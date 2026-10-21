// The production build (`vite build`, which `pnpm run deploy` runs): it succeeds, and its service worker precaches
// the app's bundle and the engine worker, so an offline reload has both. Workbox skips a file over its size limit and
// fails the build; on 2026-10-20 both files outgrew its 2 MiB default and the first production deploy failed here.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { build } from "vite"
import { afterAll, expect, test } from "vitest"

const root = join(import.meta.dirname, "..")
const outDir = mkdtempSync(join(tmpdir(), "smithers-mvp-build-"))
afterAll(() => rmSync(outDir, { recursive: true, force: true }))

test("the production build succeeds and precaches the app's bundle and the engine worker", async () => {
  await build({ root, configFile: join(root, "vite.config.ts"), logLevel: "silent", build: { outDir, emptyOutDir: true } })
  const assets = readdirSync(join(outDir, "assets"))
  const bundle = assets.find((name) => /^index-.*\.js$/.test(name))
  const engine = assets.find((name) => /^engine\.worker-.*\.js$/.test(name))
  expect(bundle).toBeDefined()
  expect(engine).toBeDefined()
  const serviceWorker = readFileSync(join(outDir, "sw.js"), "utf8")
  expect(serviceWorker).toContain(`assets/${bundle}`)
  expect(serviceWorker).toContain(`assets/${engine}`)
}, 180_000)
