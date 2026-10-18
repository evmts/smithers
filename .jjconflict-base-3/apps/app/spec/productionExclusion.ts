import { build } from "vite"
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

/** Build the ordinary entry and scan emitted code in addition to Vite's module graph guard. */
const output = await mkdtemp(join(tmpdir(), "smithers-production-exclusion-"))
try {
  let rejected = false
  try {
    await build({ configFile: resolve("vite.config.ts"), configLoader: "runner", logLevel: "silent",
      plugins: [{ name: "spec-exclusion-canary", transform(code, id) {
        if (id.endsWith("/src/mainview/main.tsx")) return `import ${JSON.stringify(resolve("spec/boot.ts"))};\n${code}`
      } }], build: { outDir: output }
    })
  } catch (error) {
    if (!String(error).includes("Production imports spec fixture")) throw error
    rejected = true
  }
  if (!rejected) throw new Error("Production graph accepted a spec import")
  await build({ configFile: resolve("vite.config.ts"), configLoader: "runner", logLevel: "warn", build: { outDir: output } })
  for (const path of await readdir(output, { recursive: true })) {
    if (!/\.(?:js|html|css)$/.test(path)) continue
    const code = await readFile(join(output, path), "utf8")
    if (code.includes("SMITHERS_SPEC_TRANSPORT_ONLY_4267")) throw new Error(`Spec sentinel in production: ${path}`)
  }
  console.log("production exclusion: module graph and emitted sentinel checks passed")
} finally { await rm(output, { recursive: true, force: true }) }
