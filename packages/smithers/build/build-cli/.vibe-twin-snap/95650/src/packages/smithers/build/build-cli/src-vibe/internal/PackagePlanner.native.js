// E-7 (EK4402): the Node platform calls PackagePlanner.vibe makes from plain code and
// between awaits: node:path, node:fs, node:os, process and Buffer. One call each, exactly
// as PackagePlanner.ts makes them.
// A-2/E-4 (D38): `runAsync` is the runner boundary that hands `plan` and `binaryIdentity`
// to their TypeScript callers as Promises, as the async functions of PackagePlanner.ts did.
import { Effect } from "effect";
import * as NodeFs from "node:fs";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";
/** `NodePath.join`. */
export const join = (...paths) => NodePath.join(...paths);
/** `NodePath.dirname`. */
export const dirname = (path) => NodePath.dirname(path);
/** `NodePath.posix.dirname`. */
export const posixDirname = (path) => NodePath.posix.dirname(path);
/** `NodePath.isAbsolute`. */
export const isAbsolute = (path) => NodePath.isAbsolute(path);
/** `NodePath.resolve`. */
export const resolve = (...paths) => NodePath.resolve(...paths);
/** `NodePath.relative`. */
export const relative = (from, to) => NodePath.relative(from, to);
/** `NodePath.basename`. */
export const basename = (path) => NodePath.basename(path);
/** `process.platform`. */
export const platform = () => process.platform;
/** `process.env`. */
export const environment = () => process.env;
/** `process.env[name]`. */
export const environmentVariable = (name) => process.env[name];
/** `process.version`. */
export const version = () => process.version;
/** `process.arch`. */
export const arch = () => process.arch;
/** `NodeFs.existsSync`. */
export const existsSync = (path) => NodeFs.existsSync(path);
/** `NodeFs.realpathSync`. */
export const realpathSync = (path) => NodeFs.realpathSync(path);
/** `NodeOs.tmpdir`. */
export const tmpdir = () => NodeOs.tmpdir();
/** `NodeFs.appendFileSync(path, text)`. */
export const appendFileSync = (path, text) => NodeFs.appendFileSync(path, text);
/** `Buffer.byteLength(text, "utf8")`. */
export const byteLength = (text) => Buffer.byteLength(text, "utf8");
/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export const runAsync = (program) => Effect.runPromise(program());
