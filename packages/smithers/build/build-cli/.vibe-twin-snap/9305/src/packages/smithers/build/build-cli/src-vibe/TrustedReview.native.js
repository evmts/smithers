// A-2/E-4/E-5 (D38): `runAsync` hands a VibeLang program's result to TypeScript callers as a
// Promise where TrustedReview.ts exported an async function; `awaited` is that function's
// `await` of a TypeScript Promise, so a rejection (or a throw while making it) is an expected
// failure. `runResult` is TrustedReview.ts's own `Effect.runPromise(Effect.result(...), { signal })`
// runner, which interrupts only the running review when the caller's signal aborts.
// E-7 (EK4402): process, node:fs/promises, node:path and Buffer are platform APIs that
// TrustedReview.vibe does not call directly.
import { Effect } from "effect";
import * as Fs from "node:fs/promises";
import * as NodePath from "node:path";
/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export const runAsync = (program) => Effect.runPromise(program());
/** `await value()`: the value is made now; a rejection or a throw is an expected failure. */
export const awaited = (value) => Effect.tryPromise({ try: () => Promise.resolve(value()), catch: (cause) => cause });
/** `Effect.runPromise(Effect.result(program), signal === undefined ? undefined : { signal })`. */
export const runResult = (program, signal) => Effect.runPromise(Effect.result(Effect.suspend(program)), signal === undefined ? undefined : { signal });
/** `signal?.throwIfAborted()`. */
export const throwIfAborted = (signal) => {
    signal?.throwIfAborted();
};
/** `process.env["PATH"]`. */
export const environmentPath = () => process.env["PATH"];
/** `process.env`. */
export const environment = () => process.env;
/** `process.platform`. */
export const platform = () => process.platform;
/** `await Fs.realpath(path)`. */
export const realpath = (path) => Effect.tryPromise({ try: () => Fs.realpath(path), catch: (cause) => cause });
/** `Fs.stat(path).then((stat) => stat.isFile(), () => false)`. */
export const isFile = (path) => Effect.promise(() => Fs.stat(path).then((stat) => stat.isFile(), () => false));
/** `Fs.access(path, R_OK or X_OK).then(() => true, () => false)`. */
export const accessible = (path, mode) => Effect.promise(() => Fs.access(path, mode === "read" ? Fs.constants.R_OK : Fs.constants.X_OK).then(() => true, () => false));
/** `Buffer.byteLength(text, "utf8")`. */
export const byteLength = (text) => Buffer.byteLength(text, "utf8");
/** `NodePath.isAbsolute`. */
export const isAbsolute = (path) => NodePath.isAbsolute(path);
/** `NodePath.relative`. */
export const relative = (from, to) => NodePath.relative(from, to);
/** `NodePath.resolve`. */
export const resolve = (...paths) => NodePath.resolve(...paths);
/** `NodePath.join`. */
export const join = (...paths) => NodePath.join(...paths);
/** `NodePath.sep`. */
export const sep = () => NodePath.sep;
