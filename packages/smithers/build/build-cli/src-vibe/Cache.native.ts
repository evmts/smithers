// E-7 (EK4402): the Node platform calls Cache.vibe's plain helpers make: path arithmetic,
// Buffer byte counts and the UTF-16 key digest, process.stderr, and the live filesystem
// defaults for the I/O seams. One call each, exactly as Cache.ts makes them.
// A-2/E-4/E-5 (D38): `runAsync` runs a VibeLang program for a TypeScript caller that receives
// a Promise, where Cache.ts had an async function.
import { Effect } from "effect"
import { createHash } from "node:crypto"
import type * as NodeFsPromises from "node:fs/promises"
import * as Fs from "node:fs/promises"
import * as NodePath from "node:path"
import * as NodeUtil from "node:util/types"

/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export const runAsync = <A, E>(program: () => Effect.Effect<A, E>): Promise<A> => Effect.runPromise(program())

/** `createHash("sha256").update(Buffer.from(key, "utf16le")).digest("hex")`. */
export const utf16Sha256 = (key: string): string =>
  createHash("sha256").update(Buffer.from(key, "utf16le")).digest("hex")

/** `NodeUtil.isProxy`. */
export const isProxy = (value: unknown): boolean => NodeUtil.isProxy(value)

/** `Buffer.byteLength`. */
export const byteLength = (value: string, encoding: "utf8"): number => Buffer.byteLength(value, encoding)

/** `NodePath.relative`. */
export const relative = (from: string, to: string): string => NodePath.relative(from, to)

/** `NodePath.isAbsolute`. */
export const isAbsolute = (path: string): boolean => NodePath.isAbsolute(path)

/** `NodePath.join`. */
export const join = (...paths: Array<string>): string => NodePath.join(...paths)

/** `NodePath.dirname`. */
export const dirname = (path: string): string => NodePath.dirname(path)

/** `NodePath.basename`. */
export const basename = (path: string): string => NodePath.basename(path)

/** The default warning sink: one line on standard error. */
export const defaultWarn = (line: string): boolean => process.stderr.write(`${line}\n`)

/** Cache.ts `openDirectoryLive`: no portable directory descriptor on Windows. */
export const openDirectoryLive = (directory: string): Promise<NodeFsPromises.FileHandle | undefined> =>
  process.platform === "win32" ? Promise.resolve(undefined) : Fs.open(directory, "r")

/** Cache.ts `removeTempLive`. */
export const removeTempLive = (temp: string): Promise<void> => Fs.rm(temp, { force: true })
