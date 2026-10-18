import { Action, Flow, Interpreter, RetryPolicy } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Effect, Layer, Metric, Option, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { codeOf } from "../ErrorCode.ts"
import { type GitHubAuth, GitHubRefused } from "../GitHubAuth.ts"
import type { SessionKeys } from "../SessionKeys.ts"
import * as SessionStore from "../SessionStore.ts"

// `auth/RevokeGitHubToken { sessionId }` (docs/features/sign-in.md#signing-out): revokes an ended session's GitHub
// token on GitHub, then forgets the session's GitHub tokens. Sign-in starts it when a person signs out, or signs in
// again in the same browser, which ends the session they held; it keeps the session's sealed tokens until this flow
// forgets them. A session GitHub refused needs none: its tokens are already dead and forgotten. It runs on any host;
// the host injects Postgres and GitHub through `registration`. GitHub or Postgres failing fails the step, which its
// retry policy repeats; after the last attempt `auth/ForgetTokens` forgets the tokens anyway, and the access token
// lapses within its 8 hours.

/**
 * What the flow did: revoked the token on GitHub and forgot it (GitHub no longer having it counts), forgot it after
 * every revocation attempt failed, forgot a token that no longer opens (SESSION_SECRET changed), found no token, or
 * found the session live and left it alone.
 */
const Revoked = Schema.Struct({
  outcome: Schema.Literals(["revoked", "forgotten", "unreadable", "none", "live"]),
})
type Revoked = typeof Revoked.Type

/** The revocation couldn't finish: GitHub was unavailable or refused the App, or Postgres failed. The step retries. */
export class RevocationFailed extends Schema.TaggedError<RevocationFailed>()("@smthrs/mvp/auth/RevocationFailed", {
  reason: Schema.Literals(["github_unavailable", "github_misconfigured", "database"]),
}) {}

/** Token revocations, by `outcome`: one of `Revoked`'s, or `failed` for one failed attempt. */
export const revocations = Metric.counter("smithers_auth_token_revocations", {
  description: "GitHub token revocations at sign-out, by outcome",
  incremental: true,
})

const payload = { sessionId: Schema.String }

/** The step: revoke the ended session's GitHub access token on GitHub, then forget its tokens. */
export const RevokeToken = Action.make("auth/RevokeToken", {
  payload,
  success: Revoked,
  error: RevocationFailed,
  capabilities: ["db:write:sessions"],
  retryPolicy: RetryPolicy.make({ initialMs: 1_000, factor: 2, maxMs: 60_000, maxAttempts: 5 }),
})

/**
 * The step after a revocation that failed every attempt: forgets the tokens without revoking them. Only Postgres can
 * fail it, so its retry policy never gives up.
 */
export const ForgetTokens = Action.make("auth/ForgetTokens", {
  payload,
  success: Revoked,
  error: RevocationFailed,
  capabilities: ["db:write:sessions"],
  retryPolicy: RetryPolicy.make({ initialMs: 1_000, factor: 2, maxMs: 60_000 }),
})

/** `auth/RevokeGitHubToken`: revokes an ended session's GitHub token and forgets it. */
export const RevokeGitHubToken = Flow.make("auth/RevokeGitHubToken", {
  description: "Revoke an ended session's GitHub token on GitHub, then forget the session's GitHub tokens.",
  capabilities: ["db:write:sessions"],
  modelInvocable: false,
  payload,
  success: Revoked,
  error: RevocationFailed,
  body: Node.capture({}, (request) =>
    RevokeToken.call(request).pipe(Node.catch({ onFailure: () => ForgetTokens.call(request) }))),
})

/** What the revocation needs besides Postgres: the session keys, to open the token, and GitHub. */
export interface Services {
  readonly keys: SessionKeys
  readonly github: GitHubAuth["Service"]
}

const outcome = (value: Revoked["outcome"]): Revoked => ({ outcome: value })

/**
 * One revocation of session `sessionId`'s GitHub token, against the `SqlClient` in context. A live session is left
 * alone. Fails with GitHub's failure when GitHub was unavailable or refused the App, and with Postgres' failure.
 */
export const revoke = (sessionId: string, services: Services) =>
  Effect.gen(function* () {
    const found = yield* SessionStore.held(sessionId)
    if (Option.isNone(found)) return outcome("none")
    if (found.value.live) return outcome("live")
    if (found.value.access === null) return outcome("none")
    const access = yield* Effect.option(
      services.keys.open(found.value.access, { id: sessionId, name: "github_access", version: 1 }),
    )
    if (Option.isSome(access)) yield* services.github.revoke(access.value)
    yield* SessionStore.forgetTokens(sessionId)
    return outcome(Option.isSome(access) ? "revoked" : "unreadable")
  })

/** A failure as a step reports it, by reason only: GitHub's failure, or anything Postgres did. */
const failed = (error: unknown) =>
  new RevocationFailed({
    reason: !(error instanceof GitHubRefused)
      ? "database"
      : error.reason === "misconfigured"
      ? "github_misconfigured"
      : "github_unavailable",
  })

/**
 * One step over `database`, with its records: an `auth.revoke_token` log line and span, and
 * `smithers_auth_token_revocations`. None carries a token, a login or GitHub's text.
 */
const recorded = <E, R>(
  sessionId: string,
  step: Effect.Effect<Revoked, unknown, SqlClient.SqlClient>,
  database: Layer.Layer<SqlClient.SqlClient, E, R>,
) =>
  step.pipe(
    Effect.provide(database),
    Effect.tapError((error) =>
      Effect.andThen(
        Metric.update(Metric.withAttributes(revocations, { outcome: "failed" }), 1),
        Effect.logWarning("auth.revoke_token").pipe(
          Effect.annotateLogs({ sessionId, outcome: "failed", errorCode: codeOf(error) }),
        ),
      )
    ),
    Effect.mapError(failed),
    Effect.tap((revoked) =>
      Effect.andThen(
        Metric.update(Metric.withAttributes(revocations, { outcome: revoked.outcome }), 1),
        Effect.logInfo("auth.revoke_token").pipe(Effect.annotateLogs({ sessionId, outcome: revoked.outcome })),
      )
    ),
    Effect.withSpan("auth.revoke_token", { attributes: { "smithers.auth.session_id": sessionId } }),
  )

/** One revocation over `database`, with its records. */
export const observed = <E, R>(
  sessionId: string,
  services: Services,
  database: Layer.Layer<SqlClient.SqlClient, E, R>,
) => recorded(sessionId, revoke(sessionId, services), database)

/** Forgets the session's tokens after a revocation that failed every attempt, over `database`, with its records. */
export const forget = <E, R>(sessionId: string, database: Layer.Layer<SqlClient.SqlClient, E, R>) =>
  recorded(sessionId, Effect.as(SessionStore.forgetTokens(sessionId), outcome("forgotten")), database)

/**
 * Registers `auth/RevokeGitHubToken` with its steps, reaching Postgres through `database` and GitHub through
 * `services`.
 */
export const registration = <E, R>(database: Layer.Layer<SqlClient.SqlClient, E, R>, services: Services) =>
  Interpreter.layerWithImplementations(
    RevokeGitHubToken,
    Layer.merge(
      RevokeToken.toLayer(({ sessionId }) => observed(sessionId, services, database)),
      ForgetTokens.toLayer(({ sessionId }) => forget(sessionId, database)),
    ),
  ).pipe(Layer.provideMerge(Action.layerImplementations))
