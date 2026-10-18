import { Action, Flow, Interpreter, RetryPolicy } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Clock, Effect, Layer, Metric, Option, Redacted, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { ROLES } from "../../src/features/auth/contract.ts"
import { codeOf } from "../ErrorCode.ts"
import { type GitHubAuth, GitHubRefused, roleOf } from "../GitHubAuth.ts"
import { digest, type SessionKeys } from "../SessionKeys.ts"
import * as SessionStore from "../SessionStore.ts"

// `auth/RecheckRole { sessionId }` (docs/features/sign-in.md#role-checks): a session's role on the repository, checked
// with GitHub again. Sign-in starts it when a session's role is over an hour old (mvp.md M-05). It first refreshes the
// session's 8-hour GitHub token when it is about to expire, keeping the single-use refresh token GitHub rotates. A
// token GitHub refuses ends the session. It runs on any host; the host injects Postgres and GitHub through
// `registration`, and the step retries a GitHub or Postgres failure under its retry policy.
//
// Only one check of a session runs at a time, so only one ever redeems its refresh token: the host names the execution
// after the check it replaces (the session's `role_checked_at`), so every request that finds the same stale role
// starts the same execution, and the flow engine runs it once. A check's last write moves `role_checked_at`: it records
// the role, or keeps it when GitHub or Postgres failed every attempt (`auth/KeepRole`). Only then can a request name the
// next check.

/** How long before a GitHub token's stated expiry the check refreshes it. */
export const REFRESH_MARGIN_MS = 5 * 60 * 1000

/**
 * What the check did: recorded the role, ended the session (GitHub refused it), found the session already over, or
 * kept the role after GitHub or Postgres failed every attempt.
 */
const Checked = Schema.Struct({
  outcome: Schema.Literals(["checked", "revoked", "ended", "kept"]),
  role: Schema.NullOr(Schema.Literals(ROLES)),
})
type Checked = typeof Checked.Type

/** The check couldn't finish: GitHub was unavailable or refused the App, or Postgres failed. The step retries it. */
export class RoleCheckFailed extends Schema.TaggedError<RoleCheckFailed>()("@smthrs/mvp/auth/RoleCheckFailed", {
  reason: Schema.Literals(["github_unavailable", "github_misconfigured", "database"]),
}) {}

/** Role checks, by `outcome`: `checked`, `revoked`, `ended`, `kept`, or `failed` for one failed attempt. */
export const roleChecks = Metric.counter("smithers_auth_role_checks", {
  description: "Role checks with GitHub, by outcome",
  incremental: true,
})

const payload = { sessionId: Schema.String }

/** The step: refresh the GitHub token if it is about to expire, read the person's permission, record the role. */
export const CheckRole = Action.make("auth/CheckRole", {
  payload,
  success: Checked,
  error: RoleCheckFailed,
  capabilities: ["db:write:sessions"],
  retryPolicy: RetryPolicy.make({ initialMs: 1_000, factor: 2, maxMs: 60_000, maxAttempts: 5 }),
})

/**
 * The step after a check that failed every attempt: keeps the role and records the check, so the next request that
 * finds it stale names a new one. Only Postgres can fail it, and no later check can start until it records, so its
 * retry policy never gives up.
 */
export const KeepRole = Action.make("auth/KeepRole", {
  payload,
  success: Checked,
  error: RoleCheckFailed,
  capabilities: ["db:write:sessions"],
  retryPolicy: RetryPolicy.make({ initialMs: 1_000, factor: 2, maxMs: 60_000 }),
})

/** `auth/RecheckRole`: checks a session's role with GitHub again. */
export const RecheckRole = Flow.make("auth/RecheckRole", {
  description: "Check a session's role on the repository with GitHub again, refreshing its GitHub token if needed.",
  capabilities: ["db:write:sessions"],
  modelInvocable: false,
  payload,
  success: Checked,
  error: RoleCheckFailed,
  body: Node.capture({}, (request) =>
    CheckRole.call(request).pipe(Node.catch({ onFailure: () => KeepRole.call(request) }))),
})

/** What the check needs besides Postgres: the session keys, GitHub, and the repository roles are read on. */
export interface Services {
  readonly keys: SessionKeys
  readonly github: GitHubAuth["Service"]
  readonly repository: string
}

const ended: Checked = { outcome: "ended", role: null }
const revoked: Checked = { outcome: "revoked", role: null }
const kept: Checked = { outcome: "kept", role: null }

/** What a GitHub refusal means here: `rejected` ends the session; anything else fails the step. */
const isRejected = (error: GitHubRefused) => error.reason === "rejected"

/**
 * One check of session `sessionId`, against the `SqlClient` in context. Fails with GitHub's refusal when GitHub was
 * unavailable or refused the App, and with Postgres' failure.
 */
