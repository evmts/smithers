/**
 * E-7/EK4402: `node:crypto`, `node:fs`, `node:net`, `node:os`, `node:tls`,
 * `Buffer` and `process` are platform APIs, which VibeLang code does not call
 * directly. `ProcessSupervisor.vibe`'s `Control`, `connectOwner` and `prepare`
 * read them through these wrappers; each is the source's own call.
 */
import { randomBytes } from "node:crypto"
import { chmodSync, mkdtempSync, rmdirSync, rmSync } from "node:fs"
import { createConnection, createServer, type Server, type Socket } from "node:net"
import { tmpdir } from "node:os"
import { join, parse, resolve } from "node:path"
import * as Tls from "node:tls"

const tlsOptions = { minVersion: "TLSv1.3", maxVersion: "TLSv1.3", ciphers: "TLS_AES_128_GCM_SHA256" } as const

/**
 * `randomBytes(32)`, one channel's pre-shared key.
 * @vibelang trusted
 */
export const channelKey = (): Buffer => randomBytes(32)

/**
 * `mkdtempSync(prefix)`.
 * @vibelang trusted
 */
export const makeTemporaryDirectory = (prefix: string): string => mkdtempSync(prefix)

/**
 * `join(tmpdir(), name)`.
 * @vibelang trusted
 */
export const inTemporaryRoot = (name: string): string => join(tmpdir(), name)

/**
 * `chmodSync(directory, 0o700)`.
 * @vibelang trusted
 */
export const makePrivate = (directory: string): void => {
  chmodSync(directory, 0o700)
}

/**
 * `rmSync(path, { recursive: true, force: true })`.
 * @vibelang trusted
 */
export const removeTree = (path: string): void => {
  rmSync(path, { recursive: true, force: true })
}

/**
 * `rmSync(path, { force: true })`.
 * @vibelang trusted
 */
export const removeFile = (path: string): void => {
  rmSync(path, { force: true })
}

/**
 * `rmdirSync(directory)`.
 * @vibelang trusted
 */
export const removeDirectory = (directory: string): void => {
  rmdirSync(directory)
}

/**
 * `createServer(accept)`, a native socket server.
 * @vibelang trusted
 */
export const nativeServer = (accept: (socket: Socket) => void): Server => createServer(accept)

/**
 * A TLS 1.3 PSK server, as the source's `Control.makeServer` builds one.
 * @vibelang trusted
 */
export const pskServer = (
  handshakeTimeout: number,
  pskCallback: (socket: Tls.TLSSocket, identity: string) => Buffer | null,
  accept: (socket: Socket) => void
): Server => Tls.createServer({ ...tlsOptions, handshakeTimeout, pskCallback }, accept)

/**
 * `createConnection(path)`.
 * @vibelang trusted
 */
export const connectNative = (path: string): Socket => createConnection(path)

/**
 * A TLS 1.3 PSK connection to the loopback owner channel, as `connectOwner` opens it.
 * @vibelang trusted
 */
export const connectPsk = (port: number, key: string): Socket =>
  Tls.connect({
    ...tlsOptions,
    host: "127.0.0.1",
    port,
    pskCallback: () => ({ identity: "smithers-owner", psk: Buffer.from(key, "hex") })
  })

/**
 * `Buffer.byteLength(data)`.
 * @vibelang trusted
 */
export const byteLength = (data: string): number => Buffer.byteLength(data)

/**
 * `process.versions.bun`.
 * @vibelang trusted
 */
export const bunVersion = (): string | undefined => process.versions.bun

/**
 * `globalThis.Bun?.main`.
 * @vibelang trusted
 */
export const bunMain = (): string => (globalThis as { readonly Bun?: { readonly main?: string } }).Bun?.main ?? ""

/**
 * `process.execPath`.
 * @vibelang trusted
 */
export const execPath = (): string => process.execPath

/**
 * `parse(process.execPath).root`.
 * @vibelang trusted
 */
export const executableRoot = (): string => parse(process.execPath).root

/**
 * `process.env`, the live record.
 * @vibelang trusted
 */
export const environment = (): NodeJS.ProcessEnv => process.env

/**
 * `resolve(path)`.
 * @vibelang trusted
 */
export const resolvePath = (path: string): string => resolve(path)

/**
 * `process.cwd()`.
 * @vibelang trusted
 */
export const currentDirectory = (): string => process.cwd()

/**
 * `process.platform`, read when called.
 * @vibelang trusted
 */
export const hostPlatform = (): string => process.platform
