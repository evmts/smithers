import { Action, Flow, Interpreter, RetryPolicy } from "@smthrs/flow"
import { GitHub } from "@smthrs/integrations"
import { Node } from "@smthrs/plan"
import { Cause, Clock, Effect, Layer, Metric, Option, Schema } from "effect"
import { HttpClient } from "effect/http"
import type { WriteFailure } from "../../src/features/issues/contract.ts"
import { codeOf } from "../ErrorCode.ts"
import type { Services } from "./Apply.ts"
import { classify, statusOf, withToken } from "./Calls.ts"
import { repositoryOf } from "./Config.ts"
import * as Metrics from "./Metrics.ts"
import { fetchPull, projectPull } from "./Pulls.ts"
import * as Store from "./Store.ts"

// `pr/Merge { writeId }` (decision 0012 decision 6, docs/features/pulls.md#merge): a person's merge, and only a
// person's. The writes route admitted it from the person's own session (never a run credential, never the agent),
// at Maintainer or above, bound to the head and base they saw. This step re-reads the pull request and refuses a moved
// head (`head_moved`), a moved base (`base_moved`), a draft, or one already merged or closed; then merges it with the
// person's own GitHub token, so GitHub shows them and applies their permissions and the branch protection, fenced by the
// head SHA (GitHub answers 409 when it moved since). Squash by default. A lost answer is read back: a pull request
// merged at that head by the requesting GitHub identity recovers an uncertain PUT. Nothing here bypasses a required
// check: GitHub's refusal is `not_mergeable`.

/** GitHub or Postgres couldn't answer, or the answer was lost: retried, after `retryAfterMillis`. */
export class MergeUnavailable extends Schema.TaggedError<MergeUnavailable>()("@smthrs/mvp/github/MergeUnavailable", {
  retryAfterMillis: Schema.optional(Schema.Number),
}) {}

/** A person waits on a merge: 1 s doubling to 15 s, for at most 5 minutes. */
export const MERGE_RETRY = RetryPolicy.make({ initialMs: 1_000, factor: 2, maxMs: 15_000, expirationMs: 5 * 60_000 })

const MergeRequest = { writeId: Schema.String.check(Schema.isUUID()) }

/** How the merge ended: `done` with the merge commit, or why not. */
export const Merged = Schema.Struct({
  status: Schema.Literals(["done", "refused", "failed", "missing"]),
  mergeSha: Schema.NullOr(Schema.String),
})
export type Merged = typeof Merged.Type

export const Send = Action.make("pr/Merge/send", {
  payload: MergeRequest,
  success: Merged,
  error: MergeUnavailable,
  retryPolicy: MERGE_RETRY,
})

export const GiveUp = Action.make("pr/Merge/give-up", {
  payload: MergeRequest,
  success: Merged,
  error: MergeUnavailable,
  retryPolicy: RetryPolicy.make({ initialMs: 1_000, factor: 2, maxMs: 60_000 }),
})

/** `pr/Merge`: merges one pull request as the person who pressed Merge. */
export const Merge = Flow.make("pr/Merge", {
  description: "Merge one pull request as the person who pressed Merge, at the head they saw, squash unless they " +
    "chose otherwise; refuse a moved head or base, a draft, or a pull request already merged or closed.",
  capabilities: ["db:write:github_writes", "db:write:items", "db:write:pulls"],
  modelInvocable: false,
  payload: MergeRequest,
  success: Merged,
  error: MergeUnavailable,
  body: Node.capture({ send: Send.name, giveUp: GiveUp.name }, (request) =>
    Send.call(request).pipe(Node.catch({ onFailure: () => GiveUp.call(request) }))),
})

/** Merges, by `outcome`: `done`, or the failure. */
export const merges = Metric.counter("smithers_pr_merges", {
  description: "Pull request merges a person asked for, by outcome",
  incremental: true,
})

/** What GitHub's refusal of a merge means. */
export const refusalOf = (status: number): WriteFailure =>
  status === 405
    ? "not_mergeable"
    : status === 409
    ? "head_moved"
    : status === 401
    ? "sign_in_required"
    : status === 404
    ? "not_found"
    : status === 422
    ? "invalid"
    : "not_allowed"

