// E-7 (EK4402): node:path and node:url are platform APIs that VibeLang code
// does not call directly. RegistryWorkspace.vibe resolves its two roots and
// relocates each locator here, exactly as RegistryWorkspace.ts computes them.
import { isAbsolute, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

/** `resolve(path)` from node:path. */
export const resolvePath = (path: string): string => resolve(path)

/** The locator of `value` under `identity` when it lies inside `workspace`, else `value`. */
export const locator = (identity: string, workspace: string) => (value: string): string => {
  const file = value.startsWith("file:")
  const path = file ? fileURLToPath(value) : value
  const suffix = relative(workspace, path)
  if (isAbsolute(suffix) || suffix === ".." || suffix.startsWith("../")) return value
  const target = resolve(identity, suffix)
  return file ? pathToFileURL(target).href : target
}
