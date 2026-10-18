/**
 * Runs every example under `examples/` against its real server process, so
 * the code the docs show stays type-checked and keeps printing what they say.
 *
 * @since 1.0.0-rc.7
 */
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { program as quickstart } from "../examples/quickstart.ts"

describe("examples", () => {
  it("quickstart counts words, returns a tool-level failure as data, and projects one flow per tool", async () => {
    expect(await Effect.runPromise(quickstart)).toEqual({
      tools: ["word_count", "explode"],
      counted: {
        content: [{ type: "text", text: "4" }],
        isError: false,
        structuredContent: { words: 4 }
      },
      refused: {
        content: [{ type: "text", text: "the tool refused" }],
        isError: true,
        structuredContent: undefined
      },
      sourceName: "mcp/quickstart",
      flowNames: ["mcp/quickstart/word_count", "mcp/quickstart/explode"]
    })
  })
})
