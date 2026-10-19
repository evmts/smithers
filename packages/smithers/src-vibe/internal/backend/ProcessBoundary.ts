// A-2/E-4 (D38): runner boundaries that hand a Promise or a running fiber to
// TypeScript callers stay in TypeScript. E-7/EK4402: hostname, process.pid
// and the PassThrough constructor are platform APIs that VibeLang code does
// not call directly. Process.vibe calls these exactly where Process.ts makes
// the same calls.
import * as Effect from "effect/Effect"
import type * as Exit from "effect/Exit"
import type * as Fiber from "effect/Fiber"
import { hostname } from "node:os"
import { PassThrough } from "node:stream"

/** The in-memory process ledger's owner: this host and this process. */
export const ledgerOwner = (): { readonly hostId: string; readonly ownerPid: number } => ({
  hostId: hostname(),
  ownerPid: process.pid
})

/** A fresh Node pass-through stream. */
export const passThrough = (): PassThrough => new PassThrough()

/** `Effect.runPromiseExit`, for a plain caller. */
export const runPromiseExit = <A, E>(
  effect: Effect.Effect<A, E>,
  options?: { readonly signal?: AbortSignal | undefined }
): Promise<Exit.Exit<A, E>> => Effect.runPromiseExit(effect, options)

/** `Effect.runFork`, for a plain caller. */
export const runFork = <A, E>(effect: Effect.Effect<A, E>): Fiber.Fiber<A, E> => Effect.runFork(effect)
