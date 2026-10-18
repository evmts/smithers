import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { fallbackFor, normalizeDts, parseDts, twinFor } from "./twin.mjs"

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
    [`export { h, type I } from "./h.js";`, "reexport"], [`export * from "./j.js";`, "reexport"]
  ])
  assert.match(exports[0].text, /Doc for A/)
  assert.equal(exports[1].generic, true)
  assert.equal(exports[3].text.split("export declare function f").length, 3)
})

test("an import that resolves into src/ goes to the compiled twin when it exists", () => {
  const pkg = mkdtempSync(join(tmpdir(), "vibe-twin-"))
  const out = join(pkg, ".vibe-twin", "out", "src-vibe")
  mkdirSync(join(out, "a"), { recursive: true })
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
  const out = join(pkg, ".vibe-twin", "out", "src-vibe")
  mkdirSync(join(out, "a"), { recursive: true })
  mkdirSync(join(pkg, "src", "a"), { recursive: true })
  writeFileSync(join(out, "a", "b.js"), "")
  writeFileSync(join(pkg, "src", "flow-form.ts"), "")
  writeFileSync(join(pkg, "src", "a", "b.ts"), "")
  const importer = join(out, "a", "index.js")
  assert.equal(fallbackFor("./b.js", importer, pkg), undefined, "twinned: keep it")
  assert.equal(fallbackFor("../flow-form", importer, pkg), join(pkg, "src", "flow-form.ts"))
  assert.equal(fallbackFor("../flow-form.js", importer, pkg), join(pkg, "src", "flow-form.ts"))
  assert.equal(fallbackFor("effect", importer, pkg), undefined, "packages resolve normally")
  assert.equal(fallbackFor("./b.js", join(pkg, "test", "x.ts"), pkg), undefined, "only twin code falls back")
})
