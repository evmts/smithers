import * as Effect from "effect/Effect";
/** Runs one `git rev-parse` query in the root and returns its single line. */
export declare const revParse: (root: string, args: ReadonlyArray<string>) => Promise<string>;
export declare const relative: (from: string, to: string) => string;
export declare const isAbsolute: (path: string) => boolean;
export declare const resolve: (...paths: Array<string>) => string;
export declare const join: (...paths: Array<string>) => string;
export declare const dirname: (path: string) => string;
export declare const basename: (path: string) => string;
/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export declare const runAsync: <A, E>(program: () => Effect.Effect<A, E>) => Promise<A>;
