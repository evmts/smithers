import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { affectedTests, dropDefaultNever, exportDocs, pinImportMeta, privateMembers, suiteEnv, undeclarableModules, unnamedInferredTypes, exactPathPattern, fallbackFor, localNames, sourceExports, normalizeDts, parseDts, quality, sameReferencedLocals, sourceRoot, splitTwinErrors, stableName, twinFor } from "./twin.mjs"

test("declarations that differ only in relative import extensions are equal", () => {
  const ts = `import { type A } from "./ErrorCode.ts";\nexport { B } from "../x/y.ts";\nexport declare const c: import("./z.ts").Z;\n`
  const vibe = `import { type A } from "./ErrorCode.js";\nexport { B } from "../x/y.vibe";\nexport declare const c: import("./z.js").Z;\n//# sourceMappingURL=a.d.ts.map\n`
  assert.equal(normalizeDts(ts), normalizeDts(vibe))
})

test("package imports and real type differences still differ", () => {
  assert.notEqual(normalizeDts(`export * from "effect/Data.ts"`), normalizeDts(`export * from "effect/Data.js"`))
  assert.notEqual(normalizeDts(`export declare const a: number;`), normalizeDts(`export declare const a: string;`))
})

test("a .d.ts splits into exports: values, types and re-exports, overloads grouped", () => {
  const dts = `import { Effect } from "effect";
/** Doc for A. */
export interface A {
    readonly x: string;
    readonly y: { z: "}" };
}
export type B<T extends string = string> = T | number;
declare const C_base: any;
export declare class C extends C_base {
    m(): void;
}
export declare function f(x: string): number;
export declare function f(x: number): string;
export declare const g: (id: string) => Effect.Effect<string, never, never>;
export { h, type I } from "./h.js";
export * from "./j.js";
export {};
`
  const exports = parseDts(dts)
  assert.deepEqual(exports.map((e) => [e.name, e.kind]), [
    ["A", "type"], ["B", "type"], ["C", "class"], ["f", "value"], ["g", "value"],
    ["h", "value"], ["I", "type"], [`export * from "./j.js";`, "reexport"]
  ])
  assert.match(exports[0].text, /Doc for A/)
  assert.equal(exports[1].generic, true)
  assert.equal(exports[3].text.split("export declare function f").length, 3)
})

test("an import that resolves into src/ goes to the compiled twin when it exists", () => {
  const pkg = mkdtempSync(join(tmpdir(), "vibe-twin-"))
  const out = join(pkg, ".vibe-twin", "src", "src-vibe")
  mkdirSync(join(out, "a"), { recursive: true })
  mkdirSync(join(pkg, "src"), { recursive: true })
  writeFileSync(join(out, "a", "b.js"), "")
  writeFileSync(join(out, "a", "stub.js"), "")
  writeFileSync(join(out, ".vibe-twin-modules.json"), JSON.stringify(["a/b"]))
  assert.equal(twinFor(join(pkg, "src", "a", "stub.ts"), pkg), undefined, "a stub is not a twin")
  assert.equal(twinFor(join(pkg, "src", "a", "b.ts"), pkg), join(out, "a", "b.js"))
  assert.equal(twinFor(join(pkg, "src", "a", "b.ts?v=1"), pkg), join(out, "a", "b.js"))
  assert.equal(twinFor(join(pkg, "src", "a", "c.ts"), pkg), undefined, "no twin yet: keep the TypeScript")
  assert.equal(twinFor(join(pkg, "src", "a", "b.d.ts"), pkg), undefined)
  assert.equal(twinFor(join(pkg, "test", "b.ts"), pkg), undefined)
})

