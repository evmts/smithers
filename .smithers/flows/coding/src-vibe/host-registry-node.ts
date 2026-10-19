// E-7/EK4402: node:fs/promises and node:path are platform APIs that VibeLang
// code does not call directly. host-registry.vibe runs this body through try,
// as host-registry.ts runs it through Effect.tryPromise.
import { lstat, mkdir, rename } from "node:fs/promises"
import { join, resolve } from "node:path"

// Only the archive directories move. Existing control journals, their codecs
// and their database locations are unchanged. Each rename is atomic, so a
// restart after moving one directory finishes the other rather than losing it.
export const relocateArchive = async (sourceRoot: string, stateRoot: string): Promise<void> => {
  const archiveRoot = join(stateRoot, "registry")
  if (resolve(sourceRoot) === resolve(archiveRoot)) throw new Error("Execution archive must be outside source")
  const legacy = join(sourceRoot, ".flows")
  const info = await lstat(legacy).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (info === undefined) return
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Legacy execution archive is not a directory")
  for (const kind of ["objects", "executions"]) {
    const from = join(legacy, kind), to = join(archiveRoot, ".flows", kind)
    const old = await lstat(from).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw error
    })
    if (old === undefined) continue
    if (!old.isDirectory() || old.isSymbolicLink()) throw new Error("Legacy execution archive is not a directory")
    // Never replace another retained archive. A conflicting destination is
    // visible rather than silently discarding either attempt's evidence.
    const present = await lstat(to).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw error
    })
    if (present !== undefined) throw new Error("Execution archive migration conflicts with retained state")
    await mkdir(join(archiveRoot, ".flows"), { recursive: true, mode: 0o700 })
    await rename(from, to)
  }
}

export const registryRoot = (stateRoot: string): string => join(stateRoot, "registry")
