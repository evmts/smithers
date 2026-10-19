// The app twin's one shared boundary with the browser and with TypeScript callers.
// A-2/E-4/E-5 (D38): `runAsync` is the runner that hands a VibeLang program's result to a
// TypeScript caller as a Promise, where the TypeScript was an async function; `awaited` is
// that async function's `await`, so a rejection (or a throw while making the value) is an
// expected failure its `catch` sees.
// E-7 (EK4402): timers, microtasks and console are platform calls VibeLang code does not make.
import { Cause, Effect } from "effect"

/**
 * An async function's body, run for its TypeScript caller: the Promise settles when the program
 * exits, as the async function's did. `Effect.runPromise` settles one microtask later, which
 * reordered callers that count turns (S21 forks B, G, I).
 */
export const runAsync = <A, E>(program: () => Effect.Effect<A, E>): Promise<A> =>
  new Promise<A>((resolve, reject) => {
    Effect.runCallback(program(), { onExit: (exit) => exit._tag === "Success" ? resolve(exit.value) : reject(Cause.squash(exit.cause)) })
  })

/** `runAsync`, interrupted when the caller's signal aborts, as `Effect.runPromise(program, { signal })` is. */
export const runAsyncWith = <A, E>(program: () => Effect.Effect<A, E>, signal: AbortSignal | undefined): Promise<A> =>
  new Promise<A>((resolve, reject) => {
    Effect.runCallback(program(), { ...(signal === undefined ? {} : { signal }), onExit: (exit) => exit._tag === "Success" ? resolve(exit.value) : reject(Cause.squash(exit.cause)) })
  })

/** `await value()`: the value is made now; a rejection or a throw is an expected failure. */
export const awaited = <A>(value: () => A): Effect.Effect<Awaited<A>, unknown> =>
  Effect.tryPromise({ try: () => Promise.resolve(value()), catch: (cause) => cause })

/**
 * A synchronous call inside an async function's `try`: its throw is an expected failure, so the
 * `catch` sees it as the async function's did (a plain throw in a VibeLang program is a defect).
 */
export const attempt = <A>(value: () => A): Effect.Effect<A, unknown> =>
  Effect.try({ try: value, catch: (cause) => cause })

/** `setTimeout(callback, ms)`. */
export const startTimer = (callback: () => void, ms?: number): ReturnType<typeof setTimeout> => setTimeout(callback, ms)

/** `clearTimeout(timer)`. */
export const stopTimer = (timer: ReturnType<typeof setTimeout> | undefined): void => clearTimeout(timer)

/** `setInterval(callback, ms)`. */
export const startInterval = (callback: () => void, ms?: number): ReturnType<typeof setInterval> => setInterval(callback, ms)

/** `clearInterval(timer)`. */
export const stopInterval = (timer: ReturnType<typeof setInterval> | undefined): void => clearInterval(timer)

/** `queueMicrotask(callback)`. */
export const microtask = (callback: () => void): void => queueMicrotask(callback)

/** `new Promise<void>((resolve) => setTimeout(resolve, ms))`. */
export const delay = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** A poll's pause: resolves after `ms`, or as soon as `signal` aborts, and leaves no timer or listener behind. */
export const abortableDelay = (signal: AbortSignal, ms: number): Promise<void> => new Promise<void>((resolve) => { const done = (): void => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve() }; const timer = setTimeout(done, ms); signal.addEventListener("abort", done, { once: true }) })