test("twin code falls back to src/ for a module the twin does not have yet", () => {
  const pkg = mkdtempSync(join(tmpdir(), "vibe-twin-"))
  const out = join(pkg, ".vibe-twin", "src", "src-vibe")
  mkdirSync(join(out, "a"), { recursive: true })
  mkdirSync(join(pkg, "src", "a"), { recursive: true })
  writeFileSync(join(out, "a", "b.js"), "")
  writeFileSync(join(pkg, "src", "flow-form.ts"), "")
  writeFileSync(join(pkg, "src", "a", "b.ts"), "")
  writeFileSync(join(out, ".vibe-twin-modules.json"), JSON.stringify(["a/b", "a/index"]))
  writeFileSync(join(out, "flow-form.js"), "// vibe-twin stub: not twinned yet\n")
  const importer = join(out, "a", "index.js")
  assert.equal(fallbackFor("./b.js", importer, pkg), undefined, "twinned: keep it")
  assert.equal(fallbackFor("../flow-form", importer, pkg), join(pkg, "src", "flow-form.ts"))
  assert.equal(fallbackFor("../flow-form.js", importer, pkg), join(pkg, "src", "flow-form.ts"))
  assert.equal(fallbackFor("effect", importer, pkg), undefined, "packages resolve normally")
  assert.equal(fallbackFor("./b.js", join(pkg, "test", "x.ts"), pkg), undefined, "only twin code falls back")
  writeFileSync(join(pkg, "src", "pack-release.mjs"), "")
  assert.equal(fallbackFor("../pack-release.mjs", importer, pkg), join(pkg, "src", "pack-release.mjs"), "a source .mjs the twin imports (S20-70)")
  writeFileSync(join(pkg, "src", "schema.ts"), "")
  writeFileSync(join(pkg, "src", "schema.js"), "")
  assert.equal(fallbackFor("../schema.js", importer, pkg), join(pkg, "src", "schema.ts"), "a .ts source wins over a compiled .js beside it")
})

test("quotes inside comments do not swallow later exports (finding B-3)", () => {
  const dts = `/**
 * Don't read this as a quote: it's prose.
 */
declare const helper: () => void;
/** The caller's error. */
export declare const toPlatformError: (e: unknown) => Error;
export declare class PermissionRequired {
}
`
  assert.deepEqual(parseDts(dts).map((e) => e.name), ["toPlatformError", "PermissionRequired"])
})

test("a module comment directly above an export's JSDoc keeps the export (finding D-1)", () => {
  const dts = `/**
 * Strict SHA-256 hashing.
 *
 * @since 1.0.0
 */
/**
 * Hashes a string.
 */
export declare const digest: (s: string) => string;
`
  assert.deepEqual(parseDts(dts).map((e) => [e.name, e.kind]), [["digest", "value"]])
})

test("VibeLang errors in unchanged TypeScript are findings, not twin errors (finding C-3)", () => {
  const errors = [
    "src-vibe/a.vibe(1,2): error EK1002: x",
    "src/Ownership.ts(363,5): error EK4820: never succeeds",
    "../canonical/src/x.ts(1,1): error TS2307: y",
    ".vibe-twin/api-check.ts(4,14): error TS2322: z",
    "src-vibe/hatch.ts(3,3): error TS2322: w"
  ]
  assert.deepEqual(splitTwinErrors(errors), {
    twin: [errors[0], errors[3], errors[4]],
    typescript: [errors[1], errors[2]]
  })
})

test("test names compare without run-dependent dates and numbers", () => {
  assert.equal(
    stableName("rejects roots: Sun Oct 18 2026 14:44:41 GMT-0700 (Pacific Daylight Time)"),
    stableName("rejects roots: Sun Oct 18 2026 14:51:02 GMT-0700 (Pacific Daylight Time)")
  )
  assert.equal(stableName("at 2026-10-18T21:44:41.123Z id 1760823881000"), stableName("at 2026-10-18T21:51:02Z id 1760824262000"))
  assert.notEqual(stableName("retries 3 times"), stableName("retries 4 times"))
  assert.notEqual(stableName("wide, seed 20260908"), stableName("wide, seed 20260909"), "a seed names its test (S12-1)")
})

test("a flat package's modules sit at its root, beside test/ (the .smithers/flows layout)", () => {
  const pkg = mkdtempSync(join(tmpdir(), "vibe-twin-"))
  const out = join(pkg, ".vibe-twin", "src", "src-vibe")
  mkdirSync(join(out, "coding"), { recursive: true })
  writeFileSync(join(out, "coding", "atoms.js"), "")
  writeFileSync(join(out, ".vibe-twin-modules.json"), JSON.stringify(["coding/atoms"]))
  assert.equal(sourceRoot(pkg), ".")
  assert.equal(twinFor(join(pkg, "coding", "atoms.ts"), pkg), join(out, "coding", "atoms.js"))
  assert.equal(twinFor(join(pkg, "test", "atoms.test.ts"), pkg), undefined)
})

