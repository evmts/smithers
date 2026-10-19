// A-2/E-4 (D38): the runner boundary that hands a Promise to TypeScript callers
// (the build planner's approval store) stays TypeScript.
import { Effect } from "effect"

/** Runs a program for a TypeScript caller. */
export const runPromise = <A, E>(effect: Effect.Effect<A, E>): Promise<A> => Effect.runPromise(effect)
