// A-2/E-4 (D38): the async runner boundary that hands a Promise to TypeScript
// callers stays TypeScript. `runAsync(program, signal)` is
// `async () => Effect.runPromise(program(), { signal })`, the shape of
// Verify.ts's `verify` and `verifyAll`.
import { Effect } from "effect"

/** Runs a program for an async TypeScript caller. */
export const runAsync = async <A, E>(program: () => Effect.Effect<A, E>, signal?: AbortSignal): Promise<A> =>
  Effect.runPromise(program(), { signal })
