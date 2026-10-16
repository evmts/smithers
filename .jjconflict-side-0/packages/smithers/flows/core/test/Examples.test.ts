import * as Result from "effect/Result"
import { describe, expect, it } from "vitest"
import { exampleSkill, loadSkill } from "../examples/load-skill.ts"

describe("skill-loading example", () => {
  it("loads the prompt and advisory collaborators without granting capabilities", () => {
    const flow = Result.getOrThrow(loadSkill(exampleSkill))

    expect(flow.name).toBe("summarize-changes")
    expect(flow.description).toBe("Summarize repository changes")
    expect(flow.prompt).toBe("Summarize the changes and their validation results.\n")
    expect(flow.flows).toEqual(["Read", "Search"])
    expect(flow.capabilities).toEqual([])
    expect(flow.model).toBe("smart")
    expect(flow.effects).toBeUndefined()
  })

  it("returns a typed failure instead of a declaration for malformed input", () => {
    const result = loadSkill("Summarize my changes.")

    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure.code).toBe("skill_missing_frontmatter")
    }
  })
})
