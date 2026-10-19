// E-7 (EK4402): node:fs/promises, node:child_process, node:crypto, node:path and node:url are
// platform APIs that Mount.vibe does not call directly. Each Promise-returning call becomes an
// Effect whose failure is the raw rejection, as an `await` in Mount.ts sees it.
// A-2/E-4/E-5 (D38): `runAsync` hands a VibeLang program's result to TypeScript callers as a
// Promise where Mount.ts exported an async function; `awaited` is that function's `await` of a
// TypeScript Promise, so a rejection (or a throw while making it) is an expected failure.
import { Effect } from "effect";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import * as Fs from "node:fs/promises";
import * as NodePath from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
const executeFile = promisify(execFile);
/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export const runAsync = (program) => Effect.runPromise(program());
/** `await value()`: the value is made now; a rejection or a throw is an expected failure. */
export const awaited = (value) => Effect.tryPromise({ try: () => Promise.resolve(value()), catch: (cause) => cause });
const attempt = (promise) => Effect.tryPromise({ try: promise, catch: (cause) => cause });
/** `await executeFile(file, args, options)` with `encoding: "utf8"`: the child's stdout. */
export const executeFileText = (file, args, options) => attempt(() => executeFile(file, [...args], {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    maxBuffer: options.maxBuffer,
    signal: options.signal
})).pipe(Effect.map((result) => result.stdout));
/** `createHash("sha256").update(bytes).digest("hex")`. */
export const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
/** `Fs.lstat(path).then((stats) => stats.isFile(), () => false)`. */
export const isFile = (path) => Effect.promise(() => Fs.lstat(path).then((stats) => stats.isFile(), () => false));
/** `Fs.stat(path).then((stats) => stats.isDirectory(), () => false)`. */
export const isDirectory = (path) => Effect.promise(() => Fs.stat(path).then((stats) => stats.isDirectory(), () => false));
/** `Fs.readFile(path).then(digest, () => undefined)`. */
export const readDigest = (path) => Effect.promise(() => Fs.readFile(path).then(digest, () => undefined));
/** `await Fs.readFile(path)`. */
export const readFile = (path) => attempt(() => Fs.readFile(path));
/** `await Fs.readFile(path, "utf8")`. */
export const readText = (path) => attempt(() => Fs.readFile(path, "utf8"));
/** `await Fs.writeFile(path, data)`. */
export const writeFile = (path, data) => attempt(() => Fs.writeFile(path, data));
/** `await Fs.mkdir(path, { recursive: true })`. */
export const mkdirp = (path) => attempt(() => Fs.mkdir(path, { recursive: true })).pipe(Effect.asVoid);
/** `await Fs.rm(path, { force: true })`. */
export const remove = (path) => attempt(() => Fs.rm(path, { force: true }));
/** `await Fs.readdir(path, { withFileTypes: true })`. */
export const readdir = (path) => attempt(() => Fs.readdir(path, { withFileTypes: true }));
/** `NodePath.join`. */
export const join = (...paths) => NodePath.join(...paths);
/** `NodePath.dirname`. */
export const dirname = (path) => NodePath.dirname(path);
/** `NodePath.relative`. */
export const relative = (from, to) => NodePath.relative(from, to);
/** `NodePath.isAbsolute`. */
export const isAbsolute = (path) => NodePath.isAbsolute(path);
/** `NodePath.resolve`. */
export const resolve = (...paths) => NodePath.resolve(...paths);
/** `NodePath.posix.basename`. */
export const posixBasename = (path) => NodePath.posix.basename(path);
/** `NodePath.sep`. */
export const sep = () => NodePath.sep;
/** `pathToFileURL(path).href`. */
export const fileUrl = (path) => pathToFileURL(path).href;
