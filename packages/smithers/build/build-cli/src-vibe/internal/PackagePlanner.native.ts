// E-7 (EK4402): the Node platform calls PackagePlanner.vibe makes from plain code and
// between awaits: node:path, node:fs, node:os, process and Buffer. One call each, exactly
// as PackagePlanner.ts makes them.
// A-2/E-4 (D38): `runAsync` is the runner boundary that hands `plan` and `binaryIdentity`
// to their TypeScript callers as Promises, as the async functions of PackagePlanner.ts did.
import { Effect } from "effect"
import * as NodeFs from "node:fs"
import * as NodeOs from "node:os"
import * as NodePath from "node:path"

/** `NodePath.join`. */
export const join = (...paths: ReadonlyArray<string>): string => NodePath.join(...paths)
/** `NodePath.dirname`. */
export const dirname = (path: string): string => NodePath.dirname(path)
/** `NodePath.posix.dirname`. */
export const posixDirname = (path: string): string => NodePath.posix.dirname(path)
/** `NodePath.isAbsolute`. */
export const isAbsolute = (path: string): boolean => NodePath.isAbsolute(path)
/** `NodePath.resolve`. */
export const resolve = (...paths: ReadonlyArray<string>): string => NodePath.resolve(...paths)
/** `NodePath.relative`. */
export const relative = (from: string, to: string): string => NodePath.relative(from, to)
/** `NodePath.basename`. */
export const basename = (path: string): string => NodePath.basename(path)
/** `process.platform`. */
export const platform = (): NodeJS.Platform => process.platform
/** `process.env`. */
export const environment = (): NodeJS.ProcessEnv => process.env
/** `process.env[name]`. */
export const environmentVariable = (name: string): string | undefined => process.env[name]
/** `process.version`. */
export const version = (): string => process.version
/** `process.arch`. */
export const arch = (): NodeJS.Architecture => process.arch
/** `NodeFs.existsSync`. */
export const existsSync = (path: string): boolean => NodeFs.existsSync(path)
/** `NodeFs.realpathSync`. */
export const realpathSync = (path: string): string => NodeFs.realpathSync(path)
/** `NodeOs.tmpdir`. */
export const tmpdir = (): string => NodeOs.tmpdir()
/** `NodeFs.appendFileSync(path, text)`. */
export const appendFileSync = (path: string, text: string): void => NodeFs.appendFileSync(path, text)
/** `Buffer.byteLength(text, "utf8")`. */
export const byteLength = (text: string): number => Buffer.byteLength(text, "utf8")

/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export const runAsync = <A, E>(program: () => Effect.Effect<A, E>): Promise<A> => Effect.runPromise(program())
