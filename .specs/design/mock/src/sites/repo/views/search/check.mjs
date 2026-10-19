import { createRequire } from "node:module"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, "../../../../../../../..")
const requireApp = createRequire(join(root, "apps/app/package.json"))
const esbuild = requireApp("esbuild")
const out = await mkdtemp(join(tmpdir(), "w1-find-check-"))
try {
  const entry = join(out, "check.mjs")
  await esbuild.build({
    entryPoints: [join(here, "check.ts")],
    outfile: entry,
    bundle: true,
    platform: "node",
    format: "esm",
    banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
    target: "es2022",
    jsx: "automatic",
    nodePaths: [join(root, "apps/app/node_modules"), join(root, "node_modules")],
    logLevel: "warning"
  })
  await import(pathToFileURL(entry).href)
} finally {
  await rm(out, { recursive: true, force: true })
}
