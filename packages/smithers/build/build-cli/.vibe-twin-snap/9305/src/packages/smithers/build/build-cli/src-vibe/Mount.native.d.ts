import { Effect } from "effect";
import type { Dirent } from "node:fs";
/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export declare const runAsync: <A, E>(program: () => Effect.Effect<A, E>) => Promise<A>;
/** `await value()`: the value is made now; a rejection or a throw is an expected failure. */
export declare const awaited: <A>(value: () => A) => Effect.Effect<Awaited<A>, unknown>;
/** `await executeFile(file, args, options)` with `encoding: "utf8"`: the child's stdout. */
export declare const executeFileText: (file: string, args: ReadonlyArray<string>, options: {
    readonly cwd: string;
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly maxBuffer: number;
    readonly signal?: AbortSignal | undefined;
}) => Effect.Effect<string, unknown>;
/** `createHash("sha256").update(bytes).digest("hex")`. */
export declare const digest: (bytes: Uint8Array) => string;
/** `Fs.lstat(path).then((stats) => stats.isFile(), () => false)`. */
export declare const isFile: (path: string) => Effect.Effect<boolean>;
/** `Fs.stat(path).then((stats) => stats.isDirectory(), () => false)`. */
export declare const isDirectory: (path: string) => Effect.Effect<boolean>;
/** `Fs.readFile(path).then(digest, () => undefined)`. */
export declare const readDigest: (path: string) => Effect.Effect<string | undefined>;
/** `await Fs.readFile(path)`. */
export declare const readFile: (path: string) => Effect.Effect<Buffer, unknown>;
/** `await Fs.readFile(path, "utf8")`. */
export declare const readText: (path: string) => Effect.Effect<string, unknown>;
/** `await Fs.writeFile(path, data)`. */
export declare const writeFile: (path: string, data: string | Uint8Array) => Effect.Effect<void, unknown>;
/** `await Fs.mkdir(path, { recursive: true })`. */
export declare const mkdirp: (path: string) => Effect.Effect<void, unknown>;
/** `await Fs.rm(path, { force: true })`. */
export declare const remove: (path: string) => Effect.Effect<void, unknown>;
/** `await Fs.readdir(path, { withFileTypes: true })`. */
export declare const readdir: (path: string) => Effect.Effect<Array<Dirent>, unknown>;
/** `NodePath.join`. */
export declare const join: (...paths: Array<string>) => string;
/** `NodePath.dirname`. */
export declare const dirname: (path: string) => string;
/** `NodePath.relative`. */
export declare const relative: (from: string, to: string) => string;
/** `NodePath.isAbsolute`. */
export declare const isAbsolute: (path: string) => boolean;
/** `NodePath.resolve`. */
export declare const resolve: (...paths: Array<string>) => string;
/** `NodePath.posix.basename`. */
export declare const posixBasename: (path: string) => string;
/** `NodePath.sep`. */
export declare const sep: () => string;
/** `pathToFileURL(path).href`. */
export declare const fileUrl: (path: string) => string;
