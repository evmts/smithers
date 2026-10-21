/**
 * Every fault case runs in the release gate's fault matrix (#3459).
 *
 * The release gate's "Exclusive fault matrix" runs `//packages/smithers:faults`.
 * A case its Vitest config does not select, or a file its target does not key
 * on, would leave the matrix silently smaller or let a cached run pass over a
 * case it never ran.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join, matchesGlob, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import release from "../vitest.faults.config.ts"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const pkg = join(root, "packages/smithers")

const walk = (dir: string): Array<string> =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]
  )
const faultCases = walk(join(pkg, "test/faults"))
  .map((file) => relative(pkg, file))
  .filter((file) => file.endsWith(".test.ts"))

const selects = (file: string): boolean =>
  (release.test?.include ?? []).some((pattern) => matchesGlob(file, pattern)) &&
  !(release.test?.exclude ?? []).some((pattern) => matchesGlob(file, pattern))

interface IndexedInput {
  readonly kind: string
  readonly pattern?: string
  readonly path?: string
  readonly exclude?: ReadonlyArray<string>
}
interface IndexedTarget {
  readonly label: string
  readonly rule: string
  readonly exclusive?: boolean
  readonly inputs: ReadonlyArray<IndexedInput>
}
const index = JSON.parse(readFileSync(join(root, ".smithers/target-index.json"), "utf8")) as Array<IndexedTarget>
const target = (label: string): IndexedTarget => {
  const found = index.find((entry) => entry.label === label)
  expect(found, `${label} is not in the target index`).toBeDefined()
  return found!
}
const keys = (indexed: IndexedTarget, file: string): boolean =>
  indexed.inputs.some((input) =>
    input.kind === "glob" && matchesGlob(file, input.pattern!) &&
    !(input.exclude ?? []).some((pattern) => matchesGlob(file, pattern))
  )

describe("fault matrix", () => {
  const faults = target("//packages/smithers:faults")

  it("declares the matrix as an exclusive Vitest target over its own config", () => {
    expect(faults.rule).toBe("Vitest")
    expect(faults.exclusive).toBe(true)
    expect(faults.inputs).toContainEqual({ kind: "file", path: "packages/smithers/vitest.faults.config.ts" })
  })

  it("selects and keys every fault case file", () => {
    expect(faultCases.length).toBeGreaterThan(20)
    for (const file of faultCases) {
      expect(selects(file), `${file} is not selected by vitest.faults.config.ts`).toBe(true)
      expect(keys(faults, `packages/smithers/${file}`), `${file} is not an input of the faults target`).toBe(true)
    }
  })
})
