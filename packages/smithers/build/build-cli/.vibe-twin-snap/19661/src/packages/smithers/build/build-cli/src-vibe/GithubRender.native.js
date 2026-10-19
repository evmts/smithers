// E-7 (EK4402): node:path calls that GithubRender.vibe does not make directly.
// A-2/E-4 (D38): `check` and `write` hand Promises to TypeScript callers; runAsync is the
// runner boundary that runs their VibeLang bodies.
import * as Effect from "effect/Effect";
import * as NodePath from "node:path";
export const join = (...paths) => NodePath.join(...paths);
export const dirname = (path) => NodePath.dirname(path);
/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export const runAsync = (program) => Effect.runPromise(Effect.suspend(program));
