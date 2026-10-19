/** Private value contracts shared by the recipe and journal projections. */
import { Schema } from "effect";
export declare const PocInput: Schema.Struct<{
    readonly plan: Schema.Struct<{
        readonly prompt: Schema.NonEmptyString;
        readonly memoryRevision: Schema.NonEmptyString;
        readonly wikiCitations: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly slug: Schema.NonEmptyString;
            readonly pageID: Schema.NonEmptyString;
            readonly revision: Schema.Int;
            readonly digest: Schema.String;
        }>>>;
        readonly memory: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly origin: Schema.Literal<"recall">;
            readonly bank: Schema.NonEmptyString;
            readonly key: Schema.NonEmptyString;
            readonly text: Schema.NonEmptyString;
        }>>>;
        readonly base: Schema.Struct<{
            readonly changeId: Schema.NonEmptyString;
            readonly commitId: Schema.NonEmptyString;
            readonly treeId: Schema.NonEmptyString;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
        }>;
        readonly observedHead: Schema.optionalKey<Schema.Struct<{
            readonly changeId: Schema.NonEmptyString;
            readonly commitId: Schema.NonEmptyString;
            readonly treeId: Schema.NonEmptyString;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
        }>>;
        readonly changes: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly title: Schema.NonEmptyString;
            readonly intent: Schema.NonEmptyString;
            readonly implementation: Schema.NonEmptyString;
            readonly implementationDigest: Schema.NonEmptyString;
            readonly atoms: Schema.$Array<Schema.Struct<{
                readonly changeId: Schema.NullOr<Schema.NonEmptyString>;
                readonly message: Schema.NonEmptyString;
                readonly intent: Schema.NonEmptyString;
                readonly reads: Schema.$Array<Schema.NonEmptyString>;
                readonly writes: Schema.$Array<Schema.NonEmptyString>;
            }>>;
            readonly checks: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly target: Schema.NonEmptyString;
                readonly flow: Schema.NonEmptyString;
                readonly flowDigest: Schema.NonEmptyString;
                readonly tier: Schema.Literals<readonly ["fast", "slow", "delivery"]>;
                readonly required: Schema.Boolean;
            }>>;
        }>>;
    }>;
    readonly source: Schema.Struct<{
        readonly changeId: Schema.NonEmptyString;
        readonly commitId: Schema.NonEmptyString;
        readonly treeId: Schema.NonEmptyString;
        readonly operationId: Schema.NonEmptyString;
        readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
    }>;
}>;
export declare const PocSource: Schema.Struct<{
    readonly revision: Schema.Struct<{
        readonly changeId: Schema.NonEmptyString;
        readonly commitId: Schema.NonEmptyString;
        readonly treeId: Schema.NonEmptyString;
        readonly operationId: Schema.NonEmptyString;
        readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
    }>;
    readonly files: Schema.$Array<Schema.Struct<{
        readonly path: Schema.NonEmptyString;
        readonly content: Schema.NullOr<Schema.String>;
    }>>;
    readonly writable: Schema.$Array<Schema.NonEmptyString>;
    readonly digest: Schema.NonEmptyString;
}>;
export type PocSource = typeof PocSource.Type;
export declare const PocDraft: Schema.Struct<{
    readonly explanation: Schema.NonEmptyString;
    readonly files: Schema.$Array<Schema.Struct<{
        readonly path: Schema.NonEmptyString;
        readonly content: Schema.NullOr<Schema.String>;
    }>>;
}>;
export type PocDraft = typeof PocDraft.Type;
export declare const PocChanges: Schema.Struct<{
    readonly sourceDigest: Schema.NonEmptyString;
    readonly transactionBase: Schema.NonEmptyString;
    readonly files: Schema.$Array<Schema.Struct<{
        readonly path: Schema.NonEmptyString;
        readonly before: Schema.NullOr<Schema.String>;
        readonly after: Schema.NullOr<Schema.String>;
        readonly beforeDigest: Schema.NullOr<Schema.String>;
        readonly afterDigest: Schema.NullOr<Schema.String>;
    }>>;
    readonly preview: Schema.Struct<{
        readonly mediaType: Schema.Literal<"text/html">;
        readonly content: Schema.String;
    }>;
}>;
export declare const PocReview: Schema.Struct<{
    readonly findings: Schema.$Array<Schema.NonEmptyString>;
    readonly nextPlan: Schema.NonEmptyString;
}>;
export declare const PocResult: Schema.Struct<{
    readonly status: Schema.Literal<"drafted-unvalidated">;
    readonly source: Schema.Struct<{
        readonly changeId: Schema.NonEmptyString;
        readonly commitId: Schema.NonEmptyString;
        readonly treeId: Schema.NonEmptyString;
        readonly operationId: Schema.NonEmptyString;
        readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
    }>;
    readonly changes: Schema.Struct<{
        readonly sourceDigest: Schema.NonEmptyString;
        readonly transactionBase: Schema.NonEmptyString;
        readonly files: Schema.$Array<Schema.Struct<{
            readonly path: Schema.NonEmptyString;
            readonly before: Schema.NullOr<Schema.String>;
            readonly after: Schema.NullOr<Schema.String>;
            readonly beforeDigest: Schema.NullOr<Schema.String>;
            readonly afterDigest: Schema.NullOr<Schema.String>;
        }>>;
        readonly preview: Schema.Struct<{
            readonly mediaType: Schema.Literal<"text/html">;
            readonly content: Schema.String;
        }>;
    }>;
    readonly findings: Schema.$Array<Schema.NonEmptyString>;
    readonly feedback: Schema.String;
}>;
export type PocResult = typeof PocResult.Type;
