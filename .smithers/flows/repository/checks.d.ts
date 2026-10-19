import { Action, Flow, FlowRuntime } from "@smthrs/flow";
import type * as Evaluator from "@smthrs/model/Evaluator";
import { Effect, Layer, Path, Schema } from "effect";
import * as Jj from "../../../packages/smithers/flows/jj/src/Jj.ts";
import { type ImmutableSourceOptions } from "../coding/immutable-source.ts";
import { CodingError } from "../coding/schema.ts";
import { CheckContext } from "./check-context.ts";
import { Work } from "./jobs.ts";
import { Check, type Draft, type JobResult, Proposal, type Step, StepResult } from "./schema.ts";
export declare const Comparison: Schema.Struct<{
    readonly base: Schema.String;
    readonly candidate: Schema.NonEmptyString;
    readonly diff: Schema.String;
    readonly paths: Schema.$Array<Schema.String>;
    readonly files: Schema.$Array<Schema.Struct<{
        readonly path: Schema.NonEmptyString;
        readonly digest: Schema.String;
        readonly text: Schema.String;
        readonly truncated: Schema.Boolean;
    }>>;
    readonly changes: Schema.$Array<Schema.Struct<{
        readonly path: Schema.String;
        readonly before: Schema.NullOr<Schema.String>;
        readonly after: Schema.NullOr<Schema.String>;
    }>>;
}>;
export declare const CheckSource: Schema.Struct<{
    readonly path: Schema.NonEmptyString;
    readonly present: Schema.Boolean;
}>;
export declare const CheckPlan: Schema.Struct<{
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
    readonly comparison: Schema.Struct<{
        readonly base: Schema.String;
        readonly candidate: Schema.NonEmptyString;
        readonly diff: Schema.String;
        readonly paths: Schema.$Array<Schema.String>;
        readonly files: Schema.$Array<Schema.Struct<{
            readonly path: Schema.NonEmptyString;
            readonly digest: Schema.String;
            readonly text: Schema.String;
            readonly truncated: Schema.Boolean;
        }>>;
        readonly changes: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly before: Schema.NullOr<Schema.String>;
            readonly after: Schema.NullOr<Schema.String>;
        }>>;
    }>;
    readonly contexts: Schema.$Array<Schema.Struct<{
        readonly checkId: Schema.String;
        readonly source: Schema.NonEmptyString;
        readonly files: Schema.$Array<Schema.Struct<{
            readonly path: Schema.NonEmptyString;
            readonly digest: Schema.String;
            readonly text: Schema.String;
            readonly truncated: Schema.Boolean;
        }>>;
        readonly reads: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly from: Schema.String;
            readonly reason: Schema.Literals<readonly ["rule", "source", "import", "convention"]>;
            readonly required: Schema.Boolean;
            readonly status: Schema.Literals<readonly ["read", "missing", "refused", "oversized", "unreadable", "limit", "unresolved", "external"]>;
            readonly digest: Schema.optionalKey<Schema.String>;
        }>>;
    }>>;
    readonly baseContexts: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly checkId: Schema.String;
        readonly source: Schema.NonEmptyString;
        readonly files: Schema.$Array<Schema.Struct<{
            readonly path: Schema.NonEmptyString;
            readonly digest: Schema.String;
            readonly text: Schema.String;
            readonly truncated: Schema.Boolean;
        }>>;
        readonly reads: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly from: Schema.String;
            readonly reason: Schema.Literals<readonly ["rule", "source", "import", "convention"]>;
            readonly required: Schema.Boolean;
            readonly status: Schema.Literals<readonly ["read", "missing", "refused", "oversized", "unreadable", "limit", "unresolved", "external"]>;
            readonly digest: Schema.optionalKey<Schema.String>;
        }>>;
    }>>>;
    readonly searched: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly path: Schema.NonEmptyString;
        readonly present: Schema.Boolean;
    }>>>;
}>;
export declare const CheckResult: Schema.Struct<{
    readonly checkId: Schema.String;
    readonly policy: Schema.Literals<readonly ["report", "required"]>;
    readonly status: Schema.Literals<readonly ["passed", "failed", "error", "skipped"]>;
    readonly summary: Schema.String;
    readonly evidence: Schema.$Array<Schema.String>;
    readonly executionId: Schema.String;
    readonly detail: Schema.Codec<Schema.Json, Schema.Json, never, never>;
}>;
/** Code findings can block policy even though the check executed correctly. */
export declare const CheckOutput: Schema.Struct<{
    readonly base: Schema.String;
    readonly candidate: Schema.NonEmptyString;
    readonly gate: Schema.Literals<readonly ["blocked", "passed"]>;
    readonly results: Schema.$Array<Schema.Struct<{
        readonly checkId: Schema.String;
        readonly policy: Schema.Literals<readonly ["report", "required"]>;
        readonly status: Schema.Literals<readonly ["passed", "failed", "error", "skipped"]>;
        readonly summary: Schema.String;
        readonly evidence: Schema.$Array<Schema.String>;
        readonly executionId: Schema.String;
        readonly detail: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    }>>;
}>;
/** Which model reached the verdict a row retained. Jev is the only one that
 * can now, but `seat` stays in the literals so rows stored while a frontier
 * checker existed keep decoding, and the key stays optional because rows
 * older than the field carry neither. `RetainSemantic` is its only writer, so
 * a checker that names itself in its own output cannot forge the record. */
