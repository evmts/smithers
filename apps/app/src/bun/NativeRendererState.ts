import { randomUUID } from "node:crypto"
import {
  closeSync, constants, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync,
  openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync
} from "node:fs"
import { join, resolve } from "node:path"
import { z } from "zod"

const cookie = z.strictObject({
  name: z.string().min(1).regex(/^[^\s\x00-\x1f\x7f;,=]+$/),
  value: z.string().regex(/^[^\x00-\x1f\x7f;]*$/),
  path: z.string().startsWith("/").regex(/^[^\x00-\x1f\x7f]*$/),
  expiresAt: z.number().finite().positive()
})
const stateSchema = z.strictObject({
  version: z.literal(1),
  port: z.number().int().min(1).max(65535),
  sessions: z.record(z.string().regex(/^[a-f0-9]{64}$/), z.array(cookie))
})
export type NativeRendererSessions = z.infer<typeof stateSchema>["sessions"]

/** Native host state follows local bootstrap's private-file contract, never browser storage. */
export const openNativeRendererState = (stateDirectory: string) => {
  const directory = resolve(stateDirectory, "renderer")
  const path = join(directory, "state.json")
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const privateDirectory = () => {
    const info = lstatSync(directory)
    if (!info.isDirectory() || (info.mode & 0o077) !== 0 ||
      (process.getuid !== undefined && info.uid !== process.getuid())) {
      throw new Error("Native renderer state must be an owner-only directory.")
    }
  }
  const read = (): z.infer<typeof stateSchema> | undefined => {
    privateDirectory()
    let descriptor: number
    try {
      if (!lstatSync(path).isFile()) throw new Error("Native renderer state must be a private regular file.")
      descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    }
    catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return undefined
      throw new Error("Native renderer state cannot be opened.", { cause: error })
    }
    try {
      const info = fstatSync(descriptor)
      if (!info.isFile() || (info.mode & 0o077) !== 0 || info.size > 1024 * 1024 ||
        (process.getuid !== undefined && info.uid !== process.getuid())) {
        throw new Error("Native renderer state must be a private regular file.")
      }
      let decoded: unknown
      try { decoded = JSON.parse(readFileSync(descriptor, "utf8")) }
      catch { throw new Error("Native renderer state is invalid.") }
      const result = stateSchema.safeParse(decoded)
      if (!result.success) throw new Error("Native renderer state is invalid.")
      return result.data
    } finally { closeSync(descriptor) }
  }
  const stored = read()
  let published = stored !== undefined
  const syncDirectory = () => {
    const descriptor = openSync(directory, constants.O_RDONLY)
    try { fsyncSync(descriptor) } finally { closeSync(descriptor) }
  }
  return {
    port: stored?.port ?? 0,
    sessions: stored?.sessions ?? {},
    /** Called only while the relay owns its saved listening port. No port fallback is allowed. */
    save: (port: number, sessions: NativeRendererSessions): void => {
      privateDirectory()
      const previous = read()
      if (published && previous?.port !== port) throw new Error("Native renderer state changed while running.")
      const next = stateSchema.safeParse({ version: 1, port, sessions })
      if (!next.success) throw new Error("Native renderer state is invalid.")
      const bytes = JSON.stringify(next.data)
      if (Buffer.byteLength(bytes) > 1024 * 1024) throw new Error("Native renderer state is too large.")
      const temporary = join(directory, `.state-${randomUUID()}.tmp`)
      const descriptor = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600)
      try {
        try { writeFileSync(descriptor, bytes); fsyncSync(descriptor) }
        finally { closeSync(descriptor) }
        if (published) renameSync(temporary, path)
        else {
          // Exclusive publication prevents two first launches from choosing different origins.
          linkSync(temporary, path)
          published = true
        }
        syncDirectory()
      } finally {
        try { unlinkSync(temporary) }
        catch (error) {
          if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) throw error
        }
      }
      // A killed writer may leave a private staging file containing an older session.
      // Owning the recorded port excludes another live writer of this state.
      for (const name of readdirSync(directory)) {
        if (/^\.state-[a-f0-9-]+\.tmp$/.test(name)) unlinkSync(join(directory, name))
      }
      syncDirectory()
    }
  }
}
