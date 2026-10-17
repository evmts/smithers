import { describe, expect, it } from "vitest"
import { instructionChunks } from "../examples/instruction-chunks.ts"
import { steerAtTurnBoundary } from "../examples/steer-at-turn-boundary.ts"

describe("examples", () => {
  it("steer-at-turn-boundary delivers steers admitted by the cutoff and keeps the rest", () => {
    expect(steerAtTurnBoundary()).toEqual({
      inserts: ["Prefer the smaller patch."],
      seatChanges: ["fast"],
      remaining: ["Then update the changelog.", "Also run the linter."],
      original: 4
    })
  })

  it("instruction-chunks splits per heading and bullet and withholds a whole wrapped bullet", () => {
    expect(instructionChunks()).toEqual({
      ids: ["/repo/AGENTS.md#0", "/repo/AGENTS.md#1", "/repo/AGENTS.md#2"],
      rejoined: true,
      rendered: "Project-specific instructions and guidelines:\n\n" +
        "<project_instructions path=\"/repo/AGENTS.md\">\n" +
        "# Rules\n\n- Run the tests before landing.\n" +
        "\n</project_instructions>"
    })
  })
})
