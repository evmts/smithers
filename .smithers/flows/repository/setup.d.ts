/** Setup operations are durable children of the existing approved Control run. */
import * as AgentAction from "@smthrs/agent/AgentAction";
import * as RunCatalogRead from "@smthrs/engine-store/RunCatalogRead";
import { Action, Flow, FlowRuntime } from "@smthrs/flow";
import { Layer, Path, Schema } from "effect";
import * as Jj from "../../../packages/smithers/flows/jj/src/Jj.ts";
import { NativeCoding } from "../coding/native.ts";
import { CodingError } from "../coding/schema.ts";
import { type InspectionOptions } from "./inspection.ts";
import { Draft, EvalCase, SetupInput } from "./schema.ts";
export declare const SuggestedCaseInput: Schema.Struct<{
    readonly sourceRevision: Schema.NonEmptyString;
    readonly assertions: Schema.$Array<Schema.Struct<{
        readonly path: Schema.String;
        readonly equals: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    }>>;
    readonly event: Schema.Struct<{
        readonly source: Schema.Literals<readonly ["github", "smithers-cloud", "schedule"]>;
        readonly type: Schema.NonEmptyString;
        readonly action: Schema.String;
        readonly deliveryKey: Schema.NonEmptyString;
        readonly issueNumber: Schema.optionalKey<Schema.Int>;
        readonly trial: Schema.optionalKey<Schema.Boolean>;
        readonly manualStep: Schema.optionalKey<Schema.String>;
        readonly approvedText: Schema.optionalKey<Schema.Struct<{
            readonly title: Schema.String;
            readonly body: Schema.String;
            readonly revision: Schema.String;
        }>>;
        readonly payload: Schema.Union<readonly [Schema.Struct<{
            readonly issue: Schema.Struct<{
                readonly title: Schema.NonEmptyString;
                readonly body: Schema.String;
            }>;
        }>, Schema.Struct<{
            readonly pull_request: Schema.Struct<{
                readonly title: Schema.NonEmptyString;
                readonly body: Schema.String;
                readonly base: Schema.Struct<{
                    readonly sha: Schema.NonEmptyString;
                }>;
                readonly head: Schema.Struct<{
                    readonly sha: Schema.NonEmptyString;
                }>;
            }>;
        }>, Schema.Struct<{
            readonly prompt: Schema.NonEmptyString;
        }>]>;
    }>;
}>;
declare const SuggestedStep: Schema.Struct<{
    readonly id: Schema.String;
    readonly mode: Schema.optionalKey<Schema.Literals<readonly ["automatic", "manual", "off", "approved"]>>;
    readonly prompt: Schema.optionalKey<Schema.String>;
}>;
declare const SuggestedDraft: Schema.Struct<{
    readonly checks: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly kind: Schema.Literals<readonly ["command", "ai"]>;
        readonly rule: Schema.String;
        readonly paths: Schema.$Array<Schema.String>;
        readonly policy: Schema.Literals<readonly ["report", "required"]>;
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
    readonly steps: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly mode: Schema.optionalKey<Schema.Literals<readonly ["automatic", "manual", "off", "approved"]>>;
        readonly prompt: Schema.optionalKey<Schema.String>;
    }>>>;
    readonly cases: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly expected: Schema.NonEmptyString;
        readonly source: Schema.optionalKey<Schema.String>;
        readonly edited: Schema.optionalKey<Schema.Boolean>;
        readonly required: Schema.Boolean;
        readonly input: Schema.Struct<{
            readonly sourceRevision: Schema.NonEmptyString;
            readonly assertions: Schema.$Array<Schema.Struct<{
                readonly path: Schema.String;
                readonly equals: Schema.Codec<Schema.Json, Schema.Json, never, never>;
            }>>;
            readonly event: Schema.Struct<{
                readonly source: Schema.Literals<readonly ["github", "smithers-cloud", "schedule"]>;
                readonly type: Schema.NonEmptyString;
                readonly action: Schema.String;
                readonly deliveryKey: Schema.NonEmptyString;
                readonly issueNumber: Schema.optionalKey<Schema.Int>;
                readonly trial: Schema.optionalKey<Schema.Boolean>;
                readonly manualStep: Schema.optionalKey<Schema.String>;
                readonly approvedText: Schema.optionalKey<Schema.Struct<{
                    readonly title: Schema.String;
                    readonly body: Schema.String;
                    readonly revision: Schema.String;
                }>>;
                readonly payload: Schema.Union<readonly [Schema.Struct<{
                    readonly issue: Schema.Struct<{
                        readonly title: Schema.NonEmptyString;
                        readonly body: Schema.String;
                    }>;
                }>, Schema.Struct<{
                    readonly pull_request: Schema.Struct<{
                        readonly title: Schema.NonEmptyString;
                        readonly body: Schema.String;
                        readonly base: Schema.Struct<{
                            readonly sha: Schema.NonEmptyString;
                        }>;
                        readonly head: Schema.Struct<{
                            readonly sha: Schema.NonEmptyString;
                        }>;
                    }>;
                }>, Schema.Struct<{
                    readonly prompt: Schema.NonEmptyString;
                }>]>;
            }>;
        }>;
    }>>;
}>;
/** An override may only adjust a step the current draft already defines. */
export declare const suggestedSteps: (existing: Draft["steps"], overrides?: ReadonlyArray<typeof SuggestedStep.Type>) => Draft["steps"];
/** A model suggestion cannot promote its own rule into a required policy. */
export declare const suggestedChecks: (existing: Draft["checks"], suggested: Draft["checks"]) => Draft["checks"];
/** The host keeps every user decision; a suggestion only proposes steps, checks, cases and trial text.
 * The held-out source is the commit this inspection actually captured, never a revision the model named. */
