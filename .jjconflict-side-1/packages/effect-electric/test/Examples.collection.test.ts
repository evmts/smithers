import { Effect } from "effect"
import { expect, test } from "vitest"
import { program, scratchTodos } from "../examples/collection.ts"
import { ELECTRIC_URL, electricUp, postgres } from "./fixtures.ts"

// The runnable Electric collection example, against the real Postgres and Electric (test/fixtures.ts).
test.skipIf(!electricUp)(
  "the example's todo is persisted, comes back as Postgres has it, and sync was followed",
  async () => {
    const result = await Effect.runPromise(
      Effect.scoped(Effect.flatMap(scratchTodos, (table) => program(ELECTRIC_URL, table))).pipe(
        Effect.provide(postgres)
      )
    )
    expect(result.synced).toBe(true)
    expect(result.rows).toEqual([{ id: "1", title: "Write the docs", done: false }])
    expect(result.events.slice(0, 2)).toEqual(["Sent", "Succeeded"])
  }
)
