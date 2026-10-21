import * as Input from "@smthrs/targets/Input"
import * as NodeTest from "@smthrs/targets/NodeTest"
import * as Target from "@smthrs/targets/Target"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { circular, moduleGraph, report } from "../scripts/circular.mjs"
import { repoRoot } from "../scripts/workspace-packages.mjs"
import { CircularImports } from "../src/CircularImports.ts"
import { packageManager } from "./toolchain.ts"

const guard = join(repoRoot, "packages/repo-targets/scripts/circular.mjs")
// The guard resolves madge from the package it checks, as every package
// declares it; a fixture borrows the copy a migrated package declares.
const madge = dirname(createRequire(join(repoRoot, "packages/errors/package.json")).resolve("madge/package.json"))

const tsconfig = JSON.stringify({
  compilerOptions: {
    target: "ES2022",
    module: "NodeNext",
    moduleResolution: "NodeNext",
    strict: true,
    verbatimModuleSyntax: true,
    allowImportingTsExtensions: true,
    rewriteRelativeImportExtensions: true,
    noEmit: true,
    types: []
  },
  include: ["src/**/*"]
})

const fixtures: Array<string> = []
afterEach(() => {
  for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true })
})

/** A package with a tsconfig, madge, and these files. */
const scratchPackage = (files: Record<string, string>): string => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "repo-targets-circular-")))
  fixtures.push(directory)
  for (const [path, text] of Object.entries({
    "package.json": JSON.stringify({ name: "fixture", type: "module" }),
    "tsconfig.json": tsconfig,
    ...files
  })) {
    mkdirSync(dirname(join(directory, path)), { recursive: true })
    writeFileSync(join(directory, path), text)
  }
  mkdirSync(join(directory, "node_modules"), { recursive: true })
  symlinkSync(madge, join(directory, "node_modules/madge"), "dir")
  return directory
}

const user = [
  'import { greeting } from "./Greeting.vibe"',
  "",
  "export error NotFound { id: string }",
  "",
  "export function find(id: string): string!NotFound {",
  '  if (id === "") throw new NotFound({ id })',
  "  return greeting(id)",
  "}",
  ""
].join("\n")

const greeting = (importUser: string): string =>
  [
    importUser,
    "",
    "export function greeting(id: string): string {",
    "  return `Hello, ${id}`",
    "}",
    ""
  ].join("\n")

const sorted = (cycles: ReadonlyArray<ReadonlyArray<string>>): ReadonlyArray<ReadonlyArray<string>> =>
  cycles.map((cycle) => [...cycle].sort())

describe("circular", () => {
  it("finds a cycle through .vibe modules", async () => {
    const directory = scratchPackage({
      "src/User.vibe": user,
      "src/Greeting.vibe": greeting('import { find } from "./User.vibe"')
    })
    expect(sorted(await circular(directory))).toEqual([["src/Greeting.vibe", "src/User.vibe"]])
  })

  it("finds a cycle between a .ts module and the .vibe module it imports", async () => {
    const directory = scratchPackage({
      "src/index.ts": 'export { find } from "./User.vibe"\nexport const prefix = "user"\n',
      "src/User.vibe": user,
      "src/Greeting.vibe": greeting('import { prefix } from "./index.ts"')
    })
    expect(sorted(await circular(directory))).toEqual([["src/Greeting.vibe", "src/User.vibe", "src/index.ts"]])
  })

  it("does not count an import that loads nothing at run time", async () => {
    const directory = scratchPackage({
      "src/User.vibe": user,
      "src/Greeting.vibe": greeting('import type { NotFound } from "./User.vibe"\nexport type Missing = NotFound')
    })
    expect(await circular(directory)).toEqual([])
  })
})

describe("moduleGraph", () => {
  it("keeps the package's own files and leaves out nested packages and dependencies", () => {
    const directory = scratchPackage({
      "src/index.ts": [
        'import { find } from "./User.vibe"',
        'import { plugin } from "./plugins/inner/index.ts"',
        'import { dependency } from "dependency"',
        "export const all = [find, plugin, dependency]",
        ""
      ].join("\n"),
      "src/User.vibe": user,
      "src/Greeting.vibe": greeting(""),
      "src/plugins/inner/package.json": JSON.stringify({ name: "inner", type: "module" }),
      "src/plugins/inner/index.ts": 'export const plugin = "inner"\n',
      "node_modules/dependency/package.json": JSON.stringify({ name: "dependency", type: "module", types: "index.d.ts" }),
      "node_modules/dependency/index.d.ts": "export declare const dependency: string\n"
    })
    expect(moduleGraph({ directory })).toEqual({
      "src/Greeting.vibe": [],
      "src/User.vibe": ["src/Greeting.vibe"],
      "src/index.ts": ["src/User.vibe"]
    })
  })
})

