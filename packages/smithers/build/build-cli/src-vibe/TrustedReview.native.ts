// A-2/E-4/E-5 (D38): `runAsync` hands a VibeLang program's result to TypeScript callers as a
// Promise where TrustedReview.ts exported an async function; `awaited` is that function's
// `await` of a TypeScript Promise, so a rejection (or a throw while making it) is an expected
// failure. `runResult` is TrustedReview.ts's own `Effect.runPromise(Effect.result(...), { signal })`
// runner, which interrupts only the running review when the caller's signal aborts.
// E-7 (EK4402): process, node:fs/promises, node:path and Buffer are platform APIs that
// TrustedReview.vibe does not call directly.
import { Effect, type Result } from "effect"
import * as Fs from "node:fs/promises"
import * as NodePath from "node:path"

/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export const runAsync = <A, E>(program: () => Effect.Effect<A, E>): Promise<A> => Effect.runPromise(program())

/** `await value()`: the value is made now; a rejection or a throw is an expected failure. */
export const awaited = <A>(value: () => A): Effect.Effect<Awaited<A>, unknown> =>
  Effect.tryPromise({ try: () => Promise.resolve(value()), catch: (cause) => cause })

/** `Effect.runPromise(Effect.result(program), signal === undefined ? undefined : { signal })`. */
export const runResult = <A, E>(
  program: () => Effect.Effect<A, E>,
  signal: AbortSignal | undefined
): Promise<Result.Result<A, E>> =>
  Effect.runPromise(Effect.result(Effect.suspend(program)), signal === undefined ? undefined : { signal })

/** `signal?.throwIfAborted()`. */
export const throwIfAborted = (signal: AbortSignal | undefined): void => {
  signal?.throwIfAborted()
}

/** `process.env["PATH"]`. */
export const environmentPath = (): string | undefined => process.env["PATH"]

/** `process.env`. */
export const environment = (): NodeJS.ProcessEnv => process.env

/** `process.platform`. */
export const platform = (): NodeJS.Platform => process.platform

/** `await Fs.realpath(path)`. */
export const realpath = (path: string): Effect.Effect<string, unknown> =>
  Effect.tryPromise({ try: () => Fs.realpath(path), catch: (cause) => cause })

/** `Fs.stat(path).then((stat) => stat.isFile(), () => false)`. */
export const isFile = (path: string): Effect.Effect<boolean> =>
  Effect.promise(() => Fs.stat(path).then((stat) => stat.isFile(), () => false))

/** `Fs.access(path, R_OK or X_OK).then(() => true, () => false)`. */
export const accessible = (path: string, mode: "read" | "execute"): Effect.Effect<boolean> =>
  Effect.promise(() =>
    Fs.access(path, mode === "read" ? Fs.constants.R_OK : Fs.constants.X_OK).then(() => true, () => false)
  )

/** `Buffer.byteLength(text, "utf8")`. */
export const byteLength = (text: string): number => Buffer.byteLength(text, "utf8")

/** `NodePath.isAbsolute`. */
export const isAbsolute = (path: string): boolean => NodePath.isAbsolute(path)

/** `NodePath.relative`. */
export const relative = (from: string, to: string): string => NodePath.relative(from, to)

/** `NodePath.resolve`. */
export const resolve = (...paths: Array<string>): string => NodePath.resolve(...paths)

/** `NodePath.join`. */
export const join = (...paths: Array<string>): string => NodePath.join(...paths)

/** `NodePath.sep`. */
export const sep = (): string => NodePath.sep
