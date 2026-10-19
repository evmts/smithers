import { Schema } from "effect";
export declare const ChangeId: Schema.String;
export declare const Resolved: Schema.Struct<{
    readonly changeId: Schema.String;
    readonly commitId: Schema.String;
    readonly operationId: Schema.String;
    readonly parentCommitIds: Schema.$Array<Schema.String>;
    readonly description: Schema.optionalKey<Schema.String>;
    readonly empty: Schema.optionalKey<Schema.Boolean>;
    readonly kind: Schema.Literal<"resolved">;
    readonly treeId: Schema.String;
}>;
export declare const Conflicted: Schema.Struct<{
    readonly changeId: Schema.String;
    readonly commitId: Schema.String;
    readonly operationId: Schema.String;
    readonly parentCommitIds: Schema.$Array<Schema.String>;
    readonly description: Schema.optionalKey<Schema.String>;
    readonly empty: Schema.optionalKey<Schema.Boolean>;
    readonly kind: Schema.Literal<"conflicted">;
    readonly treeTerms: Schema.$Array<Schema.Struct<{
        readonly treeId: Schema.String;
        readonly positive: Schema.Boolean;
    }>>;
}>;
export declare const NativeRevision: Schema.Union<readonly [Schema.Struct<{
    readonly changeId: Schema.String;
    readonly commitId: Schema.String;
    readonly operationId: Schema.String;
    readonly parentCommitIds: Schema.$Array<Schema.String>;
    readonly description: Schema.optionalKey<Schema.String>;
    readonly empty: Schema.optionalKey<Schema.Boolean>;
    readonly kind: Schema.Literal<"resolved">;
    readonly treeId: Schema.String;
}>, Schema.Struct<{
    readonly changeId: Schema.String;
    readonly commitId: Schema.String;
    readonly operationId: Schema.String;
    readonly parentCommitIds: Schema.$Array<Schema.String>;
    readonly description: Schema.optionalKey<Schema.String>;
    readonly empty: Schema.optionalKey<Schema.Boolean>;
    readonly kind: Schema.Literal<"conflicted">;
    readonly treeTerms: Schema.$Array<Schema.Struct<{
        readonly treeId: Schema.String;
        readonly positive: Schema.Boolean;
    }>>;
}>]>;
export type NativeRevision = typeof NativeRevision.Type;
export declare const Operation: Schema.Union<readonly [Schema.Struct<{
    readonly requestId: Schema.String;
    readonly expectedOperationId: Schema.String;
    readonly target: Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.optionalKey<Schema.Literal<"resolved">>;
        readonly treeId: Schema.String;
    }>;
    readonly operation: Schema.Literal<"create">;
    readonly description: Schema.String;
}>, Schema.Struct<{
    readonly requestId: Schema.String;
    readonly expectedOperationId: Schema.String;
    readonly target: Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.optionalKey<Schema.Literal<"resolved">>;
        readonly treeId: Schema.String;
    }>;
    readonly operation: Schema.Literal<"describe">;
    readonly description: Schema.String;
}>, Schema.Struct<{
    readonly requestId: Schema.String;
    readonly expectedOperationId: Schema.String;
    readonly target: Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.optionalKey<Schema.Literal<"resolved">>;
        readonly treeId: Schema.String;
    }>;
    readonly operation: Schema.Literal<"snapshot">;
}>, Schema.Struct<{
    readonly requestId: Schema.String;
    readonly expectedOperationId: Schema.String;
    readonly target: Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.optionalKey<Schema.Literal<"resolved">>;
        readonly treeId: Schema.String;
    }>;
    readonly operation: Schema.Literal<"edit">;
}>, Schema.Struct<{
    readonly requestId: Schema.String;
    readonly expectedOperationId: Schema.String;
    readonly target: Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.optionalKey<Schema.Literal<"resolved">>;
        readonly treeId: Schema.String;
    }>;
    readonly operation: Schema.Literal<"apply_files">;
    readonly files: Schema.$Array<Schema.Struct<{
        readonly path: Schema.NonEmptyString;
        readonly beforeDigest: Schema.NullOr<Schema.String>;
        readonly content: Schema.NullOr<Schema.String>;
    }>>;
}>, Schema.Struct<{
    readonly requestId: Schema.String;
    readonly expectedOperationId: Schema.String;
    readonly target: Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.optionalKey<Schema.Literal<"resolved">>;
        readonly treeId: Schema.String;
    }>;
    readonly operation: Schema.Literal<"amend">;
    readonly source: Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.optionalKey<Schema.Literal<"resolved">>;
        readonly treeId: Schema.String;
    }>;
}>, Schema.Struct<{
    readonly requestId: Schema.String;
    readonly expectedOperationId: Schema.String;
    readonly target: Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.optionalKey<Schema.Literal<"resolved">>;
        readonly treeId: Schema.String;
    }>;
    readonly operation: Schema.Literal<"reorder">;
    readonly after: Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.optionalKey<Schema.Literal<"resolved">>;
        readonly treeId: Schema.String;
    }>;
}>]>;
export type Operation = typeof Operation.Type;
export declare const ReadResult: Schema.Struct<{
    readonly status: Schema.Literal<"read">;
    readonly operationId: Schema.String;
    readonly head: Schema.Union<readonly [Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.Literal<"resolved">;
        readonly treeId: Schema.String;
    }>, Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.Literal<"conflicted">;
        readonly treeTerms: Schema.$Array<Schema.Struct<{
            readonly treeId: Schema.String;
            readonly positive: Schema.Boolean;
        }>>;
    }>]>;
    readonly revisions: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.Literal<"resolved">;
        readonly treeId: Schema.String;
    }>, Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.Literal<"conflicted">;
        readonly treeTerms: Schema.$Array<Schema.Struct<{
            readonly treeId: Schema.String;
            readonly positive: Schema.Boolean;
        }>>;
    }>]>>;
    readonly capabilities: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly history: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.Literal<"resolved">;
        readonly treeId: Schema.String;
    }>, Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.Literal<"conflicted">;
        readonly treeTerms: Schema.$Array<Schema.Struct<{
            readonly treeId: Schema.String;
            readonly positive: Schema.Boolean;
        }>>;
    }>]>>>;
    readonly historyComplete: Schema.optionalKey<Schema.Boolean>;
}>;
export declare const SourcePublication: Schema.Struct<{
    readonly status: Schema.Literal<"retained">;
    readonly requestId: Schema.String;
    readonly workspaceId: Schema.String;
    readonly repositoryId: Schema.Number;
    readonly ref: Schema.String;
    readonly source: Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly treeId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
    }>;
}>;
export type SourcePublication = typeof SourcePublication.Type;
export declare const CreationProof: Schema.Struct<{
    readonly requestId: Schema.String;
    readonly requestDigest: Schema.String;
}>;
export declare const PublishSource: Schema.Struct<{
    readonly requestId: Schema.String;
    readonly source: Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.Literal<"resolved">;
        readonly treeId: Schema.String;
    }>;
    readonly creation: Schema.optionalKey<Schema.Struct<{
        readonly requestId: Schema.String;
        readonly requestDigest: Schema.String;
    }>>;
}>;
/** Creates an immutable child without moving or writing any editing workspace. */
export declare const CreateSource: Schema.Struct<{
    readonly requestId: Schema.String;
    readonly expectedOperationId: Schema.String;
    readonly base: Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.Literal<"resolved">;
        readonly treeId: Schema.String;
    }>;
    readonly description: Schema.NonEmptyString;
    readonly files: Schema.$Array<Schema.Struct<{
        readonly path: Schema.NonEmptyString;
        readonly beforeDigest: Schema.NullOr<Schema.String>;
        readonly content: Schema.NullOr<Schema.String>;
    }>>;
}>;
export declare const SourceCreation: Schema.Struct<{
    readonly requestId: Schema.String;
    readonly requestDigest: Schema.String;
    readonly status: Schema.Literal<"created">;
    readonly replayed: Schema.Boolean;
    readonly workspaceId: Schema.String;
    readonly repositoryId: Schema.Number;
    readonly operationId: Schema.String;
    readonly parentOperationId: Schema.String;
    readonly base: Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly treeId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
    }>;
    readonly head: Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.Literal<"resolved">;
        readonly treeId: Schema.String;
    }>;
    readonly source: Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.Literal<"resolved">;
        readonly treeId: Schema.String;
    }>;
    readonly publicationReady: Schema.Boolean;
}>;
/** Object import is a native store operation, never an edit or source URL. */
export declare const ImportSource: Schema.Struct<{
    readonly requestId: Schema.String;
    readonly commits: Schema.$Array<Schema.Struct<{
        readonly commitId: Schema.String;
        readonly ref: Schema.NonEmptyString;
    }>>;
}>;
export declare const SourceImport: Schema.Struct<{
    readonly status: Schema.Literal<"imported">;
    readonly requestId: Schema.String;
    readonly workspaceId: Schema.String;
    readonly repositoryId: Schema.Number;
    readonly operationId: Schema.String;
    readonly head: Schema.Union<readonly [Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.Literal<"resolved">;
        readonly treeId: Schema.String;
    }>, Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.Literal<"conflicted">;
        readonly treeTerms: Schema.$Array<Schema.Struct<{
            readonly treeId: Schema.String;
            readonly positive: Schema.Boolean;
        }>>;
    }>]>;
    readonly revisions: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.Literal<"resolved">;
        readonly treeId: Schema.String;
    }>, Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.Literal<"conflicted">;
        readonly treeTerms: Schema.$Array<Schema.Struct<{
            readonly treeId: Schema.String;
            readonly positive: Schema.Boolean;
        }>>;
    }>]>>;
}>;
export declare const FileRecovery: Schema.Struct<{
    readonly requestId: Schema.String;
    readonly path: Schema.String;
    readonly files: Schema.$Array<Schema.Struct<{
        readonly path: Schema.String;
        readonly preimage: Schema.NullOr<Schema.String>;
        readonly proposed: Schema.NullOr<Schema.String>;
    }>>;
}>;
export declare const OperationResult: Schema.Union<readonly [Schema.Struct<{
    readonly status: Schema.Literal<"accepted">;
    readonly replayed: Schema.optionalKey<Schema.Boolean>;
    readonly operationId: Schema.String;
    readonly parentOperationId: Schema.String;
    readonly timestamp: Schema.String;
    readonly head: Schema.Union<readonly [Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.Literal<"resolved">;
        readonly treeId: Schema.String;
    }>, Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.Literal<"conflicted">;
        readonly treeTerms: Schema.$Array<Schema.Struct<{
            readonly treeId: Schema.String;
            readonly positive: Schema.Boolean;
        }>>;
    }>]>;
    readonly revision: Schema.Union<readonly [Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.Literal<"resolved">;
        readonly treeId: Schema.String;
    }>, Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.Literal<"conflicted">;
        readonly treeTerms: Schema.$Array<Schema.Struct<{
            readonly treeId: Schema.String;
            readonly positive: Schema.Boolean;
        }>>;
    }>]>;
    readonly revisions: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.Literal<"resolved">;
        readonly treeId: Schema.String;
    }>, Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.Literal<"conflicted">;
        readonly treeTerms: Schema.$Array<Schema.Struct<{
            readonly treeId: Schema.String;
            readonly positive: Schema.Boolean;
        }>>;
    }>]>>;
    readonly provenance: Schema.Literal<"pending">;
    readonly recovery: Schema.optionalKey<Schema.Struct<{
        readonly requestId: Schema.String;
        readonly path: Schema.String;
        readonly files: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly preimage: Schema.NullOr<Schema.String>;
            readonly proposed: Schema.NullOr<Schema.String>;
        }>>;
    }>>;
}>, Schema.Struct<{
    readonly status: Schema.Literal<"unchanged">;
    readonly operationId: Schema.String;
    readonly revision: Schema.Union<readonly [Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.Literal<"resolved">;
        readonly treeId: Schema.String;
    }>, Schema.Struct<{
        readonly changeId: Schema.String;
        readonly commitId: Schema.String;
        readonly operationId: Schema.String;
        readonly parentCommitIds: Schema.$Array<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly empty: Schema.optionalKey<Schema.Boolean>;
        readonly kind: Schema.Literal<"conflicted">;
        readonly treeTerms: Schema.$Array<Schema.Struct<{
            readonly treeId: Schema.String;
            readonly positive: Schema.Boolean;
        }>>;
    }>]>;
}>]>;
export type OperationResult = typeof OperationResult.Type;
/**
 * Every code a native coding failure can carry.
 *
 * It used to be `Schema.String`. The guest adapter's JSON error envelope is
 * decoded straight onto this field (`native.ts`), so an unconstrained `code`
 * let a program outside this repo choose the code on a `{ code, message }`
 * record — and that record is what `agent/internal/FailureSummary.ts` puts on
 * a run's first journal line, off which a run card picks the sentence a person
 * reads. A guest answering `{"error":{"code":"model_failed", …}}` made a
 * `repository/inspection` run say "a turn opened and the model never answered"
 * with no model in the run and no source change anywhere. Nothing in this repo
 * could see it: it is not a raise site, it is a string.
 *
 * So the field is closed, and the boundary decodes into it. The set is the
 * union of three declarations this repo already holds:
 *
 * - what this repo's own native paths raise (`native.ts`, `.smithers/flows/repository`),
 * - what the guest adapter answers, as Plue's own failure registry spells it
 *   without the `coding_` prefix (`packages/rpc/src/PlueFailureCodes.ts`),
 * - and what the same adapter answers in its `--engine` mode, as
 *   `.smithers/flows/coding/snapshots.ts` `ENGINE_CODES` admits it.
 *
 * A code outside the set is not lost: `native.ts` raises `invalid_receipt` and
 * keeps the guest's own code and sentence in the message, which is where a
 * foreign sentence already belonged. That is a smaller failure than the one it
 * replaces — the adapter's word is still on the card, and it can no longer be
 * mistaken for another vocabulary's.
 */
