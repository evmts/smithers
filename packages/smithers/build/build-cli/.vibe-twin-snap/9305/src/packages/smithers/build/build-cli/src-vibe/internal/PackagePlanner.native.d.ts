import { Effect } from "effect";
/** `NodePath.join`. */
export declare const join: (...paths: ReadonlyArray<string>) => string;
/** `NodePath.dirname`. */
export declare const dirname: (path: string) => string;
/** `NodePath.posix.dirname`. */
export declare const posixDirname: (path: string) => string;
/** `NodePath.isAbsolute`. */
export declare const isAbsolute: (path: string) => boolean;
/** `NodePath.resolve`. */
export declare const resolve: (...paths: ReadonlyArray<string>) => string;
/** `NodePath.relative`. */
export declare const relative: (from: string, to: string) => string;
/** `NodePath.basename`. */
export declare const basename: (path: string) => string;
/** `process.platform`. */
export declare const platform: () => NodeJS.Platform;
/** `process.env`. */
export declare const environment: () => NodeJS.ProcessEnv;
/** `process.env[name]`. */
export declare const environmentVariable: (name: string) => string | undefined;
/** `process.version`. */
export declare const version: () => string;
/** `process.arch`. */
export declare const arch: () => NodeJS.Architecture;
/** `NodeFs.existsSync`. */
export declare const existsSync: (path: string) => boolean;
/** `NodeFs.realpathSync`. */
export declare const realpathSync: (path: string) => string;
/** `NodeOs.tmpdir`. */
export declare const tmpdir: () => string;
/** `NodeFs.appendFileSync(path, text)`. */
export declare const appendFileSync: (path: string, text: string) => void;
/** `Buffer.byteLength(text, "utf8")`. */
export declare const byteLength: (text: string) => number;
/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export declare const runAsync: <A, E>(program: () => Effect.Effect<A, E>) => Promise<A>;
