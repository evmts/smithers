/** Jev judges one prior report at a time, so a duplicate is found by a
 * decision model over a closed candidate list instead of a frontier seat
 * reading the repository's whole issue history. */
import * as Classifier from "@smthrs/model/Classifier";
import type * as Evaluator from "@smthrs/model/Evaluator";
import { Effect, Schema } from "effect";
import { CodingError } from "../coding/schema.ts";
import type { Classification, Observation, Work } from "./jobs.ts";
import type { Record } from "./schema.ts";
/**
 * How sure the `same` answer must be before a prior record is reported as a
 * duplicate.
 *
 * TypeSafe reports Jev agreeing with a frontier model on about 76% of
 * judgments on its best-reported task, a ceiling and not an average, since its other published tasks run 61.7 to 71.6 (https://github.com/smithersai/smithers/issues/1654), so an ordinary answer is a
 * hint and not a verdict. A wrong match sends a maintainer to close a live
 * report as a duplicate of an unrelated one, which the author has to reopen
 * and argue back; a missed match costs one extra triage read. Only the top of
 * the confidence range may claim a duplicate, and everything below it is
 * reported as no duplicate rather than as a maybe.
 */
export declare const DUPLICATE_CONFIDENCE = 0.8;
/** The most bytes one pair may take, matching `@smthrs/std`'s per-state bound. */
export declare const MAX_STATE_BYTES: number;
/** The most bytes of a title one state carries, so a body is never crowded out. */
export declare const MAX_TITLE_BYTES = 1000;
/** The most duplicates one `Observation` may carry, matching its own schema. */
export declare const MAX_DUPLICATES = 20;
/** How close a prior record is, worst to closest. A score question orders its
 * rungs, so the wording of each one is what Jev is aligning the pair against
 * and what the matched duplicate later cites as its reason. */
export declare const levels: readonly ["distinct: different defects or requests", "related: same area or symptom, different cause", "same: the same underlying defect or request"];
/** The one level that makes a prior record a duplicate. */
export declare const SAME: "same: the same underlying defect or request";
/** One prior record judged against the request under investigation. */
export declare const PairState: Schema.Struct<{
    readonly subject: Schema.Struct<{
        readonly title: Schema.String;
        readonly body: Schema.String;
    }>;
    readonly candidate: Schema.Struct<{
        readonly source: Schema.Literals<readonly ["github", "smithers-cloud"]>;
        readonly number: Schema.Int;
        readonly title: Schema.String;
        readonly body: Schema.String;
    }>;
}>;
/** The pairwise judgment the whole duplicates step is built from. */
export declare const pairClassifier: Classifier.Classifier<"duplicates/pair", Schema.Struct<{
    readonly subject: Schema.Struct<{
        readonly title: Schema.String;
        readonly body: Schema.String;
    }>;
    readonly candidate: Schema.Struct<{
        readonly source: Schema.Literals<readonly ["github", "smithers-cloud"]>;
        readonly number: Schema.Int;
        readonly title: Schema.String;
        readonly body: Schema.String;
    }>;
}>, {
    readonly score: Omit<Evaluator.ScoreQuestion, "criteria"> & {
        readonly criteria: readonly ["distinct: different defects or requests", "related: same area or symptom, different cause", "same: the same underlying defect or request"];
    };
}>;
/** The state one pair is judged as. */
export type PairState = typeof PairState.Type;
/** The request under investigation, read from the same screened event payload
 * every other step reads. */
export declare const subjectOf: (work: typeof Work.Type) => {
    readonly title: string;
    readonly body: string;
};
/** The prior records a duplicate may be. Only a captured issue qualifies,
 * because that is the only thing `verifyObservation` accepts, and the event's
 * own issue is never a duplicate of itself. */
export declare const duplicateCandidates: (work: typeof Work.Type) => ReadonlyArray<typeof Record.Type>;
/** One state per candidate, with the two bodies sharing whatever the titles
 * leave. Each body may take half the room, and a body shorter than half leaves
 * the rest to the other, so one long prior record cannot crowd the request
 * under investigation out of its own state. */
export declare const duplicateStates: (work: typeof Work.Type) => ReadonlyArray<PairState>;
/** The whole observation a duplicates step retains, built from Jev's answers
 * and the captured evidence alone: no prose, no follow-up question, and no
 * citation this execution did not read. The classification is the one
 * `InvestigateStep` already read off the intake screen. */
export declare const duplicateObservation: (work: typeof Work.Type, classification: typeof Classification.Type, matched: ReadonlyArray<typeof Record.Type>) => typeof Observation.Type;
/**
 * Asks Jev about every captured prior issue and builds the observation from
 * what it answered.
 *
 * There is no fallback. An evaluator that is unconfigured, unreachable,
 * refused, out of time or malformed fails the step, because a duplicates step
 * that answered "no duplicate" on a failed evaluation would be indistinguishable
 * from one that looked and found none. A repository with no captured issue
 * history is the one case that answers without asking: there is nothing to
 * compare, so there is no decision to make.
 */
export declare const jevDuplicates: (work: typeof Work.Type, classification: typeof Classification.Type) => Effect.Effect<typeof Observation.Type, CodingError, Evaluator.Evaluator>;
