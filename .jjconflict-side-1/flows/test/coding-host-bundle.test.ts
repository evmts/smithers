import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../..", import.meta.url))

/** Every TypeScript source the coding host may bundle. */
const sources = async function*(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* sources(path)
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) yield path
  }
}

// `bun:sqlite` is a Bun builtin, so the Node bundle keeps it behind a lazy
// shim that re-exports it by name. esbuild resolves an ESM named import
// against that shim's own exports: a name the shim does not list fails the
// BUILD, not the launch, and the coding host is the artifact a release
// publishes. effect 4.0.4 (#3839) added `constants` to the Bun SQLite client
// and the coding-host build broke on it.
test("the lazy bun:sqlite shim re-exports every name the bundled sources import", async () => {
  const build = await readFile(join(root, "flows/coding/build.mjs"), "utf8")
  const shim = build.slice(build.indexOf("lazy-bun-sqlite"))
  const exported = new Set([...shim.matchAll(/export const (\w+) = native\.\1/g)].map((match) => match[1]!))
  assert.ok(exported.has("Database"), "the shim must re-export Database")
  const imported = new Map<string, string>()
  for (const scope of ["packages/smithers", "flows"]) {
    for await (const path of sources(join(root, scope))) {
      const text = await readFile(path, "utf8")
      for (const match of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*"bun:sqlite"/g)) {
        for (const name of match[1]!.split(",")) {
          const bare = name.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim()
          if (bare !== "") imported.set(bare, path.slice(root.length))
        }
      }
    }
  }
  assert.ok(imported.size > 0, "no source imports bun:sqlite; this test has stopped measuring anything")
  const missing = [...imported].filter(([name]) => !exported.has(name))
  assert.deepEqual(
    missing,
    [],
    `flows/coding/build.mjs must re-export these bun:sqlite names: ${
      missing.map(([name, path]) => `${name} (${path})`).join(", ")
    }`
  )
})
