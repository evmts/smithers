import { Schema } from "effect";
export declare const Source: Schema.Struct<{
    readonly path: Schema.String;
    readonly digest: Schema.String;
    readonly text: Schema.String;
}>;
export declare const PageSpec: Schema.Struct<{
    readonly id: Schema.String;
    readonly title: Schema.String;
    readonly purpose: Schema.String;
    readonly kind: Schema.Literals<readonly ["current", "intent"]>;
    readonly document: Schema.String;
    /** Install-generated source inventory, expanded afresh at each immutable revision. */
    readonly sourceDirectory: Schema.optionalKey<Schema.String>;
    readonly inputs: Schema.$Array<Schema.String>;
    readonly related: Schema.$Array<Schema.String>;
    readonly excerpts: Schema.optional<Schema.$Record<Schema.String, Schema.$Array<Schema.Struct<{
        readonly start: Schema.Int;
        readonly end: Schema.Int;
    }>>>>;
}>;
export type PageSpec = typeof PageSpec.Type;
export declare const Section: Schema.Struct<{
    readonly id: Schema.String;
    readonly markdown: Schema.String;
}>;
export declare const Evidence: Schema.Struct<{
    readonly spec: Schema.Struct<{
        readonly id: Schema.String;
        readonly title: Schema.String;
        readonly purpose: Schema.String;
        readonly kind: Schema.Literals<readonly ["current", "intent"]>;
        readonly document: Schema.String;
        /** Install-generated source inventory, expanded afresh at each immutable revision. */
        readonly sourceDirectory: Schema.optionalKey<Schema.String>;
        readonly inputs: Schema.$Array<Schema.String>;
        readonly related: Schema.$Array<Schema.String>;
        readonly excerpts: Schema.optional<Schema.$Record<Schema.String, Schema.$Array<Schema.Struct<{
            readonly start: Schema.Int;
            readonly end: Schema.Int;
        }>>>>;
    }>;
    readonly inputDigest: Schema.String;
    readonly contentDigest: Schema.String;
    readonly markdown: Schema.String;
    readonly sections: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly markdown: Schema.String;
    }>>;
    readonly sources: Schema.$Array<Schema.Struct<{
        readonly path: Schema.String;
        readonly digest: Schema.String;
        readonly text: Schema.String;
    }>>;
}>;
export type Evidence = typeof Evidence.Type;
export declare const Review: Schema.Struct<{
    readonly sections: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly verdict: Schema.Literals<readonly ["supported", "unsupported", "uncertain"]>;
        readonly explanation: Schema.String;
        readonly citations: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly line: Schema.Int;
            readonly quote: Schema.NonEmptyString;
        }>>;
    }>>;
}>;
export type Review = typeof Review.Type;
export declare const ReviewedPage: Schema.Struct<{
    readonly evidence: Schema.Struct<{
        readonly spec: Schema.Struct<{
            readonly id: Schema.String;
            readonly title: Schema.String;
            readonly purpose: Schema.String;
            readonly kind: Schema.Literals<readonly ["current", "intent"]>;
            readonly document: Schema.String;
            /** Install-generated source inventory, expanded afresh at each immutable revision. */
            readonly sourceDirectory: Schema.optionalKey<Schema.String>;
            readonly inputs: Schema.$Array<Schema.String>;
            readonly related: Schema.$Array<Schema.String>;
            readonly excerpts: Schema.optional<Schema.$Record<Schema.String, Schema.$Array<Schema.Struct<{
                readonly start: Schema.Int;
                readonly end: Schema.Int;
            }>>>>;
        }>;
        readonly inputDigest: Schema.String;
        readonly contentDigest: Schema.String;
        readonly markdown: Schema.String;
        readonly sections: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly markdown: Schema.String;
        }>>;
        readonly sources: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly digest: Schema.String;
            readonly text: Schema.String;
        }>>;
    }>;
    readonly review: Schema.NullOr<Schema.Struct<{
        readonly sections: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly verdict: Schema.Literals<readonly ["supported", "unsupported", "uncertain"]>;
            readonly explanation: Schema.String;
            readonly citations: Schema.$Array<Schema.Struct<{
                readonly path: Schema.String;
                readonly line: Schema.Int;
                readonly quote: Schema.NonEmptyString;
            }>>;
        }>>;
    }>>;
    readonly reviewer: Schema.NullOr<Schema.String>;
}>;
export type ReviewedPage = typeof ReviewedPage.Type;
export declare const Input: Schema.Struct<{
    readonly pages: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly title: Schema.String;
        readonly purpose: Schema.String;
        readonly kind: Schema.Literals<readonly ["current", "intent"]>;
        readonly document: Schema.String;
        /** Install-generated source inventory, expanded afresh at each immutable revision. */
        readonly sourceDirectory: Schema.optionalKey<Schema.String>;
        readonly inputs: Schema.$Array<Schema.String>;
        readonly related: Schema.$Array<Schema.String>;
        readonly excerpts: Schema.optional<Schema.$Record<Schema.String, Schema.$Array<Schema.Struct<{
            readonly start: Schema.Int;
            readonly end: Schema.Int;
        }>>>>;
    }>>;
    readonly mode: Schema.Literals<readonly ["preview", "verified"]>;
    readonly reviewer: Schema.String;
}>;
export type Input = typeof Input.Type;
export declare const Receipt: Schema.Struct<{
    readonly schemaVersion: Schema.Literal<1>;
    readonly sourceRevision: Schema.String;
    readonly inputDigest: Schema.String;
    readonly output: Schema.String;
    readonly pages: Schema.Int;
    readonly verification: Schema.Literals<readonly ["unreviewed", "verified", "needs-changes"]>;
}>;
export type Receipt = typeof Receipt.Type;
declare const WikiError_base: Schema.Class<WikiError, Schema.TaggedStruct<"WikiError", {
    readonly code: Schema.Literals<readonly ["invalid-input", "stale-source", "review-failed", "output-conflict", "citation-check-unavailable", "io"]>;
    readonly message: Schema.String;
}>, import("effect/Cause").YieldableError>;
export declare class WikiError extends WikiError_base {
}
export {};
