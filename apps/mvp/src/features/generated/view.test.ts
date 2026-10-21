// What the Generated chip and the editor's warning link to (src/features/generated/view.ts).
import { describe, expect, test } from "vitest"
import { editInsteadOf, generatedLinksOf } from "./view"

const href = (path: string) => `/o/r/blob/main/${path}`

describe("generatedLinksOf", () => {
  test("the flow's source, the last run and each input, linked where the repository has them", () => {
    const has = (path: string) => path !== "src/gone.ts"
    expect(
      generatedLinksOf({ by: "manifest", output: { flow: "docs/build", inputs: ["src/a.ts", "src/gone.ts"], run: "r 1" } }, href, has),
    ).toEqual({
      flow: { label: "docs/build", href: "/o/r/blob/main/.smithers/flows/docs/build/flow.ts" },
      run: { label: "r 1", href: "/app/runs/r%201" },
      sources: [{ label: "src/a.ts", href: "/o/r/blob/main/src/a.ts" }, { label: "src/gone.ts" }],
    })
  })

  test("a project's manifest: its paths from its folder, the flow's own source, and hashed inputs", () => {
    const output = {
      flow: "docs/generate",
      source: ".smithers/flows/docs/flow.ts",
      inputs: [{ path: "project.ts", sha256: "6bd0" }, "render.ts"],
    }
    expect(generatedLinksOf({ by: "manifest", output }, href, () => true, "tools/docgen")).toEqual({
      flow: { label: "docs/generate", href: "/o/r/blob/main/tools/docgen/.smithers/flows/docs/flow.ts" },
      sources: [
        { label: "project.ts", href: "/o/r/blob/main/tools/docgen/project.ts" },
        { label: "render.ts", href: "/o/r/blob/main/tools/docgen/render.ts" },
      ],
    })
  })

  test("a flow the repository doesn't hold is named without a link; no run, no inputs; a marker names nothing", () => {
    expect(generatedLinksOf({ by: "manifest", output: { flow: "x" } }, href, () => false)).toEqual({
      flow: { label: "x" },
      sources: [],
    })
    expect(generatedLinksOf({ by: "marker" }, href, () => true)).toEqual({ sources: [] })
  })
})

describe("editInsteadOf", () => {
  test("the first source the repository has, else the flow's source, else nothing", () => {
    expect(editInsteadOf({ sources: [{ label: "a" }, { label: "b", href: "/b" }], flow: { label: "f", href: "/f" } }))
      .toEqual({ label: "b", href: "/b" })
    expect(editInsteadOf({ sources: [{ label: "a" }], flow: { label: "f", href: "/f" } })).toEqual({ label: "f", href: "/f" })
    expect(editInsteadOf({ sources: [], flow: { label: "f" } })).toBeUndefined()
    expect(editInsteadOf({ sources: [] })).toBeUndefined()
  })
})
