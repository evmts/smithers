/** Test-only source resolution for workspace packages absent from this jj lane's
 * node_modules. Real scorer implementations run; no package APIs are mocked. */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const packages = new Map(["core", "canonical", "crypto"].map(name => {
  const directory = new URL(`../../../../../packages/smithers/flows/${name}/`, import.meta.url)
  return [`@smthrs/${name}`, { directory, exports: JSON.parse(readFileSync(new URL("package.json", directory), "utf8")).exports }]
}))
const source = specifier => {
  for (const [name, pkg] of packages) {
    if (specifier === name || specifier.startsWith(`${name}/`)) {
      const target = pkg.exports[specifier === name ? "." : `.${specifier.slice(name.length)}`]
      if (typeof target === "string") return new URL(target, pkg.directory)
    }
  }
}
if (globalThis.Bun) {
  Bun.plugin({ name: "mock-fidelity-workspace-sources", setup(build) {
    build.onResolve({ filter: /^@smthrs\/(core|canonical|crypto)(\/|$)/ }, args => {
      const url = source(args.path)
      return url ? { path: fileURLToPath(url) } : undefined
    })
  } })
} else {
  const { registerHooks } = await import("node:module")
  registerHooks({ resolve(specifier, context, next) {
    return next(source(specifier)?.href ?? specifier, context)
  } })
}
