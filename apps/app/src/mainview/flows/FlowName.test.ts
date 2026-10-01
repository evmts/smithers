import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { operationNames, operationSources } from "../../../scripts/operation-sources"
import { FLOW_NAMES } from "./FlowName"

/*
 * The FlowName union is the card seam's vocabulary, so it has to stay the
 * registry's vocabulary. Both directions are checked here: a name in the union
 * that no module declares would let a dead button compile, and a declared flow
 * missing from the union cannot be raised from a card at all.
 *
 * The registry is read as TEXT (the same technique parity.test.ts uses), so a
 * declared flow counts without building the registry. A declaration names
 * itself in one of three places: most are `flow({ name: "x.y" })` rows inside an
 * entries module or `operation({ name: "x.y" })` rows in a shared operation
 * module (`@smthrs/ui/app-operations`), and a few — the storage-recovery pair — are `Flow.make({
 * name: CONSTANT })` declarations in their own flows module that an entries
 * module registers. Both are read, and a constant is resolved against the
 * `export const NAME = "x.y"` declarations in the mainview tree.
 */
const mainview = fileURLToPath(new URL("../", import.meta.url))

/** Every `export const NAME = "string"` under mainview, as a lookup. */
const stringConstants = (): ReadonlyMap<string, string> => {
  const constants = new Map<string, string>()
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = `${directory}${entry.name}`
      if (entry.isDirectory()) walk(`${path}/`)
      else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        for (const match of readFileSync(path, "utf8").matchAll(/\bexport const (\w+) = "([^"]+)"/g)) {
          constants.set(match[1]!, match[2]!)
        }
      }
    }
  }
  walk(mainview)
  return constants
}

const declaredNames = (): ReadonlyArray<string> => {
  const flows = fileURLToPath(new URL("./", import.meta.url))
  const entries = `${flows}entries/`
  const names: Array<string> = []
  for (const file of readdirSync(entries).sort()) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue
    const source = readFileSync(`${entries}${file}`, "utf8")
    for (const match of source.matchAll(/\bname:\s*"([^"]+)"/g)) names.push(match[1]!)
  }
  const shared = fileURLToPath(new URL(".", import.meta.resolve("@smthrs/ui/app-operations")))
  names.push(...operationNames(operationSources(shared)))
  const constants = stringConstants()
  for (const file of readdirSync(flows).sort()) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue
    const source = readFileSync(`${flows}${file}`, "utf8")
    for (const match of source.matchAll(/\bFlow\.make\(\{\s*name:\s*(?:"([^"]+)"|(\w+))\s*,/g)) {
      const name = match[1] ?? constants.get(match[2]!)
      if (name !== undefined) names.push(name)
    }
  }
  return names
}

describe("FlowName — the union is the registry's own vocabulary", () => {
  test("every declared flow is in the union", () => {
    const union = new Set<string>(FLOW_NAMES)
    const missing = declaredNames().filter((name) => !union.has(name))
    expect(missing).toEqual([])
  })

  test("every name in the union is a declared flow", () => {
    const declared = new Set(declaredNames())
    expect(FLOW_NAMES.filter((name) => !declared.has(name))).toEqual([])
  })

  test("the union names no flow twice", () => {
    expect(new Set<string>(FLOW_NAMES).size).toBe(FLOW_NAMES.length)
  })
})

const operationFixtureRoots: Array<string> = []
const operationFixture = () => {
  const root = mkdtempSync(join(tmpdir(), "smithers-operation-sources-"))
  operationFixtureRoots.push(root)
  const directory = join(root, "entries")
  mkdirSync(directory)
  const write = (relative: string, source: string) => {
    const file = join(root, relative)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, source)
    return file
  }
  return { root, directory, write }
}

afterEach(() => {
  while (operationFixtureRoots.length > 0) rmSync(operationFixtureRoots.pop()!, { recursive: true, force: true })
})

