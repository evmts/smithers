import { Interpreter } from "@smthrs/flow"
import { Clock, Effect, Metric } from "effect"
import { RepoClient, type RepoRefused } from "./api"
import { type CloneFailure, parts, RepoCloneRefused, RepoCloneRequest, RepoCloneUnavailable, RequestClone } from "./flows"
import { clones } from "./metrics"

// `repo/clone`'s step (docs/features/repo.md#flows): asks RepoApi for the clone, `POST /api/repos` through `RepoClient`.
// RepoApi admits it (sign-in, the Member role, the repository cap, the budgets) and starts the durable remote
// `repo/Clone`; no route starts that flow by its name (docs/features/remote-flows.md#no-remote-door). A person's Clone,
// Try again and `/clone`, and the agent's call, all run this one step on this device's engine.

/** What RepoApi's refusal means to the flow, and the outcome it counts as. */
export const cloneFailure = (refused: RepoRefused): CloneFailure =>
  refused.status === 401
    ? new RepoCloneRefused({ reason: "sign_in" })
    : refused.status === 403
    ? new RepoCloneRefused({ reason: "forbidden" })
    : refused.status === 429
    ? new RepoCloneRefused({ reason: "limit" })
    : refused.status === 400
    ? new RepoCloneRefused({ reason: "invalid" })
    : refused.status === 503 && refused.code === "not_configured"
    ? new RepoCloneRefused({ reason: "not_configured" })
    : new RepoCloneUnavailable()

/**
 * What `repo/clone/request` does: one `POST /api/repos` for `repo`. Records it as a span `repo.clone`, a log line with
 * the outcome and RepoApi's status, and a count of `clones` by outcome: `started` (202), `existing` (200), the
 * refusal's reason, or `unavailable`.
 */
export const requestClone = ({ repo }: { readonly repo: string }) =>
  Effect.gen(function* () {
    const startedAt = yield* Clock.currentTimeMillis
    const [owner, name] = parts(repo)
    const answer = yield* Effect.result((yield* RepoClient).clone(owner, name))
    /** The request's records; RepoApi's `status` for a refusal, none when nothing answered. */
    const record = (outcome: string, refused?: { readonly status?: number | undefined }) =>
      Effect.gen(function* () {
        const status = refused?.status
        yield* Metric.update(Metric.withAttributes(clones, { outcome }), 1)
        yield* Effect.annotateCurrentSpan({ outcome })
        yield* Effect.logWithLevel(refused === undefined ? "Info" : "Warn")("repo.clone").pipe(
          Effect.annotateLogs({
            outcome,
            ...(status === undefined ? {} : { status }),
            durationMs: (yield* Clock.currentTimeMillis) - startedAt,
            feature: "repo",
          }),
        )
      })
    if (answer._tag === "Success") {
      yield* record(answer.success.txid === null ? "existing" : "started")
      return answer.success
    }
    const failure = cloneFailure(answer.failure)
    yield* record(failure._tag === "@smthrs/mvp/repo/RepoCloneRefused" ? failure.reason : "unavailable", answer.failure)
    return yield* Effect.fail(failure)
  }).pipe(Effect.withSpan("repo.clone"))

/** Registers `repo/clone` with its step, asking through the host's `RepoClient`. */
export const registration = Interpreter.layerWithImplementations(RepoCloneRequest, RequestClone.toLayer(requestClone))
