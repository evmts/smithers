import { describe, expect, it } from "vitest"
import * as Brief from "../../src/suggest/Brief.ts"
import * as Checklist from "../../src/suggest/Checklist.ts"

const chosen: Checklist.Suggestion = {
  id: "review",
  title: "Review",
  why: "GitHub remote",
  effort: "small",
  followUp: false,
  followUps: [Checklist.followUps.ci],
  files: [".git/config"]
}
const context = {
  seat: "local:reviewer",
  facts: Checklist.evidence(Checklist.memoryRepository("/repo", {}))
}

describe("suggest authoring rulings", () => {
  it("teaches default flow.ts exports built with a named Flow.make", () => {
    expect(Brief.system).toContain(".smithers/flows/<name>/flow.ts")
    expect(Brief.system).toContain("export default Flow.make(\"review\", {")
    expect(Brief.system).toContain("from \"@smthrs/flow\"")
    expect(Brief.system).not.toContain("flow.mdx")
    const brief = Brief.suggestion(context, chosen)
    expect(brief).toContain(".smithers/flows/review/flow.ts")
    expect(brief).toContain("Flow.make(\"review\",")
    expect(brief).not.toContain("flow.mdx")
  })

  it.each([{}, { ".github/workflows/ci.yml": "name: old CI" }])(
    "uses Smithers flow checks for CI with evidence %j",
    (files) => {
      const brief = Brief.followUp(
        {
          ...context,
          facts: Checklist.evidence(Checklist.memoryRepository("/repo", files))
        },
        chosen,
        { files: [".smithers/flows/review/flow.ts"], command: "smthrs flow start review" },
        Checklist.followUps.ci
      )
      const task = brief.split("## Write\n\n")[1]!
      expect(task).toContain("Smithers flow runs")
      expect(task).not.toContain(".github/workflows/")
      expect(task).not.toContain("GitHub Actions")
    }
  )
})