test("quality counts the twin's hatch share, added casts and the held-template workaround", () => {
  const pkg = mkdtempSync(join(tmpdir(), "vibe-twin-"))
  mkdirSync(join(pkg, "src"), { recursive: true })
  mkdirSync(join(pkg, "src-vibe"), { recursive: true })
  writeFileSync(join(pkg, "src", "a.ts"), "export const a = 1 as unknown as number\n")
  writeFileSync(join(pkg, "src-vibe", "a.vibe"), "export const a = 1 as unknown as number\nconst x = y as any\n;(sql`CREATE TABLE t`)()\nif (false) { reject() }\nwhile (true) { break }\nsql.unsafe(`DROP TABLE t`)()\n")
  writeFileSync(join(pkg, "src-vibe", "hatch.ts"), "export const h = 1\n")
  const q = quality(pkg)
  assert.equal(q.castsAdded, 1)
  assert.equal(q.heldCalls, 1)
  assert.equal(q.constantConditionsAdded, 1)
  assert.equal(q.vibeLines, 7)
  assert.equal(q.hatchLines, 2)
})

test("identical export text passes unless a private name it mentions changed (B-5, guardian alias drift)", () => {
  const ts = localNames(`import * as Effect from "effect/Effect";\ntype Hidden = string;\ndeclare const Box_base: any;\nexport declare const answer: Hidden;\n`)
  const vb = localNames(`import * as Effect from "effect/Effect";\ntype Hidden = number;\ndeclare const Other_base: any;\nexport declare const answer: Hidden;\n`)
  assert.equal(sameReferencedLocals("export declare const answer: Hidden;", ts, vb), false, "Hidden changed")
  assert.equal(sameReferencedLocals("export interface Page<A> { items: ReadonlyArray<A>; run: Effect.Effect<A> }", ts, vb), true, "only Effect is mentioned, and it matches")
  assert.equal(sameReferencedLocals("export declare const x: HiddenThing;", ts, vb), true, "a longer name is not Hidden")
})

test("the Bun twin filter matches exactly the twinned paths", () => {
  const re = new RegExp(exactPathPattern(["/a/b.c/x.ts", "/a/(y)+.tsx"]))
  assert.ok(re.test("/a/b.c/x.ts"))
  assert.ok(re.test("/a/(y)+.tsx"))
  assert.ok(!re.test("/a/bXc/x.ts"), "a dot is literal")
  assert.ok(!re.test("/a/b.c/x.ts.bak"))
})

test("source exports list values, classes and types of a module TypeScript can't declare", () => {
  const src = `/** doc */
export const answer = new class { #secret = 1; value = 42 }()
export function run() {}
export abstract class Base {}
export interface Shape { readonly x: number }
export type Box<A> = { a: A }
const local = 1
export { local as renamed, type Shape as ShapeAlias }
export * from "./other.ts"
// export const commented = 1
`
  const e = sourceExports(src)
  assert.deepEqual([...e.values()].map((x) => [x.name, x.kind, x.generic]), [
    ["Base", "class", false], ["run", "value", false], ["answer", "value", false],
    ["Shape", "type", false], ["Box", "type", true], ["renamed", "value", false], ["ShapeAlias", "type", false]
  ])
})

test("errors in a dependency's declarations are findings, not twin errors (E-14)", () => {
  const dep = "../../../node_modules/.pnpm/zod@4.5.4/node_modules/zod/v4/classic/schemas.d.cts(790,5): error TS5115: Instantiations appear infinitely circular"
  assert.deepEqual(splitTwinErrors([dep, "src-vibe/a.vibe(1,1): error EK1: x"]), { twin: ["src-vibe/a.vibe(1,1): error EK1: x"], typescript: [dep] })
})

test("a local export list is one entry per name (E-14)", () => {
  const e = parseDts(`declare const ImplementPlan: number;\nexport { ImplementPlan };\ntype Hidden = string;\nexport { type Hidden as Shown };\n`)
  assert.deepEqual(e.map((x) => [x.name, x.kind]), [["ImplementPlan", "value"], ["Shown", "type"]])
})

