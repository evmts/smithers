import * as Classifier from "@smthrs/model/Classifier";
import type * as Evaluator from "@smthrs/model/Evaluator";
import { Effect, Layer, Schema } from "effect";
import type * as HttpClient from "effect/http/HttpClient";
import { CodingError } from "../coding/schema.ts";
import type { Comparison, SemanticVerdict } from "./checks.ts";
import type { Check } from "./schema.ts";
/** A hunk Jev is asked about: the candidate file, the first line the hunk
 * changes in the candidate, and the hunk's own unified diff text. `complete`
 * is false when the text was clipped to {@link MAX_HUNK_BYTES}, so Jev sees
 * only a prefix of the change and cannot clear the path. */
export interface Hunk {
    readonly path: string;
    readonly line: number;
    readonly hunk: string;
    readonly complete: boolean;
}
/** At or above this probability the hunk violates the rule and becomes a
 * finding. This is the review policy's decision threshold, not a calibrated
 * guarantee about whichever subscription model the host resolves. */
export declare const FLAG_PROBABILITY = 0.8;
/** At or below this probability the hunk keeps the rule. Between the two
 * thresholds, the judge's uncertainty makes the check inconclusive. */
export declare const CLEAN_PROBABILITY = 0.2;
/** The most bytes one hunk may take, matching `@smthrs/std`'s per-state bound. */
export declare const MAX_HUNK_BYTES: number;
/** The most hunks one batched evaluation may carry, matching `@smthrs/std`. */
export declare const MAX_STATES = 64;
/** One boolean per (rule, hunk). The state is exactly what the rule can be
 * judged against, so a hunk that needs more than itself reads indecisive. */
export declare const ruleClassifier: Classifier.Classifier<"check/rule", Schema.Struct<{
    readonly rule: Schema.String;
    readonly path: Schema.String;
    readonly line: Schema.Int;
    readonly hunk: Schema.String;
}>, {
    readonly violates: Evaluator.BooleanQuestion;
}>;
/** The state one hunk is judged as. */
export type RuleState = typeof ruleClassifier.state.Type;
/** Every changed hunk of the candidate, in diff order.
 *
 * These are read from the same unified diff `diffPaths` already validated and
 * split on the same `diff --git` boundary, rather than re-derived from the
 * whole-file preimages in `changes`. `line` is the first line the hunk adds in
 * the candidate; a hunk that only deletes reports the candidate line the
 * deletion sits at. A path this parser reads is only ever judged when
 * `jevSemanticCheck` finds it in the check's scope, so an encoding the
 * validated diff would have refused cannot reach a finding. */
export declare const hunks: (comparison: typeof Comparison.Type) => ReadonlyArray<Hunk>;
/** Every changed path of a proposal, as one whole-file replacement hunk.
 *
 * A proposal is checked before it is a commit, so `captureChecks` gives its
 * comparison no unified diff at all — the change is carried in `changes`, each
 * entry holding the exact preimage and the exact proposed text. While a
 * frontier seat existed that gap was invisible: Jev answered `uncertain` on
 * every proposal and the seat read `changes` itself. With Jev the only
 * checker, a proposal with no state would make every produced change's
 * required review uncertain, so the change is rendered as the unified hunk it
 * will become. `line` is 1 because the hunk covers the file from its first
 * line, and `cited` pulls a finding back onto the captured text. */
export declare const proposalHunks: (comparison: typeof Comparison.Type) => ReadonlyArray<Hunk>;
/** The states of one evaluation, at most {@link MAX_STATES} each. */
export declare const batches: <A>(states: ReadonlyArray<A>) => ReadonlyArray<ReadonlyArray<A>>;
/** The changed paths this check is configured to cover, matched the way
 * `verifyTrialChecks` matches them. */
export declare const scopedPaths: (comparison: typeof Comparison.Type, check: typeof Check.Type) => ReadonlyArray<string>;
/** One answer per hunk becomes one verdict.
 *
 * A probability at or above {@link FLAG_PROBABILITY} flags the hunk, one at or
 * below {@link CLEAN_PROBABILITY} clears it, and anything between or a missing
 * answer is indecisive. Every answer decisive and none flagged is a pass, a
 * decisive flag is a fail, and one indecisive hunk makes the whole check
 * uncertain. A path in `partial` had a hunk Jev saw only a prefix of, so it is
 * never examined and, unless a hunk is flagged, the check is uncertain. An
 * evaluation Jev could not answer at all never reaches here:
 * {@link jevSemanticCheck} fails instead of inventing a verdict. */
export declare const jevVerdict: (comparison: typeof Comparison.Type, check: typeof Check.Type, states: ReadonlyArray<RuleState>, answers: ReadonlyArray<{
    readonly violates: Classifier.BooleanAnswer;
}>, partial?: ReadonlyArray<string>) => typeof SemanticVerdict.Type;
/** The typed failure a hunk Jev could not answer becomes. It names the
 * evaluator's own code and message so an errored check row says which part of
 * the transport gave out, not merely that something did. */
export declare const jevUnavailable: (check: typeof Check.Type, failure: Classifier.ClassifierError) => CodingError;
/** Asks Jev about every in-scope hunk and reports what it decided.
 *
 * Jev is the only model that judges the rule. A host with no transport, a
 * refused provider, a timeout and a malformed answer all fail the call with
 * {@link jevUnavailable}; nothing else is asked and no verdict is invented.
 * An indecisive answer is different: that is Jev deciding it is unsure, and
 * the uncertain verdict it produces is the check's own verdict. */
export declare const jevSemanticCheck: (comparison: typeof Comparison.Type, check: typeof Check.Type) => Effect.Effect<typeof SemanticVerdict.Type, CodingError, Evaluator.Evaluator>;
/** Use the native subscription judge over the host's proxy-aware transport.
 * Seat resolution is lazy, so newly connected accounts work without a restart.
 * Missing subscriptions and invalid verdicts fail closed when asked to judge. */
export declare const evaluatorLayer: (environment: Readonly<Record<string, string | undefined>>, jevHttp?: Layer.Layer<HttpClient.HttpClient>) => Layer.Layer<Evaluator.Evaluator>;
