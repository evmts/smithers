import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { normalizeDts, parseDts, twinFor } from "./twin.mjs"

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
  mkdirSync(join(pkg, ".vibe-twin", "out", "a"), { recursive: true })
  writeFileSync(join(pkg, ".vibe-twin", "out", "a", "b.js"), "")
  assert.equal(twinFor(join(pkg, "src", "a", "b.ts"), pkg), join(pkg, ".vibe-twin", "out", "a", "b.js"))
  assert.equal(twinFor(join(pkg, "src", "a", "b.ts?v=1"), pkg), join(pkg, ".vibe-twin", "out", "a", "b.js"))
  assert.equal(twinFor(join(pkg, "src", "a", "c.ts"), pkg), undefined, "no twin yet: keep the TypeScript")
  assert.equal(twinFor(join(pkg, "src", "a", "b.d.ts"), pkg), undefined)
  assert.equal(twinFor(join(pkg, "test", "b.ts"), pkg), undefined)
})
