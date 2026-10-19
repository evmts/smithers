// E-7 (EK4402): node:path calls that GithubRender.vibe does not make directly.
// A-2/E-4 (D38): `check` and `write` hand Promises to TypeScript callers; runAsync is the
// runner boundary that runs their VibeLang bodies.
import * as Effect from "effect/Effect"
import * as NodePath from "node:path"

export const join = (...paths: Array<string>): string => NodePath.join(...paths)
export const dirname = (path: string): string => NodePath.dirname(path)

/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export const runAsync = <A, E>(program: () => Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(Effect.suspend(program))
