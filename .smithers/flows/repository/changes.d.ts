/** Bounded proposals, real checks, and native versioned changes share the job graph. */
import * as AgentAction from "@smthrs/agent/AgentAction";
import { Action, Flow, FlowRuntime, HumanTask } from "@smthrs/flow";
import { Effect, Layer, Schema } from "effect";
import * as Jj from "../../../packages/smithers/flows/jj/src/Jj.ts";
import { type ImmutableSourceOptions } from "../coding/immutable-source.ts";
import { NativeCoding, NativeCodingError } from "../coding/native.ts";
import { CodingError } from "../coding/schema.ts";
import { finalCheckWork, Work } from "./jobs.ts";
import { type Check } from "./schema.ts";
export declare const ChangeDraft: Schema.Struct<{
    readonly summary: Schema.String;
    readonly question: Schema.String;
    readonly baseline: Schema.$Array<Schema.Struct<{
        readonly path: Schema.String;
        readonly beforeDigest: Schema.NullOr<Schema.String>;
        readonly content: Schema.NullOr<Schema.String>;
    }>>;
    readonly proposal: Schema.$Array<Schema.Struct<{
        readonly path: Schema.String;
        readonly beforeDigest: Schema.NullOr<Schema.String>;
        readonly content: Schema.NullOr<Schema.String>;
    }>>;
    readonly children: Schema.$Array<Schema.Struct<{
        readonly title: Schema.NonEmptyString;
        readonly body: Schema.String;
        readonly dependencies: Schema.$Array<Schema.Int>;
    }>>;
}>;
export declare const DraftChange: AgentAction.AgentAction<"repository/draft-change", Schema.Struct<{
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
}>, Schema.Struct<{
    readonly summary: Schema.String;
    readonly question: Schema.String;
    readonly baseline: Schema.$Array<Schema.Struct<{
        readonly path: Schema.String;
        readonly beforeDigest: Schema.NullOr<Schema.String>;
        readonly content: Schema.NullOr<Schema.String>;
    }>>;
    readonly proposal: Schema.$Array<Schema.Struct<{
        readonly path: Schema.String;
        readonly beforeDigest: Schema.NullOr<Schema.String>;
        readonly content: Schema.NullOr<Schema.String>;
    }>>;
    readonly children: Schema.$Array<Schema.Struct<{
        readonly title: Schema.NonEmptyString;
        readonly body: Schema.String;
        readonly dependencies: Schema.$Array<Schema.Int>;
    }>>;
}>>;
/** The proposal's own correctness review. A repository-wide inherited CI rule
 * is not evidence that THIS proposal was reviewed, so only a local required AI
 * check stands in for the built-in one; an ambiguous mapping keeps it. */
