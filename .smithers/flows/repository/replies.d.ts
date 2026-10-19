import { Action, Flow, FlowRuntime, HumanTask } from "@smthrs/flow";
import { Layer, Schema } from "effect";
import { CodingError } from "../coding/schema.ts";
import { JobInput, JobResult } from "./schema.ts";
/** One consolidated evidence-grounded draft per job run; this posts nothing. */
export declare const consolidatedReply: (input: JobInput, result: JobResult) => JobResult;
/** The maintainer confirms the drafted text itself; no source text can answer it.
 * The question is bounded by what is LEFT of the job's own deadline, so a second
 * round cannot hold a sandbox past the budget the maintainer configured, and a
 * deadline already spent settles as a timeout without asking anyone. */
export declare const ConfirmReply: Flow.Flow<"repository/ConfirmReply", Schema.Struct<{
    reply: Schema.Struct<{
        readonly body: Schema.String;
        readonly issueNumber: Schema.Int;
        readonly state: Schema.Literals<readonly ["drafted", "posted", "declined", "undeliverable"]>;
        readonly reason: Schema.optionalKey<Schema.String>;
    }>;
    deadlineAt: Schema.Number;
}>, Schema.Boolean, typeof HumanTask.HumanTaskFailed, Action.Requirement<"repository/reply-budget">>;
export declare const PublishReply: Flow.Flow<"repository/PublishReply", Schema.Struct<{
    input: Schema.Struct<{
        readonly repo: Schema.NonEmptyString;
        readonly job: Schema.Literals<readonly ["issues", "review", "ci", "feature", "chores"]>;
        readonly revision: Schema.Int;
        readonly digest: Schema.String;
        readonly sourceRevision: Schema.NonEmptyString;
        readonly configuration: Schema.Struct<{
            readonly steps: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly name: Schema.String;
                readonly mode: Schema.Literals<readonly ["automatic", "manual", "off", "approved"]>;
                readonly prompt: Schema.String;
            }>>;
            readonly checks: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly name: Schema.String;
                readonly kind: Schema.Literals<readonly ["command", "ai"]>;
                readonly rule: Schema.String;
                readonly paths: Schema.$Array<Schema.String>;
                readonly policy: Schema.Literals<readonly ["report", "required"]>;
            }>>;
            readonly cases: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly name: Schema.String;
                readonly input: Schema.String;
                readonly expected: Schema.NonEmptyString;
                readonly source: Schema.optionalKey<Schema.String>;
                readonly edited: Schema.optionalKey<Schema.Boolean>;
                readonly required: Schema.Boolean;
            }>>;
            readonly replies: Schema.Literals<readonly ["draft", "automatic"]>;
            readonly landing: Schema.Literals<readonly ["ask", "checks"]>;
            readonly scope: Schema.Literals<readonly ["future", "label"]>;
            readonly label: Schema.String;
            readonly schedule: Schema.String;
            readonly choreEvent: Schema.withDecodingDefaultKey<Schema.Literals<readonly ["none", "push", "labeled"]>, never>;
            readonly budgetMinutes: Schema.Int;
            readonly connectIssues: Schema.Boolean;
            readonly trialTitle: Schema.String;
            readonly trialBody: Schema.String;
        }>;
        readonly event: Schema.Struct<{
            readonly source: Schema.Literals<readonly ["github", "smithers-cloud", "schedule"]>;
            readonly type: Schema.NonEmptyString;
            readonly action: Schema.String;
            readonly deliveryKey: Schema.NonEmptyString;
            readonly issueNumber: Schema.optionalKey<Schema.Int>;
            readonly trial: Schema.optionalKey<Schema.Boolean>;
            readonly manualStep: Schema.optionalKey<Schema.String>;
            readonly payload: Schema.Codec<Schema.Json, Schema.Json, never, never>;
            readonly approvedText: Schema.optionalKey<Schema.Struct<{
                readonly title: Schema.String;
                readonly body: Schema.String;
                readonly revision: Schema.String;
            }>>;
        }>;
    }>;
    result: Schema.Struct<{
        readonly repo: Schema.String;
        readonly job: Schema.Literals<readonly ["issues", "review", "ci", "feature", "chores"]>;
        readonly revision: Schema.Int;
        readonly digest: Schema.String;
        readonly sourceRevision: Schema.String;
        readonly eventKey: Schema.String;
        readonly status: Schema.Literals<readonly ["completed", "partial", "needs-author", "needs-maintainer", "skipped", "error"]>;
        readonly results: Schema.$Array<Schema.Struct<{
            readonly stepId: Schema.String;
            readonly status: Schema.Literals<readonly ["completed", "needs-author", "needs-maintainer", "skipped", "error"]>;
            readonly summary: Schema.String;
            readonly evidence: Schema.$Array<Schema.String>;
            readonly output: Schema.Codec<Schema.Json, Schema.Json, never, never>;
            readonly executionId: Schema.NonEmptyString;
        }>>;
        readonly publicActions: Schema.$Array<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        readonly reply: Schema.optionalKey<Schema.Struct<{
            readonly body: Schema.String;
            readonly issueNumber: Schema.Int;
            readonly state: Schema.Literals<readonly ["drafted", "posted", "declined", "undeliverable"]>;
            readonly reason: Schema.optionalKey<Schema.String>;
        }>>;
    }>;
    deadlineAt: Schema.Number;
}>, Schema.Struct<{
    readonly repo: Schema.String;
    readonly job: Schema.Literals<readonly ["issues", "review", "ci", "feature", "chores"]>;
    readonly revision: Schema.Int;
    readonly digest: Schema.String;
    readonly sourceRevision: Schema.String;
    readonly eventKey: Schema.String;
    readonly status: Schema.Literals<readonly ["completed", "partial", "needs-author", "needs-maintainer", "skipped", "error"]>;
    readonly results: Schema.$Array<Schema.Struct<{
        readonly stepId: Schema.String;
        readonly status: Schema.Literals<readonly ["completed", "needs-author", "needs-maintainer", "skipped", "error"]>;
        readonly summary: Schema.String;
        readonly evidence: Schema.$Array<Schema.String>;
        readonly output: Schema.Codec<Schema.Json, Schema.Json, never, never>;
        readonly executionId: Schema.NonEmptyString;
    }>>;
    readonly publicActions: Schema.$Array<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
    readonly reply: Schema.optionalKey<Schema.Struct<{
        readonly body: Schema.String;
        readonly issueNumber: Schema.Int;
        readonly state: Schema.Literals<readonly ["drafted", "posted", "declined", "undeliverable"]>;
        readonly reason: Schema.optionalKey<Schema.String>;
    }>>;
}>, typeof CodingError, Action.Requirement<"repository/publish-reply">>;
export declare const replyLayers: Layer.Layer<Action.Requirement<"repository/publish-reply"> | Action.Requirement<"repository/reply-budget">, never, FlowRuntime.FlowRuntime | Action.Implementations>;
