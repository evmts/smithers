/**
 * Replay-stable scorer sampling.
 *
 * A ratio policy decides from the target step key, the scorer key, and the
 * seed alone, so the same step reaches the same decision on every replay and
 * in every process. Two properties make that promise real, and both were once
 * broken here:
 *
 * - The hash runs over UTF-8 *bytes*. Hashing UTF-16 code units through
 *   `charCodeAt(0)` read only the high surrogate of an astral code point, so
 *   every emoji in the same 1024-code-point block hashed identically.
 * - The three components are length-prefixed rather than joined with a
 *   delimiter. `"a:b" + ":" + "c"` and `"a" + ":" + "b:c"` produce the same
 *   `":"`-joined material, so two unrelated steps shared one decision.
 *
 * Both are silent collisions, which is why `test/Sampling.test.ts` freezes
 * golden hash vectors: a change to either rule moves every sampling decision
 * already recorded downstream and has to be a deliberate, noted change.
 *
 * @since 0.1.0
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ScorerError } from "./ScorerError.ts";
/**
 * Sampling policy for a scorer binding.
 *
 * `"all"` and `"none"` are the endpoints; a ratio policy covers the open
 * interval `(0, 1)` only, so "sample everything" and "sample nothing" have
 * exactly one spelling each. The bound lives in the schema, so a policy that
 * `decide` would reject cannot be constructed and carried into a run.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Sampling: Schema.Union<readonly [Schema.Literals<readonly ["all", "none"]>, Schema.Struct<{
    readonly ratio: Schema.Finite;
    readonly seed: Schema.String;
}>]>;
/**
 * Sampling policy for a scorer binding.
 *
 * @category models
 * @since 0.1.0
 */
export type Sampling = typeof Sampling.Type;
/**
 * Decides a ratio sample from stable target, scorer, and seed material.
 *
 * @category predicates
 * @since 0.1.0
 */
export declare const decide: (sampling: Sampling, targetStepKey: string, scorerKey: string) => Effect.Effect<boolean, ScorerError>;
