// C-1/D-2: guarded native inspection and descriptor reads catch defects; path rules call sibling TS.
import { PlatformError } from "effect"
import { closeSync, fstatSync, lstatSync, openSync, readFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { real, within } from "./approvals.ts"
const resolved = (cwd: string, path: string): { readonly path: string } | { readonly refused: string } => {
  try {
    const inside = within(cwd, path)
    return inside === undefined ? { refused: "outside this repository" } : { path: join(real(resolve(cwd)), inside) }
  } catch {
    return { refused: "too many symlinks" }
  }
}

/** Why `path` may not be read from `cwd`, or `undefined` when it may. */
export const refusalImpl = (cwd: string, path: string): string | undefined => {
  const target = resolved(cwd, path)
  return "refused" in target ? target.refused : undefined
}

const denied = (method: string, path: string, description: string): PlatformError.PlatformError =>
  PlatformError.systemError({
    _tag: "PermissionDenied",
    module: "FileSystem",
    method,
    pathOrDescriptor: path,
    description
  })

/** A Node read failure as the `PlatformError` the standard flows map. */
const failed = (method: string, path: string, cause: unknown): PlatformError.PlatformError => {
  const code = (cause as { readonly code?: unknown }).code
  return PlatformError.systemError({
    _tag: code === "ENOENT" || code === "ENOTDIR"
      ? "NotFound"
      : code === "EACCES" || code === "EPERM"
      ? "PermissionDenied"
      : "Unknown",
    module: "FileSystem",
    method,
    pathOrDescriptor: path,
    cause
  })
}

export const readBytesImpl = (cwd: string, path: string): { readonly success: Uint8Array } | { readonly failure: PlatformError.PlatformError } => {
    const absolute = resolve(cwd, path)
    let descriptor: number
    try {
      descriptor = openSync(absolute, "r")
    } catch (cause) {
      return { failure: failed("readFile", path, cause) }
    }
    try {
      const target = resolved(cwd, absolute)
      if ("refused" in target) return { failure: denied("readFile", path, target.refused) }
      const opened = fstatSync(descriptor)
      const named = statSync(target.path)
      if (opened.dev !== named.dev || opened.ino !== named.ino) {
        return { failure: denied("readFile", path, "changed while it was read") }
      }
      return { success: new Uint8Array(readFileSync(descriptor)) }
    } catch (cause) {
      return { failure: failed("readFile", path, cause) }
    } finally {
      closeSync(descriptor)
    }
}
export const isLinkImpl = (path: string): boolean => {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

