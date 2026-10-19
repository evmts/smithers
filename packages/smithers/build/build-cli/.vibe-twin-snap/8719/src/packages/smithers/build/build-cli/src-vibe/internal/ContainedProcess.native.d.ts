import { Effect, type Scope } from "effect";
import { type Options } from "./ContainedProcess.vibe";
/** `restore(Effect.scoped(program))`, the program held as a function. */
export declare const restoreScoped: <A, E, R>(restore: <A1, E1, R1>(effect: Effect.Effect<A1, E1, R1>) => Effect.Effect<A1, E1, R1>, program: () => Effect.Effect<A, E, R>) => Effect.Effect<A, E, Exclude<R, Scope.Scope>>;
/** The Promise boundary: ContainedProcess.ts `run`, unchanged. */
export declare const run: (options: Options) => Promise<number>;
