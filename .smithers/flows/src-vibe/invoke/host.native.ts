// E-7: invoke/host.ts's synchronous filesystem and hashing helpers (node:crypto, node:fs,
// node:path), verbatim. VibeLang code does not call platform APIs (EK4402); host.vibe rebinds
// sourceDigest and runs the rest from its layer program.
import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import { resolverFiles } from "./host.vibe"

export const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex")

export type Measured = { readonly path: string; readonly contentDigest?: string | undefined }

const byPath = (modules: ReadonlyArray<Measured>) =>
  [...modules].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)

/**
 * The pinned identity of `.smithers/flows/<name>/flow.ts`: SHA-256 over the entry bytes,
 * then `\0<path>\0<sha256>` for each module the entry loads from beside itself
 * (POSIX path relative to the entry's directory), then
 * `\0config\0<path>\0<sha256>` for each resolver file ({@link resolverFiles})
 * in any directory from the closure up to and including the repository root
 * (POSIX path relative to the root, so a root file is its bare name), each
 * group sorted by path. A flow with neither pins
 * `sha256(flow.ts)`. `undefined` when a module cannot be measured.
 */
export const sourceDigest = (
  entry: Uint8Array,
  imports: ReadonlyArray<Measured>,
  configuration: ReadonlyArray<Measured> = []
): string | undefined => {
  const hash = createHash("sha256").update(entry)
  for (const module of byPath(imports)) {
    if (module.contentDigest === undefined) return undefined
    hash.update(`\0${module.path}\0${module.contentDigest}`)
  }
  for (const file of byPath(configuration)) {
    if (file.contentDigest === undefined) return undefined
    hash.update(`\0config\0${file.path}\0${file.contentDigest}`)
  }
  return hash.digest("hex")
}

/**
 * A root package.json redirects a non-relative specifier into unmeasured
 * repository code through `imports` (`#alias`) or a `name` + `exports`
 * self-reference. Unparseable bytes are refused rather than guessed at.
 */
const redirectsSpecifiers = (bytes: Uint8Array): boolean => {
  try {
    const json: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (typeof json !== "object" || json === null || Array.isArray(json)) return true
    return "imports" in json || ("name" in json && "exports" in json)
  } catch {
    return true
  }
}

/**
 * Every non-relative specifier must reach the host's pinned libraries, never
 * repository code. Bun and Node resolve one through tsconfig/jsconfig `paths`
 * and `baseUrl`, package.json `imports` and self-reference, and every
 * `node_modules` from the importing file up. Below the root no `node_modules`
 * may exist on the closure's path; root/node_modules may hold only the pinned
 * library links. Resolver files anywhere from the closure up to the root (a
 * repository's own `.smithers/flows/package.json`, say) are pinned by content and
 * refused when they `extends`, map `paths`, set `baseUrl`, declare `imports`,
 * or name themselves with `exports`.
 */
export const resolverConfiguration = (
  root: string,
  stateRoot: string,
  entryDirectory: string,
  imports: ReadonlyArray<Measured>
): ReadonlyArray<Measured> => {
  const refuse = (path: string) => {
    throw new Error(`Invocation refuses repository resolver configuration at ${relative(root, path) || "."}`)
  }
  const directories = new Set<string>([root])
  for (const module of [{ path: "flow.ts" }, ...imports]) {
    const directory = dirname(resolve(entryDirectory, module.path))
    if (directory !== root && !directory.startsWith(root + sep)) refuse(directory)
    for (let current = directory; current !== root; current = dirname(current)) directories.add(current)
  }
  for (const directory of directories) {
    if (directory !== root && existsSync(join(directory, "node_modules"))) refuse(join(directory, "node_modules"))
  }
  const libraries = realpathSync(join(stateRoot, "libraries")) + sep
  const modules = join(root, "node_modules")
  for (const name of existsSync(modules) ? readdirSync(modules) : []) {
    const entries = name.startsWith("@") ? readdirSync(join(modules, name)).map((child) => join(name, child)) : [name]
    for (const entry of entries) {
      if (!realpathSync(join(modules, entry)).startsWith(libraries)) refuse(join(modules, entry))
    }
  }
  return [...directories].flatMap((directory) =>
    resolverFiles.flatMap((name) => {
      const path = join(directory, name)
      if (!existsSync(path)) return []
      const bytes = readFileSync(path)
      if (name.endsWith("config.json") && /extends|paths|baseUrl|\\u/.test(bytes.toString("utf8"))) refuse(path)
      if (name === "package.json" && redirectsSpecifiers(bytes)) refuse(path)
      return [{ path: relative(root, path).split(sep).join("/"), contentDigest: sha256(bytes) }]
    })
  )
}

