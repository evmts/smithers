import { Effect } from "effect"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { expect, test } from "vitest"
import { program } from "../examples/quickstart.ts"

// The quickstart, as a reader runs it: imported, and as its own program with node.

const expected = {
  before: ["Ship it", "Write the docs"],
  after: ["Ship it"],
  streamed: ["Ship it"],
  duplicate: "MutationRefused:insert"
}

test("the quickstart shows the open todos as they change, and refuses a duplicate key", async () => {
  expect(await Effect.runPromise(program)).toEqual(expected)
})

test("the quickstart runs with node and prints the same result", () => {
  const output = execFileSync(
    process.execPath,
    [fileURLToPath(new URL("../examples/quickstart.ts", import.meta.url))],
    {
      encoding: "utf8"
    }
  )
  expect(output).toContain("'MutationRefused:insert'")
  expect(output).toContain("after: [ 'Ship it' ]")
})