export declare const suggestedSetupDraft: (existing: Draft, suggested: typeof SuggestedDraft.Type, sourceRevision: string, job?: SetupInput["job"]) => Draft;
export declare const SuggestSetup: AgentAction.AgentAction<"repository/suggest-setup", Schema.Struct<{
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
    evidence: Schema.Struct<{
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
    deadlineAt: Schema.Number;
}>, Schema.Struct<{
    readonly checks: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly kind: Schema.Literals<readonly ["command", "ai"]>;
        readonly rule: Schema.String;
        readonly paths: Schema.$Array<Schema.String>;
        readonly policy: Schema.Literals<readonly ["report", "required"]>;
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
    readonly steps: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly mode: Schema.optionalKey<Schema.Literals<readonly ["automatic", "manual", "off", "approved"]>>;
        readonly prompt: Schema.optionalKey<Schema.String>;
    }>>>;
    readonly cases: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly expected: Schema.NonEmptyString;
        readonly source: Schema.optionalKey<Schema.String>;
        readonly edited: Schema.optionalKey<Schema.Boolean>;
        readonly required: Schema.Boolean;
        readonly input: Schema.Struct<{
            readonly sourceRevision: Schema.NonEmptyString;
            readonly assertions: Schema.$Array<Schema.Struct<{
                readonly path: Schema.String;
                readonly equals: Schema.Codec<Schema.Json, Schema.Json, never, never>;
            }>>;
            readonly event: Schema.Struct<{
                readonly source: Schema.Literals<readonly ["github", "smithers-cloud", "schedule"]>;
                readonly type: Schema.NonEmptyString;
                readonly action: Schema.String;
                readonly deliveryKey: Schema.NonEmptyString;
                readonly issueNumber: Schema.optionalKey<Schema.Int>;
                readonly trial: Schema.optionalKey<Schema.Boolean>;
                readonly manualStep: Schema.optionalKey<Schema.String>;
                readonly approvedText: Schema.optionalKey<Schema.Struct<{
                    readonly title: Schema.String;
                    readonly body: Schema.String;
                    readonly revision: Schema.String;
                }>>;
                readonly payload: Schema.Union<readonly [Schema.Struct<{
                    readonly issue: Schema.Struct<{
                        readonly title: Schema.NonEmptyString;
                        readonly body: Schema.String;
                    }>;
                }>, Schema.Struct<{
                    readonly pull_request: Schema.Struct<{
                        readonly title: Schema.NonEmptyString;
                        readonly body: Schema.String;
                        readonly base: Schema.Struct<{
                            readonly sha: Schema.NonEmptyString;
                        }>;
                        readonly head: Schema.Struct<{
                            readonly sha: Schema.NonEmptyString;
                        }>;
                    }>;
                }>, Schema.Struct<{
                    readonly prompt: Schema.NonEmptyString;
                }>]>;
            }>;
        }>;
    }>>;
}>>;
export declare const ExecuteSetup: Action.Declared<"repository/execute-setup", Schema.Struct<{
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
    readonly requestId: Schema.String;
    readonly revision: Schema.Int;
    readonly digest: Schema.String;
    readonly receipt: Schema.optionalKey<Schema.Struct<{
        readonly requestId: Schema.String;
        readonly runId: Schema.String;
        readonly revision: Schema.Int;
        readonly operation: Schema.Literals<readonly ["inspect", "evaluate", "trial", "apply", "pause", "run"]>;
        readonly phase: Schema.Literals<readonly ["queued", "running", "waiting", "completed", "failed", "stopped"]>;
        readonly digest: Schema.String;
        readonly updatedAt: Schema.Number;
        readonly results: Schema.$Array<Schema.Struct<{
            readonly caseId: Schema.String;
            readonly status: Schema.Literals<readonly ["passed", "failed", "review", "error"]>;
            readonly observed: Schema.String;
            readonly evidence: Schema.$Array<Schema.String>;
            readonly executionId: Schema.NonEmptyString;
        }>>;
        readonly evidence: Schema.$Array<Schema.String>;
        readonly error: Schema.optionalKey<Schema.String>;
        readonly trialIssue: Schema.optionalKey<Schema.Struct<{
            readonly source: Schema.Literals<readonly ["github", "smithers-cloud"]>;
            readonly number: Schema.Int;
            readonly url: Schema.optionalKey<Schema.String>;
        }>>;
        readonly registrationId: Schema.optionalKey<Schema.String>;
        readonly sourceRevision: Schema.optionalKey<Schema.String>;
        readonly jobRunId: Schema.optionalKey<Schema.String>;
    }>>;
    readonly inspection: Schema.optionalKey<Schema.Struct<{
        readonly sources: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly status: Schema.Literals<readonly ["read", "missing", "failed"]>;
            readonly summary: Schema.String;
            readonly revision: Schema.optionalKey<Schema.String>;
        }>>;
        readonly suggestedDraft: Schema.Struct<{
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
        readonly inspectedAt: Schema.Number;
    }>>;
}>, typeof CodingError, Action.Requirement<"repository/execute-setup">>;
export declare const Setup: Flow.Flow<"repository/Setup", Schema.Struct<{
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
}>, Schema.Struct<{
    readonly requestId: Schema.String;
    readonly revision: Schema.Int;
    readonly digest: Schema.String;
    readonly receipt: Schema.optionalKey<Schema.Struct<{
        readonly requestId: Schema.String;
        readonly runId: Schema.String;
        readonly revision: Schema.Int;
        readonly operation: Schema.Literals<readonly ["inspect", "evaluate", "trial", "apply", "pause", "run"]>;
        readonly phase: Schema.Literals<readonly ["queued", "running", "waiting", "completed", "failed", "stopped"]>;
        readonly digest: Schema.String;
        readonly updatedAt: Schema.Number;
        readonly results: Schema.$Array<Schema.Struct<{
            readonly caseId: Schema.String;
            readonly status: Schema.Literals<readonly ["passed", "failed", "review", "error"]>;
            readonly observed: Schema.String;
            readonly evidence: Schema.$Array<Schema.String>;
            readonly executionId: Schema.NonEmptyString;
        }>>;
        readonly evidence: Schema.$Array<Schema.String>;
        readonly error: Schema.optionalKey<Schema.String>;
        readonly trialIssue: Schema.optionalKey<Schema.Struct<{
            readonly source: Schema.Literals<readonly ["github", "smithers-cloud"]>;
            readonly number: Schema.Int;
            readonly url: Schema.optionalKey<Schema.String>;
        }>>;
        readonly registrationId: Schema.optionalKey<Schema.String>;
        readonly sourceRevision: Schema.optionalKey<Schema.String>;
        readonly jobRunId: Schema.optionalKey<Schema.String>;
    }>>;
    readonly inspection: Schema.optionalKey<Schema.Struct<{
        readonly sources: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly status: Schema.Literals<readonly ["read", "missing", "failed"]>;
            readonly summary: Schema.String;
            readonly revision: Schema.optionalKey<Schema.String>;
        }>>;
        readonly suggestedDraft: Schema.Struct<{
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
        readonly inspectedAt: Schema.Number;
    }>>;
}>, typeof CodingError, Action.Requirement<"repository/execute-setup"> | Action.Requirement<"repository/start-budget">>;
export declare const RunSetup: Flow.Flow<"repository/RunSetup", Schema.Struct<{
    readonly flow: Schema.String;
    readonly input: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly prompt: Schema.String;
    readonly model: Schema.NullOr<Schema.Union<readonly [Schema.String, Schema.NonEmptyArray<Schema.String>]>>;
    readonly placement: Schema.NullOr<Schema.Literals<readonly ["client", "local", "sandbox", "remote"]>>;
    readonly placementOptions: Schema.withDecodingDefault<Schema.NullOr<Schema.Struct<{
        readonly image: Schema.optional<Schema.String>;
        readonly profile: Schema.optional<Schema.String>;
        readonly target: Schema.optional<Schema.String>;
    }>>, never>;
    readonly capabilities: Schema.$Array<Schema.String>;
    readonly flows: Schema.$Array<Schema.String>;
}>, Schema.Struct<{
    readonly requestId: Schema.String;
    readonly revision: Schema.Int;
    readonly digest: Schema.String;
    readonly receipt: Schema.optionalKey<Schema.Struct<{
        readonly requestId: Schema.String;
        readonly runId: Schema.String;
        readonly revision: Schema.Int;
        readonly operation: Schema.Literals<readonly ["inspect", "evaluate", "trial", "apply", "pause", "run"]>;
        readonly phase: Schema.Literals<readonly ["queued", "running", "waiting", "completed", "failed", "stopped"]>;
        readonly digest: Schema.String;
        readonly updatedAt: Schema.Number;
        readonly results: Schema.$Array<Schema.Struct<{
            readonly caseId: Schema.String;
            readonly status: Schema.Literals<readonly ["passed", "failed", "review", "error"]>;
            readonly observed: Schema.String;
            readonly evidence: Schema.$Array<Schema.String>;
            readonly executionId: Schema.NonEmptyString;
        }>>;
        readonly evidence: Schema.$Array<Schema.String>;
        readonly error: Schema.optionalKey<Schema.String>;
        readonly trialIssue: Schema.optionalKey<Schema.Struct<{
            readonly source: Schema.Literals<readonly ["github", "smithers-cloud"]>;
            readonly number: Schema.Int;
            readonly url: Schema.optionalKey<Schema.String>;
        }>>;
        readonly registrationId: Schema.optionalKey<Schema.String>;
        readonly sourceRevision: Schema.optionalKey<Schema.String>;
        readonly jobRunId: Schema.optionalKey<Schema.String>;
    }>>;
    readonly inspection: Schema.optionalKey<Schema.Struct<{
        readonly sources: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly status: Schema.Literals<readonly ["read", "missing", "failed"]>;
            readonly summary: Schema.String;
            readonly revision: Schema.optionalKey<Schema.String>;
        }>>;
        readonly suggestedDraft: Schema.Struct<{
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
        readonly inspectedAt: Schema.Number;
    }>>;
}>, typeof CodingError, Action.Requirement<"repository/refuse-setup">>;
export declare const RunJob: Flow.Flow<"repository/RunJob", Schema.Struct<{
    readonly flow: Schema.String;
    readonly input: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly prompt: Schema.String;
    readonly model: Schema.NullOr<Schema.Union<readonly [Schema.String, Schema.NonEmptyArray<Schema.String>]>>;
    readonly placement: Schema.NullOr<Schema.Literals<readonly ["client", "local", "sandbox", "remote"]>>;
    readonly placementOptions: Schema.withDecodingDefault<Schema.NullOr<Schema.Struct<{
        readonly image: Schema.optional<Schema.String>;
        readonly profile: Schema.optional<Schema.String>;
        readonly target: Schema.optional<Schema.String>;
    }>>, never>;
    readonly capabilities: Schema.$Array<Schema.String>;
    readonly flows: Schema.$Array<Schema.String>;
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
}>, Schema.Union<readonly [typeof CodingError, typeof import("@smthrs/flow/WaitFor").WaitForRequestInvalid]>, Action.Requirement<"repository/refuse-job">>;
/** The repository keeps the executable test definition; the expected answer and the
 * deterministic assertions that decide it stay with the setup authority. An input the
 * case contract cannot read carries no assertions and is kept as the maintainer wrote it. */
export declare const publicCase: (test: typeof EvalCase.Type) => {
    id: string;
    name: string;
    input: string;
    required: boolean;
};
export declare const candidateFiles: (input: SetupInput) => Record<string, string>;
export declare const setupLayers: (options: InspectionOptions) => Layer.Layer<Action.Requirement<"repository/execute-setup"> | Action.Requirement<"repository/refuse-job"> | Action.Requirement<"repository/refuse-setup"> | RunCatalogRead.RunCatalogRead, never, import("@smthrs/control/ControlRuntime").ControlRuntime | import("@smthrs/engine-store/DurableEngineState").DurableEngineState | FlowRuntime.FlowRuntime | Action.Implementations | Jj.Jj | NativeCoding | Path.Path | import("@smthrs/run-store/RunStore").RunStore | import("effect/sql/SqlClient").SqlClient>;
export {};
