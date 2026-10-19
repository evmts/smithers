// A-2/E-4/E-5 (D38): `runAsync` is the runner that hands a VibeLang program's result to a
// TypeScript caller as a Promise, where monitors.ts had an async function; `awaited` is that
// function's `await`, so a rejection (or a throw while making the value) is an expected failure
// its `catch` sees, as the async function's did.
// E-7 (EK4402): timers and microtasks are platform calls VibeLang code does not make; one
// function each, exactly as monitors.ts calls them.
import { Effect } from "effect"

/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export const runAsync = <A, E>(program: () => Effect.Effect<A, E>): Promise<A> => Effect.runPromise(program())

/** `await value()`: the value is made now; a rejection or a throw is an expected failure. */
export const awaited = <A>(value: () => A): Effect.Effect<Awaited<A>, unknown> =>
  Effect.tryPromise({ try: () => Promise.resolve(value()), catch: (cause) => cause })

type Tick = () => void

/** `setInterval(run, ms)`, stopped by the function it returns. */
export const every = (ms: number, run: Tick): () => void => {
  const timer = setInterval(run, ms)
  return () => clearInterval(timer)
}

/** `setTimeout(run, ms)`. */
export const startTimer = (run: Tick, ms: number): ReturnType<typeof setTimeout> => setTimeout(run, ms)

/** `clearTimeout(timer)`. */
export const stopTimer = (timer: ReturnType<typeof setTimeout>): void => clearTimeout(timer)

/** `queueMicrotask(run)`. */
export const microtask = (run: Tick): void => queueMicrotask(run)

/**
 * A synchronous step inside an async function's `try`: its throw is an expected failure, so the
 * `catch` sees it as the async function's did (a plain throw in a VibeLang program is a defect).
 */
export const attempt = <A>(value: () => A): Effect.Effect<A, unknown> => Effect.try({ try: value, catch: (cause) => cause })
