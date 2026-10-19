// E-7 (EK4402): node:fs, node:module and node:path are platform APIs that
// VibeLang code does not call directly. HostLanguageServers.vibe resolves the
// workspace roots, the program on PATH and its tsserver here, exactly as
// HostLanguageServers.ts does.
import { accessSync, constants, realpathSync } from "node:fs"
import { createRequire } from "node:module"
import { delimiter, isAbsolute, join, relative, resolve } from "node:path"

/** `resolve(path)` from node:path. */
export const resolvePath = (path: string): string => resolve(path)

/** The real path of `path`, or its resolved form when it cannot be read. */
export const realPath = (path: string): string => {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

/** Whether `path` lies at or below `root`. */
export const within = (root: string, path: string): boolean => {
  const inside = relative(root, path)
  return inside === "" || (!inside.startsWith("..") && !isAbsolute(inside))
}

/** The real path of the executable `name` on `PATH`, skipping relative entries. */
export const onPath = (name: string, PATH: string): string | undefined => {
  for (const directory of PATH.split(delimiter)) {
    if (directory === "" || !isAbsolute(directory)) continue
    const candidate = join(directory, name)
    try {
      accessSync(candidate, constants.X_OK)
      return realpathSync(candidate)
    } catch {
      continue
    }
  }
  return undefined
}

/** The real path of the tsserver installed beside `program`; throws when there is none. */
export const tsserverBeside = (program: string): string =>
  realpathSync(createRequire(program).resolve("typescript/lib/tsserver.js"))
