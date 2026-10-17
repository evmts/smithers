import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { scanProject } from "../examples/scan-project.ts"
import { copyFixture, hashTree } from "./fixtures/helpers.ts"

describe("examples", () => {
  it.effect("scan-project plans a 0.x project and leaves its files untouched", () =>
    Effect.gen(function*() {
      const root = copyFixture("jsx-single")
      const before = Object.fromEntries(hashTree(root))
      const plan = yield* scanProject(root, "2026-10-14T00:00:00.000Z")

      expect(Object.fromEntries(hashTree(root))).toEqual(before)
      expect(plan.exitCode).toBe(0)
      expect(plan.runState).toBe("clean")
      expect(plan.units).toEqual([
        "dependencies:planned",
        "workflow:simple-workflow:planned",
        "project:planned"
      ])
      expect(plan.mapping).toEqual([
        "Sequence:guided",
        "Task:guided",
        "Workflow:guided",
        "createSmithers:guided",
        "ctx.input:automatic",
        "outputs.<key>:automatic",
        "smithers:guided"
      ])
      expect(plan.markdown.startsWith("# Smithers 0.x to 1.0 migration report\n")).toBe(true)
      expect(plan.markdown).toContain(" at 2026-10-14T00:00:00.000Z.\n")
      expect(plan.markdown).toContain(`| Project | ${root} |`)
      expect(plan.markdown).toContain("| Mode | plan |")
      expect(plan.markdown).toContain("| package.json | 1 | smithers up | cli-verb |")
      expect(plan.markdown).toContain("- `flows/simple-workflow/flow.ts`")
    }))
})