test("a test that imports its own package by name is affected (S2-1)", () => {
  const pkg = mkdtempSync(join(tmpdir(), "vibe-twin-"))
  mkdirSync(join(pkg, "src", "flow", "internal"), { recursive: true })
  mkdirSync(join(pkg, "test"), { recursive: true })
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "@x/p", exports: { ".": "./src/index.ts", "./flow/internal/*": null, "./flow/*": "./src/flow/*.ts" } }))
  for (const f of ["index.ts", "flow/Command.ts", "flow/internal/x.ts", "Other.ts"]) writeFileSync(join(pkg, "src", f), "")
  writeFileSync(join(pkg, "test", "named.test.ts"), `import { run } from "@x/p/flow/Command"\n`)
  writeFileSync(join(pkg, "test", "root.test.ts"), `import { run } from "@x/p"\n`)
  writeFileSync(join(pkg, "test", "blocked.test.ts"), `import { x } from "@x/p/flow/internal/x"\n`)
  writeFileSync(join(pkg, "test", "other.test.ts"), `import { y } from "@x/q/flow/Command"\n`)
  const names = (twinned) => affectedTests(pkg, ["test"], twinned, "direct").map((f) => f.split("/").pop()).sort()
  assert.deepEqual(names(["flow/Command"]), ["named.test.ts"])
  assert.deepEqual(names(["index"]), ["root.test.ts"])
  assert.deepEqual(names(["flow/internal/x"]), [], "an export mapped to null is not importable")
})

test("Effect.Effect's default never arguments compare equal, nested and around arrows (D-3)", () => {
  assert.equal(dropDefaultNever("x: Effect.Effect<Resolved<H>, PluginError, never>;"), "x: Effect.Effect<Resolved<H>, PluginError>;")
  assert.equal(dropDefaultNever("Effect.Effect<A, never, never>"), "Effect.Effect<A>")
  assert.equal(dropDefaultNever("Effect.Effect<A, never, R>"), "Effect.Effect<A, never, R>", "R is not a default")
  assert.equal(dropDefaultNever("Effect.Effect<never>"), "Effect.Effect<never>")
  assert.equal(dropDefaultNever("Effect.Effect<(a: X) => Effect.Effect<B, E, never>, never>"), "Effect.Effect<(a: X) => Effect.Effect<B, E>>")
  assert.equal(dropDefaultNever(`Effect.Effect<"a>b", never>`), `Effect.Effect<"a>b">`)
  assert.equal(dropDefaultNever("MyEffect.Effect<A, never>"), "MyEffect.Effect<A, never>", "another namespace is untouched")
})

test("suites run without CI, whatever the caller's environment says", () => {
  process.env.CI = "true"
  try {
    assert.equal("CI" in suiteEnv(), false)
    assert.equal(suiteEnv({ NODE_OPTIONS: "--x" }).NODE_OPTIONS, "--x")
  } finally {
    delete process.env.CI
  }
})

test("modules TypeScript reports TS4094 for are undeclarable on both sides (S9-1)", () => {
  const pkg = mkdtempSync(join(tmpdir(), "vibe-twin-"))
  mkdirSync(join(pkg, "src"), { recursive: true })
  const set = undeclarableModules([
    "src/MaintenanceExport.ts(157,14): error TS4094: Property 'x' of exported anonymous class type may not be private or protected.",
    "src/a/Other.ts(1,1): error TS2322: nope",
    "../sibling/src/X.ts(3,3): error TS4094: elsewhere"
  ], pkg)
  assert.deepEqual([...set], ["MaintenanceExport"])
})

test("TS4094 private members group per module on either side (S9-1)", () => {
  const pkg = mkdtempSync(join(tmpdir(), "vibe-twin-"))
  mkdirSync(join(pkg, "src-vibe"), { recursive: true })
  writeFileSync(join(pkg, "src-vibe", "MaintenanceExport.vibe"), "\n".repeat(156) + "export const withSealedExport = 1\n")
  const m = privateMembers([
    "src-vibe/MaintenanceExport.vibe(157,14): error TS4094: Property 'snapshotContext' of exported anonymous class type may not be private or protected.",
    "src-vibe/MaintenanceExport.vibe(157,14): error TS4094: Property 'exportEnv' of exported anonymous class type may not be private or protected.",
    "src-vibe/MaintenanceExport.vibe(160,1): error TS4094: Property 'exportEnv' of exported anonymous class type may not be private or protected."
  ], pkg, "src-vibe")
  assert.deepEqual([...m], [["MaintenanceExport", { members: ["exportEnv", "snapshotContext"], exports: ["withSealedExport"] }]])
})

