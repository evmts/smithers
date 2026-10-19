/** Jev judges one executed reproduction, and it is the only model that judges
 * it: there is no frontier seat behind it. */
import * as Classifier from "@smthrs/model/Classifier";
import type * as Evaluator from "@smthrs/model/Evaluator";
import { Effect, Schema } from "effect";
import { CodingError } from "../coding/schema.ts";
import type { Observation, Reproduction, ReproductionReview, Work } from "./jobs.ts";
/**
 * How sure the verdict must be before it is the review's verdict.
 *
 * TypeSafe reports Jev agreeing with a frontier model on about 76% of
 * judgments on its best-reported task, a ceiling and not an average, since its other published tasks run 61.7 to 71.6 (https://github.com/smithersai/smithers/issues/1654), so an ordinary answer is a
 * hint and not a verdict. `demonstrates` closes a bug report as reproduced and
 * `unrelated` closes it as not reproduced; both are read as facts downstream,
 * while `uncertain` only sends the run to a maintainer. Only the top of the
 * confidence range may decide, and everything below it reads `uncertain`,
 * which is Jev deciding it is unsure rather than the host overruling it.
 */
export declare const REPRODUCTION_CONFIDENCE = 0.8;
/** The most bytes one state may take, matching `@smthrs/std`'s per-state bound. */
export declare const MAX_REPRODUCTION_STATE_BYTES: number;
/** The most citations one review may carry, matching `ReproductionReview`. */
export declare const MAX_REPRODUCTION_CITATIONS = 40;
/** The three answers the step may reach, in the reviewer's own words. They are
 * the criteria Jev aligns the measurement against and the whole vocabulary
 * `assessReproduction` branches on. */
export declare const verdicts: {
    readonly demonstrates: "the fixture actually invokes the relevant repository behavior and the measured assertion establishes the reported defect";
    readonly unrelated: "the run failed, or passed, for some other reason: an unconditional throw, a hardcoded answer, a missing dependency, or a failure the report does not describe";
    readonly uncertain: "the captured source or the measured output is incomplete, so neither answer is established";
};
/** One executed reproduction, as the classifier sees it: the report it claims
 * to demonstrate, the exact fixture and command, and what running them
 * actually measured. */
export declare const ReproductionState: Schema.Struct<{
    readonly report: Schema.Struct<{
        readonly title: Schema.String;
        readonly body: Schema.String;
    }>;
    readonly fixture: Schema.$Array<Schema.Struct<{
        readonly path: Schema.String;
        readonly content: Schema.String;
    }>>;
    readonly command: Schema.Struct<{
        readonly argv: Schema.$Array<Schema.String>;
        readonly cwd: Schema.String;
        readonly expected: Schema.String;
        readonly failureContains: Schema.String;
    }>;
    readonly measured: Schema.Struct<{
        readonly exitCode: Schema.Int;
        readonly stdout: Schema.String;
        readonly stderr: Schema.String;
        readonly truncated: Schema.Boolean;
    }>;
    readonly source: Schema.$Array<Schema.String>;
}>;
/** The one judgment the whole reproduction review is built from. */
export declare const reproductionClassifier: Classifier.Classifier<"reproduction/verdict", Schema.Struct<{
    readonly report: Schema.Struct<{
        readonly title: Schema.String;
        readonly body: Schema.String;
    }>;
    readonly fixture: Schema.$Array<Schema.Struct<{
        readonly path: Schema.String;
        readonly content: Schema.String;
    }>>;
    readonly command: Schema.Struct<{
        readonly argv: Schema.$Array<Schema.String>;
        readonly cwd: Schema.String;
        readonly expected: Schema.String;
        readonly failureContains: Schema.String;
    }>;
    readonly measured: Schema.Struct<{
        readonly exitCode: Schema.Int;
        readonly stdout: Schema.String;
        readonly stderr: Schema.String;
        readonly truncated: Schema.Boolean;
    }>;
    readonly source: Schema.$Array<Schema.String>;
}>, {
    readonly verdict: Omit<Evaluator.ChoiceQuestion, "criteria"> & {
        readonly criteria: {
            readonly demonstrates: "the fixture actually invokes the relevant repository behavior and the measured assertion establishes the reported defect";
            readonly unrelated: "the run failed, or passed, for some other reason: an unconditional throw, a hardcoded answer, a missing dependency, or a failure the report does not describe";
            readonly uncertain: "the captured source or the measured output is incomplete, so neither answer is established";
        };
    };
}>;
/** The state one executed reproduction is judged as. */
export type ReproductionState = typeof ReproductionState.Type;
/** The captured source a fixture actually names, and then the fixture itself.
 *
 * A reviewer's citations are exact paths, which is the one thing a decision
 * model cannot produce, so the host derives them from the fixture rather than
 * asking a seat to retype them. A path counts as read when the fixture's text
 * carries it, either whole or as the final segment an import would write. That
 * is also what makes a `demonstrates` verdict stick: `assessReproduction`
 * accepts one only when a cited, untruncated captured source is among these,
 * so a fixture that names no captured source can never claim to exercise one.
 */
export declare const reproductionCitations: (work: typeof Work.Type, reproduction: typeof Reproduction.Type) => ReadonlyArray<string>;
/** The state this measurement is judged as, clipped so the encoded state fits.
 *
 * The report, the fixture and the two captured streams share whatever the
 * fixed fields leave. Each takes an equal share, and a part shorter than its
 * share leaves the rest to the others, so one enormous stdout cannot crowd the
 * fixture it came from out of its own state.
 */
export declare const reproductionState: (work: typeof Work.Type, reproduction: typeof Reproduction.Type, output: unknown) => ReproductionState;
/** The whole review a reproduction step retains, built from Jev's one answer
 * and the measured execution alone: no model prose and no cited path this
 * execution did not read. */
export declare const reproductionReview: (work: typeof Work.Type, reproduction: typeof Reproduction.Type, verdict: keyof typeof verdicts) => typeof ReproductionReview.Type;
/**
 * Asks Jev about one executed reproduction and writes the review from what it
 * answered.
 *
 * There is no fallback. An evaluator that is unconfigured, unreachable,
 * refused, out of time or malformed fails the step, because a review that
 * answered `uncertain` on a failed evaluation would be indistinguishable from
 * one Jev actually read and could not call. An answer below
 * {@link REPRODUCTION_CONFIDENCE} is different: that is Jev deciding it is
 * unsure, and the `uncertain` verdict it produces is the review's own.
 */
export declare const jevReproduction: (work: typeof Work.Type, observation: typeof Observation.Type, output: unknown) => Effect.Effect<typeof ReproductionReview.Type, CodingError, Evaluator.Evaluator>;
