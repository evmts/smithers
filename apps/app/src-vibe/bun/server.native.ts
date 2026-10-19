// E-7 (EK4402): the local host's platform: Bun's server, files and environment, Node's crypto,
// filesystem, OS and path modules, the global fetch, WebSocket client and console.
// A-2/E-4 (D38): the two `Effect.runFork` calls that start and interrupt a configured-model turn.
// server.vibe calls each of these exactly where server.ts makes the platform call.
import type { Serve, Server } from "bun"
import { Effect, Fiber } from "effect"
import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { existsSync, statSync } from "node:fs"
import { homedir } from "node:os"
import * as Path from "node:path"

/**
 * Constant-time comparison for the local session capability, the same
 * discipline PackagedE2EBridge and CloudAuth apply to their secrets. Hashing
 * both sides first gives timingSafeEqual equal lengths, so it never throws.
 */
export const sameSecret = (supplied: string, expected: string): boolean =>
  timingSafeEqual(createHash("sha256").update(supplied).digest(), createHash("sha256").update(expected).digest())

/** `randomBytes(32).toString("base64url")`. */
export const freshSessionToken = (): string => randomBytes(32).toString("base64url")

/** `homedir()`. */
export const homeDirectory = (): string => homedir()

/** `existsSync(path)`. */
export const fileExists = (path: string): boolean => existsSync(path)

/** `statSync(path, { throwIfNoEntry: false })?.isFile() === true`. */
export const isRegularFile = (path: string): boolean => statSync(path, { throwIfNoEntry: false })?.isFile() === true

/** `join(...)` from node:path. */
export const join = (...paths: Array<string>): string => Path.join(...paths)

/** `normalize(path)` from node:path. */
export const normalize = (path: string): string => Path.normalize(path)

/** `resolve(...)` from node:path. */
export const resolve = (...paths: Array<string>): string => Path.resolve(...paths)

/** `Bun.env`. */
export const bunEnv = (): Readonly<Record<string, string | undefined>> => Bun.env

/** `Bun.file(path)`. */
export const bunFile = (path: string): ReturnType<typeof Bun.file> => Bun.file(path)

/** `Bun.serve(options)`. */
export const bunServe = <T>(options: Serve.Options<T>): Server<T> => Bun.serve<T>(options)

/** `fetch(input, init)`. */
export const platformFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => fetch(input, init)

/** `console.log(line)`. */
export const consoleLog = (line: string): void => console.log(line)

/** `process.platform`. */
export const processPlatform = (): NodeJS.Platform => process.platform

/** `process.pid`. */
export const processId = (): number => process.pid

/** `Buffer.byteLength(text)`. */
export const utf8ByteLength = (text: string): number => Buffer.byteLength(text)

/** `WebSocket.OPEN` (S21-40). */
export const socketOpen = (): number => WebSocket.OPEN

/** Bun's WebSocket client with dial headers: `new WebSocket(target, { headers } as never)`. */
export const dialSocket = (target: string, headers: Record<string, string>) => new WebSocket(target, { headers } as never)

/** `Effect.runFork(program().pipe(Effect.ensuring(Effect.sync(onExit))))`. */
export const forkProgram = (program: () => Effect.Effect<void>, onExit: () => void): Fiber.Fiber<void> =>
  Effect.runFork(program().pipe(Effect.ensuring(Effect.sync(onExit))))

/** `Effect.runFork(Fiber.interrupt(fiber))`. */
export const interruptFiber = (fiber: Fiber.Fiber<void>): Fiber.Fiber<void> => Effect.runFork(Fiber.interrupt(fiber))