export declare const NativeCode: Schema.Literals<readonly ["invalid_receipt", "invalid_request", "outcome_unknown", "response_too_large", "source_creation_unavailable", "source_changed", "source_missing", "source_publication_invalid_ack", "source_publication_unavailable", "source_refused", "file_conflict", "file_recovery_required", "gateway_not_configured", "guest_failure", "host_unavailable", "host_upgrade_required", "provenance_pending", "provider_refresh_required", "reporter_upgrade_required", "unsupported_jj", "workspace_busy", "invalid_ref", "operation_conflict", "request_conflict", "revision_conflict", "snapshot_incomplete", "snapshot_refused", "unsupported_version"]>;
export type NativeCode = typeof NativeCode.Type;
/** Whether a string the guest adapter answered is one this repo declares. */
export declare const isNativeCode: <I>(input: I) => input is I & ("file_conflict" | "file_recovery_required" | "gateway_not_configured" | "guest_failure" | "host_unavailable" | "host_upgrade_required" | "invalid_receipt" | "invalid_ref" | "invalid_request" | "operation_conflict" | "outcome_unknown" | "provenance_pending" | "provider_refresh_required" | "reporter_upgrade_required" | "request_conflict" | "response_too_large" | "revision_conflict" | "snapshot_incomplete" | "snapshot_refused" | "source_changed" | "source_creation_unavailable" | "source_missing" | "source_publication_invalid_ack" | "source_publication_unavailable" | "source_refused" | "unsupported_jj" | "unsupported_version" | "workspace_busy");
declare const NativeCodingError_base: Schema.Class<NativeCodingError, Schema.TaggedStruct<"coding/NativeCodingError", {
    readonly code: Schema.Literals<readonly ["invalid_receipt", "invalid_request", "outcome_unknown", "response_too_large", "source_creation_unavailable", "source_changed", "source_missing", "source_publication_invalid_ack", "source_publication_unavailable", "source_refused", "file_conflict", "file_recovery_required", "gateway_not_configured", "guest_failure", "host_unavailable", "host_upgrade_required", "provenance_pending", "provider_refresh_required", "reporter_upgrade_required", "unsupported_jj", "workspace_busy", "invalid_ref", "operation_conflict", "request_conflict", "revision_conflict", "snapshot_incomplete", "snapshot_refused", "unsupported_version"]>;
    readonly message: Schema.String;
    readonly recovery: Schema.optionalKey<Schema.Struct<{
        readonly requestId: Schema.String;
        readonly path: Schema.String;
        readonly files: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly preimage: Schema.NullOr<Schema.String>;
            readonly proposed: Schema.NullOr<Schema.String>;
        }>>;
    }>>;
}>, import("effect/Cause").YieldableError>;
export declare class NativeCodingError extends NativeCodingError_base {
}
/** Reserved stack operations resolve the TODO/attempt/run/machine from the
 * installed host binding. None of that authority is supplied by a flow body. */
export declare const StackCandidate: Schema.Struct<{
    readonly generation: Schema.Number;
    readonly base: Schema.String;
    readonly head: Schema.String;
}>;
export type StackCandidate = typeof StackCandidate.Type;
export declare const StackProposal: Schema.Struct<{
    readonly generation: Schema.Number;
    readonly head: Schema.String;
}>;
export type StackProposal = typeof StackProposal.Type;
export {};