export declare const reviewChecks: (work: typeof Work.Type) => ReadonlyArray<typeof Check.Type>;
/** Main is independent from the editing source which retains configured flows. */
export declare const selectChangeSource: (options: ImmutableSourceOptions, work: typeof Work.Type) => Effect.Effect<{
    work: {
        readonly repo: string;
        readonly job: "chores" | "ci" | "feature" | "issues" | "review";
        readonly event: {
            readonly source: "github" | "schedule" | "smithers-cloud";
            readonly type: string;
            readonly action: string;
            readonly deliveryKey: string;
            readonly issueNumber?: number;
            readonly trial?: boolean;
            readonly manualStep?: string;
            readonly payload: Schema.Json;
            readonly approvedText?: {
                readonly title: string;
                readonly body: string;
                readonly revision: string;
            };
        };
        readonly step: {
            readonly id: string;
            readonly name: string;
            readonly mode: "approved" | "automatic" | "manual" | "off";
            readonly prompt: string;
        };
        readonly evidence: {
            readonly repo: string;
            readonly source: {
                readonly changeId: string;
                readonly commitId: string;
                readonly treeId: string;
                readonly operationId: string;
                readonly parentCommitIds: readonly string[];
            };
            readonly files: readonly {
                readonly path: string;
                readonly digest: string;
                readonly text: string;
                readonly truncated: boolean;
            }[];
            readonly missing: readonly string[];
            readonly history: readonly {
                readonly commitId: string;
                readonly description: string;
            }[];
            readonly records: readonly {
                readonly source: "github" | "smithers-cloud";
                readonly kind: "issue" | "pr";
                readonly number: number;
                readonly title: string;
                readonly body: string;
                readonly state: string;
                readonly url: string;
                readonly revision?: string;
            }[];
            readonly sources: readonly {
                readonly path: string;
                readonly status: "failed" | "missing" | "read";
                readonly summary: string;
                readonly revision?: string;
            }[];
            readonly subject?: Schema.Json;
            readonly intake?: {
                readonly action: string;
                readonly answers: readonly {
                    readonly id: string;
                    readonly kind: "bug" | "feature" | "irrelevant" | "question" | "spam";
                    readonly kindConfidence: number;
                    readonly urgency: "high" | "low" | "medium";
                    readonly urgencyConfidence: number;
                    readonly injection: number;
                    readonly withheld: boolean;
                }[];
                readonly kind?: "bug" | "feature" | "irrelevant" | "question" | "spam";
                readonly urgency?: "high" | "low" | "medium";
                readonly reason?: string;
            };
        };
        readonly deadlineAt: number;
        readonly checks: readonly {
            readonly id: string;
            readonly name: string;
            readonly kind: "ai" | "command";
            readonly rule: string;
            readonly paths: readonly string[];
            readonly policy: "report" | "required";
        }[];
        readonly landing: "ask" | "checks";
        readonly replies: "automatic" | "draft";
        readonly executionMode: "evaluation" | "live" | "trial";
        readonly intake?: {
            readonly kind: "bug" | "feature" | "irrelevant" | "question" | "spam";
            readonly urgency: "high" | "low" | "medium";
        };
        readonly policy?: {
            readonly kind: "none";
        } | {
            readonly kind: "pinned";
            readonly ref: {
                readonly repositoryId: number;
                readonly registrationId: string;
                readonly revision: number;
                readonly digest: string;
                readonly executionDigest: string;
                readonly requiredCheckIds: readonly string[];
            };
            readonly checks: readonly {
                readonly id: string;
                readonly name: string;
                readonly kind: "ai" | "command";
                readonly rule: string;
                readonly paths: readonly string[];
                readonly policy: "report" | "required";
            }[];
        };
        readonly proposal?: readonly {
            readonly path: string;
            readonly beforeDigest: string | null;
            readonly content: string | null;
        }[];
    };
    blocked: string;
} | {
    work: {
        repo: string;
        job: "chores" | "ci" | "feature" | "issues" | "review";
        event: {
            readonly source: "github" | "schedule" | "smithers-cloud";
            readonly type: string;
            readonly action: string;
            readonly deliveryKey: string;
            readonly issueNumber?: number;
            readonly trial?: boolean;
            readonly manualStep?: string;
            readonly payload: Schema.Json;
            readonly approvedText?: {
                readonly title: string;
                readonly body: string;
                readonly revision: string;
            };
        };
        step: {
            readonly id: string;
            readonly name: string;
            readonly mode: "approved" | "automatic" | "manual" | "off";
            readonly prompt: string;
        };
        deadlineAt: number;
        checks: readonly {
            readonly id: string;
            readonly name: string;
            readonly kind: "ai" | "command";
            readonly rule: string;
            readonly paths: readonly string[];
            readonly policy: "report" | "required";
        }[];
        landing: "ask" | "checks";
        replies: "automatic" | "draft";
        executionMode: "evaluation" | "live" | "trial";
        intake?: {
            readonly kind: "bug" | "feature" | "irrelevant" | "question" | "spam";
            readonly urgency: "high" | "low" | "medium";
        };
        policy?: {
            readonly kind: "none";
        } | {
            readonly kind: "pinned";
            readonly ref: {
                readonly repositoryId: number;
                readonly registrationId: string;
                readonly revision: number;
                readonly digest: string;
                readonly executionDigest: string;
                readonly requiredCheckIds: readonly string[];
            };
            readonly checks: readonly {
                readonly id: string;
                readonly name: string;
                readonly kind: "ai" | "command";
                readonly rule: string;
                readonly paths: readonly string[];
                readonly policy: "report" | "required";
            }[];
        };
        proposal?: readonly {
            readonly path: string;
            readonly beforeDigest: string | null;
            readonly content: string | null;
        }[];
        evidence: {
            repo: string;
            source: {
                readonly changeId: string;
                readonly commitId: string;
                readonly treeId: string;
                readonly operationId: string;
                readonly parentCommitIds: readonly string[];
            };
            files: readonly {
                readonly path: string;
                readonly digest: string;
                readonly text: string;
                readonly truncated: boolean;
            }[];
            missing: readonly string[];
            history: {
                commitId: string;
                description: string;
            }[];
            records: readonly {
                readonly source: "github" | "smithers-cloud";
                readonly kind: "issue" | "pr";
                readonly number: number;
                readonly title: string;
                readonly body: string;
                readonly state: string;
                readonly url: string;
                readonly revision?: string;
            }[];
            sources: ({
                readonly path: string;
                readonly status: "failed" | "missing" | "read";
                readonly summary: string;
                readonly revision?: string;
            } | {
                path: string;
                status: "missing";
                summary: string;
            })[];
        };
    };
    blocked: string;
} | {
    work: {
        readonly repo: string;
        readonly job: "chores" | "ci" | "feature" | "issues" | "review";
        readonly event: {
            readonly source: "github" | "schedule" | "smithers-cloud";
            readonly type: string;
            readonly action: string;
            readonly deliveryKey: string;
            readonly issueNumber?: number;
            readonly trial?: boolean;
            readonly manualStep?: string;
            readonly payload: Schema.Json;
            readonly approvedText?: {
                readonly title: string;
                readonly body: string;
                readonly revision: string;
            };
        };
        readonly step: {
            readonly id: string;
            readonly name: string;
            readonly mode: "approved" | "automatic" | "manual" | "off";
            readonly prompt: string;
        };
        readonly evidence: {
            readonly repo: string;
            readonly source: {
                readonly changeId: string;
                readonly commitId: string;
                readonly treeId: string;
                readonly operationId: string;
                readonly parentCommitIds: readonly string[];
            };
            readonly files: readonly {
                readonly path: string;
                readonly digest: string;
                readonly text: string;
                readonly truncated: boolean;
            }[];
            readonly missing: readonly string[];
            readonly history: readonly {
                readonly commitId: string;
                readonly description: string;
            }[];
            readonly records: readonly {
                readonly source: "github" | "smithers-cloud";
                readonly kind: "issue" | "pr";
                readonly number: number;
                readonly title: string;
                readonly body: string;
                readonly state: string;
                readonly url: string;
                readonly revision?: string;
            }[];
            readonly sources: readonly {
                readonly path: string;
                readonly status: "failed" | "missing" | "read";
                readonly summary: string;
                readonly revision?: string;
            }[];
            readonly subject?: Schema.Json;
            readonly intake?: {
                readonly action: string;
                readonly answers: readonly {
                    readonly id: string;
                    readonly kind: "bug" | "feature" | "irrelevant" | "question" | "spam";
                    readonly kindConfidence: number;
                    readonly urgency: "high" | "low" | "medium";
                    readonly urgencyConfidence: number;
                    readonly injection: number;
                    readonly withheld: boolean;
                }[];
                readonly kind?: "bug" | "feature" | "irrelevant" | "question" | "spam";
                readonly urgency?: "high" | "low" | "medium";
                readonly reason?: string;
            };
        };
        readonly deadlineAt: number;
        readonly checks: readonly {
            readonly id: string;
            readonly name: string;
            readonly kind: "ai" | "command";
            readonly rule: string;
            readonly paths: readonly string[];
            readonly policy: "report" | "required";
        }[];
        readonly landing: "ask" | "checks";
        readonly replies: "automatic" | "draft";
        readonly executionMode: "evaluation" | "live" | "trial";
        readonly intake?: {
            readonly kind: "bug" | "feature" | "irrelevant" | "question" | "spam";
            readonly urgency: "high" | "low" | "medium";
        };
        readonly policy?: {
            readonly kind: "none";
        } | {
            readonly kind: "pinned";
            readonly ref: {
                readonly repositoryId: number;
                readonly registrationId: string;
                readonly revision: number;
                readonly digest: string;
                readonly executionDigest: string;
                readonly requiredCheckIds: readonly string[];
            };
            readonly checks: readonly {
                readonly id: string;
                readonly name: string;
                readonly kind: "ai" | "command";
                readonly rule: string;
                readonly paths: readonly string[];
                readonly policy: "report" | "required";
            }[];
        };
        readonly proposal?: readonly {
            readonly path: string;
            readonly beforeDigest: string | null;
            readonly content: string | null;
        }[];
    };
    blocked: string;
}, never, import("effect/process/ChildProcessSpawner").ChildProcessSpawner | Jj.Jj | NativeCoding | import("effect/Path").Path>;
/** Rechecked before offering approval and again immediately before creation. */
export declare const changeAdmission: (work: typeof Work.Type) => Effect.Effect<string, never, NativeCoding>;
export declare const ProposalStep: Flow.Flow<"repository/ProposalStep", Schema.Struct<{
    work: Schema.Struct<{
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
}>, Schema.Struct<{
    readonly stepId: Schema.String;
    readonly status: Schema.Literals<readonly ["completed", "needs-author", "needs-maintainer", "skipped", "error"]>;
    readonly summary: Schema.String;
    readonly evidence: Schema.$Array<Schema.String>;
    readonly output: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly executionId: Schema.NonEmptyString;
}>, Schema.Union<readonly [typeof CodingError, typeof NativeCodingError, Schema.Union<readonly [typeof import("@smthrs/harness/StructuredOutput").StructuredOutputFailure, typeof import("@smthrs/agent/Seat").SeatUnresolved, typeof import("@smthrs/agent/Seat").SeatUnrouted, typeof import("@smthrs/agent/Budget").BudgetExceeded, typeof import("@smthrs/agent/Budget").Skipped, typeof import("@smthrs/harness/HarnessError").HarnessError, typeof import("@smthrs/plugin").PluginError]>, typeof HumanTask.HumanTaskFailed, Schema.Union<readonly [typeof CodingError, Schema.Union<readonly [typeof import("@smthrs/flow/Poll").PollExhausted, typeof import("@smthrs/flow/Sleep").SleepRequestInvalid]>]>]>, Action.Requirement<"repository/draft-change"> | Action.Requirement<"repository/prepare-change"> | Action.Requirement<"repository/retain-proposed-change"> | Action.Requirement<"repository/select-change-source">>;
export declare const changeLayers: (options: ImmutableSourceOptions) => Layer.Layer<Action.Requirement<"repository/create-native-source"> | Action.Requirement<"repository/prepare-change"> | Action.Requirement<"repository/prepare-change-entry"> | Action.Requirement<"repository/retain-proposed-change"> | Action.Requirement<"repository/retain-source-admission-failure"> | Action.Requirement<"repository/select-change-source"> | Action.Requirement<"repository/verify-written-change">, never, import("effect/process/ChildProcessSpawner").ChildProcessSpawner | import("effect/Crypto").Crypto | FlowRuntime.FlowRuntime | Action.Implementations | Jj.Jj | NativeCoding | import("effect/Path").Path>;
/** Re-exported at its contract home: the producer and the receipt verifier
 * share one construction, and check-receipt.ts cannot import this module
 * (changes -> delivery -> check-receipt is a cycle), so it lives in jobs.ts. */
export { finalCheckWork };
export declare const changeModelLayers: Layer.Layer<Action.Requirement<"repository/draft-change">, never, import("@smthrs/agent/Agent").Agent | import("@smthrs/agent/Budget").Budget | import("effect/Crypto").Crypto | import("@smthrs/model/Evaluator").Evaluator | FlowRuntime.FlowRuntime | AgentAction.Host | import("@smthrs/agent/QuotaPolicy").QuotaClassifier | import("@smthrs/harness/Sandbox").Sandbox | import("@smthrs/agent/SeatResolver").SeatResolver | import("@smthrs/harness/Steering").Source>;
export declare const changeModelNames: Set<"repository/draft-change">;
