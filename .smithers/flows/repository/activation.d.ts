/** Live trials use the same event dispatcher and prove the resulting native run. */
import { ControlRuntime } from "@smthrs/control/ControlRuntime";
import * as RunCatalogRead from "@smthrs/engine-store/RunCatalogRead";
import { Action, Flow, Poll, Sleep } from "@smthrs/flow";
import { Layer, Schema } from "effect";
import * as Jj from "../../../packages/smithers/flows/jj/src/Jj.ts";
import { NativeCoding } from "../coding/native.ts";
import { CodingError } from "../coding/schema.ts";
import { SetupInput } from "./schema.ts";
/** The registration a pause is asked to stop, read before the registry is written. */
export declare const activeRegistration: (response: unknown, input: SetupInput) => {
    readonly id: string;
    readonly job: string;
    readonly mode: "enabled" | "trial";
    readonly revision: number;
    readonly digest: string;
    readonly source_revision: string;
    readonly enabled: boolean;
} | undefined;
/** The paused row a pause receipt may speak for. The request carries the local
 * draft's revision, which moves on while the active policy stays where it was
 * applied, so that revision identifies nothing in the registry. */
export declare const pausedRegistration: (response: unknown, input: SetupInput) => {
    readonly id: string;
    readonly job: string;
    readonly mode: "enabled" | "trial";
    readonly revision: number;
    readonly digest: string;
    readonly source_revision: string;
    readonly enabled: boolean;
} | undefined;
/** A paused policy whose reviewed draft this candidate still carries. Cloud
 * re-enables a row only at a newer revision, so a restart applies the next
 * revision of the same draft and keeps that row's evaluation and live trial. */