export declare const DecidedBy: Schema.Literals<readonly ["jev", "seat"]>;
export declare const SemanticVerdict: Schema.Struct<{
    readonly verdict: Schema.Literals<readonly ["pass", "fail", "uncertain"]>;
    readonly summary: Schema.NonEmptyString;
    readonly examinedPaths: Schema.$Array<Schema.String>;
    readonly findings: Schema.$Array<Schema.Struct<{
        readonly path: Schema.NonEmptyString;
        readonly line: Schema.Int;
        readonly message: Schema.NonEmptyString;
    }>>;
    readonly decidedBy: Schema.optionalKey<Schema.Literals<readonly ["jev", "seat"]>>;
}>;
/** Shared by review execution, its trial verifier and the evaluator. */
export declare const reviewCheckId: (stepId: string) => string;
/** A review's product is what it found on the exact source, so its own finding
 * cannot be the reason its step failed: a required synthesized rule made every
 * finding-bearing review an errored step with a blocked gate, which no eval
 * case and no live trial could ever complete. Promoting an AI rule to a
 * required gate stays the maintainer's separate decision (`suggestedChecks`). */
export declare const reviewCheck: (step: typeof Step.Type) => typeof Check.Type;
export interface RecordedCheck {
    readonly step: typeof StepResult.Type;
    readonly output: typeof CheckOutput.Type;
    readonly phase: "baseline" | "candidate";
}
/** Read only the host's direct check or proposal.checks shape, never arbitrary
 * nested model JSON. Baselines remain measured evidence, not final coverage. */
export declare const recordedChecks: (step: typeof StepResult.Type, sourceRevision: string) => ReadonlyArray<RecordedCheck> | undefined;
/** The checker's own recorded admission that it could not conclude on the
 * supplied scope. `assessSemantic` is the only writer of this summary. */
export declare const inconclusiveCheck = "The AI check did not establish complete scope coverage";
/** A valid failed required check is a policy finding. It is not an unavailable
 * execution. Report-only model/tool errors still invalidate eval/trial proof.
 * The single recorded error a reviewed step may be judged on is its own check
 * reporting, against this exact source, that it could not conclude: a
 * contradicted verdict, a citation outside the captured evidence, a missing
 * context, an expired deadline and a lost execution all stay unavailable. */
export declare const unavailableCheck: ({ output }: RecordedCheck, reviewedId?: string) => typeof CheckResult.Type | undefined;
/** The refusal carries the check and its measured reason: a report-only rule
 * the gate deliberately ignored still stops the trial, and the bare fact that
 * something was unavailable sent the last operator to a retained workspace
 * file the product's file door cannot serve. Evaluation reads only the boolean. */
