// E-7 (EK4402): the Node platform calls session.vibe makes, one call each, under the names
// session.ts imports, so its plain file, folder and hash code reads unchanged.
// S13-2: `metadata` is a JavaScript generator that `summary` and `latest` drive with for...of and
// `.next()`/`.return()`; in a .vibe file `function*` declares a producer (a Stream), so it stays
// here, unchanged from session.ts, with its own file-descriptor reads.
import * as NodeCrypto from "node:crypto"
import * as NodeFs from "node:fs"
import * as NodeOs from "node:os"
import * as NodePath from "node:path"
import { StringDecoder } from "node:string_decoder"

export const createHash = (algorithm: string): NodeCrypto.Hash => NodeCrypto.createHash(algorithm)
export const randomUUID = (): string => NodeCrypto.randomUUID()

export const appendFileSync = (file: string, data: string, options: NodeFs.WriteFileOptions): void =>
  NodeFs.appendFileSync(file, data, options)
export const chmodSync = (path: string, mode: number): void => NodeFs.chmodSync(path, mode)
export const closeSync = (fd: number): void => NodeFs.closeSync(fd)
export const existsSync = (path: string): boolean => NodeFs.existsSync(path)
export const fstatSync = (fd: number): NodeFs.Stats => NodeFs.fstatSync(fd)
export const ftruncateSync = (fd: number, length: number): void => NodeFs.ftruncateSync(fd, length)
export const mkdirSync = (path: string, options: NodeFs.MakeDirectoryOptions & { recursive: true }): void => {
  NodeFs.mkdirSync(path, options)
}
export const openSync = (path: string, flags: string): number => NodeFs.openSync(path, flags)
export const readdirSync = (path: string): Array<string> => NodeFs.readdirSync(path)
export const readFileSync = (path: string, encoding: "utf8"): string => NodeFs.readFileSync(path, encoding)
export const readSync = (fd: number, buffer: Buffer, offset: number, length: number, position: number): number =>
  NodeFs.readSync(fd, buffer, offset, length, position)
export const renameSync = (from: string, to: string): void => NodeFs.renameSync(from, to)
export const rmSync = (path: string, options: NodeFs.RmOptions): void => NodeFs.rmSync(path, options)
export const statSync = (path: string): NodeFs.Stats => NodeFs.statSync(path)
export const writeFileSync = (file: string, data: string, options: NodeFs.WriteFileOptions): void =>
  NodeFs.writeFileSync(file, data, options)
export const writeSync = (fd: number, text: string, position: number, encoding: BufferEncoding): number =>
  NodeFs.writeSync(fd, text, position, encoding)

export const homedir = (): string => NodeOs.homedir()
export const basename = (path: string): string => NodePath.basename(path)
export const join = (...paths: Array<string>): string => NodePath.join(...paths)

/** `process.env.SMITHERS_TUI_SESSION_DIR`. */
export const sessionDirectory = (): string | undefined => process.env.SMITHERS_TUI_SESSION_DIR
/** `Buffer.byteLength(text)`. */
export const byteLength = (text: string): number => Buffer.byteLength(text)
/** `Buffer.allocUnsafe(size)`. */
export const allocUnsafe = (size: number): Buffer => Buffer.allocUnsafe(size)

/** Stream metadata lines only; event payloads never accumulate in memory. */
export function* metadata(file: string): Generator<string> {
  const fd = NodeFs.openSync(file, "r")
  const bytes = Buffer.allocUnsafe(64 * 1024)
  const decoder = new StringDecoder("utf8")
  let line = ""
  let skip = false
  try {
    while (true) {
      const size = NodeFs.readSync(fd, bytes, 0, bytes.length, null)
      if (size === 0) break
      const parts = decoder.write(bytes.subarray(0, size)).split("\n")
      for (let i = 0; i < parts.length; i++) {
        if (!skip) {
          line += parts[i]!
          if (line.length >= 32 && !/^\{"type":"(session|user|name)"/.test(line)) {
            skip = true
            line = ""
          }
        }
        if (i < parts.length - 1) {
          if (!skip) yield line
          line = ""
          skip = false
        }
      }
    }
    if (!skip && line !== "") yield line + decoder.end()
  } finally {
    NodeFs.closeSync(fd)
  }
}