test("an export's docs are its own JSDoc and its members', not a dropped private's (S10-22)", () => {
  const own = "/** Grades a suite. */\nexport declare const ciGrade: number;"
  assert.equal(exportDocs("/** A private helper. */\n" + own), exportDocs(own), "an orphan above does not count")
  assert.notEqual(exportDocs("export declare const ciGrade: number;"), exportDocs(own), "a dropped doc counts")
  assert.notEqual(exportDocs("/** Grades  a\n * suite, differently. */\nexport declare const ciGrade: number;"), exportDocs(own))
  assert.equal(exportDocs("/** Grades\n *   a suite. */\nexport declare const ciGrade: number;"), exportDocs(own), "whitespace is not a difference")
  assert.notEqual(exportDocs("export interface A {\n  /** x */\n  x: 1\n}"), exportDocs("export interface A {\n  x: 1\n}"), "member docs count")
})

test("an import type's resolution-mode import attribute is not a difference (S10-3)", () => {
  assert.equal(
    normalizeDts(`export declare const make: () => import("effect/Crypto", { with: { "resolution-mode": "import" } }).Crypto;`),
    normalizeDts(`export declare const make: () => import("effect/Crypto").Crypto;`)
  )
  assert.notEqual(
    normalizeDts(`export declare const make: () => import("effect/Crypto", { with: { "resolution-mode": "require" } }).Crypto;`),
    normalizeDts(`export declare const make: () => import("effect/Crypto").Crypto;`),
    "require mode is a different resolution"
  )
})

test("default-never normalization leaves string literals and comments alone (guardian b-4zmezg)", () => {
  assert.notEqual(normalizeDts(`export type Shape = "Effect.Effect<number, never>";`), normalizeDts(`export type Shape = "Effect.Effect<number>";`))
  assert.notEqual(normalizeDts("export type T = `Effect.Effect<number, never>`;"), normalizeDts("export type T = `Effect.Effect<number>`;"))
  assert.equal(dropDefaultNever("/** Effect.Effect<A, never> */ x"), "/** Effect.Effect<A, never> */ x")
  assert.equal(dropDefaultNever("// Effect.Effect<A, never>\nx"), "// Effect.Effect<A, never>\nx")
  assert.equal(normalizeDts("export declare const r: Effect.Effect<R<H>, E, never>;"), normalizeDts("export declare const r: Effect.Effect<R<H>, E>;"))
})

test("an export TypeScript itself can't name is reproduced, not a twin error (S17-1)", () => {
  const pkg = mkdtempSync(join(tmpdir(), "vibe-twin-"))
  const m = unnamedInferredTypes([
    "correction.ts(512,14): error TS2883: The inferred type of 'correctionLayers' cannot be named without a reference to 'MemoryStore' from '../x.ts'. This is likely not portable.",
    "../repository/execution.ts(206,14): error TS2883: The inferred type of 'captureJobSource' cannot be named",
    "host.ts(1,1): error TS2322: nope"
  ], pkg, ".")
  assert.deepEqual([...m].map(([k, v]) => [k, [...v]]), [["correction", ["TS2883:correctionLayers"]]])
})

test("a twin's import.meta names the source file it twins (S20-1)", () => {
  const code = `const script = new URL("../smoke-release.mjs", import.meta.url)\nconst here = import.meta.dirname, me = import.meta.filename\nconst r = import.meta.resolve("x")\n`
  const pinned = pinImportMeta(code, "/repo/.smithers/flows/release/smoke/flow.ts")
  assert.match(pinned, /new URL\("..\/smoke-release.mjs", "file:\/\/\/repo\/.smithers\/flows\/release\/smoke\/flow.ts"\)/)
  assert.match(pinned, /const here = "\/repo\/.smithers\/flows\/release\/smoke", me = "\/repo\/.smithers\/flows\/release\/smoke\/flow.ts"/)
  assert.match(pinned, /import\.meta\.resolve\("x"\)/, "resolve stays")
})