export declare const checkExecutionFailure: (recorded: RecordedCheck, reviewedId?: string) => string | undefined;
export declare const checkExecutionFailed: (recorded: RecordedCheck, reviewedId?: string) => boolean;
/** Only the owned trial receipt uses this gate. Unrelated live events may skip. */
export declare const verifyTrialChecks: (configuration: Pick<Draft, "checks" | "steps">, result: JobResult) => void;
export declare const CaptureChecks: Action.Declared<"repository/capture-checks", Schema.Struct<{
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
    readonly comparison: Schema.Struct<{
        readonly base: Schema.String;
        readonly candidate: Schema.NonEmptyString;
        readonly diff: Schema.String;
        readonly paths: Schema.$Array<Schema.String>;
        readonly files: Schema.$Array<Schema.Struct<{
            readonly path: Schema.NonEmptyString;
            readonly digest: Schema.String;
            readonly text: Schema.String;
            readonly truncated: Schema.Boolean;
        }>>;
        readonly changes: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly before: Schema.NullOr<Schema.String>;
            readonly after: Schema.NullOr<Schema.String>;
        }>>;
    }>;
    readonly contexts: Schema.$Array<Schema.Struct<{
        readonly checkId: Schema.String;
        readonly source: Schema.NonEmptyString;
        readonly files: Schema.$Array<Schema.Struct<{
            readonly path: Schema.NonEmptyString;
            readonly digest: Schema.String;
            readonly text: Schema.String;
            readonly truncated: Schema.Boolean;
        }>>;
        readonly reads: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly from: Schema.String;
            readonly reason: Schema.Literals<readonly ["rule", "source", "import", "convention"]>;
            readonly required: Schema.Boolean;
            readonly status: Schema.Literals<readonly ["read", "missing", "refused", "oversized", "unreadable", "limit", "unresolved", "external"]>;
            readonly digest: Schema.optionalKey<Schema.String>;
        }>>;
    }>>;
    readonly baseContexts: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly checkId: Schema.String;
        readonly source: Schema.NonEmptyString;
        readonly files: Schema.$Array<Schema.Struct<{
            readonly path: Schema.NonEmptyString;
            readonly digest: Schema.String;
            readonly text: Schema.String;
            readonly truncated: Schema.Boolean;
        }>>;
        readonly reads: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly from: Schema.String;
            readonly reason: Schema.Literals<readonly ["rule", "source", "import", "convention"]>;
            readonly required: Schema.Boolean;
            readonly status: Schema.Literals<readonly ["read", "missing", "refused", "oversized", "unreadable", "limit", "unresolved", "external"]>;
            readonly digest: Schema.optionalKey<Schema.String>;
        }>>;
    }>>>;
    readonly searched: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly path: Schema.NonEmptyString;
        readonly present: Schema.Boolean;
    }>>>;
}>, typeof CodingError, Action.Requirement<"repository/capture-checks">>;
export declare const ExecuteCommand: Action.Declared<"repository/execute-command-check", Schema.Struct<{
    plan: Schema.Struct<{
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
        readonly comparison: Schema.Struct<{
            readonly base: Schema.String;
            readonly candidate: Schema.NonEmptyString;
            readonly diff: Schema.String;
            readonly paths: Schema.$Array<Schema.String>;
            readonly files: Schema.$Array<Schema.Struct<{
                readonly path: Schema.NonEmptyString;
                readonly digest: Schema.String;
                readonly text: Schema.String;
                readonly truncated: Schema.Boolean;
            }>>;
            readonly changes: Schema.$Array<Schema.Struct<{
                readonly path: Schema.String;
                readonly before: Schema.NullOr<Schema.String>;
                readonly after: Schema.NullOr<Schema.String>;
            }>>;
        }>;
        readonly contexts: Schema.$Array<Schema.Struct<{
            readonly checkId: Schema.String;
            readonly source: Schema.NonEmptyString;
            readonly files: Schema.$Array<Schema.Struct<{
                readonly path: Schema.NonEmptyString;
                readonly digest: Schema.String;
                readonly text: Schema.String;
                readonly truncated: Schema.Boolean;
            }>>;
            readonly reads: Schema.$Array<Schema.Struct<{
                readonly path: Schema.String;
                readonly from: Schema.String;
                readonly reason: Schema.Literals<readonly ["rule", "source", "import", "convention"]>;
                readonly required: Schema.Boolean;
                readonly status: Schema.Literals<readonly ["read", "missing", "refused", "oversized", "unreadable", "limit", "unresolved", "external"]>;
                readonly digest: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        readonly baseContexts: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly checkId: Schema.String;
            readonly source: Schema.NonEmptyString;
            readonly files: Schema.$Array<Schema.Struct<{
                readonly path: Schema.NonEmptyString;
                readonly digest: Schema.String;
                readonly text: Schema.String;
                readonly truncated: Schema.Boolean;
            }>>;
            readonly reads: Schema.$Array<Schema.Struct<{
                readonly path: Schema.String;
                readonly from: Schema.String;
                readonly reason: Schema.Literals<readonly ["rule", "source", "import", "convention"]>;
                readonly required: Schema.Boolean;
                readonly status: Schema.Literals<readonly ["read", "missing", "refused", "oversized", "unreadable", "limit", "unresolved", "external"]>;
                readonly digest: Schema.optionalKey<Schema.String>;
            }>>;
        }>>>;
        readonly searched: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly path: Schema.NonEmptyString;
            readonly present: Schema.Boolean;
        }>>>;
    }>;
    check: Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly kind: Schema.Literals<readonly ["command", "ai"]>;
        readonly rule: Schema.String;
        readonly paths: Schema.$Array<Schema.String>;
        readonly policy: Schema.Literals<readonly ["report", "required"]>;
    }>;
}>, Schema.Struct<{
    readonly checkId: Schema.String;
    readonly policy: Schema.Literals<readonly ["report", "required"]>;
    readonly status: Schema.Literals<readonly ["passed", "failed", "error", "skipped"]>;
    readonly summary: Schema.String;
    readonly evidence: Schema.$Array<Schema.String>;
    readonly executionId: Schema.String;
    readonly detail: Schema.Codec<Schema.Json, Schema.Json, never, never>;
}>, typeof CodingError, Action.Requirement<"repository/execute-command-check">>;
export declare const RetainSemantic: Action.Declared<"repository/retain-semantic-check", Schema.Struct<{
    plan: Schema.Struct<{
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
        readonly comparison: Schema.Struct<{
            readonly base: Schema.String;
            readonly candidate: Schema.NonEmptyString;
            readonly diff: Schema.String;
            readonly paths: Schema.$Array<Schema.String>;
            readonly files: Schema.$Array<Schema.Struct<{
                readonly path: Schema.NonEmptyString;
                readonly digest: Schema.String;
                readonly text: Schema.String;
                readonly truncated: Schema.Boolean;
            }>>;
            readonly changes: Schema.$Array<Schema.Struct<{
                readonly path: Schema.String;
                readonly before: Schema.NullOr<Schema.String>;
                readonly after: Schema.NullOr<Schema.String>;
            }>>;
        }>;
        readonly contexts: Schema.$Array<Schema.Struct<{
            readonly checkId: Schema.String;
            readonly source: Schema.NonEmptyString;
            readonly files: Schema.$Array<Schema.Struct<{
                readonly path: Schema.NonEmptyString;
                readonly digest: Schema.String;
                readonly text: Schema.String;
                readonly truncated: Schema.Boolean;
            }>>;
            readonly reads: Schema.$Array<Schema.Struct<{
                readonly path: Schema.String;
                readonly from: Schema.String;
                readonly reason: Schema.Literals<readonly ["rule", "source", "import", "convention"]>;
                readonly required: Schema.Boolean;
                readonly status: Schema.Literals<readonly ["read", "missing", "refused", "oversized", "unreadable", "limit", "unresolved", "external"]>;
                readonly digest: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        readonly baseContexts: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly checkId: Schema.String;
            readonly source: Schema.NonEmptyString;
            readonly files: Schema.$Array<Schema.Struct<{
                readonly path: Schema.NonEmptyString;
                readonly digest: Schema.String;
                readonly text: Schema.String;
                readonly truncated: Schema.Boolean;
            }>>;
            readonly reads: Schema.$Array<Schema.Struct<{
                readonly path: Schema.String;
                readonly from: Schema.String;
                readonly reason: Schema.Literals<readonly ["rule", "source", "import", "convention"]>;
                readonly required: Schema.Boolean;
                readonly status: Schema.Literals<readonly ["read", "missing", "refused", "oversized", "unreadable", "limit", "unresolved", "external"]>;
                readonly digest: Schema.optionalKey<Schema.String>;
            }>>;
        }>>>;
        readonly searched: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly path: Schema.NonEmptyString;
            readonly present: Schema.Boolean;
        }>>>;
    }>;
    check: Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly kind: Schema.Literals<readonly ["command", "ai"]>;
        readonly rule: Schema.String;
        readonly paths: Schema.$Array<Schema.String>;
        readonly policy: Schema.Literals<readonly ["report", "required"]>;
    }>;
    comparison: Schema.Struct<{
        readonly base: Schema.String;
        readonly candidate: Schema.NonEmptyString;
        readonly diff: Schema.String;
        readonly paths: Schema.$Array<Schema.String>;
        readonly files: Schema.$Array<Schema.Struct<{
            readonly path: Schema.NonEmptyString;
            readonly digest: Schema.String;
            readonly text: Schema.String;
            readonly truncated: Schema.Boolean;
        }>>;
        readonly changes: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly before: Schema.NullOr<Schema.String>;
            readonly after: Schema.NullOr<Schema.String>;
        }>>;
    }>;
    verdict: Schema.Struct<{
        readonly verdict: Schema.Literals<readonly ["pass", "fail", "uncertain"]>;
        readonly summary: Schema.NonEmptyString;
        readonly examinedPaths: Schema.$Array<Schema.String>;
        readonly findings: Schema.$Array<Schema.Struct<{
            readonly path: Schema.NonEmptyString;
            readonly line: Schema.Int;
            readonly message: Schema.NonEmptyString;
        }>>;
        readonly decidedBy: Schema.optionalKey<Schema.Literals<readonly ["jev", "seat"]>>;
    }>;
    decidedBy: Schema.optionalKey<Schema.Literals<readonly ["jev", "seat"]>>;
}>, Schema.Struct<{
    readonly checkId: Schema.String;
    readonly policy: Schema.Literals<readonly ["report", "required"]>;
    readonly status: Schema.Literals<readonly ["passed", "failed", "error", "skipped"]>;
    readonly summary: Schema.String;
    readonly evidence: Schema.$Array<Schema.String>;
    readonly executionId: Schema.String;
    readonly detail: Schema.Codec<Schema.Json, Schema.Json, never, never>;
}>, typeof CodingError, Action.Requirement<"repository/retain-semantic-check">>;
/** Jev judges the maintainer's rule one changed hunk at a time. An answer
 * between the two thresholds is Jev deciding it is unsure, and comes back
 * `uncertain`; an evaluation it could not make at all — a missing subscription, a
 * refused call, a timeout, a malformed answer — fails this action with the
 * evaluator's typed error. There is no second model behind it. */