/** The steps over `services`. */
export const steps = <E, R>(services: Services<E, R>) => {
  const settled = (write: Store.Write, settlement: Store.Settlement, mergeSha: string | null, project?: Effect.Effect<unknown>) =>
    Effect.gen(function* () {
      const now = yield* Store.settleWrite(write.id, settlement)
      // GitHub's successful write is durable before projection, which may fail independently.
      if (now && settlement.status === "done" && project !== undefined) yield* project.pipe(
        Effect.catchCause((cause) => Effect.gen(function* () {
          yield* Metric.update(Metric.withAttributes(Metrics.projectionFailures, { op: write.op }), 1)
          yield* Effect.logWarning("github.merge.projection").pipe(
            Effect.annotateLogs({ writeId: write.id, outcome: "unavailable", errorCode: codeOf(Cause.squash(cause)) }),
          )
        })),
      )
      const outcome = settlement.status === "done" ? "done" : settlement.failure
      if (now) {
        yield* Metric.update(Metric.withAttributes(merges, { outcome }), 1)
        yield* Metric.update(Metric.withAttributes(Metrics.writeMs, { op: write.op }), (yield* Clock.currentTimeMillis) - write.createdAt)
      }
      yield* Effect.logWithLevel(settlement.status === "done" ? "Info" : "Warn")("github.merge").pipe(
        Effect.annotateLogs({ writeId: write.id, outcome, settled: now }),
      )
      return { status: settlement.status, mergeSha } satisfies Merged
    })

  const send = ({ writeId }: typeof Send.payloadSchema.Type) =>
    Effect.gen(function* () {
      const found = yield* Store.writeOf(writeId)
      if (Option.isNone(found) || found.value.payload.op !== "pr/merge") {
        return { status: "missing", mergeSha: null } satisfies Merged
      }
      const write = found.value
      const payload = found.value.payload
      if (write.status !== "pending") return { status: write.status, mergeSha: null } satisfies Merged
      const repository = repositoryOf(write.repoId.replace(/^github\//, ""))
      // Only a person's own session admits a merge. A write without one, which the route never admits, is refused now
      // rather than retried.
      if (write.sessionId === null) return yield* settled(write, { status: "refused", failure: "sign_in_required" }, null)
      const token = yield* services.tokens.forSession(write.sessionId).pipe(Effect.result)
      if (token._tag === "Failure") {
        if (token.failure.reason === "refreshing" || token.failure.reason === "unavailable") {
          return yield* new MergeUnavailable(
            token.failure.retryAfterMillis === undefined ? {} : { retryAfterMillis: token.failure.retryAfterMillis },
          )
        }
        return yield* settled(write, { status: "refused", failure: "sign_in_required" }, null)
      }
      const outcome = yield* Effect.gen(function* () {
        const earlier = write.mergeUnknown
        const pull = yield* GitHub.Pulls.getPull(repository.owner, repository.name, payload.number)
        // Recover only an uncertain PUT at this head attributed to the requesting GitHub identity.
        if (pull.merged) {
          return earlier && write.githubActorId !== null && pull.merged_by?.id === write.githubActorId &&
              pull.head.sha === payload.headSha && pull.merge_commit_sha !== null
            ? { kind: "merged" as const, sha: pull.merge_commit_sha }
            : { kind: "refused" as const, failure: "merged" as const }
        }
        if (pull.state === "closed") return { kind: "refused" as const, failure: "closed" as const }
        if (pull.draft) return { kind: "refused" as const, failure: "draft" as const }
        if (pull.head.sha !== payload.headSha) return { kind: "refused" as const, failure: "head_moved" as const }
        if (pull.base.sha !== payload.baseSha) return { kind: "refused" as const, failure: "base_moved" as const }
        yield* Store.beginAttempt(write.id)
        const merged = yield* GitHub.Pulls.mergePull(repository.owner, repository.name, payload.number, {
          sha: payload.headSha,
          method: payload.method,
          commitTitle: `${pull.title} (#${pull.number})`,
        }).pipe(Effect.result)
        if (merged._tag === "Success") return { kind: "merged" as const, sha: merged.success.sha }
        const classified = classify(merged.failure)
        // A decode failure after HTTP success is still uncertain. Only a definite rejection clears recovery.
        const status = statusOf(merged.failure)
        if (classified.kind === "refused" || (classified.kind === "retry" && (status === 403 || status === 429))) {
          yield* Store.clearMergeUnknown(write.id)
        }
        if (classified.kind === "refused") return { kind: "refused" as const, failure: refusalOf(classified.status) }
        return yield* Effect.fail(merged.failure)
      }).pipe(withToken(token.success, services.apiBaseUrl), Effect.result)
      if (outcome._tag === "Failure") {
        const classified = classify(outcome.failure)
        if (classified.kind === "refused") {
          return yield* settled(write, { status: "refused", failure: refusalOf(classified.status) }, null)
        }
        if (classified.kind === "unknown") {
          yield* Metric.update(Metric.withAttributes(Metrics.writeUnknown, { op: write.op }), 1)
        }
        yield* Effect.logWarning("github.merge").pipe(
          Effect.annotateLogs({ writeId, outcome: classified.kind, errorCode: codeOf(outcome.failure) }),
        )
        return yield* new MergeUnavailable(
          classified.kind === "retry" && classified.retryAfterMillis !== undefined
            ? { retryAfterMillis: classified.retryAfterMillis }
            : {},
        )
      }
      if (outcome.success.kind === "refused") {
        return yield* settled(write, { status: "refused", failure: outcome.success.failure }, null)
      }
      // Merged: read back with the App token. Settlement survives an unavailable projection.
      const read = yield* services.tokens.forInstallation(repository, "pulls").pipe(Effect.option)
      const fetched = Option.isSome(read)
        ? yield* fetchPull(repository, payload.number).pipe(withToken(read.value, services.apiBaseUrl), Effect.option)
        : Option.none()
      return yield* settled(
        write,
        { status: "done", itemNumber: payload.number, githubId: null },
        outcome.success.sha,
        (Option.isSome(fetched) ? projectPull(repository, payload.number, fetched.value) : Effect.void) as Effect.Effect<
          unknown
        >,
      )
    }).pipe(
      Effect.provideService(HttpClient.HttpClient, services.http),
      Effect.provide(services.database),
      Effect.catch((error) =>
        error instanceof MergeUnavailable
          ? Effect.fail(error)
          : Effect.logWarning("github.merge").pipe(
            Effect.annotateLogs({ writeId, outcome: "failed", errorCode: codeOf(error) }),
            Effect.andThen(Effect.fail(new MergeUnavailable({}))),
          )
      ),
      Effect.withSpan("github.merge", { attributes: { "smithers.github.write": writeId } }),
    )

  const giveUp = ({ writeId }: typeof GiveUp.payloadSchema.Type) =>
    Effect.gen(function* () {
      const found = yield* Store.writeOf(writeId)
      if (Option.isNone(found)) return { status: "missing", mergeSha: null } satisfies Merged
      if (found.value.status !== "pending") return { status: found.value.status, mergeSha: null } satisfies Merged
      return yield* settled(found.value, { status: "failed", failure: "unavailable" }, null)
    }).pipe(
      Effect.provide(services.database),
      Effect.mapError(() => new MergeUnavailable({})),
      Effect.withSpan("github.merge.give_up", { attributes: { "smithers.github.write": writeId } }),
    )

  return { send, giveUp }
}

/** Registers `pr/Merge` with its steps over `services`. */
export const registration = <E, R>(services: Services<E, R>) => {
  const implementation = steps(services)
  return Interpreter.layerWithImplementations(
    Merge,
    Layer.merge(Send.toLayer(implementation.send), GiveUp.toLayer(implementation.giveUp)),
  ).pipe(Layer.provideMerge(Action.layerImplementations))
}
