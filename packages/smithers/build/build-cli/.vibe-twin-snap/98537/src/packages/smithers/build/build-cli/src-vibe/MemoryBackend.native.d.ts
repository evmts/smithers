import { Effect } from "effect";
/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export declare const runAsync: <A, E>(program: () => Effect.Effect<A, E>) => Promise<A>;
/** `await value()`: the value is made now; a rejection or a throw is an expected failure. */
export declare const awaited: <A>(value: () => A) => Effect.Effect<Awaited<A>, unknown>;
/** `process.platform`. */
export declare const platform: () => NodeJS.Platform;
/** `NodePath.delimiter`. */
export declare const delimiter: () => string;
/** `NodePath.join`. */
export declare const join: (...paths: Array<string>) => string;
/** Whether `path` is an executable regular file: `Fs.access(X_OK)`, then `Fs.stat(path).isFile()`. */
export declare const executableFile: (path: string) => Effect.Effect<boolean, unknown>;