describe("the circular program", () => {
  const run = (directory: string) =>
    spawnSync(process.execPath, [guard], { cwd: directory, encoding: "utf8", timeout: 60_000 })

  it("prints each cycle and exits 1, and exits 0 when the package has none", () => {
    const cyclic = scratchPackage({
      "src/User.vibe": user,
      "src/Greeting.vibe": greeting('import { find } from "./User.vibe"')
    })
    const failed = run(cyclic)
    expect(failed.status).toBe(1)
    expect(failed.stderr).toMatch(/^Circular dependencies found: 1\n {2}src\/(User|Greeting)\.vibe > src\/(User|Greeting)\.vibe > src\/\1\.vibe\n$/)
    const clean = run(scratchPackage({ "src/User.vibe": user, "src/Greeting.vibe": greeting("") }))
    expect([clean.status, clean.stderr]).toEqual([0, ""])
  })

  it("exits 2 with the compiler's diagnostics when it cannot read the project", () => {
    const directory = scratchPackage({ "src/User.vibe": user })
    writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({ compilerOptions: { notAnOption: true } }))
    const failed = run(directory)
    expect(failed.status).toBe(2)
    expect(failed.stderr).toContain("The compiler could not read tsconfig.json:")
    expect(failed.stderr).toContain("error TS5023: Unknown compiler option 'notAnOption'")
  })
})

describe("report", () => {
  it("is nothing for no cycles and one closed line per cycle otherwise", () => {
    expect(report([])).toBeUndefined()
    expect(report([["src/a.vibe", "src/b.ts"], ["src/c.ts", "src/d.ts", "src/e.ts"]])).toBe(
      [
        "Circular dependencies found: 2",
        "  src/a.vibe > src/b.ts > src/a.vibe",
        "  src/c.ts > src/d.ts > src/e.ts > src/c.ts"
      ].join("\n")
    )
  })
})

describe("CircularImports", () => {
  const attrsOf = (target: ReturnType<typeof CircularImports>): NodeTest.Attrs =>
    Target.metadata(target).attrs as NodeTest.Attrs

  it("runs the shared guard in the package, keyed on its sources, its tsconfig and the guard itself", () => {
    const target = CircularImports({
      cwd: "packages/errors",
      sources: [Input.glob("src/**/*.{ts,vibe}")],
      runtime: packageManager.runtime
    })
    const metadata = Target.metadata(target)
    expect([metadata.target, metadata.kinds]).toEqual(["NodeTest", ["test"]])
    const attrs = attrsOf(target)
    expect(attrs.cwd).toBe("packages/errors")
    expect(NodeTest.runArgv(attrs)).toEqual(["node", "../repo-targets/scripts/circular.mjs"])
    expect(attrs.srcs).toEqual([
      { _tag: "Glob", pattern: "src/**/*.{ts,vibe}", exclude: [] },
      { _tag: "File", path: "tsconfig.json" },
      { _tag: "File", path: "//packages/repo-targets/src/ImportAnalysis.ts" },
      { _tag: "File", path: "//packages/repo-targets/scripts/workspace-packages.mjs" }
    ])
  })

  it("takes another guard or runtime", () => {
    const attrs = attrsOf(CircularImports({
      cwd: "packages/smithers/flows/plan",
      sources: [Input.glob("src/**/*.ts")],
      script: Input.file("tools/cycles.mjs"),
      runtime: packageManager.runtime
    }))
    expect(NodeTest.runArgv(attrs)).toEqual(["node", "tools/cycles.mjs"])
    expect(attrs.srcs).toEqual([
      { _tag: "Glob", pattern: "src/**/*.ts", exclude: [] },
      { _tag: "File", path: "tsconfig.json" }
    ])
    expect(attrs.runtime).toEqual(packageManager.runtime)
  })
})
