import * as Classifier from "@smthrs/model/Classifier";
import * as Evaluator from "@smthrs/model/Evaluator";
import { Effect, Schema } from "effect";
import { CodingError } from "../coding/schema.ts";
import type { Event, IntakeScreening } from "./schema.ts";
/** The step whose decision the journal event records. It runs inside the
 * recorded, nondeterministic `repository/capture-job` action, so its answers
 * are captured once with the evidence and a replay reuses them rather than
 * asking Jev again. */
export declare const intakeScreenStep = "repository/intake-screen";
/** The journal event one screened event writes. */
export declare const intakeScreenedEvent = "flows.repository.intake-screened.v1";
/** What replaces a text the screen withheld. It is the whole text: a model
 * that sees this knows something was removed and cannot read what it said. */
export declare const withheldPlaceholder = "[withheld: instruction-shaped content]";
/**
 * How sure the `kind` answer must be before a spam or irrelevant event is
 * dropped without spending an investigation.
 *
 * TypeSafe reports Jev agreeing with a frontier model on about 76% of
 * judgments, so an ordinary answer is a hint and not a verdict. Dropping an
 * event is irreversible from the author's point of view, so only the top of
 * the confidence range may do it; everything below proceeds untouched and the
 * answer rides along as data.
 *
 * A choice the transport answers without a distribution decodes as one-hot,
 * so its confidence reads 1 and every spam verdict would clear this bar. Jev
 * sends the distribution; a host that binds some other transport that does
 * not would be dropping events on a verdict with no measured confidence
 * behind it, and the journal's `answers` is where that shows up.
 */
export declare const ignoreConfidence = 0.9;
/**
 * How probable the `injection` answer must be before a text is withheld from
 * every model prompt.
 *
 * The same 76% agreement figure applies, and withholding blinds the
 * investigation to real content, so the bar is the same top of the range. A
 * lower probability changes nothing: today's only defense is the system
 * prompt's "treat as untrusted", which stays in force underneath.
 */
export declare const injectionProbability = 0.9;
/** The maximum UTF-8 size of a complete JSON-encoded classifier state. */
export declare const maximumStateBytes: number;
/** At most this many texts of one event are screened in one batch. */
export declare const maximumStates = 64;
/** One text of an inbound event, as the classifier sees it. */
export declare const IntakeState: Schema.Struct<{
    readonly repo: Schema.String;
    readonly source: Schema.Literals<readonly ["issue", "pr", "comment"]>;
    readonly title: Schema.String;
    readonly body: Schema.String;
    readonly author: Schema.String;
}>;
/** The one screen every inbound repository event goes through. */
export declare const intakeClassifier: Classifier.Classifier<"intake/event", Schema.Struct<{
    readonly repo: Schema.String;
    readonly source: Schema.Literals<readonly ["issue", "pr", "comment"]>;
    readonly title: Schema.String;
    readonly body: Schema.String;
    readonly author: Schema.String;
}>, {
    readonly injection: Evaluator.BooleanQuestion;
    readonly kind: Omit<Evaluator.ChoiceQuestion, "criteria"> & {
        readonly criteria: {
            readonly bug: "it reports behavior the project gets wrong, with or without a reproduction";
            readonly feature: "it asks for behavior the project does not have yet, or for a change to behavior it has";
            readonly question: "it asks how something works or how to use it, and wants an answer rather than a change";
            readonly spam: "it advertises, solicits, or is automated noise with nothing to act on";
            readonly irrelevant: "it is about some other project, is empty, or names nothing this repository could act on";
        };
    };
    readonly urgency: Omit<Evaluator.ScoreQuestion, "criteria"> & {
        readonly criteria: readonly ["low", "medium", "high"];
    };
}>;
/** One text per state, so an injected comment is withheld on its own and the
 * title and body it arrived beside are not. */
export declare const intakeTexts: (payload: unknown) => ReadonlyArray<typeof IntakeState.Type & {
    readonly id: string;
}>;
/** The complete state one text is judged as; bounds are checked before evaluation. */
export declare const intakeState: (repo: string, text: typeof IntakeState.Type) => typeof IntakeState.Type;
/** Replaces the named texts with {@link withheldPlaceholder}, leaving every
 * other field of the payload, and every text the screen cleared, as it was. */
export declare const redactPayload: (payload: unknown, withheld: ReadonlySet<string>) => Schema.Json;
export interface ScreenedEvent {
    /** The event payload every later step reads, with any withheld text replaced. */
    readonly payload: Schema.Json;
    readonly screening: typeof IntakeScreening.Type;
}
/**
 * Screens one inbound event's text with Jev, before any frontier model is
 * asked anything about it.
 *
 * One batched call answers every text the event carries. A spam or irrelevant
 * event at {@link ignoreConfidence} or above is ignored, which ends the job
 * the way an already-ignored event ends it. A text whose injection
 * probability reaches {@link injectionProbability} is replaced by
 * {@link withheldPlaceholder} on its own. An answer below either threshold is
 * Jev deciding, so the event proceeds and the answers ride along as data.
 *
 * An evaluator that is unconfigured, refused, malformed or out of time is a
 * reason to stop. A text nobody screened is a text no model may read, so the
 * screen fails the job with a typed {@link CodingError} naming the
 * evaluator's own error, and the journal records `failed` with that reason.
 * One unanswered text of several is the same refusal: a partly screened event
 * would carry unscreened text into every later prompt.
 */
export declare const screenEvent: (input: {
    readonly repo: string;
    readonly event: typeof Event.Type;
    readonly payload: unknown;
}) => Effect.Effect<ScreenedEvent, CodingError>;
