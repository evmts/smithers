import { Schema } from "effect";
export declare const Job: Schema.Literals<readonly ["issues", "review", "ci", "feature", "chores"]>;
export declare const Step: Schema.Struct<{
    readonly id: Schema.String;
    readonly name: Schema.String;
    readonly mode: Schema.Literals<readonly ["automatic", "manual", "off", "approved"]>;
    readonly prompt: Schema.String;
}>;
export declare const Check: Schema.Struct<{
    readonly id: Schema.String;
    readonly name: Schema.String;
    readonly kind: Schema.Literals<readonly ["command", "ai"]>;
    readonly rule: Schema.String;
    readonly paths: Schema.$Array<Schema.String>;
    readonly policy: Schema.Literals<readonly ["report", "required"]>;
}>;
/** `edited` marks a case the maintainer wrote or changed, so its pin is theirs.
 * Every other case belongs to the inspection that authored it, which re-pins it. */
export declare const EvalCase: Schema.Struct<{
    readonly id: Schema.String;
    readonly name: Schema.String;
    readonly input: Schema.String;
    readonly expected: Schema.NonEmptyString;
    readonly source: Schema.optionalKey<Schema.String>;
    readonly edited: Schema.optionalKey<Schema.Boolean>;
    readonly required: Schema.Boolean;
}>;
export declare const Draft: Schema.Struct<{
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
export type Draft = typeof Draft.Type;
export declare const Proposal: Schema.$Array<Schema.Struct<{
    readonly path: Schema.String;
    readonly beforeDigest: Schema.NullOr<Schema.String>;
    readonly content: Schema.NullOr<Schema.String>;
}>>;
export declare const Operation: Schema.Literals<readonly ["inspect", "evaluate", "trial", "apply", "pause", "run"]>;
export declare const Manual: Schema.Struct<{
    readonly stepId: Schema.String;
    readonly prompt: Schema.String;
    readonly subject: Schema.optionalKey<Schema.Struct<{
        readonly source: Schema.Literals<readonly ["github", "smithers-cloud"]>;
        readonly kind: Schema.Literals<readonly ["issue", "pr"]>;
        readonly number: Schema.Int;
    }>>;
}>;
export declare const SetupInput: Schema.Struct<{
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
export type SetupInput = typeof SetupInput.Type;
export declare const Event: Schema.Struct<{
    readonly source: Schema.Literals<readonly ["github", "smithers-cloud", "schedule"]>;
    readonly type: Schema.NonEmptyString;
    readonly action: Schema.String;
    readonly deliveryKey: Schema.NonEmptyString;
    readonly issueNumber: Schema.optionalKey<Schema.Int>;
    readonly trial: Schema.optionalKey<Schema.Boolean>;
    readonly manualStep: Schema.optionalKey<Schema.String>;
    readonly payload: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    /** The subject's text as the backend approved it for this run. */
    readonly approvedText: Schema.optionalKey<Schema.Struct<{
        readonly title: Schema.String;
        readonly body: Schema.String;
        readonly revision: Schema.String;
    }>>;
}>;
export declare const JobInput: Schema.Struct<{
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
        /** The subject's text as the backend approved it for this run. */
        readonly approvedText: Schema.optionalKey<Schema.Struct<{
            readonly title: Schema.String;
            readonly body: Schema.String;
            readonly revision: Schema.String;
        }>>;
    }>;
}>;
export type JobInput = typeof JobInput.Type;
export declare const Record: Schema.Struct<{
    readonly source: Schema.Literals<readonly ["github", "smithers-cloud"]>;
    readonly kind: Schema.Literals<readonly ["issue", "pr"]>;
    readonly number: Schema.Int;
    readonly title: Schema.String;
    readonly body: Schema.String;
    readonly state: Schema.String;
    readonly url: Schema.String;
    readonly revision: Schema.optionalKey<Schema.String>;
}>;
export declare const SourceStatus: Schema.Struct<{
    readonly path: Schema.String;
    readonly status: Schema.Literals<readonly ["read", "missing", "failed"]>;
    readonly summary: Schema.String;
    readonly revision: Schema.optionalKey<Schema.String>;
}>;
/** What the intake screen decides about one inbound event, before a frontier
 * model reads a word of it. `kind` is deliberately its own vocabulary and not
 * `Observation.classification`: this is a decision-only model's answer about
 * the raw event, not an investigation's finding about the request. */
export declare const IntakeKind: Schema.Literals<readonly ["bug", "feature", "question", "spam", "irrelevant"]>;
export declare const IntakeUrgency: Schema.Literals<readonly ["low", "medium", "high"]>;
export declare const IntakeAnswers: Schema.Struct<{
    readonly kind: Schema.Literals<readonly ["bug", "feature", "question", "spam", "irrelevant"]>;
    readonly urgency: Schema.Literals<readonly ["low", "medium", "high"]>;
}>;
export declare const IntakeAnswer: Schema.Struct<{
    /** Which text of the event this answers: `issue`, `pull_request`, `comment` or `authorReplies.<n>`. */
    readonly id: Schema.String;
    readonly kind: Schema.Literals<readonly ["bug", "feature", "question", "spam", "irrelevant"]>;
    readonly kindConfidence: Schema.Number;
    readonly urgency: Schema.Literals<readonly ["low", "medium", "high"]>;
    readonly urgencyConfidence: Schema.Number;
    /** How probable it is that this text carries instructions aimed at an AI agent. */
    readonly injection: Schema.Number;
    readonly withheld: Schema.Boolean;
}>;
export declare const IntakeScreening: Schema.Struct<{
    /** `proceed`, `ignored`, `withheld:<n>` for the number of texts replaced by
     * the placeholder, or `failed` when Jev could not answer and the job stops. */
    readonly action: Schema.String;
    readonly answers: Schema.$Array<Schema.Struct<{
        /** Which text of the event this answers: `issue`, `pull_request`, `comment` or `authorReplies.<n>`. */
        readonly id: Schema.String;
        readonly kind: Schema.Literals<readonly ["bug", "feature", "question", "spam", "irrelevant"]>;
        readonly kindConfidence: Schema.Number;
        readonly urgency: Schema.Literals<readonly ["low", "medium", "high"]>;
        readonly urgencyConfidence: Schema.Number;
        /** How probable it is that this text carries instructions aimed at an AI agent. */
        readonly injection: Schema.Number;
        readonly withheld: Schema.Boolean;
    }>>;
    readonly kind: Schema.optionalKey<Schema.Literals<readonly ["bug", "feature", "question", "spam", "irrelevant"]>>;
    readonly urgency: Schema.optionalKey<Schema.Literals<readonly ["low", "medium", "high"]>>;
    /** Why the screen failed: the evaluator's own failure code and message, per unanswered text. */
    readonly reason: Schema.optionalKey<Schema.String>;
}>;
export declare const RepositoryEvidence: Schema.Struct<{
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
        /** `proceed`, `ignored`, `withheld:<n>` for the number of texts replaced by
         * the placeholder, or `failed` when Jev could not answer and the job stops. */
        readonly action: Schema.String;
        readonly answers: Schema.$Array<Schema.Struct<{
            /** Which text of the event this answers: `issue`, `pull_request`, `comment` or `authorReplies.<n>`. */
            readonly id: Schema.String;
            readonly kind: Schema.Literals<readonly ["bug", "feature", "question", "spam", "irrelevant"]>;
            readonly kindConfidence: Schema.Number;
            readonly urgency: Schema.Literals<readonly ["low", "medium", "high"]>;
            readonly urgencyConfidence: Schema.Number;
            /** How probable it is that this text carries instructions aimed at an AI agent. */
            readonly injection: Schema.Number;
            readonly withheld: Schema.Boolean;
        }>>;
        readonly kind: Schema.optionalKey<Schema.Literals<readonly ["bug", "feature", "question", "spam", "irrelevant"]>>;
        readonly urgency: Schema.optionalKey<Schema.Literals<readonly ["low", "medium", "high"]>>;
        /** Why the screen failed: the evaluator's own failure code and message, per unanswered text. */
        readonly reason: Schema.optionalKey<Schema.String>;
    }>>;
}>;
export type RepositoryEvidence = typeof RepositoryEvidence.Type;
export declare const StepResult: Schema.Struct<{
    readonly stepId: Schema.String;
    readonly status: Schema.Literals<readonly ["completed", "needs-author", "needs-maintainer", "skipped", "error"]>;
    readonly summary: Schema.String;
    readonly evidence: Schema.$Array<Schema.String>;
    readonly output: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly executionId: Schema.NonEmptyString;
}>;
export declare const Reply: Schema.Struct<{
    readonly body: Schema.String;
    readonly issueNumber: Schema.Int;
    readonly state: Schema.Literals<readonly ["drafted", "posted", "declined", "undeliverable"]>;
    readonly reason: Schema.optionalKey<Schema.String>;
}>;
export type Reply = typeof Reply.Type;
export declare const JobResult: Schema.Struct<{
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
export type JobResult = typeof JobResult.Type;
export declare const EvalResult: Schema.Struct<{
    readonly caseId: Schema.String;
    readonly status: Schema.Literals<readonly ["passed", "failed", "review", "error"]>;
    readonly observed: Schema.String;
    readonly evidence: Schema.$Array<Schema.String>;
    readonly executionId: Schema.NonEmptyString;
}>;
export declare const Receipt: Schema.Struct<{
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
}>;
export declare const OperationResult: Schema.Struct<{
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
}>;
/** One repository's own name for one schedule. Never the flow id: a repository
 * may register the same flow under two slugs with different inputs. */
export declare const FlowSlug: Schema.String;
export declare const CronUtc: Schema.String;
/** What every unattended fire of one schedule may spend. Smithers Cloud stores
 * it on the registration and refuses one whose envelope names no finite pair
 * (`validateRepositoryJob`), so a registration states it rather than inheriting
 * whatever ceiling the scheduled flow happened to declare for itself. */
export declare const TriggerBudget: Schema.Struct<{
    readonly tokens: Schema.Int;
    readonly milliseconds: Schema.Int;
}>;
/** What the app sends the registrar. The approval fields carry the plan a
 * person approved; nothing here names who approved it or when. */
export declare const TriggerRequest: Schema.Struct<{
    readonly requestId: Schema.optionalKey<Schema.NonEmptyString>;
    readonly repo: Schema.NonEmptyString;
    readonly slug: Schema.String;
    readonly flow: Schema.String;
    readonly schedule: Schema.String;
    readonly input: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly workspaceId: Schema.optionalKey<Schema.String>;
    readonly budget: Schema.optionalKey<Schema.Struct<{
        readonly tokens: Schema.Int;
        readonly milliseconds: Schema.Int;
    }>>;
    readonly approvedPlanId: Schema.optionalKey<Schema.String>;
    readonly approvedPlanDigest: Schema.optionalKey<Schema.String>;
    /** A completed run of that exact plan, when the caller made one first. */
    readonly testRunId: Schema.optionalKey<Schema.String>;
    readonly operation: Schema.Literals<readonly ["register", "fire", "resume"]>;
    /** Resume must not overwrite a registration changed after its recovery read. */
    readonly expectedRevision: Schema.optionalKey<Schema.Int>;
}>;
export type TriggerRequest = typeof TriggerRequest.Type;
export declare const TriggerRegistration: Schema.Struct<{
    readonly registration_id: Schema.String;
    readonly revision: Schema.Int;
    readonly digest: Schema.String;
    readonly source_revision: Schema.String;
    readonly mode: Schema.Literal<"enabled">;
    readonly enabled: Schema.Boolean;
    readonly schedule: Schema.String;
    readonly next_fire_at: Schema.NullOr<Schema.String>;
    readonly timezone: Schema.Literal<"UTC">;
}>;
export declare const TriggerResult: Schema.Struct<{
    readonly requestId: Schema.String;
    readonly slug: Schema.String;
    readonly flow: Schema.String;
    readonly planId: Schema.String;
    readonly planDigest: Schema.String;
    readonly executionDigest: Schema.String;
    readonly envelope: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly sourceRevision: Schema.String;
    readonly testRunId: Schema.optionalKey<Schema.String>;
    readonly registration: Schema.Struct<{
        readonly registration_id: Schema.String;
        readonly revision: Schema.Int;
        readonly digest: Schema.String;
        readonly source_revision: Schema.String;
        readonly mode: Schema.Literal<"enabled">;
        readonly enabled: Schema.Boolean;
        readonly schedule: Schema.String;
        readonly next_fire_at: Schema.NullOr<Schema.String>;
        readonly timezone: Schema.Literal<"UTC">;
    }>;
}>;
/** 64-hex over the canonical request; Plue requires ^[a-f0-9]{64}$ for `digest`. */
export declare const triggerCandidate: (request: TriggerRequest) => string;
