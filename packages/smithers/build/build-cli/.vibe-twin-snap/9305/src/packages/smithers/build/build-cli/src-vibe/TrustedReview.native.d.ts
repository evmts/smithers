import { Effect, type Result } from "effect";
/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export declare const runAsync: <A, E>(program: () => Effect.Effect<A, E>) => Promise<A>;
/** `await value()`: the value is made now; a rejection or a throw is an expected failure. */
export declare const awaited: <A>(value: () => A) => Effect.Effect<Awaited<A>, unknown>;
/** `Effect.runPromise(Effect.result(program), signal === undefined ? undefined : { signal })`. */
export declare const runResult: <A, E>(program: () => Effect.Effect<A, E>, signal: AbortSignal | undefined) => Promise<Result.Result<A, E>>;
/** `signal?.throwIfAborted()`. */
export declare const throwIfAborted: (signal: AbortSignal | undefined) => void;
/** `process.env["PATH"]`. */
export declare const environmentPath: () => string | undefined;
/** `process.env`. */
export declare const environment: () => NodeJS.ProcessEnv;
/** `process.platform`. */
export declare const platform: () => NodeJS.Platform;
/** `await Fs.realpath(path)`. */
export declare const realpath: (path: string) => Effect.Effect<string, unknown>;
/** `Fs.stat(path).then((stat) => stat.isFile(), () => false)`. */
export declare const isFile: (path: string) => Effect.Effect<boolean>;
/** `Fs.access(path, R_OK or X_OK).then(() => true, () => false)`. */
export declare const accessible: (path: string, mode: "read" | "execute") => Effect.Effect<boolean>;
/** `Buffer.byteLength(text, "utf8")`. */
export declare const byteLength: (text: string) => number;
/** `NodePath.isAbsolute`. */
export declare const isAbsolute: (path: string) => boolean;
/** `NodePath.relative`. */
export declare const relative: (from: string, to: string) => string;
/** `NodePath.resolve`. */
export declare const resolve: (...paths: Array<string>) => string;
/** `NodePath.join`. */
export declare const join: (...paths: Array<string>) => string;
/** `NodePath.sep`. */
export declare const sep: () => string;
