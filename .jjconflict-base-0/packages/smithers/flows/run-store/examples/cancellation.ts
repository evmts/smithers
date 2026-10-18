/**
 * Cooperative cancellation: a caller requests it, the owner's guarded
 * checkpoint refuses to run past the request, and the owner acknowledges it
 * and settles the run as `cancelled`.
 *
 * @since 1.0.0
 */
import { RunStore } from "@smthrs/run-store"
import type { OwnerId } from "@smthrs/run-store/Ownership"
import * as TestRunStore from "@smthrs/run-store/test/TestRunStore"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"

const owner: OwnerId = { hostId: "worker-a", pid: 311, nonce: "cancel-demo" }
const runId = "cancel-demo-1"

/**
 * Runs the cancellation handshake and returns each outcome along the way plus
 * the settled row.
 *
 * @since 1.0.0
 */
export const main = Effect.gen(function*() {
  const runs = yield* RunStore.RunStore

  yield* runs.create(runId, JSON.stringify({ cursor: 0 }))
  const pending = yield* runs.get(runId)
  const owned = yield* runs.claimAndOwn(runId, pending, owner, yield* Clock.currentTimeMillis)
  if (owned._tag !== "Activated") return yield* Effect.die(`claimAndOwn lost: ${owned._tag}`)

  // Any process may ask; the request is a timestamp on the row, not a kill.
  const requested = yield* runs.requestCancel(runId, yield* Clock.currentTimeMillis)
  const repeated = yield* runs.requestCancel(runId, yield* Clock.currentTimeMillis)

  // The owner's next progress write is guarded on "no request yet", so it
  // cannot persist state past the request.
  const progress = yield* runs.transitionOwned(runId, owner, "running", JSON.stringify({ cursor: 1 }), {
    cancelRequested: "absent"
  })

  // The owner records that it saw the request, then settles the run.
  const acknowledged = yield* runs.acknowledgeCancel(runId, owner, yield* Clock.currentTimeMillis)
  const settled = yield* runs.transitionOwned(runId, owner, "cancelled", undefined, { cancelRequested: "present" })
  const afterSettle = yield* runs.requestCancel(runId, yield* Clock.currentTimeMillis)

  return { requested, repeated, progress, acknowledged, settled, afterSettle, row: yield* runs.get(runId) }
}).pipe(Effect.provide(TestRunStore.layer), Effect.scoped)
