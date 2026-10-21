import { Effect } from "effect"
import { describe, expect, test } from "vitest"
import { OutboxWrites } from "./outbox"

// How features hand their writes to the device's one outbox (src/outbox.ts): a second feature adds its own to the
// writes a layer below handed over, and the first feature's names stay as they were. The outbox sending them is tested
// through each feature's real writes (src/features/issues, src/features/todos).

const mutation = () => Effect.void as never

describe("OutboxWrites.adding", () => {
  test("with nothing below, the writes are the feature's own", () => {
    const writes = { collections: {}, mutations: { mine: mutation } }
    expect(Effect.runSync(OutboxWrites.adding(writes)).mutations).toEqual({ mine: mutation })
  })

  test("adds to the writes below, which keep their names", () => {
    const below = OutboxWrites.of({ collections: {}, mutations: { first: mutation, shared: mutation } })
    const theirs = () => Effect.never as never
    const added = Effect.runSync(
      OutboxWrites.adding({ collections: {}, mutations: { second: mutation, shared: theirs } }).pipe(
        Effect.provideService(OutboxWrites, below),
      ),
    )
    expect(Object.keys(added.mutations).sort()).toEqual(["first", "second", "shared"])
    expect(added.mutations.shared).toBe(mutation)
  })
})
