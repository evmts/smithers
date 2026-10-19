/** Whole-tree exclusion for target execution.
 * @since 1.0.0-rc.0
 */
import * as Effect from "effect/Effect";
/**
 * Whole-tree snapshots exclude every peer. Admission stays held while a
 * writer waits for all work permits, so later readers cannot overtake it.
 * @category constructors
 * @since 1.0.0-rc.0
 */
export declare const make: (jobs: number) => Effect.Effect<<A, E, R>(exclusive: boolean, body: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>, never, never>;
