import { Action, Flow, Interpreter, RetryPolicy } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Clock, Effect, Layer, Metric, Option, Schema } from "effect"
import { HttpClient } from "effect/http"
import type { SqlClient } from "effect/sql"
import { codeOf } from "../ErrorCode.ts"
import { classify, withToken } from "./Calls.ts"
import { repositoryOf } from "./Config.ts"
import * as Metrics from "./Metrics.ts"
import { readIssue } from "./Project.ts"
import * as Store from "./Store.ts"
import type { GitHubTokens } from "./Tokens.ts"

// `github/Apply { deliveryId, repo, number, event }` (decision 0012 §2, docs/features/issues.md#the-webhook):
// a webhook rang the bell for issue `number`; this reads the issue and its comments from GitHub with an installation
// token and upserts them under the newer-than guard. A payload names a subject; it never sets state. It runs remotely
// because it must happen while every device is off (decision 0011 §2), one execution per delivery, and on the Node host
// in the tests. Retries belong to the engine: the step's policy, which honors GitHub's `Retry-After`. A delivery whose
// subject stays unreadable past the retries ends `unavailable`, and Reconcile covers it.

/** GitHub or Postgres couldn't answer. The step's retry policy tries again, after `retryAfterMillis`. */
export class ApplyUnavailable extends Schema.TaggedError<ApplyUnavailable>()("@smthrs/mvp/github/ApplyUnavailable", {
  retryAfterMillis: Schema.optional(Schema.Number),
}) {}

/** 1 s doubling to a minute, for at most 30 minutes. */
export const APPLY_RETRY = RetryPolicy.make({ initialMs: 1_000, factor: 2, maxMs: 60_000, expirationMs: 30 * 60_000 })

/**
 * The delivery a run is for: its id, the repository (`owner/name`), the issue and the event. Only what the delivery
 * itself says, so a redelivery starts the very same execution.
 */
const ApplyRequest = {
  deliveryId: Schema.String,
  repo: Schema.String,
  number: Schema.Int,
  event: Schema.String,
}

/** What the run did to the projection. */
export const Applied = Schema.Struct({
  outcome: Schema.Literals(["applied", "tombstoned", "not_installed", "unavailable"]),
  changed: Schema.Number,
})
export type Applied = typeof Applied.Type

const UNAVAILABLE: Applied = { outcome: "unavailable", changed: 0 }

/** The step: re-read the subject and upsert it. */
export const Read = Action.make("github/Apply/read", {
  payload: ApplyRequest,
  success: Applied,
  error: ApplyUnavailable,
  retryPolicy: APPLY_RETRY,
})

/** `github/Apply`: re-reads a webhook's subject from GitHub into Postgres. */
export const Apply = Flow.make("github/Apply", {
  description: "Re-read the issue a GitHub webhook names, with its comments, into items and comments.",
  capabilities: ["db:write:items", "db:write:comments"],
  modelInvocable: false,
  payload: ApplyRequest,
  success: Applied,
  error: ApplyUnavailable,
  body: Node.capture({ read: Read.name }, (request) =>
    Read.call(request).pipe(
      Node.catch({ onFailure: Node.capture({ applied: "unavailable" }, () => Node.succeed(UNAVAILABLE)) }),
    )),
})

/** What the GitHub flows need from their host. */
export interface Services<E = unknown, R = never> {
  /** Postgres with the app's tables (not the engine's schema). */
  readonly database: Layer.Layer<SqlClient.SqlClient, E, R>
  readonly tokens: GitHubTokens
  /** How GitHub is reached: Effect's `HttpClient` over `fetch` when deployed, a scripted GitHub in the tests. */
  readonly http: HttpClient.HttpClient
  /** GitHub's REST API (`GITHUB_API_URL`). */
  readonly apiBaseUrl: string
}

/** What `github/Apply/read` does: one re-read with its records, never a title, a body or a login. */
export const read = <E, R>(services: Services<E, R>) => (request: typeof Read.payloadSchema.Type) =>
  Effect.gen(function* () {
    const repository = repositoryOf(request.repo)
    const fields = { deliveryId: request.deliveryId, repoId: repository.id, number: request.number, event: request.event }
    const token = yield* services.tokens.forInstallation(repository, "read").pipe(Effect.result)
    if (token._tag === "Failure") {
      if (token.failure.reason === "app_not_installed" || token.failure.reason === "not_allowed") {
        yield* Metric.update(Metric.withAttributes(Metrics.applies, { outcome: "not_installed" }), 1)
        yield* Effect.logWarning("github.apply").pipe(Effect.annotateLogs({ ...fields, outcome: "not_installed" }))
        return { outcome: "not_installed", changed: 0 } satisfies Applied
      }
      return yield* new ApplyUnavailable(
        token.failure.retryAfterMillis === undefined ? {} : { retryAfterMillis: token.failure.retryAfterMillis },
      )
    }
    const projected = yield* readIssue(repository, request.number).pipe(
      withToken(token.success, services.apiBaseUrl),
      Effect.tapError((error) =>
        Effect.logWarning("github.apply").pipe(Effect.annotateLogs({ ...fields, outcome: "failed", errorCode: codeOf(error) }))
      ),
      Effect.mapError((error) => {
        const classified = classify(error)
        return new ApplyUnavailable(
          classified.kind === "retry" && classified.retryAfterMillis !== undefined
            ? { retryAfterMillis: classified.retryAfterMillis }
            : {},
        )
      }),
    )
    // From the delivery's arrival, once the route recorded it.
    const received = yield* Store.receivedAt(request.deliveryId)
    const now = yield* Clock.currentTimeMillis
    const lag = Option.map(received, (at) => Math.max(0, now - at))
    yield* Metric.update(Metric.withAttributes(Metrics.applies, { outcome: projected.outcome }), 1)
    if (Option.isSome(lag)) yield* Metric.update(Metrics.deliveryLag, lag.value)
    yield* Effect.logInfo("github.apply").pipe(
      Effect.annotateLogs({
        ...fields,
        outcome: projected.outcome,
        changed: projected.changed,
        ...(Option.isSome(lag) ? { lagMs: lag.value } : {}),
      }),
    )
    return projected
  }).pipe(
    Effect.provideService(HttpClient.HttpClient, services.http),
    Effect.provide(services.database),
    // Postgres couldn't be reached for the token's installation, or a connection failed to open: tried again.
    Effect.mapError((error) => (error instanceof ApplyUnavailable ? error : new ApplyUnavailable({}))),
    Effect.withSpan("github.apply", {
      attributes: { "smithers.github.delivery": request.deliveryId, "smithers.github.number": request.number },
    }),
  )

/** Registers `github/Apply` with its step over `services`. */
export const registration = <E, R>(services: Services<E, R>) =>
  Interpreter.layerWithImplementations(Apply, Read.toLayer(read(services))).pipe(
    Layer.provideMerge(Action.layerImplementations),
  )
