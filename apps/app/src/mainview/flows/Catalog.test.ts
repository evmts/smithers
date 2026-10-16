import { FORM_INSTRUCTION_FIELDS, UI_INSTRUCTION_FIELDS } from "@smthrs/rpc/UiInstruction"
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import appendixA from "./fixtures/AppendixA.json"
import { generateCatalog, generateSkill, generateFormInstructions } from "../../../../../scripts/catalog-mvp"
import { lintText } from "../cards/productWords"
import { disclosedToAgent, visible, viewerAdmitted, type CommandState } from "./registry"

const rows = generateCatalog()
describe("C-CAT-01 literal Appendix A contract", () => {
  test("each shipped surface is declared exactly once with its reviewed actor policy", () => {
    expect(rows.filter(row => row.visibility === "core" || row.visibility === "advanced").map(row => row.name).sort())
      .toEqual(appendixA.map(row => row.name).sort())
    for (const expected of appendixA) {
      const actual = rows.filter(row => row.name === expected.name)
      expect(actual).toHaveLength(1)
      expect(actual[0]).toMatchObject({ slash: expected.slash, cli: expected.cli, visibility: expected.visibility,
        actors: expected.actors, minimumRole: expected.minimumRole, agent: expected.agent })
    }
  })
  /*
   * Every listed door says what IT does. `/sign-out` read "Sign in with
   * GitHub" — mvp.md §6.1's table describes the `/sign-in`, `/sign-out` PAIR
   * with one line, and the implementation copied that line onto both doors, so
   * the palette offered the same sentence twice and the signed-in person's own
   * exit named the act they had already done (`flows/entries/auth.ts`). The
   * summary is also the words a notice puts in place of the slash name
   * (`controller/failures.humanCommandText`), so a shared line misnames the act
   * wherever it is quoted.
   */
  test("no two listed doors say the same sentence", () => {
    const listed = rows.filter(row => row.visibility === "core" || row.visibility === "advanced")
    const shared = [...listed.reduce((seen, row) => seen.set(row.summary, [...(seen.get(row.summary) ?? []), row.name]),
      new Map<string, ReadonlyArray<string>>())].filter(([, names]) => names.length > 1)
    expect(shared).toEqual([])
    expect(listed.find(row => row.name === "sign-out")?.summary).toBe("Sign out")
    expect(listed.find(row => row.name === "sign-in")?.summary).toBe("Sign in with GitHub")
  })
  test("the owner-required email login door remains person-only", () => {
    expect(rows.find(row => row.name === "auth.email")).toMatchObject({ actors: ["person"], agent: "never", visibility: "in-card" })
  })
  test("the retained raw API CLI door grants no agent authority", () => {
    const playground = rows.find(row => row.name === "debug-api")!
    expect(playground).toMatchObject({
      cli: ["debug", "api"], actors: ["person"], agent: "never",
      http: { method: "GET", path: "/api/commands/debug-api", body: {} }
    })
    expect(disclosedToAgent(playground)).toBe(false)
    expect(generateSkill(rows)).not.toContain("smthrs debug api")
  })
  test("declared core doors remain visible to an eligible person despite legacy hidden hints", () => {
    const state = { viewerRole: "owner", surface: "chat", typing: false, hasConnectors: true, admin: true, signedOut: false } as CommandState
    const entry = { name: "branch", summary: "Open a branch", group: "Branches and machines", visibility: "core" as const,
      hidden: true, actors: ["person" as const, "app_agent" as const], minimumRole: "member" as const, agent: "run" as const }
    expect(viewerAdmitted(state, [entry]).map(row => row.name)).toEqual(["branch"])
    expect(viewerAdmitted(state, [{ ...entry, visibility: "hidden" }])).toEqual([])
    expect(viewerAdmitted({ ...state, viewerRole: "member" }, [{ ...entry, minimumRole: "owner" }])).toEqual([])
  })
  // Product §6.15 permits every member to read names and the Members card;
  // maintainer-only writes stay separate (engineering §5.2.0c).
  test("catalog regeneration is byte-for-byte stable", () => {
    expect(readFileSync(new URL("../../../../../catalog.mvp.json", import.meta.url), "utf8"))
      .toBe(JSON.stringify({ version: 1, operations: rows }, null, 2) + "\n")
  })
  test("hidden entries cannot opt into model disclosure", () => {
    expect(disclosedToAgent({ summary: "Hidden", visibility: "hidden", discloseToAgent: true, agent: "run" })).toBe(false)
    expect(disclosedToAgent({ summary: "Person", visibility: "in-card", agent: "never" })).toBe(false)
    expect(disclosedToAgent({ summary: "Control", visibility: "in-card", agent: "confirm", actors: ["person", "app_agent"] })).toBe(true)
    expect(visible([{ name: "control", summary: "Control", visibility: "in-card" }, { name: "read", summary: "Read", visibility: "core", hidden: true }]).map(row => row.name)).toEqual(["read"])
  })
})
describe("C-CAT-03 generated Smithers skill", () => {
  test("the committed Commands section is generated and uses product words", () => {
    const skill = readFileSync(new URL("../../../../../packages/smithers/skills/smithers/SKILL.md", import.meta.url), "utf8")
    expect("## Commands\n" + skill.split("## Commands\n")[1]).toBe(generateSkill(rows))
    for (const row of rows.filter(row => row.cli !== null)) expect(lintText(row.summary)).toEqual([])
    expect(generateSkill(rows)).not.toContain("smthrs settings")
    expect(generateSkill(rows)).not.toContain("smthrs members")
    expect(generateSkill(rows)).not.toContain("smthrs secrets")
    expect(generateSkill(rows)).toContain("smthrs search")
    expect(generateSkill(rows)).toContain("smthrs github")
    expect(generateSkill(rows)).toContain("smthrs merge` — confirm; waits for the person's confirmation")
  })
})

test("account form projection follows the real app catalog and preserves actor fences", async () => {
  const forms = await generateFormInstructions()
  expect(forms).toEqual(FORM_INSTRUCTION_FIELDS)
  expect(forms["flow.new"]).toEqual(["description", "repo"])
  expect(forms["flow.edit"]).toContain("request")
  expect(forms["flow.run"]).toContain("name")
  for (const name of ["issue.new", "todo.new", "todo.drop", "form.submit", "palette.open", "chat.retry", "toString", ...Object.keys(UI_INSTRUCTION_FIELDS)]) {
    expect(Object.hasOwn(forms, name)).toBe(false)
  }
  expect(forms["flow.edit"]).not.toContain("diff")
})