export declare const JevSemanticCheck: Action.Declared<"repository/jev-semantic-check", Schema.Struct<{
    check: Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly kind: Schema.Literals<readonly ["command", "ai"]>;
        readonly rule: Schema.String;
        readonly paths: Schema.$Array<Schema.String>;
        readonly policy: Schema.Literals<readonly ["report", "required"]>;
    }>;
    comparison: Schema.Struct<{
        readonly base: Schema.String;
        readonly candidate: Schema.NonEmptyString;
        readonly diff: Schema.String;
        readonly paths: Schema.$Array<Schema.String>;
        readonly files: Schema.$Array<Schema.Struct<{
            readonly path: Schema.NonEmptyString;
            readonly digest: Schema.String;
            readonly text: Schema.String;
            readonly truncated: Schema.Boolean;
        }>>;
        readonly changes: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly before: Schema.NullOr<Schema.String>;
            readonly after: Schema.NullOr<Schema.String>;
        }>>;
    }>;
}>, Schema.Struct<{
    readonly verdict: Schema.Literals<readonly ["pass", "fail", "uncertain"]>;
    readonly summary: Schema.NonEmptyString;
    readonly examinedPaths: Schema.$Array<Schema.String>;
    readonly findings: Schema.$Array<Schema.Struct<{
        readonly path: Schema.NonEmptyString;
        readonly line: Schema.Int;
        readonly message: Schema.NonEmptyString;
    }>>;
    readonly decidedBy: Schema.optionalKey<Schema.Literals<readonly ["jev", "seat"]>>;
}>, typeof CodingError, Action.Requirement<"repository/jev-semantic-check">>;
export declare const CommandCheck: Flow.Flow<"repository/CommandCheck", Schema.Struct<{
    plan: Schema.Struct<{
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
        readonly comparison: Schema.Struct<{
            readonly base: Schema.String;
            readonly candidate: Schema.NonEmptyString;
            readonly diff: Schema.String;
            readonly paths: Schema.$Array<Schema.String>;
            readonly files: Schema.$Array<Schema.Struct<{
                readonly path: Schema.NonEmptyString;
                readonly digest: Schema.String;
                readonly text: Schema.String;
                readonly truncated: Schema.Boolean;
            }>>;
            readonly changes: Schema.$Array<Schema.Struct<{
                readonly path: Schema.String;
                readonly before: Schema.NullOr<Schema.String>;
                readonly after: Schema.NullOr<Schema.String>;
            }>>;
        }>;
        readonly contexts: Schema.$Array<Schema.Struct<{
            readonly checkId: Schema.String;
            readonly source: Schema.NonEmptyString;
            readonly files: Schema.$Array<Schema.Struct<{
                readonly path: Schema.NonEmptyString;
                readonly digest: Schema.String;
                readonly text: Schema.String;
                readonly truncated: Schema.Boolean;
            }>>;
            readonly reads: Schema.$Array<Schema.Struct<{
                readonly path: Schema.String;
                readonly from: Schema.String;
                readonly reason: Schema.Literals<readonly ["rule", "source", "import", "convention"]>;
                readonly required: Schema.Boolean;
                readonly status: Schema.Literals<readonly ["read", "missing", "refused", "oversized", "unreadable", "limit", "unresolved", "external"]>;
                readonly digest: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        readonly baseContexts: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly checkId: Schema.String;
            readonly source: Schema.NonEmptyString;
            readonly files: Schema.$Array<Schema.Struct<{
                readonly path: Schema.NonEmptyString;
                readonly digest: Schema.String;
                readonly text: Schema.String;
                readonly truncated: Schema.Boolean;
            }>>;
            readonly reads: Schema.$Array<Schema.Struct<{
                readonly path: Schema.String;
                readonly from: Schema.String;
                readonly reason: Schema.Literals<readonly ["rule", "source", "import", "convention"]>;
                readonly required: Schema.Boolean;
                readonly status: Schema.Literals<readonly ["read", "missing", "refused", "oversized", "unreadable", "limit", "unresolved", "external"]>;
                readonly digest: Schema.optionalKey<Schema.String>;
            }>>;
        }>>>;
        readonly searched: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly path: Schema.NonEmptyString;
            readonly present: Schema.Boolean;
        }>>>;
    }>;
    check: Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly kind: Schema.Literals<readonly ["command", "ai"]>;
        readonly rule: Schema.String;
        readonly paths: Schema.$Array<Schema.String>;
        readonly policy: Schema.Literals<readonly ["report", "required"]>;
    }>;
}>, Schema.Struct<{
    readonly checkId: Schema.String;
    readonly policy: Schema.Literals<readonly ["report", "required"]>;
    readonly status: Schema.Literals<readonly ["passed", "failed", "error", "skipped"]>;
    readonly summary: Schema.String;
    readonly evidence: Schema.$Array<Schema.String>;
    readonly executionId: Schema.String;
    readonly detail: Schema.Codec<Schema.Json, Schema.Json, never, never>;
}>, typeof CodingError, Action.Requirement<"repository/execute-command-check">>;
/** Jev decides, and its verdict is the check's verdict — `uncertain`
 * included, which `assessSemantic` records as an errored check rather than a
 * pass. When Jev cannot answer, the flow fails with its typed error and
 * `RunChecks` retains that as the check's error row. Nothing falls back to a
 * frontier seat. */
