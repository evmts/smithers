// E-7 (EK4402): the AsyncLocalStorage that carries the action's host services is a
// Node platform object, so its construction and calls stay TypeScript.
// A-2/E-4 (D38): `runPromise` is the runner boundary that hands a Promise to
// TypeScript callers. io.vibe calls these exactly where io.ts touches them.
import { Effect } from "effect"
import { AsyncLocalStorage } from "node:async_hooks"
import type { Io } from "./io.vibe"

const active = new AsyncLocalStorage<Io>()

/** `active.getStore()`. */
export const current = (): Io | undefined => active.getStore()

/** `active.run(host, operation)`. */
export const runWith = <A>(host: Io, operation: () => Promise<A>): Promise<A> => active.run(host, operation)

/** `Effect.runPromise(operation, { signal })`. */
export const runPromise = <A, E>(operation: Effect.Effect<A, E>, signal: AbortSignal): Promise<A> =>
  Effect.runPromise(operation, { signal })

/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export const runAsync = <A, E>(program: () => Effect.Effect<A, E>): Promise<A> => Effect.runPromise(program())
