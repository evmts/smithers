/** One production investigation graph, reused by historical evaluation and events. */
import * as AgentAction from "@smthrs/agent/AgentAction";
import { Action, Flow, FlowRuntime, HumanTask, WaitFor } from "@smthrs/flow";
import { Layer, Schema } from "effect";
import { CodingError } from "../coding/schema.ts";
/** Error instances are not Schema.Json, even when their enumerable fields are.
 * Keep a plain diagnostic without serializing provider internals or losing the
 * original message to a second payload-validation failure. */
export declare const retainedStepError: (error: unknown) => Schema.Json;
export declare const Reproduction: Schema.Struct<{
    readonly files: Schema.$Array<Schema.Struct<{
        readonly path: Schema.NonEmptyString;
        readonly content: Schema.String;
    }>>;
    readonly argv: Schema.NonEmptyArray<Schema.NonEmptyString>;
    readonly cwd: Schema.String;
    readonly expected: Schema.NonEmptyString;
    readonly failureContains: Schema.NonEmptyString;
    readonly timeoutMs: Schema.Int;
}>;
/** What a seat is asked for: the parts of an observation whose answer is
 * genuinely text. Every enumerable answer is decided without a frontier call —
 * the classification by the intake screen, the duplicates by `jev-duplicates`. */
export declare const Finding: Schema.Struct<{
    readonly summary: Schema.String;
    readonly question: Schema.String;
    readonly citations: Schema.$Array<Schema.NonEmptyString>;
    readonly reproduction: Schema.NullOr<Schema.Struct<{
        readonly files: Schema.$Array<Schema.Struct<{
            readonly path: Schema.NonEmptyString;
            readonly content: Schema.String;
        }>>;
        readonly argv: Schema.NonEmptyArray<Schema.NonEmptyString>;
        readonly cwd: Schema.String;
        readonly expected: Schema.NonEmptyString;
        readonly failureContains: Schema.NonEmptyString;
        readonly timeoutMs: Schema.Int;
    }>>;
}>;
/** What kind of request this step investigated. It is the intake screen's own
 * answer, carried onto this vocabulary, never a second opinion. */
