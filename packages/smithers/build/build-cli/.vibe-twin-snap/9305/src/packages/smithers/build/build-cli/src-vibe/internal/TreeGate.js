/** Whole-tree exclusion for target execution.
 * @since 1.0.0-rc.0
 */
import * as Effect_1 from "effect/Effect";
import * as Effect from "effect/Effect";
import * as Semaphore from "effect/Semaphore";
/**
 * Whole-tree snapshots exclude every peer. Admission stays held while a
 * writer waits for all work permits, so later readers cannot overtake it.
 * @category constructors
 * @since 1.0.0-rc.0
 */
export const make = Effect_1.fnUntraced(function* make(jobs) { return yield* (Effect_1.fnUntraced(function* () {
    const admission = yield* Semaphore.make(1);
    const work = yield* Semaphore.make(jobs);
    return Effect_1.fnUntraced(function* (exclusive, body) {
        const permits = exclusive ? jobs : 1;
        return yield* Effect.uninterruptibleMask(Effect_1.fnUntraced(function* (restore) { return yield* Effect.acquireUseRelease(Effect_1.gen(function* () { return yield* restore(Effect_1.gen(function* () { return yield* admission.withPermit(Effect_1.gen(function* () { return yield* work.take(permits); })); })); }), Effect_1.fnUntraced(function* () { return yield* restore(body); }), Effect_1.fnUntraced(function* () { return yield* Effect.asVoid(Effect_1.gen(function* () { return yield* work.release(permits); })); })); }));
    });
}))(); });
