import { Interpreter } from "@smthrs/flow"
import { Clock, Effect, Layer, Metric } from "effect"
import { BranchClient, type TrackRefused } from "./api"
import { BranchTrack, BranchTrackRefused, BranchTrackUnavailable, type TrackFailure, TrackBranch } from "./flows"
import { tracks } from "./metrics"
import { parts } from "../repo/flows"

// `branch/track`'s step (docs/features/branch-workspace.md#tracking-a-branch): one `POST /api/branches` through
// `BranchClient`. A person opening a branch's page and the agent's call run this one step on this device's engine.

/** What ChatApi's refusal means to the flow. */
export const trackFailure = (refused: TrackRefused): TrackFailure =>
  refused.status === 404
    ? new BranchTrackRefused({ reason: "not_found" })
    : refused.status === 401
    ? new BranchTrackRefused({ reason: "sign_in" })
    : refused.status === 403
    ? new BranchTrackRefused({ reason: "forbidden" })
    : refused.status === 400 || refused.status === 413
    ? new BranchTrackRefused({ reason: "invalid" })
    : new BranchTrackUnavailable()

/**
 * What `branch/track/request` does: one `POST /api/branches`. Records it as a span `branch.track`, a log line with the
 * outcome and ChatApi's status, and a count of `tracks` by outcome: `tracked`, the refusal's reason, or `unavailable`.
 * Never the branch's name.
 */
export const requestTrack = ({ repo, branch }: { readonly repo: string; readonly branch: string }) =>
  Effect.gen(function* () {
    const startedAt = yield* Clock.currentTimeMillis
    const [owner, name] = parts(repo)
    const answer = yield* Effect.result((yield* BranchClient).track({ owner, name, ref: branch }))
    const outcome = answer._tag === "Success"
      ? "tracked"
      : (() => {
        const failure = trackFailure(answer.failure)
        return failure._tag === "@smthrs/mvp/branch/BranchTrackRefused" ? failure.reason : "unavailable"
      })()
    yield* Metric.update(Metric.withAttributes(tracks, { outcome }), 1)
    yield* Effect.annotateCurrentSpan({ outcome })
    yield* Effect.logWithLevel(answer._tag === "Success" ? "Info" : "Warn")("branch.track").pipe(
      Effect.annotateLogs({
        outcome,
        ...(answer._tag === "Failure" && answer.failure.status !== undefined ? { status: answer.failure.status } : {}),
        durationMs: (yield* Clock.currentTimeMillis) - startedAt,
        feature: "branch",
      }),
    )
    if (answer._tag === "Success") return answer.success
    return yield* Effect.fail(trackFailure(answer.failure))
  }).pipe(Effect.withSpan("branch.track"))

/** Registers `branch/track` with its step, asking through the host's `BranchClient`. */
export const registration = Interpreter.layerWithImplementations(BranchTrack, TrackBranch.toLayer(requestTrack))

/** `branch/track`, asking ChatApi on `origin`. Needs the host's `HttpClient`. */
export const registrationAt = (origin: string) => registration.pipe(Layer.provide(BranchClient.layer({ origin })))
