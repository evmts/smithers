import { mergeConfig } from "vitest/config"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve, sep } from "node:path"
import base from "/Users/williamcory/smithers-vibe-twins/packages/smithers/build/build-cli/vitest.config.ts"
const pkg = "/Users/williamcory/smithers-vibe-twins/packages/smithers/build/build-cli"
const out = "/Users/williamcory/smithers-vibe-twins/packages/smithers/build/build-cli/.vibe-twin-snap/98537/src/packages/smithers/build/build-cli/src-vibe"
const src = join(pkg, "src") + sep
const twins = new Set(JSON.parse(readFileSync(join(out, ".vibe-twin-modules.json"), "utf8")))
// twin.mjs twinFor/fallbackFor, against this snapshot instead of .vibe-twin/.
const twinFor = (resolved) => {
  const file = resolved.split("?")[0]
  if (!file.startsWith(src) || !/\.(?:ts|tsx|mts)$/.test(file) || file.endsWith(".d.ts")) return undefined
  const rel = file.slice(src.length).replace(/\.(?:ts|tsx|mts)$/, "")
  return twins.has(rel) ? join(out, rel + ".js") : undefined
}
const fallbackFor = (source, importer) => {
  const twinRoot = out + sep
  if (!importer.startsWith(twinRoot) || !source.startsWith(".")) return undefined
  const target = resolve(dirname(importer), source.split("?")[0])
  const stem = target.replace(/\.(?:js|mjs|ts|tsx|vibe)$/, "")
  if (!stem.startsWith(twinRoot)) return undefined
  const rel = stem.slice(twinRoot.length)
  if (twins.has(rel) || twins.has(rel + "/index")) return undefined
  const typescript = [".ts", ".tsx", ".mts", "/index.ts", "/index.tsx"].map((x) => join(pkg, "src", rel + x)).find(existsSync)
  if (typescript !== undefined) return typescript
  const script = target.match(/\.(?:mjs|cjs|js)$/)?.[0]
  if (script !== undefined && !existsSync(target)) {
    const real = join(pkg, "src", rel + script)
    if (existsSync(real)) return real
  }
  return undefined
}
export default mergeConfig(base, {
  root: pkg,
  plugins: [{
    name: "vibe-twin-snapshot",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || importer.includes("/node_modules/")) return null
      if (importer.includes("/.vibe-twin-snap/")) return fallbackFor(source, importer) ?? null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      return resolved && twinFor(resolved.id) ? twinFor(resolved.id) : null
    }
  }],
  test: { coverage: { enabled: false } }
})
