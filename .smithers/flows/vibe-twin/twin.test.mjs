import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { normalizeDts, twinFor } from "./twin.mjs"

test("declarations that differ only in relative import extensions are equal", () => {
  const ts = `import { type A } from "./ErrorCode.ts";\nexport { B } from "../x/y.ts";\nexport declare const c: import("./z.ts").Z;\n`
  const vibe = `import { type A } from "./ErrorCode.js";\nexport { B } from "../x/y.vibe";\nexport declare const c: import("./z.js").Z;\n//# sourceMappingURL=a.d.ts.map\n`
  assert.equal(normalizeDts(ts), normalizeDts(vibe))
})

test("package imports and real type differences still differ", () => {
  assert.notEqual(normalizeDts(`export * from "effect/Data.ts"`), normalizeDts(`export * from "effect/Data.js"`))
  assert.notEqual(normalizeDts(`export declare const a: number;`), normalizeDts(`export declare const a: string;`))
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
