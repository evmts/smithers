// E-7: preserve the native host primitives used by plain synchronous APIs.
import * as NodePath from "node:path"
import * as NodeFs from "node:fs"
import * as NodeUtil from "node:util/types"
import * as Os from "node:os"
import { createHash } from "node:crypto"
import { StringDecoder } from "node:string_decoder"
import { stripVTControlCharacters } from "node:util"
import { Writable } from "node:stream"
export const isAbsolute = (path: string): boolean => NodePath.isAbsolute(path)
export const resolve = (...paths: string[]): string => NodePath.resolve(...paths)
export const relative = (from: string, to: string): string => NodePath.relative(from, to)
export const basename = (path: string): string => NodePath.basename(path)
export const join = (...paths: string[]): string => NodePath.join(...paths)
export const isProxy = (value: unknown): boolean => NodeUtil.isProxy(value)
export const isNativeError = (value: unknown): value is Error => NodeUtil.isNativeError(value)
export const readText = (path: string, encoding: "utf8"): string => NodeFs.readFileSync(path, encoding)
export const appendText = (path: string, text: string, encoding: "utf8"): void => NodeFs.appendFileSync(path, text, encoding)
export const hash: typeof createHash = (algorithm, options) => createHash(algorithm, options)
export const processEnvironment = (): typeof process.env => process.env
export const stdin = (): typeof process.stdin => process.stdin
export const stdout = (): typeof process.stdout => process.stdout
export const stderr = (): typeof process.stderr => process.stderr
export const parallelism = (): number => Os.availableParallelism()
export const byteLength: typeof Buffer.byteLength = (value, encoding) => Buffer.byteLength(value, encoding)
export const hex = (value: string): string => Buffer.from(value).toString("hex")
export const strip = (text: string): string => stripVTControlCharacters(text)
export const decoder = (encoding: NodeJS.BufferEncoding): StringDecoder => new StringDecoder(encoding)
export const writable = (options: ConstructorParameters<typeof Writable>[0]): Writable => new Writable(options)
type Tick = () => void
export const interval = (tick: Tick, delay: number): ReturnType<typeof setInterval> => setInterval(tick, delay)
export const clear = (timer: ReturnType<typeof setInterval>): void => clearInterval(timer)
export const onExit = (listener: Tick): void => { process.once("exit", listener) }
export const removeExit = (listener: Tick): void => { process.removeListener("exit", listener) }
