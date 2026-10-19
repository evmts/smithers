// A-2/E-4/E-5 (D38): `runAsync` hands a VibeLang program's result to TypeScript callers as a
// Promise where MemoryBackend.ts exported an async function or method; `awaited` is that async
// function's `await`, so a rejection (or a throw while making the value) is an expected failure.
// E-7 (EK4402): process.platform, node:path and node:fs/promises are platform APIs that
// MemoryBackend.vibe does not call directly.
import { Effect } from "effect";
import * as Fs from "node:fs/promises";
import * as NodePath from "node:path";
/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export const runAsync = (program) => Effect.runPromise(program());
/** `await value()`: the value is made now; a rejection or a throw is an expected failure. */
export const awaited = (value) => Effect.tryPromise({ try: () => Promise.resolve(value()), catch: (cause) => cause });
/** `process.platform`. */
export const platform = () => process.platform;
/** `NodePath.delimiter`. */
export const delimiter = () => NodePath.delimiter;
/** `NodePath.join`. */
export const join = (...paths) => NodePath.join(...paths);
/** Whether `path` is an executable regular file: `Fs.access(X_OK)`, then `Fs.stat(path).isFile()`. */
export const executableFile = (path) => Effect.tryPromise({
    try: async () => {
        await Fs.access(path, Fs.constants.X_OK);
        const stats = await Fs.stat(path);
        return stats.isFile();
    },
    catch: (cause) => cause
});
