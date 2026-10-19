// E-7 (EK4402): the Node platform calls Resolver.vibe makes: node:path arithmetic and
// node:module's isBuiltin. One call each, exactly as Resolver.ts makes them.
// A-2/E-4/E-5 (D38): `runAsync` runs a VibeLang program for a TypeScript caller that receives
// a Promise, where Resolver.ts had an async function.
import { Effect } from "effect";
import { isBuiltin as nodeIsBuiltin } from "node:module";
import * as NodePath from "node:path";
/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export const runAsync = (program) => Effect.runPromise(program());
/** `isBuiltin` from node:module. */
export const isBuiltin = (specifier) => nodeIsBuiltin(specifier);
/** `NodePath.join`. */
export const join = (...paths) => NodePath.join(...paths);
/** `NodePath.resolve`. */
export const resolve = (...paths) => NodePath.resolve(...paths);
/** `NodePath.normalize`. */
export const normalize = (path) => NodePath.normalize(path);
/** `NodePath.dirname`. */
export const dirname = (path) => NodePath.dirname(path);
/** `NodePath.extname`. */
export const extname = (path) => NodePath.extname(path);
/** `NodePath.isAbsolute`. */
export const isAbsolute = (path) => NodePath.isAbsolute(path);
/** `NodePath.posix.basename`. */
export const posixBasename = (path) => NodePath.posix.basename(path);
