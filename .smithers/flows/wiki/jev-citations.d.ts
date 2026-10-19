/** Jev judges whether each cited excerpt actually supports the claim it was
 * cited for. Exact assessment already proves a citation's quote is really on
 * that line of that file; it cannot tell whether the line has anything to do
 * with the sentence it is attached to. That judgement has three answers and
 * Jev gives it, one (claim, citation) pair at a time. */
import * as Classifier from "@smthrs/model/Classifier";
import type * as Evaluator from "@smthrs/model/Evaluator";
import { Effect, Schema } from "effect";
import { type Evidence, type Review, WikiError } from "./schema.ts";
/**
 * At or above this confidence a `contradicts` or `unrelated` answer makes the
 * citation unsupported, and a `supports` answer makes it supported.
 *
 * This is the review policy's decision threshold, not a calibrated guarantee
 * about whichever subscription model the host resolves. Lower confidence is
 * recorded as `uncertain` rather than counted either way.
 */
export declare const UNSUPPORTED_CONFIDENCE = 0.8;
/** The most bytes one state may take, matching `@smthrs/std`'s per-state bound. */
export declare const MAX_STATE_BYTES: number;
/** The most bytes of the claim one state carries; the excerpt takes the rest. */
export declare const MAX_CLAIM_BYTES: number;
/** How many source lines either side of the cited line the excerpt carries, so
 * a claim is judged against the line in the context the reviewer saw it in. */
export declare const CITATION_CONTEXT_LINES = 8;
/** One (claim, citation) pair as the classifier sees it. */
export declare const CitationState: Schema.Struct<{
    readonly claim: Schema.String;
    readonly source: Schema.Struct<{
        readonly path: Schema.String;
        readonly excerpt: Schema.String;
    }>;
}>;
export type CitationState = typeof CitationState.Type;
/** The one question every citation answers. */
export declare const citationClassifier: Classifier.Classifier<"citation/support", Schema.Struct<{
    readonly claim: Schema.String;
    readonly source: Schema.Struct<{
        readonly path: Schema.String;
        readonly excerpt: Schema.String;
    }>;
}>, {
    readonly support: Omit<Evaluator.ChoiceQuestion, "criteria"> & {
        readonly criteria: {
            readonly supports: "the excerpt states or directly implies the claim";
            readonly contradicts: "the excerpt states the opposite";
            readonly unrelated: "the excerpt does not bear on the claim";
        };
    };
}>;
/** What Jev may answer about one citation. */
export declare const CitationChoice: Schema.Literals<readonly ["supports", "contradicts", "unrelated"]>;
/** What one citation, or a whole page of them, comes to. */
export declare const CitationOutcome: Schema.Literals<readonly ["supported", "unsupported", "uncertain"]>;
export declare const CitationVerdict: Schema.Struct<{
    readonly section: Schema.String;
    readonly path: Schema.String;
    readonly line: Schema.Int;
    readonly quote: Schema.String;
    readonly choice: Schema.Literals<readonly ["supports", "contradicts", "unrelated"]>;
    readonly confidence: Schema.Number;
    readonly outcome: Schema.Literals<readonly ["supported", "unsupported", "uncertain"]>;
}>;
export type CitationVerdict = typeof CitationVerdict.Type;
export declare const PageCitations: Schema.Struct<{
    readonly verdict: Schema.Literals<readonly ["supported", "unsupported", "uncertain"]>;
    readonly citations: Schema.$Array<Schema.Struct<{
        readonly section: Schema.String;
        readonly path: Schema.String;
        readonly line: Schema.Int;
        readonly quote: Schema.String;
        readonly choice: Schema.Literals<readonly ["supports", "contradicts", "unrelated"]>;
        readonly confidence: Schema.Number;
        readonly outcome: Schema.Literals<readonly ["supported", "unsupported", "uncertain"]>;
    }>>;
}>;
export type PageCitations = typeof PageCitations.Type;
/** One citation, the claim it is attached to, and the state Jev is asked about. */
export interface CitationRequest {
    readonly section: string;
    readonly path: string;
    readonly line: number;
    readonly quote: string;
    readonly state: CitationState;
}
/** The cited line with its neighbours, numbered the way the reviewer saw them.
 * A line the page's excerpts hid is not evidence, so it is not shown here
 * either. */
export declare const citationExcerpt: (evidence: Evidence, path: string, line: number) => string;
/** Every (claim, citation) pair one reviewed page puts to Jev, in review order.
 * The claim is the section's own Markdown, which is the unit the reviewer
 * attached the citation to. */
export declare const citationRequests: (evidence: Evidence, review: Review) => ReadonlyArray<CitationRequest>;
/** One answer per citation becomes one verdict, and the page takes the worst
 * of them: unsupported when any citation is, uncertain when any is unsure and
 * none is unsupported, supported only when every one is. */
export declare const citationVerdicts: (requests: ReadonlyArray<CitationRequest>, answers: ReadonlyArray<{
    readonly support: Classifier.ChoiceAnswer<typeof CitationChoice.Type>;
}>) => PageCitations;
/** The typed failure a citation Jev could not answer becomes. It names the
 * evaluator's own code so a refused run says which part of the transport gave
 * out, not merely that the page was not checked. */
export declare const citationCheckUnavailable: (evidence: Evidence, failure: Classifier.ClassifierError) => WikiError;
/** The refusal an unsupported page becomes, naming the citations that earned
 * it the way exact assessment names the ones that are not really there. */
export declare const unsupportedCitations: (evidence: Evidence, page: PageCitations) => WikiError;
/**
 * Asks Jev about every citation of one reviewed page and reports what it
 * decided.
 *
 * Jev is the only model that answers this: a host with no transport, a refused
 * provider, a timeout and a malformed answer all fail the call with
 * {@link citationCheckUnavailable}, so a page is never published unchecked and
 * no frontier seat is asked to make the judgement instead. An unsure answer is
 * different: that is Jev deciding it cannot tell, and it rides along as an
 * `uncertain` verdict.
 */
export declare const checkCitations: (evidence: Evidence, review: Review) => Effect.Effect<PageCitations, WikiError, Evaluator.Evaluator>;
