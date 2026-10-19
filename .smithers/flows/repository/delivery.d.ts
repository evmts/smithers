/** Append exactly the checked native change through the existing landing policy. */
import { Action, Flow, Poll, Sleep } from "@smthrs/flow";
import { Layer, Schema } from "effect";
import { NativeCoding } from "../coding/native.ts";
import { CodingError } from "../coding/schema.ts";
export declare const DeliverChange: Flow.Flow<"repository/DeliverChange", Schema.Struct<{
    readonly work: Schema.Struct<{
        readonly repo: Schema.String;
        readonly job: Schema.Literals<readonly ["issues", "review", "ci", "feature", "chores"]>;
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
        readonly step: Schema.Struct<{
            readonly id: Schema.String;
            readonly name: Schema.String;
            readonly mode: Schema.Literals<readonly ["automatic", "manual", "off", "approved"]>;
            readonly prompt: Schema.String;
        }>;
        readonly evidence: Schema.Struct<{
            readonly repo: Schema.NonEmptyString;
            readonly source: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
            readonly files: Schema.$Array<Schema.Struct<{
                readonly path: Schema.NonEmptyString;
                readonly digest: Schema.String;
                readonly text: Schema.String;
                readonly truncated: Schema.Boolean;
            }>>;
            readonly missing: Schema.$Array<Schema.String>;
            readonly history: Schema.$Array<Schema.Struct<{
                readonly commitId: Schema.String;
                readonly description: Schema.String;
            }>>;
            readonly records: Schema.$Array<Schema.Struct<{
                readonly source: Schema.Literals<readonly ["github", "smithers-cloud"]>;
                readonly kind: Schema.Literals<readonly ["issue", "pr"]>;
                readonly number: Schema.Int;
                readonly title: Schema.String;
                readonly body: Schema.String;
                readonly state: Schema.String;
                readonly url: Schema.String;
                readonly revision: Schema.optionalKey<Schema.String>;
            }>>;
            readonly sources: Schema.$Array<Schema.Struct<{
                readonly path: Schema.String;
                readonly status: Schema.Literals<readonly ["read", "missing", "failed"]>;
                readonly summary: Schema.String;
                readonly revision: Schema.optionalKey<Schema.String>;
            }>>;
            readonly subject: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
            readonly intake: Schema.optionalKey<Schema.Struct<{
                readonly action: Schema.String;
                readonly answers: Schema.$Array<Schema.Struct<{
                    readonly id: Schema.String;
                    readonly kind: Schema.Literals<readonly ["bug", "feature", "question", "spam", "irrelevant"]>;
                    readonly kindConfidence: Schema.Number;
                    readonly urgency: Schema.Literals<readonly ["low", "medium", "high"]>;
                    readonly urgencyConfidence: Schema.Number;
                    readonly injection: Schema.Number;
                    readonly withheld: Schema.Boolean;
                }>>;
                readonly kind: Schema.optionalKey<Schema.Literals<readonly ["bug", "feature", "question", "spam", "irrelevant"]>>;
                readonly urgency: Schema.optionalKey<Schema.Literals<readonly ["low", "medium", "high"]>>;
                readonly reason: Schema.optionalKey<Schema.String>;
            }>>;
        }>;
        readonly deadlineAt: Schema.Number;
        readonly checks: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly name: Schema.String;
            readonly kind: Schema.Literals<readonly ["command", "ai"]>;
            readonly rule: Schema.String;
            readonly paths: Schema.$Array<Schema.String>;
            readonly policy: Schema.Literals<readonly ["report", "required"]>;
        }>>;
        readonly landing: Schema.Literals<readonly ["ask", "checks"]>;
        readonly replies: Schema.Literals<readonly ["draft", "automatic"]>;
        readonly executionMode: Schema.Literals<readonly ["live", "trial", "evaluation"]>;
        readonly intake: Schema.optionalKey<Schema.Struct<{
            readonly kind: Schema.Literals<readonly ["bug", "feature", "question", "spam", "irrelevant"]>;
            readonly urgency: Schema.Literals<readonly ["low", "medium", "high"]>;
        }>>;
        readonly policy: Schema.optionalKey<Schema.Union<readonly [Schema.Struct<{
            readonly kind: Schema.Literal<"none">;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"pinned">;
            readonly ref: Schema.Struct<{
                readonly repositoryId: Schema.Int;
                readonly registrationId: Schema.String;
                readonly revision: Schema.Int;
                readonly digest: Schema.String;
                readonly executionDigest: Schema.String;
                readonly requiredCheckIds: Schema.$Array<Schema.String>;
            }>;
            readonly checks: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly name: Schema.String;
                readonly kind: Schema.Literals<readonly ["command", "ai"]>;
                readonly rule: Schema.String;
                readonly paths: Schema.$Array<Schema.String>;
                readonly policy: Schema.Literals<readonly ["report", "required"]>;
            }>>;
        }>]>>;
        readonly proposal: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly beforeDigest: Schema.NullOr<Schema.String>;
            readonly content: Schema.NullOr<Schema.String>;
        }>>>;
    }>;
    readonly result: Schema.Struct<{
        readonly stepId: Schema.String;
        readonly status: Schema.Literals<readonly ["completed", "needs-author", "needs-maintainer", "skipped", "error"]>;
        readonly summary: Schema.String;
        readonly evidence: Schema.$Array<Schema.String>;
        readonly output: Schema.Codec<Schema.Json, Schema.Json, never, never>;
        readonly executionId: Schema.NonEmptyString;
    }>;
}>, Schema.Struct<{
    readonly stepId: Schema.String;
    readonly status: Schema.Literals<readonly ["completed", "needs-author", "needs-maintainer", "skipped", "error"]>;
    readonly summary: Schema.String;
    readonly evidence: Schema.$Array<Schema.String>;
    readonly output: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly executionId: Schema.NonEmptyString;
}>, Schema.Union<readonly [typeof CodingError, Schema.Union<readonly [typeof Poll.PollExhausted, typeof Sleep.SleepRequestInvalid]>]>, Action.Requirement<"repository/create-landing"> | Action.Requirement<"repository/prepare-landing"> | Action.Requirement<"repository/queue-landing"> | Action.Requirement<"repository/report-check-receipt"> | Action.Requirement<"repository/retain-delivery-failure"> | Action.Requirement<"repository/retain-landing">>;
export declare const deliveryLayers: Layer.Layer<Action.Requirement<"repository/create-landing"> | Action.Requirement<"repository/observe-landing"> | Action.Requirement<"repository/prepare-landing"> | Action.Requirement<"repository/queue-landing"> | Action.Requirement<"repository/report-check-receipt"> | Action.Requirement<"repository/retain-delivery-failure"> | Action.Requirement<"repository/retain-landing">, never, import("effect/Crypto").Crypto | import("@smthrs/flow/FlowRuntime").FlowRuntime | Action.Implementations | NativeCoding>;
