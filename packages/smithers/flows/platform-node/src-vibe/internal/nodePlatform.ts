/**
 * E-7/EK4402: `Buffer`, `node:util`'s `TextDecoder`, `node:fs`, `node:path`,
 * `node:os` and `process` are platform APIs, which VibeLang code does not call
 * directly (as in flows/database's and flows/jj's hatches). The `.vibe`
 * modules of this package read them through these one-line wrappers; every
 * wrapper is the source's own expression.
 */
import { accessSync, constants, lstatSync, readlinkSync, realpathSync, type Stats, statSync } from "node:fs"
import { isIP } from "node:net"
import { availableParallelism as osAvailableParallelism, tmpdir } from "node:os"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { TextDecoder } from "node:util"

const fatalUtf8 = new TextDecoder("utf-8", { fatal: true })

/** @vibelang trusted */
export const asciiBytes = (text: string): Buffer => Buffer.from(text, "ascii")

/** @vibelang trusted */
export const concatBytes = (list: ReadonlyArray<Uint8Array>, totalLength?: number): Buffer =>
  Buffer.concat(list, totalLength)

/** @vibelang trusted */
export const fatalUtf8Decode = (bytes: Uint8Array): string => fatalUtf8.decode(bytes)

/** @vibelang trusted */
export const base64Bytes = (encoded: string): Buffer => Buffer.from(encoded, "base64")

/** @vibelang trusted */
export const utf8ByteLength = (text: string): number => Buffer.byteLength(text, "utf8")

/** @vibelang trusted */
export const decodeText = (encoding: string | undefined, bytes: Uint8Array): string =>
  new TextDecoder(encoding).decode(bytes)

/** @vibelang trusted */
export const relativePath = (from: string, to: string): string => relative(from, to)

/** The platform's path segment separator, `node:path`'s `sep`. */
export const pathSeparator: string = sep

/** @vibelang trusted */
export const isAbsolutePath = (path: string): boolean => isAbsolute(path)

/** @vibelang trusted */
export const dirnameOf = (path: string): string => dirname(path)

/** @vibelang trusted */
export const basenameOf = (path: string): string => basename(path)

/** @vibelang trusted */
export const joinPath = (...segments: Array<string>): string => join(...segments)

/** @vibelang trusted */
export const realpathNative = (path: string): string => realpathSync.native(path)

/** @vibelang trusted */
export const lstatOf = (path: string): Stats => lstatSync(path)

/** @vibelang trusted */
export const statOf = (path: string): Stats => statSync(path)

/** @vibelang trusted */
export const readlinkOf = (path: string): string => readlinkSync(path)

/**
 * `accessSync(path, constants.X_OK)`: throws unless the file is executable.
 * @vibelang trusted
 */
export const requireExecutable = (path: string): void => {
  accessSync(path, constants.X_OK)
}

/**
 * `process.kill(pid, signal)`, the liveness probe's default signal.
 * @vibelang trusted
 */
export const signalProcess = (pid: number, signal: 0): void => {
  process.kill(pid, signal)
}

/** @vibelang trusted */
export const utf8Bytes = (text: string): Buffer => Buffer.from(text, "utf8")

/**
 * `process.env[name]`, read when called.
 * @vibelang trusted
 */
export const environmentVariable = (name: string): string | undefined => process.env[name]

/**
 * `process.platform`, read when called.
 * @vibelang trusted
 */
export const hostPlatform = (): string => process.platform

/** @vibelang trusted */
export const availableParallelism = (): number => osAvailableParallelism()

/**
 * `os.tmpdir()`.
 * @vibelang trusted
 */
export const temporaryDirectory = (): string => tmpdir()

/**
 * `path.resolve(...segments)`.
 * @vibelang trusted
 */
export const resolvePath = (...segments: Array<string>): string => resolve(...segments)

/**
 * `process.env`, the live record.
 * @vibelang trusted
 */
export const processEnvironment = (): NodeJS.ProcessEnv => process.env

/**
 * `net.isIP(address)`: 4, 6, or 0 when `address` is not an IP literal.
 * @vibelang trusted
 */
export const ipVersion = (address: string): number => isIP(address)