export declare const Classification: Schema.Literals<readonly ["bug", "feature", "question", "irrelevant"]>;
export declare const Observation: Schema.Struct<{
    readonly summary: Schema.String;
    readonly question: Schema.String;
    readonly citations: Schema.$Array<Schema.NonEmptyString>;
    readonly reproduction: Schema.NullOr<Schema.Struct<{
        readonly files: Schema.$Array<Schema.Struct<{
            readonly path: Schema.NonEmptyString;
            readonly content: Schema.String;
        }>>;
        readonly argv: Schema.NonEmptyArray<Schema.NonEmptyString>;
        readonly cwd: Schema.String;
        readonly expected: Schema.NonEmptyString;
        readonly failureContains: Schema.NonEmptyString;
        readonly timeoutMs: Schema.Int;
    }>>;
    readonly classification: Schema.Literals<readonly ["bug", "feature", "question", "irrelevant"]>;
    readonly duplicates: Schema.$Array<Schema.Struct<{
        readonly source: Schema.Literals<readonly ["github", "smithers-cloud"]>;
        readonly number: Schema.Int;
        readonly reason: Schema.String;
    }>>;
}>;
/** The candidate's eval cases and expected answers never enter this model input. */
export declare const Work: Schema.Struct<{
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
    /** What the intake screen decided about this event. It is the authority for
     * `Observation.classification`: no seat is asked the same question twice. */
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
/** The one Work a produced change is finally checked under. The producer
 * (changes.ts FinishChange) and the CI receipt verifier both call this, so the
 * payload one writes is the payload the other expects; neither rebuilds it.
 * The revision that caused a job and the revision it produced are different
 * facts: the checks read the produced change's own candidate and base, and a
 * triggering push or PR stays beside them as provenance, never as their
 * authority. An event that carries no commit of its own is passed through. */
export declare const finalCheckWork: (work: typeof Work.Type, produced: {
    readonly head: typeof Work.Type["evidence"]["source"];
    readonly base: string;
}) => typeof Work.Type;
export declare const ApproveStep: Flow.Flow<"repository/ApproveStep", Schema.Struct<{
    name: Schema.String;
    prompt: Schema.String;
    repo: Schema.String;
    sourceRevision: Schema.String;
    issueNumber: Schema.optionalKey<Schema.Int>;
    issueTitle: Schema.optionalKey<Schema.String>;
}>, Schema.Boolean, typeof HumanTask.HumanTaskFailed, never>;
/** The screen's own vocabulary, carried onto the observation's. The screen
 * answers about the raw event and has no `unknown`; an event it never answered
 * about has no classification at all, and `InvestigateStep` refuses that step
 * rather than buying a second opinion from a frontier seat. */
export declare const intakeClassification: (work: typeof Work.Type) => typeof Classification.Type | undefined;
/** The one observation a seat's prose becomes. The classification is the
 * screen's, the duplicates are `jev-duplicates`' alone, and each text field is
 * copied by name so a seat that volunteered an extra one cannot overrule either. */
export declare const observationOf: (classification: typeof Classification.Type, finding: typeof Finding.Type) => typeof Observation.Type;
export declare const Research: AgentAction.AgentAction<"repository/research", Schema.Struct<{
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
    /** What the intake screen decided about this event. It is the authority for
     * `Observation.classification`: no seat is asked the same question twice. */
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
    readonly citations: Schema.$Array<Schema.NonEmptyString>;
    readonly reproduction: Schema.NullOr<Schema.Struct<{
        readonly files: Schema.$Array<Schema.Struct<{
            readonly path: Schema.NonEmptyString;
            readonly content: Schema.String;
        }>>;
        readonly argv: Schema.NonEmptyArray<Schema.NonEmptyString>;
        readonly cwd: Schema.String;
        readonly expected: Schema.NonEmptyString;
        readonly failureContains: Schema.NonEmptyString;
        readonly timeoutMs: Schema.Int;
    }>>;
}>>;
export declare const ProposeRepro: AgentAction.AgentAction<"repository/propose-repro", Schema.Struct<{
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
    /** What the intake screen decided about this event. It is the authority for
     * `Observation.classification`: no seat is asked the same question twice. */
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
    readonly citations: Schema.$Array<Schema.NonEmptyString>;
    readonly reproduction: Schema.NullOr<Schema.Struct<{
        readonly files: Schema.$Array<Schema.Struct<{
            readonly path: Schema.NonEmptyString;
            readonly content: Schema.String;
        }>>;
        readonly argv: Schema.NonEmptyArray<Schema.NonEmptyString>;
        readonly cwd: Schema.String;
        readonly expected: Schema.NonEmptyString;
        readonly failureContains: Schema.NonEmptyString;
        readonly timeoutMs: Schema.Int;
    }>>;
}>>;
export declare const Review: AgentAction.AgentAction<"repository/review", Schema.Struct<{
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
    /** What the intake screen decided about this event. It is the authority for
     * `Observation.classification`: no seat is asked the same question twice. */
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
    readonly citations: Schema.$Array<Schema.NonEmptyString>;
    readonly reproduction: Schema.NullOr<Schema.Struct<{
        readonly files: Schema.$Array<Schema.Struct<{
            readonly path: Schema.NonEmptyString;
            readonly content: Schema.String;
        }>>;
        readonly argv: Schema.NonEmptyArray<Schema.NonEmptyString>;
        readonly cwd: Schema.String;
        readonly expected: Schema.NonEmptyString;
        readonly failureContains: Schema.NonEmptyString;
        readonly timeoutMs: Schema.Int;
    }>>;
}>>;
/** Finding a duplicate is a pairwise judgment over a closed candidate list,
 * which is a decision, not text. Jev answers every pair and the host builds
 * the whole observation from those answers, so no seat reads the repository's
 * issue history and a Jev failure fails the step. */
export declare const JevDuplicates: Action.Declared<"repository/jev-duplicates", Schema.Struct<{
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
        /** What the intake screen decided about this event. It is the authority for
         * `Observation.classification`: no seat is asked the same question twice. */
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
    classification: Schema.Literals<readonly ["bug", "feature", "question", "irrelevant"]>;
}>, Schema.Struct<{
    readonly summary: Schema.String;
    readonly question: Schema.String;
    readonly citations: Schema.$Array<Schema.NonEmptyString>;
    readonly reproduction: Schema.NullOr<Schema.Struct<{
        readonly files: Schema.$Array<Schema.Struct<{
            readonly path: Schema.NonEmptyString;
            readonly content: Schema.String;
        }>>;
        readonly argv: Schema.NonEmptyArray<Schema.NonEmptyString>;
        readonly cwd: Schema.String;
        readonly expected: Schema.NonEmptyString;
        readonly failureContains: Schema.NonEmptyString;
        readonly timeoutMs: Schema.Int;
    }>>;
    readonly classification: Schema.Literals<readonly ["bug", "feature", "question", "irrelevant"]>;
    readonly duplicates: Schema.$Array<Schema.Struct<{
        readonly source: Schema.Literals<readonly ["github", "smithers-cloud"]>;
        readonly number: Schema.Int;
        readonly reason: Schema.String;
    }>>;
}>, typeof CodingError, Action.Requirement<"repository/jev-duplicates">>;
export declare const RetainObservation: Action.Declared<"repository/retain-observation", Schema.Struct<{
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
        /** What the intake screen decided about this event. It is the authority for
         * `Observation.classification`: no seat is asked the same question twice. */
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
    observation: Schema.Struct<{
        readonly summary: Schema.String;
        readonly question: Schema.String;
        readonly citations: Schema.$Array<Schema.NonEmptyString>;
        readonly reproduction: Schema.NullOr<Schema.Struct<{
            readonly files: Schema.$Array<Schema.Struct<{
                readonly path: Schema.NonEmptyString;
                readonly content: Schema.String;
            }>>;
            readonly argv: Schema.NonEmptyArray<Schema.NonEmptyString>;
            readonly cwd: Schema.String;
            readonly expected: Schema.NonEmptyString;
            readonly failureContains: Schema.NonEmptyString;
            readonly timeoutMs: Schema.Int;
        }>>;
        readonly classification: Schema.Literals<readonly ["bug", "feature", "question", "irrelevant"]>;
        readonly duplicates: Schema.$Array<Schema.Struct<{
            readonly source: Schema.Literals<readonly ["github", "smithers-cloud"]>;
            readonly number: Schema.Int;
            readonly reason: Schema.String;
        }>>;
    }>;
}>, Schema.Struct<{
    readonly stepId: Schema.String;
    readonly status: Schema.Literals<readonly ["completed", "needs-author", "needs-maintainer", "skipped", "error"]>;
    readonly summary: Schema.String;
    readonly evidence: Schema.$Array<Schema.String>;
    readonly output: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly executionId: Schema.NonEmptyString;
}>, typeof CodingError, Action.Requirement<"repository/retain-observation">>;
export declare const ExecuteRepro: Action.Declared<"repository/execute-repro", Schema.Struct<{
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
        /** What the intake screen decided about this event. It is the authority for
         * `Observation.classification`: no seat is asked the same question twice. */
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
    observation: Schema.Struct<{
        readonly summary: Schema.String;
        readonly question: Schema.String;
        readonly citations: Schema.$Array<Schema.NonEmptyString>;
        readonly reproduction: Schema.NullOr<Schema.Struct<{
            readonly files: Schema.$Array<Schema.Struct<{
                readonly path: Schema.NonEmptyString;
                readonly content: Schema.String;
            }>>;
            readonly argv: Schema.NonEmptyArray<Schema.NonEmptyString>;
            readonly cwd: Schema.String;
            readonly expected: Schema.NonEmptyString;
            readonly failureContains: Schema.NonEmptyString;
            readonly timeoutMs: Schema.Int;
        }>>;
        readonly classification: Schema.Literals<readonly ["bug", "feature", "question", "irrelevant"]>;
        readonly duplicates: Schema.$Array<Schema.Struct<{
            readonly source: Schema.Literals<readonly ["github", "smithers-cloud"]>;
            readonly number: Schema.Int;
            readonly reason: Schema.String;
        }>>;
    }>;
}>, Schema.Struct<{
    readonly stepId: Schema.String;
    readonly status: Schema.Literals<readonly ["completed", "needs-author", "needs-maintainer", "skipped", "error"]>;
    readonly summary: Schema.String;
    readonly evidence: Schema.$Array<Schema.String>;
    readonly output: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly executionId: Schema.NonEmptyString;
}>, typeof CodingError, Action.Requirement<"repository/execute-repro">>;
export declare const ReproductionReview: Schema.Struct<{
    readonly verdict: Schema.Literals<readonly ["demonstrates", "unrelated", "uncertain"]>;
    readonly summary: Schema.NonEmptyString;
    readonly citations: Schema.$Array<Schema.NonEmptyString>;
}>;
/** Whether an executed fixture demonstrates the report is a judgment over
 * three named answers about a bounded, already-serialized measurement, which
 * is a decision and not prose. Jev answers it and the host writes the review
 * from that answer, so no seat reads the fixture and a Jev failure fails the
 * step. */
export declare const JevReproduction: Action.Declared<"repository/jev-reproduction", Schema.Struct<{
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
        /** What the intake screen decided about this event. It is the authority for
         * `Observation.classification`: no seat is asked the same question twice. */
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
    readonly observation: Schema.Struct<{
        readonly summary: Schema.String;
        readonly question: Schema.String;
        readonly citations: Schema.$Array<Schema.NonEmptyString>;
        readonly reproduction: Schema.NullOr<Schema.Struct<{
            readonly files: Schema.$Array<Schema.Struct<{
                readonly path: Schema.NonEmptyString;
                readonly content: Schema.String;
            }>>;
            readonly argv: Schema.NonEmptyArray<Schema.NonEmptyString>;
            readonly cwd: Schema.String;
            readonly expected: Schema.NonEmptyString;
            readonly failureContains: Schema.NonEmptyString;
            readonly timeoutMs: Schema.Int;
        }>>;
        readonly classification: Schema.Literals<readonly ["bug", "feature", "question", "irrelevant"]>;
        readonly duplicates: Schema.$Array<Schema.Struct<{
            readonly source: Schema.Literals<readonly ["github", "smithers-cloud"]>;
            readonly number: Schema.Int;
            readonly reason: Schema.String;
        }>>;
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
    readonly verdict: Schema.Literals<readonly ["demonstrates", "unrelated", "uncertain"]>;
    readonly summary: Schema.NonEmptyString;
    readonly citations: Schema.$Array<Schema.NonEmptyString>;
}>, typeof CodingError, Action.Requirement<"repository/jev-reproduction">>;
export declare const RetainReproductionReview: Action.Declared<"repository/retain-reproduction-review", Schema.Struct<{
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
        /** What the intake screen decided about this event. It is the authority for
         * `Observation.classification`: no seat is asked the same question twice. */
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
    observation: Schema.Struct<{
        readonly summary: Schema.String;
        readonly question: Schema.String;
        readonly citations: Schema.$Array<Schema.NonEmptyString>;
        readonly reproduction: Schema.NullOr<Schema.Struct<{
            readonly files: Schema.$Array<Schema.Struct<{
                readonly path: Schema.NonEmptyString;
                readonly content: Schema.String;
            }>>;
            readonly argv: Schema.NonEmptyArray<Schema.NonEmptyString>;
            readonly cwd: Schema.String;
            readonly expected: Schema.NonEmptyString;
            readonly failureContains: Schema.NonEmptyString;
            readonly timeoutMs: Schema.Int;
        }>>;
        readonly classification: Schema.Literals<readonly ["bug", "feature", "question", "irrelevant"]>;
        readonly duplicates: Schema.$Array<Schema.Struct<{
            readonly source: Schema.Literals<readonly ["github", "smithers-cloud"]>;
            readonly number: Schema.Int;
            readonly reason: Schema.String;
        }>>;
    }>;
    result: Schema.Struct<{
        readonly stepId: Schema.String;
        readonly status: Schema.Literals<readonly ["completed", "needs-author", "needs-maintainer", "skipped", "error"]>;
        readonly summary: Schema.String;
        readonly evidence: Schema.$Array<Schema.String>;
        readonly output: Schema.Codec<Schema.Json, Schema.Json, never, never>;
        readonly executionId: Schema.NonEmptyString;
    }>;
    review: Schema.Struct<{
        readonly verdict: Schema.Literals<readonly ["demonstrates", "unrelated", "uncertain"]>;
        readonly summary: Schema.NonEmptyString;
        readonly citations: Schema.$Array<Schema.NonEmptyString>;
    }>;
}>, Schema.Struct<{
    readonly stepId: Schema.String;
    readonly status: Schema.Literals<readonly ["completed", "needs-author", "needs-maintainer", "skipped", "error"]>;
    readonly summary: Schema.String;
    readonly evidence: Schema.$Array<Schema.String>;
    readonly output: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly executionId: Schema.NonEmptyString;
}>, typeof CodingError, Action.Requirement<"repository/retain-reproduction-review">>;
export declare const ReviewReproduction: Flow.Flow<"repository/ReviewReproduction", Schema.Struct<{
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
        /** What the intake screen decided about this event. It is the authority for
         * `Observation.classification`: no seat is asked the same question twice. */
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
    readonly observation: Schema.Struct<{
        readonly summary: Schema.String;
        readonly question: Schema.String;
        readonly citations: Schema.$Array<Schema.NonEmptyString>;
        readonly reproduction: Schema.NullOr<Schema.Struct<{
            readonly files: Schema.$Array<Schema.Struct<{
                readonly path: Schema.NonEmptyString;
                readonly content: Schema.String;
            }>>;
            readonly argv: Schema.NonEmptyArray<Schema.NonEmptyString>;
            readonly cwd: Schema.String;
            readonly expected: Schema.NonEmptyString;
            readonly failureContains: Schema.NonEmptyString;
            readonly timeoutMs: Schema.Int;
        }>>;
        readonly classification: Schema.Literals<readonly ["bug", "feature", "question", "irrelevant"]>;
        readonly duplicates: Schema.$Array<Schema.Struct<{
            readonly source: Schema.Literals<readonly ["github", "smithers-cloud"]>;
            readonly number: Schema.Int;
            readonly reason: Schema.String;
        }>>;
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
}>, typeof CodingError, Action.Requirement<"repository/jev-reproduction"> | Action.Requirement<"repository/retain-reproduction-review">>;
export declare const FailedStep: Flow.Flow<"repository/FailedStep", Schema.Struct<{
    stepId: Schema.String;
    error: Schema.Codec<Schema.Json, Schema.Json, never, never>;
}>, Schema.Struct<{
    readonly stepId: Schema.String;
    readonly status: Schema.Literals<readonly ["completed", "needs-author", "needs-maintainer", "skipped", "error"]>;
    readonly summary: Schema.String;
    readonly evidence: Schema.$Array<Schema.String>;
    readonly output: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly executionId: Schema.NonEmptyString;
}>, typeof CodingError, Action.Requirement<"repository/retain-step-failure">>;
export declare const InvestigateStep: Flow.Flow<"repository/InvestigateStep", Schema.Struct<{
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
        /** What the intake screen decided about this event. It is the authority for
         * `Observation.classification`: no seat is asked the same question twice. */
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
}>, Schema.Union<readonly [typeof CodingError, Schema.Union<readonly [typeof import("@smthrs/harness/StructuredOutput").StructuredOutputFailure, typeof import("@smthrs/agent/Seat").SeatUnresolved, typeof import("@smthrs/agent/Seat").SeatUnrouted, typeof import("@smthrs/agent/Budget").BudgetExceeded, typeof import("@smthrs/agent/Budget").Skipped, typeof import("@smthrs/harness/HarnessError").HarnessError, typeof import("@smthrs/plugin").PluginError]>, typeof HumanTask.HumanTaskFailed]>, Action.Requirement<"repository/assert-budget"> | Action.Requirement<"repository/execute-repro"> | Action.Requirement<"repository/jev-duplicates"> | Action.Requirement<"repository/propose-repro"> | Action.Requirement<"repository/research"> | Action.Requirement<"repository/retain-observation"> | Action.Requirement<"repository/retain-step-failure"> | Action.Requirement<"repository/review">>;
export declare const FinishJob: Action.Declared<"repository/finish-job", Schema.Struct<{
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
    results: Schema.$Record<Schema.String, Schema.Struct<{
        readonly stepId: Schema.String;
        readonly status: Schema.Literals<readonly ["completed", "needs-author", "needs-maintainer", "skipped", "error"]>;
        readonly summary: Schema.String;
        readonly evidence: Schema.$Array<Schema.String>;
        readonly output: Schema.Codec<Schema.Json, Schema.Json, never, never>;
        readonly executionId: Schema.NonEmptyString;
    }>>;
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
}>, typeof CodingError, Action.Requirement<"repository/finish-job">>;
export declare const ValidateReply: Action.Declared<"repository/validate-author-reply", Schema.Struct<{
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
    reply: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    previous: Schema.Struct<{
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
}>, Schema.NullOr<Schema.Struct<{
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
}>>, typeof CodingError, Action.Requirement<"repository/validate-author-reply">>;
export declare const CheckReply: Flow.Flow<"repository/CheckReply", Schema.Struct<{
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
    reply: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    previous: Schema.Struct<{
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
}>, Schema.NullOr<Schema.Struct<{
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
}>>, typeof CodingError, Action.Requirement<"repository/validate-author-reply">>;
export declare const AwaitReply: Flow.Flow<"repository/AwaitReply", Schema.Struct<{
    deadlineAt: Schema.Number;
}>, Schema.Codec<Schema.Json, Schema.Json, never, never>, Schema.Never, Action.Requirement<"repository/await-author-reply">>;
export declare const ContinueAuthor: Action.Declared<"repository/continue-author", Schema.Struct<{
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
}>, typeof CodingError, Action.Requirement<"repository/continue-author">>;
/** Runtime action builds bounded children from the reviewed config; each child
 * is still an ordinary native Flow with its own durable result and parent edge. */
export declare const RunSteps: Action.Declared<"repository/run-steps", Schema.Struct<{
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
    evaluation: Schema.optionalKey<Schema.Boolean>;
}>, Schema.$Record<Schema.String, Schema.Struct<{
    readonly stepId: Schema.String;
    readonly status: Schema.Literals<readonly ["completed", "needs-author", "needs-maintainer", "skipped", "error"]>;
    readonly summary: Schema.String;
    readonly evidence: Schema.$Array<Schema.String>;
    readonly output: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly executionId: Schema.NonEmptyString;
}>>, typeof CodingError, Action.Requirement<"repository/run-steps">>;
export declare const CaptureJob: Action.Declared<"repository/capture-job", Schema.Struct<{
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
    readonly deadlineAt: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{
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
}>, typeof CodingError, Action.Requirement<"repository/capture-job">>;
export declare const CaptureFollowup: Flow.Flow<"repository/CaptureFollowup", Schema.Struct<{
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
    readonly deadlineAt: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{
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
}>, typeof CodingError, Action.Requirement<"repository/capture-job">>;
export declare const Investigate: Flow.Flow<"repository/Investigate", Schema.Struct<{
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
    evaluation: Schema.optionalKey<Schema.Boolean>;
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
}>, typeof CodingError, Action.Requirement<"repository/finish-job"> | Action.Requirement<"repository/run-steps">>;
export declare const RepositoryJob: Flow.Flow<"repository/Job", Schema.Struct<{
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
}>, Schema.Union<readonly [typeof CodingError, typeof WaitFor.WaitForRequestInvalid]>, Action.Requirement<"repository/capture-job"> | Action.Requirement<"repository/continue-author"> | Action.Requirement<"repository/start-budget">>;
export declare const jobFlows: Layer.Layer<Action.Requirement<"repository/await-author-reply">, never, import("effect/Crypto").Crypto | FlowRuntime.FlowRuntime | Action.Implementations>;
export declare const modelLayers: Layer.Layer<Action.Requirement<"repository/propose-repro"> | Action.Requirement<"repository/research"> | Action.Requirement<"repository/review">, never, import("@smthrs/agent/Agent").Agent | import("@smthrs/agent/Budget").Budget | import("effect/Crypto").Crypto | import("@smthrs/model/Evaluator").Evaluator | FlowRuntime.FlowRuntime | AgentAction.Host | import("@smthrs/agent/QuotaPolicy").QuotaClassifier | import("@smthrs/harness/Sandbox").Sandbox | import("@smthrs/agent/SeatResolver").SeatResolver | import("@smthrs/harness/Steering").Source>;
export declare const modelNames: Set<"repository/propose-repro" | "repository/research" | "repository/review">;
export declare const failureLayer: Layer.Layer<Action.Requirement<"repository/retain-step-failure">, never, FlowRuntime.FlowRuntime>;
