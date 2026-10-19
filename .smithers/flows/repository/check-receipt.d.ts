import { Context, Effect, Layer, Schema } from "effect";
import { HttpClient } from "effect/http";
import { CodingError } from "../coding/schema.ts";
import { CiPolicy, type CiPolicyRef } from "./ci-policy.ts";
import { type Work } from "./jobs.ts";
export declare const CheckOutcome: Schema.Struct<{
    readonly id: Schema.NonEmptyString;
    readonly outcome: Schema.Literals<readonly ["passed", "skipped_no_matching_paths"]>;
}>;
export declare const CheckReceiptRequest: Schema.Struct<{
    readonly repo: Schema.NonEmptyString;
    readonly workspace_id: Schema.String;
    readonly registration_id: Schema.String;
    readonly revision: Schema.Int;
    readonly digest: Schema.String;
    readonly execution_digest: Schema.String;
    readonly run_id: Schema.NonEmptyString;
    readonly execution_id: Schema.NonEmptyString;
    readonly commit_id: Schema.String;
    readonly change_id: Schema.String;
    readonly base_commit_id: Schema.String;
    readonly checks: Schema.$Array<Schema.Struct<{
        readonly id: Schema.NonEmptyString;
        readonly outcome: Schema.Literals<readonly ["passed", "skipped_no_matching_paths"]>;
    }>>;
    readonly gate: Schema.Literal<"passed">;
}>;
export declare const CheckReceipt: Schema.Struct<{
    readonly request_id: Schema.String;
    readonly context: Schema.NonEmptyString;
    readonly commit_id: Schema.String;
    readonly status: Schema.Literal<"success">;
    readonly status_id: Schema.Int;
}>;
declare const RepositoryCheckReceipts_base: Context.ServiceClass<RepositoryCheckReceipts, "repository/CheckReceipts", {
    readonly report: (requestId: string, input: typeof CheckReceiptRequest.Type) => Effect.Effect<typeof CheckReceipt.Type, CodingError>;
}>;
export declare class RepositoryCheckReceipts extends RepositoryCheckReceipts_base {
}
/** An absent pinned policy is authoritative "no policy"; an unreadable one is an error. */
export declare const pinnedPolicy: (work: unknown) => Effect.Effect<CiPolicy, CodingError>;
/** Trusted provisioned gateway binding, never workflow or model input. */
export interface Options {
    readonly apiBaseUrl: string;
    readonly gatewayId: string;
    readonly credential: string;
    readonly repositorySlug: string;
    readonly workspaceId: string;
    /** Plue refuses a truthful receipt while its own dispatch row is still
     * missing the run id; that window closes on its worker's own retry. */
    readonly unverifiedRunRetryMs?: number;
}
/** The gateway credential proves this workspace, never the repository landing token. */
export declare const make: (options: Options) => Effect.Effect<{
    readonly report: (requestId: string, input: typeof CheckReceiptRequest.Type) => Effect.Effect<typeof CheckReceipt.Type, CodingError>;
}, CodingError, HttpClient.HttpClient>;
export declare const layer: (options: Options) => Layer.Layer<RepositoryCheckReceipts, CodingError, HttpClient.HttpClient>;
export interface VerifiedCheckStep {
    readonly runId: string;
    readonly executionId: string;
    readonly candidate: string;
    readonly checks: ReadonlyArray<typeof CheckOutcome.Type>;
}
/** Proof comes from the same durable ownership reader the completed-job
 * receipts use, relaxed only where a job waiting to land must be: its own
 * ancestry and control root are still running. The checked step's payload is
 * the exact Work this delivery reconstructs, so no claimed identity is taken
 * from the step output the delivering job happens to be carrying. */
export declare const verifiedCheckStep: (input: {
    readonly executionId: string;
    readonly commitId: string;
    readonly baseCommitId: string;
    readonly work: typeof Work.Type;
    readonly source: unknown;
    readonly ref: CiPolicyRef;
    readonly checks: ReadonlyArray<{
        readonly id: string;
    }>;
}) => Effect.Effect<{
    runId: string;
    executionId: string;
    candidate: string;
    checks: {
        readonly id: string;
        readonly outcome: "passed" | "skipped_no_matching_paths";
    }[];
}, CodingError, never>;
export {};
