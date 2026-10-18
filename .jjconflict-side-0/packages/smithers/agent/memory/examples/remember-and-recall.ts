/**
 * Write one fact through the `remember` handler, recall it with keyword
 * recall, and read it back from the store. Runs over an in-memory database.
 */
import { Effect, Layer } from "effect"
import * as Flows from "../src/Flows.ts"
import * as MemoryStore from "../src/MemoryStore.ts"
import * as RecallKeyword from "../src/RecallKeyword.ts"
import * as TestMemory from "../src/test/TestMemory.ts"

// provideMerge shares one store build: recall reads the database the program
// writes to.
const memory = Layer.provideMerge(RecallKeyword.layer, TestMemory.layer)

/** Remembers a release note and answers what recall and the store see. */
export const rememberAndRecall = (): Promise<{
  readonly recalled: ReadonlyArray<{ readonly bank: string; readonly key: string; readonly text: string }>
  readonly keys: ReadonlyArray<string>
}> =>
  Effect.gen(function*() {
    yield* Flows.runRemember({ bank: "global-notes", key: "release", text: "cut 0.1.0" })
    const rows = yield* Flows.runRecall({ banks: ["global-notes"], query: "release" })
    // The bank `global-notes` is the namespace { kind: "global", id: "notes" }.
    const store = yield* MemoryStore.MemoryStore
    const facts = yield* store.listFacts({ namespace: { kind: "global", id: "notes" } })
    return {
      recalled: rows.map(({ bank, key, text }) => ({ bank, key, text })),
      keys: facts.map((fact) => fact.key)
    }
  }).pipe(Effect.provide(memory), Effect.runPromise)
