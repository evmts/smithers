// A-2/E-4 (D38): a runner boundary that returns a Promise to TypeScript callers
// stays in TypeScript. `Boundary.vibe`'s `runRequest` and `runDurable` start
// their root fiber through these. E-7/EK4402: `console.error` is a platform
// API, so the defect log line is written here too.
import * as Effect from "effect/Effect"
import type * as Exit from "effect/Exit"

export const runPromiseExit = <A>(effect: Effect.Effect<A, never>, signal: AbortSignal | undefined): Promise<Exit.Exit<A, never>> =>
  Effect.runPromiseExit(effect, { signal })

export const runPromise = <A>(effect: Effect.Effect<A, never>): Promise<A> => Effect.runPromise(effect)

export const logDefect = (defect: unknown): void => console.error("worker fetch failed:", defect)