describe("operation declaration owners", () => {
  test("the public Account re-export contributes its actual declaration once", () => {
    const shared = fileURLToPath(new URL(".", import.meta.resolve("@smthrs/ui/app-operations")))
    const owner = realpathSync(fileURLToPath(import.meta.resolve("@smthrs/control/Account")))
    const sources = operationSources(shared)
    expect(sources.filter((source) => source.file === owner)).toHaveLength(1)
    expect(operationNames(sources)).toContain("account.show")
  })

  test("relative re-exports enumerate nested owners and terminate a real export cycle", () => {
    const fixture = operationFixture()
    const entry = fixture.write("entries/index.ts", "export * from \"../owners/first\"")
    const first = fixture.write(
      "owners/first.ts",
      "export * from \"./second\"; export const first = operation({ name: \"fixture.first\" })"
    )
    const second = fixture.write(
      "owners/second.ts",
      "export * from \"./first\"; export const second = operation({ name: \"fixture.second\" })"
    )
    fixture.write("entries/ignored.test.ts", "operation({ name: \"fixture.test-only\" })")
    fixture.write("entries/ignored.d.ts", "operation({ name: \"fixture.declaration-only\" })")
    const sources = operationSources(fixture.directory)
    expect(sources.map((source) => source.file).sort()).toEqual(
      [entry, first, second].map((file) => realpathSync(file)).sort()
    )
    expect([...operationNames(sources)].sort()).toEqual(["fixture.first", "fixture.second"])
  })

  test("a diamond and symlink alias share one physical owner without a false duplicate", () => {
    const fixture = operationFixture()
    const entry = fixture.write("entries/index.ts", "export * from \"./left\"; export * from \"./right\"")
    const left = fixture.write("entries/left.ts", "export { shared } from \"../owners/shared\"")
    const right = fixture.write("entries/right.ts", "export * from \"../owners/alias\"")
    const shared = fixture.write("owners/shared.ts", "export const shared = operation({ name: \"fixture.shared\" })")
    symlinkSync(shared, join(fixture.root, "owners/alias.ts"))
    const sources = operationSources(fixture.directory)
    expect(sources.map((source) => source.file).sort()).toEqual(
      [entry, left, right, shared].map((file) => realpathSync(file)).sort()
    )
    expect(operationNames(sources)).toEqual(["fixture.shared"])
  })

  test("public package exports resolve the executed Bun condition, not the default owner", () => {
    const fixture = operationFixture()
    fixture.write("entries/index.ts", "export { selected } from \"@fixture/operations\"")
    fixture.write(
      "node_modules/@fixture/operations/package.json",
      JSON.stringify({
        name: "@fixture/operations",
        version: "1.0.0",
        exports: { ".": { bun: "./bun.ts", default: "./default.ts" } }
      })
    )
    const selected = fixture.write(
      "node_modules/@fixture/operations/bun.ts",
      "export const selected = operation({ name: \"fixture.bun\" })"
    )
    const excluded = fixture.write(
      "node_modules/@fixture/operations/default.ts",
      "export const selected = operation({ name: \"fixture.default\" })"
    )
    const sources = operationSources(fixture.directory)
    expect(sources.some((source) => source.file === realpathSync(selected))).toBe(true)
    expect(sources.some((source) => source.file === realpathSync(excluded))).toBe(false)
    expect(operationNames(sources)).toEqual(["fixture.bun"])
  })

  test("ordinary name fields and other call names cannot inflate the operation inventory", () => {
    const fixture = operationFixture()
    fixture.write(
      "entries/index.ts",
      `
      export const metadata = { name: "fixture.metadata" }
      export const unrelated = otherOperation({ name: "fixture.unrelated" })
      export const selected = operation({ name: "fixture.actual", description: { name: "fixture.description" } })
    `
    )
    expect(operationNames(operationSources(fixture.directory))).toEqual(["fixture.actual"])
  })

  for (const target of ["./missing", "@fixture/missing"]) {
    test(`an unresolved ${target} re-export refuses instead of silently omitting declarations`, () => {
      const fixture = operationFixture()
      const entry = fixture.write("entries/index.ts", `export * from ${JSON.stringify(target)}`)
      expect(() => operationSources(fixture.directory)).toThrow(
        `Cannot resolve operation re-export ${target} from ${realpathSync(entry)}`
      )
    })
  }

  for (const layout of ["same-owner", "different-owners"]) {
    test(`duplicate names in ${layout} refuse the inventory`, () => {
      const fixture = operationFixture()
      const declaration = "export const selected = operation({ name: \"fixture.duplicate\" })"
      if (layout === "same-owner") {
        fixture.write("entries/index.ts", `${declaration}; operation({ name: "fixture.duplicate" })`)
      } else {
        fixture.write("entries/index.ts", "export * from \"../owners/first\"; export * from \"../owners/second\"")
        fixture.write("owners/first.ts", declaration)
        fixture.write("owners/second.ts", declaration)
      }
      expect(() => operationSources(fixture.directory)).toThrow("Duplicate operation fixture.duplicate")
    })
  }
})
