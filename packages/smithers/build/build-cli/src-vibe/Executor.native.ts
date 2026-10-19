// A-2/E-4 (D38): `schedule` hands a Promise to its TypeScript callers, so the runner call
// that starts its program stays TypeScript.
import * as Effect from "effect/Effect"

/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export const runAsync = <A, E>(program: () => Effect.Effect<A, E>): Promise<A> => Effect.runPromise(program())
