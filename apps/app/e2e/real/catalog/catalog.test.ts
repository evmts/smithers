import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import ts from "typescript"
import { domains, flowById, flows, journeyFlows } from "./index"

const root = resolve(import.meta.dir, "../../../../..")
const real = resolve(root, "apps/app/e2e/real")
const mvp = readFileSync(resolve(root, ".specs/product/mvp.md"), "utf8")
const actions = readFileSync(resolve(root, ".specs/product/actions.md"), "utf8")
const operations = new Set<string>(JSON.parse(readFileSync(resolve(root, "catalog.mvp.json"), "utf8")).operations.map((op: { name: string }) => op.name))

/** Resolve heading/table identities, rather than accepting incidental prose mentions. */
function resolves(reference: string): boolean {
  if (/^J\d+$/.test(reference)) return mvp.split("\n").some((line) => line.startsWith(`### ${reference}. `))
  if (/^§\d+(?:\.\d+)*$/.test(reference)) {
    const section = reference.slice(1)
    return mvp.split("\n").some((line) => /^#{2,4} /.test(line) && line.replace(/^#+ /, "").startsWith(`${section} `))
  }
  if (/^M-\d+$/.test(reference)) return mvp.split("\n").some((line) => line.startsWith("| ") && line.split("|")[1]?.trim().split(/[ (]/)[0] === reference)
  if (/^Appendix [AB](?:\.\d+)?$/.test(reference)) {
    const heading = reference.replace("Appendix ", "")
    return mvp.split("\n").some((line) => line.startsWith(`## Appendix ${heading}. `) || line.startsWith(`### ${heading} `))
  }
  if (/^C\.\d+$/.test(reference)) return actions.split("\n").some((line) => line.startsWith(`## ${reference} `))
  return false
}

/** Scan string tokens, excluding comments, property names and embedded selector text. */
function flowTokens(source: string): string[] {
  const file = ts.createSourceFile("scenario.ts", source, ts.ScriptTarget.Latest, true)
  const ids: string[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (node.text.startsWith("flow" + ":") && node.text.length > 5) ids.push(node.text.slice(5))
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return ids
}

describe("real e2e product flow catalog", () => {
  test("unique dotted lowercase IDs and complete entries", () => {
    expect(flows.length).toBeGreaterThan(0)
    expect(flowById.size).toBe(flows.length)
    for (const flow of flows) {
      expect(flow.id).toMatch(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/)
      expect(flow.title.trim().length).toBeGreaterThan(0)
      expect(flow.spec.length).toBeGreaterThan(0)
      expect(flow).not.toHaveProperty("status")
      for (const issue of flow.issues ?? []) expect(Number.isInteger(issue) && issue > 0).toBe(true)
    }
    expect(flowById.has("auth.session")).toBe(true)
    expect(flowById.has("repo.open")).toBe(true)
    expect(Object.keys(domains)).toHaveLength(12)
    expect(Object.values(domains).every((entries) => entries.length > 0)).toBe(true)
  })

  test("every spec reference resolves to a source heading or decision", () => {
    for (const flow of flows) {
      for (const reference of flow.spec) expect(resolves(reference), `${flow.id}: ${reference}`).toBe(true)
    }
    for (const invalid of ["J12", "§6.99", "M-999", "Appendix B.99", "C.99", "arbitrary prose"]) expect(resolves(invalid)).toBe(false)
  })

  test("operations exist in the shared product catalog", () => {
    for (const flow of flows) {
      expect(new Set(flow.operations).size).toBe(flow.operations?.length ?? 0)
      for (const operation of flow.operations ?? []) expect(operations.has(operation), `${flow.id}: ${operation}`).toBe(true)
    }
  })

  test("layer exclusions cite a source and leave a plausible layer", () => {
    for (const flow of flows) {
      const excluded = Object.entries(flow.na ?? {})
      expect(excluded.length, flow.id).toBeLessThan(4)
      for (const [layer, reason] of excluded) {
        expect(["ui", "api", "cli", "tui"]).toContain(layer)
        const reference = reason.split(":")[0]
        expect(resolves(reference), `${flow.id}: ${reason}`).toBe(true)
        expect(reason.length).toBeGreaterThan(reference.length + 10)
      }
    }
  })

  test("each journey J1–J11 has catalog obligations with exact matching", () => {
    for (let n = 1; n <= 11; n++) {
      expect(journeyFlows(`J${n}`).length, `J${n}`).toBeGreaterThan(0)
      expect(journeyFlows(`J${n}`).every((flow) => flow.spec.includes(`J${n}`))).toBe(true)
    }
    expect(journeyFlows("J12")).toEqual([])
    expect(journeyFlows("J1").some((flow) => !flow.spec.includes("J10"))).toBe(true)
  })

  test("every literal flow token in the real tier names a catalog flow", async () => {
    for await (const path of new Bun.Glob("**/*.ts").scan({ cwd: real, absolute: true })) {
      for (const id of flowTokens(readFileSync(path, "utf8"))) expect(flowById.has(id), `${path}: ${id}`).toBe(true)
    }
  })

  test("token scanning ignores comments and ordinary flow properties", () => {
    const prefix = "flow" + ":"
    expect(flowTokens(`// '${prefix}unknown'\nconst flow = { flow: 'todo' }; const selector = 'card-${prefix}todo';`)).toEqual([])
    expect(flowTokens(`const tokens = ['${prefix}auth.session', \`${prefix}repo.open\`];`)).toEqual(["auth.session", "repo.open"])
  })
})
