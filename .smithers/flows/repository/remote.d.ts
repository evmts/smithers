/** Reserved repository/gateway credentials stay inside this host-owned service. */
import { Context, Effect, Layer, Schema } from "effect";
import { HttpClient } from "effect/http";
import type { Options as RepositoryBinding } from "../coding/landing.ts";
import { CodingError } from "../coding/schema.ts";
import type { Event, Job, Record, SourceStatus } from "./schema.ts";
export interface RemoteOptions extends RepositoryBinding {
    readonly gatewayId: string;
    readonly credential: string;
}
/** The five reviewed responsibilities, or one repository's own `flow:<slug>`
 * schedule. The prefix keeps the two namespaces disjoint. */
export type JobKey = typeof Job.Type | `flow:${string}`;
/** The host constructs this only from an admitted push or a resolved PR. */
export declare const RetainSourceRequest: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"pull_request">;
    readonly number: Schema.Int;
    readonly head: Schema.String;
    readonly base: Schema.String;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"push">;
    readonly head: Schema.String;
    readonly base: Schema.String;
    readonly ref: Schema.String;
    readonly delivery_key: Schema.NonEmptyString;
}>]>;
export declare const RetainedSource: Schema.Struct<{
    readonly status: Schema.Literal<"retained">;
    readonly source: Schema.Literal<"github">;
    readonly full_name: Schema.NonEmptyString;
    readonly workspace_id: Schema.NonEmptyString;
    readonly head: Schema.String;
    readonly base: Schema.String;
    readonly head_ref: Schema.NonEmptyString;
    readonly base_ref: Schema.optionalKey<Schema.NonEmptyString>;
    readonly clone_url: Schema.NonEmptyString;
}>;
export declare const RetainedMain: Schema.Struct<{
    readonly status: Schema.Literal<"retained">;
    readonly full_name: Schema.NonEmptyString;
    readonly workspace_id: Schema.NonEmptyString;
    readonly head: Schema.String;
    readonly base: Schema.String;
    readonly head_ref: Schema.NonEmptyString;
    readonly base_ref: Schema.optionalKey<Schema.NonEmptyString>;
    readonly clone_url: Schema.NonEmptyString;
    readonly source: Schema.Literal<"smithers-cloud">;
}>;
declare const RepositoryRemote_base: Context.ServiceClass<RepositoryRemote, "repository/Remote", {
    readonly repo: string;
    readonly workspaceId: string;
    readonly source?: Effect.Effect<"github" | "smithers-cloud", CodingError>;
    readonly registrations: Effect.Effect<Schema.Json, CodingError>;
    readonly history: Effect.Effect<{
        records: ReadonlyArray<typeof Record.Type>;
        sources: ReadonlyArray<typeof SourceStatus.Type>;
    }, CodingError>;
    readonly register: (job: JobKey, input: Schema.Json) => Effect.Effect<Schema.Json, CodingError>;
    readonly pause: (job: JobKey) => Effect.Effect<Schema.Json, CodingError>;
    readonly dispatches: (job: JobKey) => Effect.Effect<Schema.Json, CodingError>;
    readonly createTrial: (job: typeof Job.Type, requestId: string, input: Schema.Json) => Effect.Effect<Schema.Json, CodingError>;
    readonly manual?: (job: JobKey, requestId: string, input: Schema.Json) => Effect.Effect<Schema.Json, CodingError>;
    readonly resolveReview?: (event: typeof Event.Type) => Effect.Effect<{
        payload: Schema.Json;
        sourceRevision: string;
    }, CodingError>;
    readonly retainMain?: (commitId: string) => Effect.Effect<typeof RetainedMain.Type, CodingError>;
    readonly retainSource?: (input: typeof RetainSourceRequest.Type) => Effect.Effect<typeof RetainedSource.Type, CodingError>;
    readonly comment?: (job: typeof Job.Type, step: string, input: Schema.Json) => Effect.Effect<Schema.Json, CodingError>;
    /**
     * One read-only GitHub REST GET for this repository's imported source, through the repository's
     * GitHub proxy addressed by the source's own coordinates. `path` is relative to `/repos/{owner}/{repo}`.
     */
    readonly github?: (path: string) => Effect.Effect<Schema.Json, CodingError>;
    /** The GitHub `owner/repo` this repository was imported from. */
    readonly githubSource?: Effect.Effect<string, CodingError>;
}>;
export declare class RepositoryRemote extends RepositoryRemote_base {
}
/** The read-only repository paths registration asks GitHub for; nothing encoded, nothing else. */
export declare const githubReadable: (path: string) => boolean;
export declare const makeRemote: (options: RemoteOptions) => Effect.Effect<{
    readonly repo: string;
    readonly workspaceId: string;
    readonly source?: Effect.Effect<"github" | "smithers-cloud", CodingError>;
    readonly registrations: Effect.Effect<Schema.Json, CodingError>;
    readonly history: Effect.Effect<{
        records: ReadonlyArray<typeof Record.Type>;
        sources: ReadonlyArray<typeof SourceStatus.Type>;
    }, CodingError>;
    readonly register: (job: JobKey, input: Schema.Json) => Effect.Effect<Schema.Json, CodingError>;
    readonly pause: (job: JobKey) => Effect.Effect<Schema.Json, CodingError>;
    readonly dispatches: (job: JobKey) => Effect.Effect<Schema.Json, CodingError>;
    readonly createTrial: (job: typeof Job.Type, requestId: string, input: Schema.Json) => Effect.Effect<Schema.Json, CodingError>;
    readonly manual?: (job: JobKey, requestId: string, input: Schema.Json) => Effect.Effect<Schema.Json, CodingError>;
    readonly resolveReview?: (event: typeof Event.Type) => Effect.Effect<{
        payload: Schema.Json;
        sourceRevision: string;
    }, CodingError>;
    readonly retainMain?: (commitId: string) => Effect.Effect<typeof RetainedMain.Type, CodingError>;
    readonly retainSource?: (input: typeof RetainSourceRequest.Type) => Effect.Effect<typeof RetainedSource.Type, CodingError>;
    readonly comment?: (job: typeof Job.Type, step: string, input: Schema.Json) => Effect.Effect<Schema.Json, CodingError>;
    /**
     * One read-only GitHub REST GET for this repository's imported source, through the repository's
     * GitHub proxy addressed by the source's own coordinates. `path` is relative to `/repos/{owner}/{repo}`.
     */
    readonly github?: (path: string) => Effect.Effect<Schema.Json, CodingError>;
    /** The GitHub `owner/repo` this repository was imported from. */
    readonly githubSource?: Effect.Effect<string, CodingError>;
}, CodingError, HttpClient.HttpClient>;
export declare const remoteLayer: (options: RemoteOptions) => Layer.Layer<RepositoryRemote, CodingError, HttpClient.HttpClient>;
export {};
