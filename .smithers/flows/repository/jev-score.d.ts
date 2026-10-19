/** Jev decides whether a recorded job met the maintainer's frozen
 * expectation, and it is the only model that decides it. */
import * as Classifier from "@smthrs/model/Classifier";
import type * as Evaluator from "@smthrs/model/Evaluator";
import { Effect, Schema } from "effect";
import { CodingError } from "../coding/schema.ts";
import type { EvalCase, JobResult } from "./schema.ts";
/**
 * How sure the verdict must be before it is the row's verdict.
 *
 * TypeSafe reports Jev agreeing with a frontier model on about 76% of
 * judgments on its best-reported task, a ceiling and not an average, since its other published tasks run 61.7 to 71.6 (https://github.com/smithersai/smithers/issues/1654), so an ordinary answer is a
 * hint and not a verdict. `pass` and `fail` are read as the candidate's own
 * score and gate whether a maintainer ships a configuration; `review` only
 * asks a person to read the row. Only the top of the confidence range may
 * decide, and everything below it reads `review`, which is Jev deciding it is
 * unsure rather than the host overruling it.
 */
export declare const SCORE_CONFIDENCE = 0.8;
/** The most bytes one state may take, matching `@smthrs/std`'s per-state bound. */
export declare const MAX_SCORE_STATE_BYTES: number;
/** The most recorded steps one state carries, matching `Draft.steps`. */
export declare const MAX_SCORE_STEPS = 30;
/** The three answers a row may reach, in the evaluator's own words. */
export declare const verdicts: {
    readonly pass: "the recorded facts establish the expected behavior";
    readonly fail: "the recorded facts contradict the expected behavior, or the job did not do what was expected";
    readonly review: "the recorded facts cannot establish the expectation either way, so a person has to read the row";
};
/** One recorded job judged against one frozen expectation. */
export declare const CaseState: Schema.Struct<{
    readonly name: Schema.String;
    readonly expected: Schema.String;
    readonly observed: Schema.Struct<{
        readonly job: Schema.String;
        readonly status: Schema.String;
        readonly results: Schema.$Array<Schema.Struct<{
            readonly stepId: Schema.String;
            readonly status: Schema.String;
            readonly summary: Schema.String;
            readonly evidence: Schema.$Array<Schema.String>;
        }>>;
    }>;
}>;
/** The state one recorded job is judged as. */
export type CaseState = typeof CaseState.Type;
/** The one judgment every evaluation row is built from. */
export declare const caseClassifier: Classifier.Classifier<"eval/case", Schema.Struct<{
    readonly name: Schema.String;
    readonly expected: Schema.String;
    readonly observed: Schema.Struct<{
        readonly job: Schema.String;
        readonly status: Schema.String;
        readonly results: Schema.$Array<Schema.Struct<{
            readonly stepId: Schema.String;
            readonly status: Schema.String;
            readonly summary: Schema.String;
            readonly evidence: Schema.$Array<Schema.String>;
        }>>;
    }>;
}>, {
    readonly verdict: Omit<Evaluator.ChoiceQuestion, "criteria"> & {
        readonly criteria: {
            readonly pass: "the recorded facts establish the expected behavior";
            readonly fail: "the recorded facts contradict the expected behavior, or the job did not do what was expected";
            readonly review: "the recorded facts cannot establish the expectation either way, so a person has to read the row";
        };
    };
}>;
/**
 * The state this row is judged as, clipped so the encoded state fits.
 *
 * The expectation takes at most half the room and every recorded summary
 * shares the rest evenly, so one long step summary cannot crowd the
 * expectation it is judged against out of its own state.
 */
export declare const scoreState: (test: typeof EvalCase.Type, observed: JobResult) => CaseState;
/**
 * Asks Jev whether one recorded job met its frozen expectation.
 *
 * There is no fallback. An evaluator that is unconfigured, unreachable,
 * refused, out of time or malformed fails the score, because a row that read
 * `review` on a failed evaluation would be indistinguishable from one Jev
 * actually judged and could not call. An answer below {@link SCORE_CONFIDENCE}
 * is different: that is Jev deciding it is unsure, and the `review` verdict it
 * produces is the row's own.
 */
export declare const jevScore: (test: typeof EvalCase.Type, observed: JobResult) => Effect.Effect<keyof typeof verdicts, CodingError, Evaluator.Evaluator>;