export declare const AICheck: Flow.Flow<"repository/AICheck", Schema.Struct<{
    plan: Schema.Struct<{
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
        readonly comparison: Schema.Struct<{
            readonly base: Schema.String;
            readonly candidate: Schema.NonEmptyString;
            readonly diff: Schema.String;
            readonly paths: Schema.$Array<Schema.String>;
            readonly files: Schema.$Array<Schema.Struct<{
                readonly path: Schema.NonEmptyString;
                readonly digest: Schema.String;
                readonly text: Schema.String;
                readonly truncated: Schema.Boolean;
            }>>;
            readonly changes: Schema.$Array<Schema.Struct<{
                readonly path: Schema.String;
                readonly before: Schema.NullOr<Schema.String>;
                readonly after: Schema.NullOr<Schema.String>;
            }>>;
        }>;
        readonly contexts: Schema.$Array<Schema.Struct<{
            readonly checkId: Schema.String;
            readonly source: Schema.NonEmptyString;
            readonly files: Schema.$Array<Schema.Struct<{
                readonly path: Schema.NonEmptyString;
                readonly digest: Schema.String;
                readonly text: Schema.String;
                readonly truncated: Schema.Boolean;
            }>>;
            readonly reads: Schema.$Array<Schema.Struct<{
                readonly path: Schema.String;
                readonly from: Schema.String;
                readonly reason: Schema.Literals<readonly ["rule", "source", "import", "convention"]>;
                readonly required: Schema.Boolean;
                readonly status: Schema.Literals<readonly ["read", "missing", "refused", "oversized", "unreadable", "limit", "unresolved", "external"]>;
                readonly digest: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        readonly baseContexts: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly checkId: Schema.String;
            readonly source: Schema.NonEmptyString;
            readonly files: Schema.$Array<Schema.Struct<{
                readonly path: Schema.NonEmptyString;
                readonly digest: Schema.String;
                readonly text: Schema.String;
                readonly truncated: Schema.Boolean;
            }>>;
            readonly reads: Schema.$Array<Schema.Struct<{
                readonly path: Schema.String;
                readonly from: Schema.String;
                readonly reason: Schema.Literals<readonly ["rule", "source", "import", "convention"]>;
                readonly required: Schema.Boolean;
                readonly status: Schema.Literals<readonly ["read", "missing", "refused", "oversized", "unreadable", "limit", "unresolved", "external"]>;
                readonly digest: Schema.optionalKey<Schema.String>;
            }>>;
        }>>>;
        readonly searched: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly path: Schema.NonEmptyString;
            readonly present: Schema.Boolean;
        }>>>;
    }>;
    check: Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly kind: Schema.Literals<readonly ["command", "ai"]>;
        readonly rule: Schema.String;
        readonly paths: Schema.$Array<Schema.String>;
        readonly policy: Schema.Literals<readonly ["report", "required"]>;
    }>;
    comparison: Schema.Struct<{
        readonly base: Schema.String;
        readonly candidate: Schema.NonEmptyString;
        readonly diff: Schema.String;
        readonly paths: Schema.$Array<Schema.String>;
        readonly files: Schema.$Array<Schema.Struct<{
            readonly path: Schema.NonEmptyString;
            readonly digest: Schema.String;
            readonly text: Schema.String;
            readonly truncated: Schema.Boolean;
        }>>;
        readonly changes: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly before: Schema.NullOr<Schema.String>;
            readonly after: Schema.NullOr<Schema.String>;
        }>>;
    }>;
    context: Schema.Struct<{
        readonly checkId: Schema.String;
        readonly source: Schema.NonEmptyString;
        readonly files: Schema.$Array<Schema.Struct<{
            readonly path: Schema.NonEmptyString;
            readonly digest: Schema.String;
            readonly text: Schema.String;
            readonly truncated: Schema.Boolean;
        }>>;
        readonly reads: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly from: Schema.String;
            readonly reason: Schema.Literals<readonly ["rule", "source", "import", "convention"]>;
            readonly required: Schema.Boolean;
            readonly status: Schema.Literals<readonly ["read", "missing", "refused", "oversized", "unreadable", "limit", "unresolved", "external"]>;
            readonly digest: Schema.optionalKey<Schema.String>;
        }>>;
    }>;
    baseContext: Schema.optionalKey<Schema.Struct<{
        readonly checkId: Schema.String;
        readonly source: Schema.NonEmptyString;
        readonly files: Schema.$Array<Schema.Struct<{
            readonly path: Schema.NonEmptyString;
            readonly digest: Schema.String;
            readonly text: Schema.String;
            readonly truncated: Schema.Boolean;
        }>>;
        readonly reads: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly from: Schema.String;
            readonly reason: Schema.Literals<readonly ["rule", "source", "import", "convention"]>;
            readonly required: Schema.Boolean;
            readonly status: Schema.Literals<readonly ["read", "missing", "refused", "oversized", "unreadable", "limit", "unresolved", "external"]>;
            readonly digest: Schema.optionalKey<Schema.String>;
        }>>;
    }>>;
}>, Schema.Struct<{
    readonly checkId: Schema.String;
    readonly policy: Schema.Literals<readonly ["report", "required"]>;
    readonly status: Schema.Literals<readonly ["passed", "failed", "error", "skipped"]>;
    readonly summary: Schema.String;
    readonly evidence: Schema.$Array<Schema.String>;
    readonly executionId: Schema.String;
    readonly detail: Schema.Codec<Schema.Json, Schema.Json, never, never>;
}>, typeof CodingError, Action.Requirement<"repository/jev-semantic-check"> | Action.Requirement<"repository/retain-semantic-check">>;
export declare const RunChecks: Action.Declared<"repository/run-checks", Schema.Struct<{
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
    readonly comparison: Schema.Struct<{
        readonly base: Schema.String;
        readonly candidate: Schema.NonEmptyString;
        readonly diff: Schema.String;
        readonly paths: Schema.$Array<Schema.String>;
        readonly files: Schema.$Array<Schema.Struct<{
            readonly path: Schema.NonEmptyString;
            readonly digest: Schema.String;
            readonly text: Schema.String;
            readonly truncated: Schema.Boolean;
        }>>;
        readonly changes: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly before: Schema.NullOr<Schema.String>;
            readonly after: Schema.NullOr<Schema.String>;
        }>>;
    }>;
    readonly contexts: Schema.$Array<Schema.Struct<{
        readonly checkId: Schema.String;
        readonly source: Schema.NonEmptyString;
        readonly files: Schema.$Array<Schema.Struct<{
            readonly path: Schema.NonEmptyString;
            readonly digest: Schema.String;
            readonly text: Schema.String;
            readonly truncated: Schema.Boolean;
        }>>;
        readonly reads: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly from: Schema.String;
            readonly reason: Schema.Literals<readonly ["rule", "source", "import", "convention"]>;
            readonly required: Schema.Boolean;
            readonly status: Schema.Literals<readonly ["read", "missing", "refused", "oversized", "unreadable", "limit", "unresolved", "external"]>;
            readonly digest: Schema.optionalKey<Schema.String>;
        }>>;
    }>>;
    readonly baseContexts: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly checkId: Schema.String;
        readonly source: Schema.NonEmptyString;
        readonly files: Schema.$Array<Schema.Struct<{
            readonly path: Schema.NonEmptyString;
            readonly digest: Schema.String;
            readonly text: Schema.String;
            readonly truncated: Schema.Boolean;
        }>>;
        readonly reads: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly from: Schema.String;
            readonly reason: Schema.Literals<readonly ["rule", "source", "import", "convention"]>;
            readonly required: Schema.Boolean;
            readonly status: Schema.Literals<readonly ["read", "missing", "refused", "oversized", "unreadable", "limit", "unresolved", "external"]>;
            readonly digest: Schema.optionalKey<Schema.String>;
        }>>;
    }>>>;
    readonly searched: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly path: Schema.NonEmptyString;
        readonly present: Schema.Boolean;
    }>>>;
}>, Schema.Struct<{
    readonly stepId: Schema.String;
    readonly status: Schema.Literals<readonly ["completed", "needs-author", "needs-maintainer", "skipped", "error"]>;
    readonly summary: Schema.String;
    readonly evidence: Schema.$Array<Schema.String>;
    readonly output: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly executionId: Schema.NonEmptyString;
}>, typeof CodingError, Action.Requirement<"repository/run-checks">>;
export declare const CheckStep: Flow.Flow<"repository/CheckStep", Schema.Struct<{
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
}>, typeof CodingError, Action.Requirement<"repository/capture-checks"> | Action.Requirement<"repository/run-checks">>;
/** A nonempty diff with unsupported path encoding cannot become an empty scope. */
export declare const diffPaths: (diff: string) => Array<string>;
export declare const selectedComparison: (comparison: typeof Comparison.Type, check: typeof Check.Type) => typeof Comparison.Type;
export declare const refusedComparison: (comparison: typeof Comparison.Type, check: typeof Check.Type) => Array<string>;
/** Full-file proposals alter only the private exported tree and name their exact preimages. */
export declare const materializeProposal: (options: ImmutableSourceOptions, root: string, proposal: typeof Proposal.Type) => Effect.Effect<{
    readonly path: string;
    readonly before: string | null;
    readonly after: string | null;
}[], CodingError, Path.Path>;
/** A repository configures checks in workflow files, manifests and task
 * scripts. The step probes those locations on its own immutable source, so its
 * report never borrows the paths a triggering event happened to mention. */
