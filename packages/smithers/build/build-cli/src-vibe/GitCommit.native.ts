// E-7 (EK4402): process.env and node:path calls that GitCommit.vibe does not make directly.
// A-2/E-4 (D38): `commit` and the candidate's `materialize` hand Promises to TypeScript
// callers; runAsync is the runner boundary that runs their VibeLang bodies.
import * as Effect from "effect/Effect"
import * as NodePath from "node:path"

export const processEnvironment = (): NodeJS.ProcessEnv => process.env
export const resolve = (...paths: Array<string>): string => NodePath.resolve(...paths)
export const join = (...paths: Array<string>): string => NodePath.join(...paths)

/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export const runAsync = <A, E>(program: () => Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(Effect.suspend(program))
