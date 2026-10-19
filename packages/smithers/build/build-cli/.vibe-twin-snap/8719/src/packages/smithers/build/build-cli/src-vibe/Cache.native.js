// E-7 (EK4402): the Node platform calls Cache.vibe's plain helpers make: path arithmetic,
// Buffer byte counts and the UTF-16 key digest, process.stderr, and the live filesystem
// defaults for the I/O seams. One call each, exactly as Cache.ts makes them.
// A-2/E-4/E-5 (D38): `runAsync` runs a VibeLang program for a TypeScript caller that receives
// a Promise, where Cache.ts had an async function.
import { Effect } from "effect";
import { createHash } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util/types";
/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export const runAsync = (program) => Effect.runPromise(program());
/** `createHash("sha256").update(Buffer.from(key, "utf16le")).digest("hex")`. */
export const utf16Sha256 = (key) => createHash("sha256").update(Buffer.from(key, "utf16le")).digest("hex");
/** `NodeUtil.isProxy`. */
export const isProxy = (value) => NodeUtil.isProxy(value);
/** `Buffer.byteLength`. */
export const byteLength = (value, encoding) => Buffer.byteLength(value, encoding);
/** `NodePath.relative`. */
export const relative = (from, to) => NodePath.relative(from, to);
/** `NodePath.isAbsolute`. */
export const isAbsolute = (path) => NodePath.isAbsolute(path);
/** `NodePath.join`. */
export const join = (...paths) => NodePath.join(...paths);
/** `NodePath.dirname`. */
export const dirname = (path) => NodePath.dirname(path);
/** `NodePath.basename`. */
export const basename = (path) => NodePath.basename(path);
/** The default warning sink: one line on standard error. */
export const defaultWarn = (line) => process.stderr.write(`${line}\n`);
/** Cache.ts `openDirectoryLive`: no portable directory descriptor on Windows. */
export const openDirectoryLive = (directory) => process.platform === "win32" ? Promise.resolve(undefined) : Fs.open(directory, "r");
/** Cache.ts `removeTempLive`. */
export const removeTempLive = (temp) => Fs.rm(temp, { force: true });
