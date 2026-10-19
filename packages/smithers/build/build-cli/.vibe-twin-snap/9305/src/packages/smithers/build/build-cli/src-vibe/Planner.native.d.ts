import * as Effect from "effect/Effect";
/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export declare const runAsync: <A, E>(program: () => Effect.Effect<A, E>) => Promise<A>;
/** `NodePath.dirname(fileURLToPath(url))`. */
export declare const directoryOf: (url: string) => string;