export declare const checkLocations: string[];
export declare const probeCheckLocations: (options: ImmutableSourceOptions, root: string) => Effect.Effect<{
    readonly path: string;
    readonly present: boolean;
}[], never, Path.Path>;
export declare const captureChecks: (options: ImmutableSourceOptions, work: typeof Work.Type) => Effect.Effect<{
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
    comparison: {
        base: string;
        candidate: string;
        diff: string;
        paths: string[];
        files: {
            readonly path: string;
            readonly digest: string;
            readonly text: string;
            readonly truncated: boolean;
        }[];
        changes: {
            readonly path: string;
            readonly before: string | null;
            readonly after: string | null;
        }[];
    };
    contexts: {
        checkId: string;
        source: string;
        files: {
            readonly path: string;
            readonly digest: string;
            readonly text: string;
            readonly truncated: boolean;
        }[];
        reads: {
            readonly path: string;
            readonly from: string;
            readonly reason: "convention" | "import" | "rule" | "source";
            readonly required: boolean;
            readonly status: "external" | "limit" | "missing" | "oversized" | "read" | "refused" | "unreadable" | "unresolved";
            readonly digest?: string;
        }[];
    }[];
    baseContexts: {
        checkId: string;
        source: string;
        files: {
            readonly path: string;
            readonly digest: string;
            readonly text: string;
            readonly truncated: boolean;
        }[];
        reads: {
            readonly path: string;
            readonly from: string;
            readonly reason: "convention" | "import" | "rule" | "source";
            readonly required: boolean;
            readonly status: "external" | "limit" | "missing" | "oversized" | "read" | "refused" | "unreadable" | "unresolved";
            readonly digest?: string;
        }[];
    }[];
    searched: {
        readonly path: string;
        readonly present: boolean;
    }[];
}, CodingError, import("effect/process/ChildProcessSpawner").ChildProcessSpawner | Jj.Jj | Path.Path>;
export declare const executeCommand: (options: ImmutableSourceOptions, plan: typeof CheckPlan.Type, check: typeof Check.Type, executionId: string) => Effect.Effect<{
    checkId: string;
    policy: "report" | "required";
    executionId: string;
    status: "error" | "failed" | "passed";
    summary: string;
    evidence: string[];
    detail: Schema.Json;
}, CodingError, import("effect/process/ChildProcessSpawner").ChildProcessSpawner | Path.Path>;
export declare const assessSemantic: (comparison: typeof Comparison.Type, verdict: typeof SemanticVerdict.Type, context?: CheckContext, baseContext?: CheckContext) => {
    status: "error";
    summary: string;
} | {
    status: "failed" | "passed";
    summary: string;
};
/** A configured check that never ran is not a measured pass, so a run that
 * measured nothing says so and names the locations this step probed. */
export declare const checksSummary: (plan: typeof CheckPlan.Type, results: ReadonlyArray<typeof CheckResult.Type>) => string;
/** Every composition must supply its judge. Omitting it is a type error;
 * an offline fixture supplies an evidence-based script, never a gateway key. */
export declare const checkLayers: (options: ImmutableSourceOptions & {
    readonly evaluator: Layer.Layer<Evaluator.Evaluator>;
}) => Layer.Layer<Action.Requirement<"repository/capture-checks"> | Action.Requirement<"repository/execute-command-check"> | Action.Requirement<"repository/jev-semantic-check"> | Action.Requirement<"repository/retain-semantic-check"> | Action.Requirement<"repository/run-checks">, never, import("effect/process/ChildProcessSpawner").ChildProcessSpawner | FlowRuntime.FlowRuntime | Action.Implementations | Jj.Jj | Path.Path>;
