/** Held-out inputs execute the production investigation; scoring is a separate action. */
import * as AgentAction from "@smthrs/agent/AgentAction";
import { Action, Flow, FlowRuntime } from "@smthrs/flow";
import type * as Evaluator from "@smthrs/model/Evaluator";
import { Layer, Schema } from "effect";
import { CodingError } from "../coding/schema.ts";
import { EvalCase, Event, type JobInput, JobResult, SetupInput } from "./schema.ts";
/** Machine checks supplement semantic review. Neither enters the worker input. */
export declare const CaseInput: Schema.Struct<{
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
    readonly sourceRevision: Schema.NonEmptyString;
    readonly assertions: Schema.$Array<Schema.Struct<{
        readonly path: Schema.String;
        readonly equals: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    }>>;
}>;
export declare const ScoreVerdict: Schema.Literals<readonly ["pass", "fail", "review"]>;
export declare const Score: Schema.Struct<{
    readonly verdict: Schema.Literals<readonly ["pass", "fail", "review"]>;
    readonly reason: Schema.NonEmptyString;
    readonly evidenceIds: Schema.$Array<Schema.Int>;
}>;
/** What the seat still writes. The verdict is Jev's; the reason is prose and
 * the evidence IDs are integers picked out of a numbered index, which a
 * decision model cannot produce, so those two stay where they were. */
export declare const SeatScore: Schema.Struct<{
    readonly reason: Schema.NonEmptyString;
    readonly evidenceIds: Schema.$Array<Schema.Int>;
}>;
/** Whether a recorded job met a frozen expectation is a judgment over three
 * named answers, which is a decision. Jev answers it and the seat is never
 * asked, so a Jev failure fails the score rather than buying a second opinion. */
export declare const JevScore: Action.Declared<"repository/jev-score", Schema.Struct<{
    test: Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly input: Schema.String;
        readonly expected: Schema.NonEmptyString;
        readonly source: Schema.optionalKey<Schema.String>;
        readonly edited: Schema.optionalKey<Schema.Boolean>;
        readonly required: Schema.Boolean;
    }>;
    observed: Schema.Struct<{
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
}>, Schema.Literals<readonly ["pass", "fail", "review"]>, typeof CodingError, Action.Requirement<"repository/jev-score">>;
export declare const ScoreCase: AgentAction.AgentAction<"repository/score-case", Schema.Struct<{
    test: Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly input: Schema.String;
        readonly expected: Schema.NonEmptyString;
        readonly source: Schema.optionalKey<Schema.String>;
        readonly edited: Schema.optionalKey<Schema.Boolean>;
        readonly required: Schema.Boolean;
    }>;
    observed: Schema.Struct<{
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
    readonly reason: Schema.NonEmptyString;
    readonly evidenceIds: Schema.$Array<Schema.Int>;
}>>;
export declare const RetainScore: Action.Declared<"repository/retain-eval-score", Schema.Struct<{
    test: Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly input: Schema.String;
        readonly expected: Schema.NonEmptyString;
        readonly source: Schema.optionalKey<Schema.String>;
        readonly edited: Schema.optionalKey<Schema.Boolean>;
        readonly required: Schema.Boolean;
    }>;
    observed: Schema.Struct<{
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
    score: Schema.Struct<{
        readonly verdict: Schema.Literals<readonly ["pass", "fail", "review"]>;
        readonly reason: Schema.NonEmptyString;
        readonly evidenceIds: Schema.$Array<Schema.Int>;
    }>;
}>, Schema.Struct<{
    readonly caseId: Schema.String;
    readonly status: Schema.Literals<readonly ["passed", "failed", "review", "error"]>;
    readonly observed: Schema.String;
    readonly evidence: Schema.$Array<Schema.String>;
    readonly executionId: Schema.NonEmptyString;
}>, typeof CodingError, Action.Requirement<"repository/retain-eval-score">>;
export declare const ScoreExecution: Flow.Flow<"repository/ScoreExecution", Schema.Struct<{
    test: Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly input: Schema.String;
        readonly expected: Schema.NonEmptyString;
        readonly source: Schema.optionalKey<Schema.String>;
        readonly edited: Schema.optionalKey<Schema.Boolean>;
        readonly required: Schema.Boolean;
    }>;
    observed: Schema.Struct<{
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
    readonly caseId: Schema.String;
    readonly status: Schema.Literals<readonly ["passed", "failed", "review", "error"]>;
    readonly observed: Schema.String;
    readonly evidence: Schema.$Array<Schema.String>;
    readonly executionId: Schema.NonEmptyString;
}>, Schema.Union<readonly [typeof CodingError, Schema.Union<readonly [typeof import("@smthrs/harness/StructuredOutput").StructuredOutputFailure, typeof import("@smthrs/agent/Seat").SeatUnresolved, typeof import("@smthrs/agent/Seat").SeatUnrouted, typeof import("@smthrs/agent/Budget").BudgetExceeded, typeof import("@smthrs/agent/Budget").Skipped, typeof import("@smthrs/harness/HarnessError").HarnessError, typeof import("@smthrs/plugin").PluginError]>]>, Action.Requirement<"repository/jev-score"> | Action.Requirement<"repository/retain-eval-score"> | Action.Requirement<"repository/score-case">>;
export declare const Evaluate: Action.Declared<"repository/evaluate-candidate", Schema.Struct<{
    setup: Schema.Struct<{
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
}>, Schema.$Array<Schema.Struct<{
    readonly caseId: Schema.String;
    readonly status: Schema.Literals<readonly ["passed", "failed", "review", "error"]>;
    readonly observed: Schema.String;
    readonly evidence: Schema.$Array<Schema.String>;
    readonly executionId: Schema.NonEmptyString;
}>>, typeof CodingError, Action.Requirement<"repository/evaluate-candidate">>;
/** An evaluated job carries the reviewed configuration without its held-out cases, so its
 * digest covers exactly the configuration it receives while the candidate identity is unchanged. */
export declare const evaluatedCandidate: (setup: SetupInput) => Pick<JobInput, "repo" | "job" | "revision" | "digest" | "configuration">;
/** The commit an event calls the work under review. `captureChecks` accepts no
 * other source for such an event, so an evaluation of it captures this commit
 * rather than substituting whatever source the current workspace holds. */
export declare const eventCandidate: (event: typeof Event.Type) => string | undefined;
/** An inspection writes the commit it captured twice: as the case's pin and as
 * the candidate of the event it authored. Re-pinning only the first moves nothing
 * that decides the run, so both move together. A candidate the remote published
 * is the event's own fact, and no inspection rewrites it. */
export declare const repinnedEvent: (event: typeof Event.Type, from: string, to: string) => typeof Event.Type;
export declare const assessScore: (test: typeof EvalCase.Type, observed: JobResult, score: typeof Score.Type) => {
    status: "error" | "failed" | "passed" | "review";
    observed: string;
    evidence: string[];
};
/** Every composition must supply its judge. Omitting it is a type error;
 * an offline fixture supplies an evidence-based script, never a gateway key. */
export declare const evaluationLayers: (options: {
    readonly evaluator: Layer.Layer<Evaluator.Evaluator>;
}) => Layer.Layer<Action.Requirement<"repository/evaluate-candidate"> | Action.Requirement<"repository/jev-score"> | Action.Requirement<"repository/retain-eval-score">, never, FlowRuntime.FlowRuntime | Action.Implementations>;