export declare const restartedRegistration: (response: unknown, input: SetupInput) => {
    readonly id: string;
    readonly job: string;
    readonly mode: "enabled" | "trial";
    readonly revision: number;
    readonly digest: string;
    readonly source_revision: string;
    readonly enabled: boolean;
} | undefined;
export declare const TrialIssue: Schema.Struct<{
    readonly source: Schema.Literal<"smithers-cloud">;
    readonly number: Schema.Int;
    readonly issue_id: Schema.Number;
    readonly request_id: Schema.String;
    readonly api_path: Schema.String;
}>;
export declare const Registration: Schema.Struct<{
    readonly registration_id: Schema.String;
    readonly revision: Schema.Int;
    readonly digest: Schema.String;
    readonly source_revision: Schema.String;
    readonly mode: Schema.Literals<readonly ["trial", "enabled"]>;
    readonly enabled: Schema.Boolean;
}>;
export declare const Activated: Schema.Struct<{
    readonly registration: Schema.Struct<{
        readonly registration_id: Schema.String;
        readonly revision: Schema.Int;
        readonly digest: Schema.String;
        readonly source_revision: Schema.String;
        readonly mode: Schema.Literals<readonly ["trial", "enabled"]>;
        readonly enabled: Schema.Boolean;
    }>;
    readonly source: Schema.Struct<{
        readonly changeId: Schema.NonEmptyString;
        readonly commitId: Schema.NonEmptyString;
        readonly treeId: Schema.NonEmptyString;
        readonly operationId: Schema.NonEmptyString;
        readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
    }>;
    readonly trialIssue: Schema.optionalKey<Schema.Struct<{
        readonly source: Schema.Literal<"smithers-cloud">;
        readonly number: Schema.Int;
        readonly issue_id: Schema.Number;
        readonly request_id: Schema.String;
        readonly api_path: Schema.String;
    }>>;
}>;
export declare const Register: Action.Declared<"repository/register-candidate", Schema.Struct<{
    input: Schema.Struct<{
        readonly requestId: Schema.String;
        readonly repo: Schema.String;
        readonly job: Schema.Literals<readonly ["issues", "review", "ci", "feature", "chores"]>;
        readonly operation: Schema.Literals<readonly ["inspect", "evaluate", "trial", "apply", "pause", "run"]>;
        readonly revision: Schema.Int;
        readonly digest: Schema.String;
        readonly draft: Schema.Struct<{
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
        readonly workspaceId: Schema.optionalKey<Schema.String>;
        readonly manual: Schema.optionalKey<Schema.Struct<{
            readonly stepId: Schema.String;
            readonly prompt: Schema.String;
            readonly subject: Schema.optionalKey<Schema.Struct<{
                readonly source: Schema.Literals<readonly ["github", "smithers-cloud"]>;
                readonly kind: Schema.Literals<readonly ["issue", "pr"]>;
                readonly number: Schema.Int;
            }>>;
        }>>;
    }>;
    mode: Schema.Literals<readonly ["trial", "enabled"]>;
    deadlineAt: Schema.Number;
}>, Schema.Struct<{
    readonly registration: Schema.Struct<{
        readonly registration_id: Schema.String;
        readonly revision: Schema.Int;
        readonly digest: Schema.String;
        readonly source_revision: Schema.String;
        readonly mode: Schema.Literals<readonly ["trial", "enabled"]>;
        readonly enabled: Schema.Boolean;
    }>;
    readonly source: Schema.Struct<{
        readonly changeId: Schema.NonEmptyString;
        readonly commitId: Schema.NonEmptyString;
        readonly treeId: Schema.NonEmptyString;
        readonly operationId: Schema.NonEmptyString;
        readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
    }>;
    readonly trialIssue: Schema.optionalKey<Schema.Struct<{
        readonly source: Schema.Literal<"smithers-cloud">;
        readonly number: Schema.Int;
        readonly issue_id: Schema.Number;
        readonly request_id: Schema.String;
        readonly api_path: Schema.String;
    }>>;
}>, typeof CodingError, Action.Requirement<"repository/register-candidate">>;
export declare const RegisterCandidate: Flow.Flow<"repository/RegisterCandidate", Schema.Struct<{
    input: Schema.Struct<{
        readonly requestId: Schema.String;
        readonly repo: Schema.String;
        readonly job: Schema.Literals<readonly ["issues", "review", "ci", "feature", "chores"]>;
        readonly operation: Schema.Literals<readonly ["inspect", "evaluate", "trial", "apply", "pause", "run"]>;
        readonly revision: Schema.Int;
        readonly digest: Schema.String;
        readonly draft: Schema.Struct<{
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
        readonly workspaceId: Schema.optionalKey<Schema.String>;
        readonly manual: Schema.optionalKey<Schema.Struct<{
            readonly stepId: Schema.String;
            readonly prompt: Schema.String;
            readonly subject: Schema.optionalKey<Schema.Struct<{
                readonly source: Schema.Literals<readonly ["github", "smithers-cloud"]>;
                readonly kind: Schema.Literals<readonly ["issue", "pr"]>;
                readonly number: Schema.Int;
            }>>;
        }>>;
    }>;
    mode: Schema.Literals<readonly ["trial", "enabled"]>;
    deadlineAt: Schema.Number;
}>, Schema.Struct<{
    readonly registration: Schema.Struct<{
        readonly registration_id: Schema.String;
        readonly revision: Schema.Int;
        readonly digest: Schema.String;
        readonly source_revision: Schema.String;
        readonly mode: Schema.Literals<readonly ["trial", "enabled"]>;
        readonly enabled: Schema.Boolean;
    }>;
    readonly source: Schema.Struct<{
        readonly changeId: Schema.NonEmptyString;
        readonly commitId: Schema.NonEmptyString;
        readonly treeId: Schema.NonEmptyString;
        readonly operationId: Schema.NonEmptyString;
        readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
    }>;
    readonly trialIssue: Schema.optionalKey<Schema.Struct<{
        readonly source: Schema.Literal<"smithers-cloud">;
        readonly number: Schema.Int;
        readonly issue_id: Schema.Number;
        readonly request_id: Schema.String;
        readonly api_path: Schema.String;
    }>>;
}>, typeof CodingError, Action.Requirement<"repository/register-candidate">>;
export declare const TrialResult: Schema.Struct<{
    readonly status: Schema.Literals<readonly ["completed", "failed", "pending"]>;
    readonly runId: Schema.String;
    readonly executionId: Schema.String;
    readonly evidence: Schema.$Array<Schema.String>;
    readonly result: Schema.optionalKey<Schema.Struct<{
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
    }>>;
    readonly error: Schema.optionalKey<Schema.String>;
}>;
export declare const WaitTrial: Flow.Flow<"repository/WaitTrial", Poll.PayloadSchema<{
    input: Schema.Struct<{
        readonly requestId: Schema.String;
        readonly repo: Schema.String;
        readonly job: Schema.Literals<readonly ["issues", "review", "ci", "feature", "chores"]>;
        readonly operation: Schema.Literals<readonly ["inspect", "evaluate", "trial", "apply", "pause", "run"]>;
        readonly revision: Schema.Int;
        readonly digest: Schema.String;
        readonly draft: Schema.Struct<{
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
        readonly workspaceId: Schema.optionalKey<Schema.String>;
        readonly manual: Schema.optionalKey<Schema.Struct<{
            readonly stepId: Schema.String;
            readonly prompt: Schema.String;
            readonly subject: Schema.optionalKey<Schema.Struct<{
                readonly source: Schema.Literals<readonly ["github", "smithers-cloud"]>;
                readonly kind: Schema.Literals<readonly ["issue", "pr"]>;
                readonly number: Schema.Int;
            }>>;
        }>>;
    }>;
    activation: Schema.Struct<{
        readonly registration: Schema.Struct<{
            readonly registration_id: Schema.String;
            readonly revision: Schema.Int;
            readonly digest: Schema.String;
            readonly source_revision: Schema.String;
            readonly mode: Schema.Literals<readonly ["trial", "enabled"]>;
            readonly enabled: Schema.Boolean;
        }>;
        readonly source: Schema.Struct<{
            readonly changeId: Schema.NonEmptyString;
            readonly commitId: Schema.NonEmptyString;
            readonly treeId: Schema.NonEmptyString;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
        }>;
        readonly trialIssue: Schema.optionalKey<Schema.Struct<{
            readonly source: Schema.Literal<"smithers-cloud">;
            readonly number: Schema.Int;
            readonly issue_id: Schema.Number;
            readonly request_id: Schema.String;
            readonly api_path: Schema.String;
        }>>;
    }>;
    deadlineAt: Schema.Number;
}>, Schema.Struct<{
    readonly status: Schema.Literals<readonly ["completed", "failed", "pending"]>;
    readonly runId: Schema.String;
    readonly executionId: Schema.String;
    readonly evidence: Schema.$Array<Schema.String>;
    readonly result: Schema.optionalKey<Schema.Struct<{
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
    }>>;
    readonly error: Schema.optionalKey<Schema.String>;
}>, Schema.Union<readonly [typeof Poll.PollExhausted, typeof Sleep.SleepRequestInvalid]>, Action.Requirement<"repository/probe-trial">>;
export declare const ManualDispatch: Schema.Struct<{
    readonly dispatch_id: Schema.Union<readonly [Schema.String, Schema.Number]>;
    readonly registration_id: Schema.String;
    readonly revision: Schema.Int;
    readonly digest: Schema.String;
    readonly status: Schema.String;
    readonly run_id: Schema.optionalKey<Schema.String>;
}>;
export declare const DispatchManual: Flow.Flow<"repository/DispatchManual", Schema.Struct<{
    input: Schema.Struct<{
        readonly requestId: Schema.String;
        readonly repo: Schema.String;
        readonly job: Schema.Literals<readonly ["issues", "review", "ci", "feature", "chores"]>;
        readonly operation: Schema.Literals<readonly ["inspect", "evaluate", "trial", "apply", "pause", "run"]>;
        readonly revision: Schema.Int;
        readonly digest: Schema.String;
        readonly draft: Schema.Struct<{
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
        readonly workspaceId: Schema.optionalKey<Schema.String>;
        readonly manual: Schema.optionalKey<Schema.Struct<{
            readonly stepId: Schema.String;
            readonly prompt: Schema.String;
            readonly subject: Schema.optionalKey<Schema.Struct<{
                readonly source: Schema.Literals<readonly ["github", "smithers-cloud"]>;
                readonly kind: Schema.Literals<readonly ["issue", "pr"]>;
                readonly number: Schema.Int;
            }>>;
        }>>;
    }>;
    deadlineAt: Schema.Number;
}>, Schema.Struct<{
    readonly dispatch_id: Schema.Union<readonly [Schema.String, Schema.Number]>;
    readonly registration_id: Schema.String;
    readonly revision: Schema.Int;
    readonly digest: Schema.String;
    readonly status: Schema.String;
    readonly run_id: Schema.optionalKey<Schema.String>;
}>, typeof CodingError, Action.Requirement<"repository/request-manual">>;
export declare const WaitManual: Flow.Flow<"repository/WaitManual", Poll.PayloadSchema<{
    input: Schema.Struct<{
        readonly requestId: Schema.String;
        readonly repo: Schema.String;
        readonly job: Schema.Literals<readonly ["issues", "review", "ci", "feature", "chores"]>;
        readonly operation: Schema.Literals<readonly ["inspect", "evaluate", "trial", "apply", "pause", "run"]>;
        readonly revision: Schema.Int;
        readonly digest: Schema.String;
        readonly draft: Schema.Struct<{
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
        readonly workspaceId: Schema.optionalKey<Schema.String>;
        readonly manual: Schema.optionalKey<Schema.Struct<{
            readonly stepId: Schema.String;
            readonly prompt: Schema.String;
            readonly subject: Schema.optionalKey<Schema.Struct<{
                readonly source: Schema.Literals<readonly ["github", "smithers-cloud"]>;
                readonly kind: Schema.Literals<readonly ["issue", "pr"]>;
                readonly number: Schema.Int;
            }>>;
        }>>;
    }>;
    dispatch: Schema.Struct<{
        readonly dispatch_id: Schema.Union<readonly [Schema.String, Schema.Number]>;
        readonly registration_id: Schema.String;
        readonly revision: Schema.Int;
        readonly digest: Schema.String;
        readonly status: Schema.String;
        readonly run_id: Schema.optionalKey<Schema.String>;
    }>;
    deadlineAt: Schema.Number;
}>, Schema.Struct<{
    readonly status: Schema.Literals<readonly ["completed", "failed", "pending"]>;
    readonly runId: Schema.String;
    readonly executionId: Schema.String;
    readonly evidence: Schema.$Array<Schema.String>;
    readonly result: Schema.optionalKey<Schema.Struct<{
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
    }>>;
    readonly error: Schema.optionalKey<Schema.String>;
}>, Schema.Union<readonly [typeof Poll.PollExhausted, typeof Sleep.SleepRequestInvalid]>, Action.Requirement<"repository/probe-manual">>;
export declare const normalEvents: (input: SetupInput) => {
    type: string;
    actions: string[];
}[];
export declare const activationLayers: Layer.Layer<Action.Requirement<"repository/probe-manual"> | Action.Requirement<"repository/probe-trial"> | Action.Requirement<"repository/register-candidate"> | Action.Requirement<"repository/request-manual"> | RunCatalogRead.RunCatalogRead, never, ControlRuntime | import("effect/Crypto").Crypto | import("@smthrs/engine-store/DurableEngineState").DurableEngineState | import("@smthrs/flow/FlowRuntime").FlowRuntime | Action.Implementations | Jj.Jj | NativeCoding | import("@smthrs/run-store/RunStore").RunStore | import("effect/sql/SqlClient").SqlClient>;
