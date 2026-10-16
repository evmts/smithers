/**
 * The quickstart lifecycle as one runnable program: create a run, claim and
 * activate it, record one step attempt, and settle the run as `completed`.
 *
 * @since 1.0.0
 */
import { AttemptStore, RunStore } from "@smthrs/run-store"
import type { OwnerId } from "@smthrs/run-store/Ownership"
import * as TestRunStore from "@smthrs/run-store/test/TestRunStore"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"

/**
 * The fence every write in this program carries.
 *
 * @since 1.0.0
 */
export const owner: OwnerId = { hostId: "quickstart-host", pid: 4102, nonce: "3f9c-8b21" }

/**
 * Creates `quickstart-1`, then claims and activates it for {@link owner}.
 *
 * @since 1.0.0
 */
export const claimRun = Effect.gen(function*() {
  const runs = yield* RunStore.RunStore

  yield* runs.create("quickstart-1", JSON.stringify({ cursor: 0 }))

  const pending = yield* runs.get("quickstart-1")
  const expected = {
    status: pending.status,
    owner: pending.owner,
    heartbeatAtMs: pending.heartbeatAtMs
  }

  const nowMs = yield* Clock.currentTimeMillis
  const claim = yield* runs.claim("quickstart-1", expected, owner, nowMs)
  if (claim._tag !== "Claimed") return yield* Effect.die(`claim lost: ${claim._tag}`)

  const activation = yield* runs.activate("quickstart-1", owner, claim.claimedAtMs, expected)
  if (activation._tag !== "Activated") return yield* Effect.die(`activation lost: ${activation._tag}`)
})

/**
 * Starts, heartbeats with a checkpoint, and finishes attempt 0 of `step-fetch`.
 *
 * @since 1.0.0
 */
export const runStep = Effect.gen(function*() {
  const attempts = yield* AttemptStore.AttemptStore
  const startedAtMs = yield* Clock.currentTimeMillis

  yield* attempts.put({
    runId: "quickstart-1",
    stepKeyDigest: "step-fetch",
    attempt: 0,
    state: "running",
    startedAtMs,
    meta: { step: "fetch" }
  }, owner)

  yield* attempts.heartbeat(
    "quickstart-1",
    "step-fetch",
    0,
    owner,
    yield* Clock.currentTimeMillis,
    { cursor: 1 }
  )

  yield* attempts.finish({
    runId: "quickstart-1",
    stepKeyDigest: "step-fetch",
    attempt: 0,
    state: "completed",
    finishedAtMs: yield* Clock.currentTimeMillis,
    outcome: { rows: 12 }
  }, owner)
})

/**
 * Moves the owned run to `completed` and reads back the settled row.
 *
 * @since 1.0.0
 */
export const settleRun = Effect.gen(function*() {
  const runs = yield* RunStore.RunStore
  const outcome = yield* runs.transitionOwned(
    "quickstart-1",
    owner,
    "completed",
    JSON.stringify({ cursor: 1 })
  )
  if (outcome._tag !== "Transitioned") return yield* Effect.die(`fence lost: ${outcome._tag}`)
  return yield* runs.get("quickstart-1")
})

/**
 * The whole quickstart over a fresh in-memory database; yields the settled row.
 *
 * @since 1.0.0
 */
export const main = claimRun.pipe(
  Effect.andThen(runStep),
  Effect.andThen(settleRun),
  Effect.provide(TestRunStore.layer),
  Effect.scoped
)
