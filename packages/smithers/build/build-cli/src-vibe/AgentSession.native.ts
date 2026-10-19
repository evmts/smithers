// E-7 (EK4402): the Node platform primitives AgentSession.vibe does not call directly, each the
// AgentSession.ts code unchanged: process.env and process.platform, node:crypto digests, Buffer
// and TextDecoder byte handling, node:path, and the descriptor-level node:fs helpers (candidate
// overlay reads, inode-fresh publication, symlink-refusing path checks, and descriptor-anchored
// workspace reads) that the module's Effect.tryPromise bodies await. The .vibe module calls them
// from its `try` hatches, exactly where AgentSession.ts awaits them.
import { createHash, randomBytes } from "node:crypto"
import * as NodeFs from "node:fs"
import * as Fs from "node:fs/promises"
import * as NodePath from "node:path"
import type { CandidateOverlay } from "./AgentSession.vibe"
import { optionalOpenFlag } from "./internal/Fs.vibe"
import * as Path from "./internal/Path.vibe"

export const processEnvironment = (): NodeJS.ProcessEnv => process.env
export const platform = (): NodeJS.Platform => process.platform
export const sha256Hex = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex")
export const byteLength = (text: string): number => Buffer.byteLength(text, "utf8")
export const bufferFrom = (chunk: Uint8Array): Buffer => Buffer.from(chunk)
export const utf8Buffer = (text: string): Buffer => Buffer.from(text, "utf8")
export const utf8Text = (chunk: Uint8Array): string => Buffer.from(chunk).toString("utf8")
export const concatText = (chunks: ReadonlyArray<Buffer>): string => Buffer.concat(chunks).toString("utf8")
export const decodeUtf8Fatal = (bytes: Uint8Array): string => new TextDecoder("utf-8", { fatal: true }).decode(bytes)
export const resolve = (...paths: Array<string>): string => NodePath.resolve(...paths)

/** Reasons one edit path cannot be a workspace-relative regular path. */
export const editPathFailure = (path: string): string | undefined => {
  if (path.includes("\0") || /[\u0000-\u001f\u007f]/.test(path)) return "contains control characters"
  if (/^([/\\]|[A-Za-z]:)/.test(path)) return "is absolute"
  const segments = path.split(/[/\\]/)
  if (segments.some((segment) => segment === "" || segment === ".")) return "is not normalized"
  if (segments.includes("..")) return "leaves the workspace"
  if (segments[0] === ".git") return "names the repository database"
  return undefined
}

export const overlayOf = (
  workspaceRoot: string,
  files: ReadonlyMap<string, string | null>
): CandidateOverlay => ({
  files,
  read: async (path) => {
    if (files.has(path)) {
      const entry = files.get(path)
      return entry === null ? undefined : entry
    }
    try {
      return await Fs.readFile(NodePath.join(workspaceRoot, path), "utf8")
    } catch {
      return undefined
    }
  },
  render: () =>
    [...files.entries()]
      .sort(([left], [right]) => left < right ? -1 : 1)
      .map(([path, contents]) =>
        contents === null
          ? `=== ${path} (deleted) ===\n`
          : `=== ${path} (candidate) ===\n${contents}\n`
      )
      .join("\n")
})

/** Publishes new bytes on a fresh inode, retaining only ordinary permission bits. */
export const publishFile = async (path: string, contents: string, mode?: number): Promise<void> => {
  const permissions = mode === undefined ? undefined : mode & 0o777
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(12).toString("hex")}`
  const handle = await Fs.open(temporary, "wx", permissions)
  try {
    try {
      await handle.writeFile(contents, "utf8")
      if (permissions !== undefined) await handle.chmod(permissions)
      await handle.sync()
    } finally {
      await handle.close()
    }
    for (let attempt = 0;; attempt += 1) {
      try {
        await Fs.rename(temporary, path)
        break
      } catch (cause) {
        const code = (cause as NodeJS.ErrnoException).code
        // Windows replacement can briefly conflict with another replacement.
        // Retry the same closed inode; never unlink the published destination.
        if (
          process.platform !== "win32" || attempt >= 6 ||
          (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY")
        ) throw cause
        await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** attempt))
      }
    }
  } finally {
    await Fs.rm(temporary, { force: true })
  }
}

/** Checks each component, including the root, without following symlinks. */
export const editPathState = async (
  workspaceRoot: string,
  path: string
): Promise<ReadonlyMap<string, NodeFs.Stats | undefined>> => {
  const failure = editPathFailure(path)
  if (failure !== undefined) throw new Error(`candidate edit path ${JSON.stringify(path)} ${failure}`)
  const state = new Map<string, NodeFs.Stats | undefined>()
  let prefix = workspaceRoot
  for (const segment of ["", ...path.split("/")]) {
    prefix = NodePath.join(prefix, segment)
    let stat: NodeFs.Stats | undefined
    try {
      stat = await Fs.lstat(prefix)
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause
    }
    if (stat?.isSymbolicLink()) {
      throw new Error(`candidate edit ${JSON.stringify(path)} travels through a symlink at ${prefix}`)
    }
    if (stat !== undefined && !(prefix === NodePath.join(workspaceRoot, path) ? stat.isFile() : stat.isDirectory())) {
      throw new Error(`candidate edit ${JSON.stringify(path)} has a non-regular path component at ${prefix}`)
    }
    state.set(prefix, stat)
    if (stat === undefined) break
  }
  return state
}

/**
 * Reads one workspace file into a prompt through a descriptor that cannot
 * leave the workspace.
 *
 * Lexical containment is not enough here. `resolve` plus a `..` check judges
 * the text of a path, and `stat`/`readFile` then follow symlinks, so an
 * in-workspace link pointing at `~/.ssh/id_rsa` plus a declared path that
 * traverses it used to send a host file straight into a model prompt. The file
 * is opened without following a final-component link, the current pathname is
 * resolved and re-checked against the real workspace root, and that resolved
 * path must still name the same device and inode as the open descriptor. The
 * size and bytes then come from the descriptor, so a pathname replacement
 * cannot substitute a different file after validation.
 */
export const readWithinWorkspace = async (
  workspaceRoot: string,
  absolute: string,
  label: string,
  limit: number
): Promise<
  { readonly kind: "read"; readonly bytes: Buffer } | { readonly kind: "oversize"; readonly size: number }
> => {
  const realRoot = await Fs.realpath(NodePath.resolve(workspaceRoot))
  const handle = await Fs.open(absolute, NodeFs.constants.O_RDONLY | optionalOpenFlag("O_NOFOLLOW"))
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) throw new Error(`${label} is not a regular file`)
    const real = await Fs.realpath(absolute)
    if (!Path.contains(realRoot, real)) {
      throw new Error(`${label} resolves outside the workspace through a symlink`)
    }
    const resolved = await Fs.stat(real)
    if (stat.dev !== resolved.dev || stat.ino !== resolved.ino) {
      throw new Error(`${label} was replaced while it was being read`)
    }
    if (stat.size > limit) return { kind: "oversize", size: stat.size }
    const bytes = Buffer.alloc(stat.size)
    let offset = 0
    while (offset < stat.size) {
      const { bytesRead } = await handle.read(bytes, offset, stat.size - offset, offset)
      if (bytesRead === 0) break
      offset += bytesRead
    }
    return { kind: "read", bytes: bytes.subarray(0, offset) }
  } finally {
    await handle.close()
  }
}

