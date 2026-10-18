import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, expect, it } from "vitest"
import { buildLibrary, copyCommonJsDeclarations, copyInputDeclarations } from "../scripts/build-library.mjs"

const roots: Array<string> = []
const scratch = () => {
  const root = mkdtempSync(join(tmpdir(), "repo-targets-build-library-"))
  roots.push(root)
  return root
}
const write = (path: string, text: string) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}
const read = (path: string) => readFileSync(path, "utf8")

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

it("copies only hand-written declarations, keeping their nested paths", () => {
  const root = scratch()
  write(join(root, "src/index.ts"), "export {}\n")
  write(join(root, "src/ambient.d.ts"), "declare const top: 1\n")
  write(join(root, "src/deep/er/shape.d.ts"), "export type Shape = 1\n")
  write(join(root, "src/deep/er/shape.d.ts.map"), "{}\n")
  copyInputDeclarations(join(root, "src"), join(root, "dist/esm"))
  expect(read(join(root, "dist/esm/ambient.d.ts"))).toBe("declare const top: 1\n")
  expect(read(join(root, "dist/esm/deep/er/shape.d.ts"))).toBe("export type Shape = 1\n")
  expect(existsSync(join(root, "dist/esm/index.ts"))).toBe(false)
  expect(existsSync(join(root, "dist/esm/deep/er/shape.d.ts.map"))).toBe(false)
})

it("mirrors ESM declarations and maps into the CommonJS branch and marks it CommonJS", () => {
  const root = scratch()
  write(join(root, "dist/esm/index.js"), "export {}\n")
  write(join(root, "dist/esm/index.d.ts"), "export {}\n")
  write(join(root, "dist/esm/nested/a.d.ts"), "export declare const a: 1\n")
  write(join(root, "dist/esm/nested/a.d.ts.map"), "{\"sources\":[\"../../../src/nested/a.ts\"]}\n")
  copyCommonJsDeclarations(root)
  expect(read(join(root, "dist/cjs/index.d.ts"))).toBe("export {}\n")
  expect(read(join(root, "dist/cjs/nested/a.d.ts"))).toBe("export declare const a: 1\n")
  expect(read(join(root, "dist/cjs/nested/a.d.ts.map"))).toBe("{\"sources\":[\"../../../src/nested/a.ts\"]}\n")
  expect(existsSync(join(root, "dist/cjs/index.js"))).toBe(false)
  expect(JSON.parse(read(join(root, "dist/cjs/package.json")))).toEqual({ type: "commonjs" })
})

// The fixture links the workspace's own esbuild and typescript into its
// node_modules, because buildLibrary resolves both from the package it builds.
const fixture = () => {
  const root = scratch()
  const require = createRequire(import.meta.url)
  for (const name of ["esbuild", "typescript"]) {
    mkdirSync(join(root, "node_modules"), { recursive: true })
    symlinkSync(dirname(require.resolve(`${name}/package.json`)), join(root, "node_modules", name), "dir")
  }
  write(join(root, "package.json"), JSON.stringify({ name: "fixture", type: "module" }))
  write(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
        target: "ES2022",
        strict: true,
        declaration: true,
        emitDeclarationOnly: true,
        allowImportingTsExtensions: true,
        rewriteRelativeImportExtensions: true,
        outDir: "dist/esm",
        rootDir: "src",
        skipLibCheck: true
      },
      include: ["src"]
    })
  )
  write(
    join(root, "src/index.ts"),
    [
      "export * from \"./lib/value.ts\"",
      "export const later = () => import(\"./lib/value.ts\")",
      "export const load = (specifier: string) => import(specifier)",
      ""
    ].join("\n")
  )
  write(join(root, "src/lib/value.ts"), "export const value = \"pkg/value.ts\"\n")
  write(join(root, "src/esm-only.ts"), "export const top = await Promise.resolve(1)\n")
  write(join(root, "src/types.d.ts"), "export type Hand = 1\n")
  return root
}

it("builds a CommonJS branch whose relative requires load the emitted .js files", async () => {
  const root = fixture()
  await buildLibrary(root, { esmOnly: ["esm-only.ts"] })
  const index = read(join(root, "dist/cjs/index.js"))
  expect(index).toContain("Promise.resolve().then(() => require(\"./lib/value.js\"))")
  expect(index).not.toMatch(/\.\/lib\/value\.ts/)
  // A computed specifier stays a native import(): require() cannot load a file URL.
  expect(index).toContain("import(specifier)")
  // A string literal that only looks like a module path stays untouched.
  expect(read(join(root, "dist/cjs/lib/value.js"))).toContain("\"pkg/value.ts\"")
  expect(existsSync(join(root, "dist/cjs/esm-only.js"))).toBe(false)
  expect(read(join(root, "dist/esm/types.d.ts"))).toBe("export type Hand = 1\n")
  expect(read(join(root, "dist/cjs/types.d.ts"))).toBe("export type Hand = 1\n")
  expect(existsSync(join(root, "dist/cjs/lib/value.d.ts"))).toBe(true)
  const loaded = createRequire(join(root, "dist/cjs/index.js"))("./index.js")
  expect(loaded.value).toBe("pkg/value.ts")
  expect((await loaded.later()).value).toBe("pkg/value.ts")
  write(join(root, "outside.mjs"), "export const named = \"esm\"\n")
  expect((await loaded.load(pathToFileURL(join(root, "outside.mjs")).href)).named).toBe("esm")
})

it("removes a stale dist and reports a failing declaration compile", async () => {
  const root = fixture()
  write(join(root, "dist/stale.txt"), "old\n")
  write(join(root, "src/broken.ts"), "export const broken: number = \"no\"\n")
  await expect(buildLibrary(root, { esmOnly: ["esm-only.ts"] })).rejects.toThrow(/^package compiler exited 2$/)
  expect(existsSync(join(root, "dist/stale.txt"))).toBe(false)
})
