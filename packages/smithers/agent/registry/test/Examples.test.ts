import { describe, expect, it } from "vitest"
import { quickstart } from "../examples/quickstart.ts"

describe("examples", () => {
  it("quickstart lists the described flow, reports the refused one, and renders its prompt", async () => {
    const { root, catalog, warnings, xml, prompt } = await quickstart()

    expect(catalog).toEqual([{ name: "review", tier: "sealed", invocable: true }])
    expect(warnings).toEqual([
      { code: "missing_description", path: `${root}/.smithers/flows/draft/flow.mdx` },
      { code: "name_field_ignored", path: `${root}/.smithers/flows/draft/flow.mdx` }
    ])
    expect(xml).toBe([
      "<available_skills>",
      "  <skill>",
      "    <name>review</name>",
      "    <description>Reviews a proposed change and reports concrete correctness and maintainability risks.</description>",
      "  </skill>",
      "</available_skills>"
    ].join("\n"))
    expect(prompt).toBe([
      "",
      "Review the supplied change. Report only findings you can point at a line for.",
      "",
      "",
      "Supporting skill resources are available relative to this skill directory but are not loaded into context unless needed:",
      "<skill_resources>",
      `- Base directory: ${root}/.smithers/flows/review`,
      "- Resolve relative resource paths from this directory and read only the files you need.",
      "</skill_resources>",
      "",
      "the staged diff"
    ].join("\n"))
  })
})
