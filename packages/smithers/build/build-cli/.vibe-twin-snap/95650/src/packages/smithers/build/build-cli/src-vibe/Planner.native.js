// A-2/E-4 (D38): fingerprintSources and implementationFingerprint hand a Promise to their
// TypeScript callers, so the runner call that starts their program stays TypeScript.
// E-7 (EK4402): fileURLToPath and node:path's dirname are platform APIs.
import * as Effect from "effect/Effect";
import * as NodePath from "node:path";
import { fileURLToPath } from "node:url";
/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export const runAsync = (program) => Effect.runPromise(program());
/** `NodePath.dirname(fileURLToPath(url))`. */
export const directoryOf = (url) => NodePath.dirname(fileURLToPath(url));
