// A-2/E-4 (D38): `token mint` hands Presentation.guard a Promise, so the
// Effect.runPromise call stays in TypeScript. E-7/EK4402: process.env is read
// here, where cli/TokenCommands.ts reads it.
import { Effect } from "effect"

/** `Effect.runPromise`, for the plain `token mint` handler. */
export const runPromise = <A, E>(effect: Effect.Effect<A, E>): Promise<A> => Effect.runPromise(effect)

/** `process.env`, read where TokenCommands.ts reads it. */
export const processEnvironment = (): Record<string, string | undefined> => process.env
