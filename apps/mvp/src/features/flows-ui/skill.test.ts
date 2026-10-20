// A person's flow as a `SKILL.md` (src/features/flows-ui/skill.ts, decision 0014 §2): written from a draft's fields,
// read back through the registry's `MarkdownFlow`, and checked by decision 0014's static checks, each failure by code.
import { describe, expect, test } from "vitest"
import { MAX_SKILL_BYTES } from "./contract"
import { checkSkill, passes, readSkill, renderSkill, type Skill } from "./skill"

const notes: Skill = {
  name: "release-notes",
  description: "Summarize merged pull requests: since the last tag.",
  flows: ["repo/read", "repo/tree"],
  instructions: "Read the repository.\n\nThen summarize what merged.",
}

const allowed = ["repo/read", "repo/tree", "app/theme/set"]

/** The failing checks of `text`, as `check:code`. */
const failures = (text: string, name = "release-notes", calls = allowed) =>
  checkSkill(text, name, calls).filter((check) => !check.ok).map((check) => `${check.check}:${check.code}`)

describe("renderSkill and readSkill", () => {
  test("a rendered flow reads back as written, quotes and colons included", () => {
    const text = renderSkill(notes)
    expect(text.startsWith("---\nname: release-notes\n")).toBe(true)
    expect(readSkill(text, "release-notes")).toEqual({ skill: notes, model: undefined, placement: undefined, warnings: [] })
    expect(passes(checkSkill(text, "release-notes", allowed))).toBe(true)
  })

  test("a flow that calls nothing has no flows: list", () => {
    const text = renderSkill({ ...notes, flows: [] })
    expect(text).not.toContain("flows:")
    expect(readSkill(text, "release-notes").skill?.flows).toEqual([])
  })

  test("text without frontmatter, or without a description, reads as nothing", () => {
    expect(readSkill("Just instructions.", "release-notes")).toMatchObject({ skill: undefined })
    const read = readSkill("---\nname: release-notes\n---\n\nDo it.\n", "release-notes")
    expect(read.skill).toBeUndefined()
    expect(read.warnings).toContain("missing_description")
  })
})

describe("checkSkill", () => {
  test("every check passes for a good flow", () => {
    expect(checkSkill(renderSkill(notes), "release-notes", allowed)).toEqual([
      { check: "parses", ok: true },
      { check: "name", ok: true },
      { check: "description", ok: true },
      { check: "calls", ok: true },
      { check: "model", ok: true },
      { check: "size", ok: true },
    ])
  })

  test("names: the pattern, the app's names, and the name it should have", () => {
    expect(failures(renderSkill({ ...notes, name: "Release" }), "Release")).toContain("name:pattern")
    expect(failures(renderSkill({ ...notes, name: "theme" }), "theme")).toEqual(["name:reserved"])
    expect(failures(renderSkill(notes), "other-name")).toEqual(["parses:directory_name_mismatch", "name:mismatch"])
  })

  test("descriptions over 1,024 characters fail, as the registry warns", () => {
    expect(failures(renderSkill({ ...notes, description: "x".repeat(1025) }))).toEqual([
      "parses:invalid_description",
      "description:length",
    ])
  })

  test("calls: only allowed flows, never an authoring or run act, at most 20", () => {
    expect(failures(renderSkill({ ...notes, flows: ["flow/new"] }), "release-notes", [...allowed, "flow/new"]))
      .toEqual(["calls:forbidden"])
    expect(failures(renderSkill({ ...notes, flows: ["repo/write"] }))).toEqual(["calls:unknown"])
    const many = Array.from({ length: 21 }, (_, index) => `app/f${index}`)
    expect(failures(renderSkill({ ...notes, flows: many }), "release-notes", many)).toEqual(["calls:too_many"])
  })

  test("a model must be the endpoint's agent role, and a flow declares no placement", () => {
    const withField = (field: string) => renderSkill(notes).replace("---\n\n", `${field}\n---\n\n`)
    expect(failures(withField("model: agent"))).toEqual([])
    expect(failures(withField("model: claude-opus-4-1"))).toEqual(["model:model"])
    expect(failures(withField("placement: sandbox"))).toContain("model:placement")
  })

  test("a file that doesn't read fails every check that needs it", () => {
    expect(failures("no frontmatter")).toEqual([
      "parses:missing_name",
      "name:pattern",
      "description:length",
      "calls:unread",
    ])
  })

  test("a file over 64 KiB fails size", () => {
    expect(failures(renderSkill({ ...notes, instructions: "x".repeat(MAX_SKILL_BYTES) }))).toEqual(["size:too_large"])
  })
})
