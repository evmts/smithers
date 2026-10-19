import * as Effect from "effect/Effect";
export declare const join: (...paths: Array<string>) => string;
export declare const dirname: (path: string) => string;
/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export declare const runAsync: <A, E>(program: () => Effect.Effect<A, E>) => Promise<A>;
