import { Effect } from "effect";
/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export declare const runAsync: <A, E>(program: () => Effect.Effect<A, E>) => Promise<A>;
/** `isBuiltin` from node:module. */
export declare const isBuiltin: (specifier: string) => boolean;
/** `NodePath.join`. */
export declare const join: (...paths: Array<string>) => string;
/** `NodePath.resolve`. */
export declare const resolve: (...paths: Array<string>) => string;
/** `NodePath.normalize`. */
export declare const normalize: (path: string) => string;
/** `NodePath.dirname`. */
export declare const dirname: (path: string) => string;
/** `NodePath.extname`. */
export declare const extname: (path: string) => string;
/** `NodePath.isAbsolute`. */
export declare const isAbsolute: (path: string) => boolean;
/** `NodePath.posix.basename`. */
export declare const posixBasename: (path: string) => string;
