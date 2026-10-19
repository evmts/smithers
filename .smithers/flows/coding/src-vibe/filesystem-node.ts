// E-7/EK4402: node:crypto and node:path are platform APIs that VibeLang code
// does not call directly. filesystem.vibe takes its content digests, root
// resolution and run-ledger path keys from here, exactly as filesystem.ts
// computes them.
import { createHash } from "node:crypto"
import { isAbsolute, relative, resolve, sep } from "node:path"

export const digest = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex")

export const resolvePath = (path: string): string => resolve(path)

/** The repository-relative ledger key of a path, or undefined outside both roots. */
export const ledgerKey = (root: string, pinnedRoot: string, path: string): string | undefined => {
  const absolute = resolve(root, path)
  const suffix = relative(root, absolute)
  const canonicalSuffix = relative(pinnedRoot, absolute)
  const inside = (value: string) =>
    value !== "" && value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value)
  const target = inside(suffix) ? suffix : canonicalSuffix
  if (!inside(target)) return undefined
  return target.split(sep).join("/")
}