export const check = (sessionId: string, services: Services) =>
  Effect.gen(function* () {
    const { keys, github, repository } = services
    const end = (reason: SessionStore.RevokedReason) =>
      Effect.as(SessionStore.revoke({ id: sessionId }, reason), revoked)
    const context = (name: "github_access" | "github_refresh") => ({ id: sessionId, name, version: 1 })
    const open = (sealed: SessionStore.Sealed, name: "github_access" | "github_refresh") =>
      Effect.option(keys.open(sealed, context(name)))

    /** The access token the session holds now, or what the check concludes when it holds none it can use. */
    const current = Effect.gen(function* () {
      const found = yield* SessionStore.held(sessionId)
      if (Option.isNone(found) || !found.value.live || found.value.access === null) return ended
      const access = yield* open(found.value.access, "github_access")
      return Option.isNone(access) ? yield* end("unreadable") : { held: found.value, access: access.value }
    })

    /**
     * Trades the session's refresh token for new tokens and stores them, only over the token it presented and only
     * while the session is live. When GitHub refuses it, or the store finds the session changed, the session's own
     * current token decides.
     */
    const refresh = (held: SessionStore.Held) =>
      Effect.gen(function* () {
        const refreshToken = held.refresh === null ? Option.none() : yield* open(held.refresh, "github_refresh")
        if (Option.isNone(refreshToken) || held.refreshDigest === null) return yield* end("github_refused")
        const tokens = yield* github.refresh(refreshToken.value).pipe(
          Effect.map(Option.some),
          Effect.catchIf(isRejected, () => Effect.succeedNone),
        )
        if (Option.isSome(tokens)) {
          const next = tokens.value
          const replaced = yield* SessionStore.replaceTokens(sessionId, held.refreshDigest, {
            access: yield* keys.seal(next.accessToken, context("github_access")),
            accessExpiresAt: next.expiresAt,
            refresh: next.refreshToken === null ? null : yield* keys.seal(next.refreshToken, context("github_refresh")),
            refreshDigest: next.refreshToken === null ? null : digest(Redacted.value(next.refreshToken)),
          })
          if (replaced) return next.accessToken
        }
        // GitHub refused the token, or the session changed while GitHub answered (signed out, say): a refusal ends the
        // session only when the session still holds the token GitHub refused.
        const now = yield* current
        if ("outcome" in now) return now
        if (Option.isNone(tokens) && now.held.refreshDigest === held.refreshDigest) return yield* end("github_refused")
        return now.access
      })

    const now = yield* current
    if ("outcome" in now) return now
    const expiring = now.held.accessExpiresAt !== null &&
      now.held.accessExpiresAt - (yield* Clock.currentTimeMillis) < REFRESH_MARGIN_MS
    const access: Redacted.Redacted<string> | Checked = expiring ? yield* refresh(now.held) : now.access
    if (typeof access === "object" && "outcome" in access) return access
    const permission = yield* github.permission(access, repository).pipe(
      Effect.map(Option.some),
      Effect.catchIf(isRejected, () => Effect.succeedNone),
    )
    if (Option.isNone(permission)) return yield* end("github_refused")
    const role = roleOf(permission.value)
    yield* SessionStore.setRole(sessionId, role)
    return { outcome: "checked", role } satisfies Checked
  })

/** A failure as a step reports it, by reason only: GitHub's refusal, or anything Postgres did. */
const failed = (error: unknown) =>
  new RoleCheckFailed({
    reason: !(error instanceof GitHubRefused)
      ? "database"
      : error.reason === "misconfigured"
      ? "github_misconfigured"
      : "github_unavailable",
  })

/**
 * One step over `database`, with its records: an `auth.role_check` log line and span, and
 * `smithers_auth_role_checks`. None carries a token, a login or GitHub's text.
 */
const recorded = <E, R>(
  sessionId: string,
  step: Effect.Effect<Checked, unknown, SqlClient.SqlClient>,
  database: Layer.Layer<SqlClient.SqlClient, E, R>,
) =>
  step.pipe(
    Effect.provide(database),
    Effect.tapError((error) =>
      Effect.andThen(
        Metric.update(Metric.withAttributes(roleChecks, { outcome: "failed" }), 1),
        Effect.logWarning("auth.role_check").pipe(
          Effect.annotateLogs({ sessionId, outcome: "failed", errorCode: codeOf(error) }),
        ),
      )
    ),
    Effect.mapError(failed),
    Effect.tap((checked) =>
      Effect.andThen(
        Metric.update(Metric.withAttributes(roleChecks, { outcome: checked.outcome }), 1),
        Effect.logInfo("auth.role_check").pipe(
          Effect.annotateLogs({ sessionId, outcome: checked.outcome, role: checked.role ?? "none" }),
        ),
      )
    ),
    Effect.withSpan("auth.role_check", { attributes: { "smithers.auth.session_id": sessionId } }),
  )

/** One check over `database`, with its records. */
export const observed = <E, R>(
  sessionId: string,
  services: Services,
  database: Layer.Layer<SqlClient.SqlClient, E, R>,
) => recorded(sessionId, check(sessionId, services), database)

/** Keeps the session's role after a check that failed every attempt, over `database`, with its records. */
export const keep = <E, R>(sessionId: string, database: Layer.Layer<SqlClient.SqlClient, E, R>) =>
  recorded(sessionId, Effect.as(SessionStore.keepRole(sessionId), kept), database)

/** Registers `auth/RecheckRole` with its steps, reaching Postgres through `database` and GitHub through `services`. */
export const registration = <E, R>(database: Layer.Layer<SqlClient.SqlClient, E, R>, services: Services) =>
  Interpreter.layerWithImplementations(
    RecheckRole,
    Layer.merge(
      CheckRole.toLayer(({ sessionId }) => observed(sessionId, services, database)),
      KeepRole.toLayer(({ sessionId }) => keep(sessionId, database)),
    ),
  ).pipe(Layer.provideMerge(Action.layerImplementations))
