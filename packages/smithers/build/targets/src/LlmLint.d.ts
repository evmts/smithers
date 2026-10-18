/**
 * Model-assisted lint over changed files.
 *
 * This module also declares the shared llm-review action: one sealed model
 * call per target that diffs, batches, and reviews source through tool-free
 * provider requests, or through the model seats a trusted host supplies as a
 * {@link ReviewTransport}. Explicit trusted-host executable overrides and the
 * generic promptEngine utility use bounded CLI invocations.
 *
 * @since 0.1.0
 */
import { Action, type FlowRuntime } from "@smthrs/flow";
import type * as Model from "@smthrs/model/Model";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import type * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { Engine } from "./ModelEngine.ts";
import * as Target from "./Target.ts";
/**
 * Maximum changed files placed in one model-review batch.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumLlmBatchSize = 128;
/**
 * Maximum changed files admitted to one review target.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumReviewFiles = 2048;
/**
 * Maximum model calls made by one review target.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumReviewBatches = 64;
/**
 * Maximum repository context files supplied alongside a review batch.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumContextFiles = 512;
/**
 * Maximum bytes read from one changed or context file.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumReviewFileBytes: number;
/**
 * Maximum aggregate changed-file content one review reads.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const maximumReviewContentBytes: number;
/**
 * Maximum unchanged related files (dependencies, Go package siblings and
 * callers of the changed files) one review reads.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const maximumRelatedFiles = 512;
/**
 * Maximum aggregate related-file content one review reads.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const maximumRelatedContentBytes: number;
/**
 * Model context window, in tokens, a review budgets against when its
 * declaration names none.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const defaultContextTokens = 200000;
/**
 * Smallest declarable model context window, in tokens.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const minimumContextTokens = 32768;
/**
 * Largest declarable model context window, in tokens.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const maximumContextTokens = 2000000;
/**
 * Maximum aggregate repository context supplied in one batch.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumContextContentBytes: number;
/**
 * Maximum encoded prompt size admitted to one model call.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumReviewPromptBytes: number;
/**
 * Maximum stdout bytes accepted from one model process.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumModelOutputBytes: number;
/**
 * Maximum findings accepted from one model response.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumFindings = 10000;
/**
 * Maximum aggregate finding text accepted from one model response.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumFindingBytes: number;
/**
 * Default wall-clock timeout for one model process.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const defaultReviewTimeoutMs: number;
/**
 * Maximum configurable wall-clock timeout for one model process.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumReviewTimeoutMs: number;
/**
 * Finding severity, ordered `info` below `warning` below `error`.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Severity: Schema.Literals<readonly ["info", "warning", "error"]>;
/**
 * Finding severity.
 *
 * @category models
 * @since 0.1.0
 */
export type Severity = typeof Severity.Type;
export { Engine };
/**
 * A trusted host's receipt for a controlled reproduction, never model authority.
 * @category schemas
 * @since 1.0.0
 */
export declare const Reproduction: Schema.Struct<{
    readonly revision: Schema.String;
    readonly command: Schema.NonEmptyString;
    readonly observedResult: Schema.NonEmptyString;
}>;
/**
 * Impact, verification, and release advice are independent dimensions.
 * @category schemas
 * @since 1.0.0
 */
export declare const SecurityEvidence: Schema.Struct<{
    readonly checkId: Schema.String;
    readonly impact: Schema.Literals<readonly ["low", "medium", "high", "critical"]>;
    readonly verification: Schema.Literals<readonly ["suspected", "confirmed"]>;
    readonly releaseRecommendation: Schema.Literals<readonly ["allow", "review", "block"]>;
    readonly attackerPreconditions: Schema.NonEmptyString;
    readonly evidence: Schema.NonEmptyString;
    readonly nextConfirmationStep: Schema.NonEmptyString;
    readonly reproduction: Schema.optional<Schema.Struct<{
        readonly revision: Schema.String;
        readonly command: Schema.NonEmptyString;
        readonly observedResult: Schema.NonEmptyString;
    }>>;
}>;
/**
 * One model finding against a reviewed file.
 *
 * `line` is 1-based; whole-file findings report line 1.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Finding: Schema.Struct<{
    readonly file: Schema.NonEmptyString;
    readonly line: Schema.Int;
    readonly severity: Schema.Literals<readonly ["info", "warning", "error"]>;
    readonly security: Schema.optional<Schema.Struct<{
        readonly checkId: Schema.String;
        readonly impact: Schema.Literals<readonly ["low", "medium", "high", "critical"]>;
        readonly verification: Schema.Literals<readonly ["suspected", "confirmed"]>;
        readonly releaseRecommendation: Schema.Literals<readonly ["allow", "review", "block"]>;
        readonly attackerPreconditions: Schema.NonEmptyString;
        readonly evidence: Schema.NonEmptyString;
        readonly nextConfirmationStep: Schema.NonEmptyString;
        readonly reproduction: Schema.optional<Schema.Struct<{
            readonly revision: Schema.String;
            readonly command: Schema.NonEmptyString;
            readonly observedResult: Schema.NonEmptyString;
        }>>;
    }>>;
    readonly message: Schema.NonEmptyString;
}>;
/**
 * One model finding against a reviewed file.
 *
 * @category models
 * @since 0.1.0
 */
export type Finding = typeof Finding.Type;
/**
 * Explicit security coverage; an empty findings list alone proves nothing.
 * @since 1.0.0
 * @category schemas
 */
export declare const SecurityCompletion: Schema.Struct<{
    readonly status: Schema.Literals<readonly ["completed", "refused", "incomplete"]>;
    readonly coverage: Schema.$Array<Schema.Struct<{
        readonly checkId: Schema.NonEmptyString;
        readonly status: Schema.Literals<readonly ["completed", "incomplete"]>;
        readonly evidence: Schema.NonEmptyString;
    }>>;
    readonly missingContext: Schema.$Array<Schema.NonEmptyString>;
    readonly findings: Schema.$Array<Schema.Struct<{
        readonly file: Schema.NonEmptyString;
        readonly line: Schema.Int;
        readonly severity: Schema.Literals<readonly ["info", "warning", "error"]>;
        readonly security: Schema.optional<Schema.Struct<{
            readonly checkId: Schema.String;
            readonly impact: Schema.Literals<readonly ["low", "medium", "high", "critical"]>;
            readonly verification: Schema.Literals<readonly ["suspected", "confirmed"]>;
            readonly releaseRecommendation: Schema.Literals<readonly ["allow", "review", "block"]>;
            readonly attackerPreconditions: Schema.NonEmptyString;
            readonly evidence: Schema.NonEmptyString;
            readonly nextConfirmationStep: Schema.NonEmptyString;
            readonly reproduction: Schema.optional<Schema.Struct<{
                readonly revision: Schema.String;
                readonly command: Schema.NonEmptyString;
                readonly observedResult: Schema.NonEmptyString;
            }>>;
        }>>;
        readonly message: Schema.NonEmptyString;
    }>>;
}>;
/**
 * One bounded invocation receipt, including failed attempts and coverage.
 * @since 1.0.0
 * @category schemas
 */
export declare const ReviewAttempt: Schema.Struct<{
    readonly batch: Schema.Int;
    readonly pass: Schema.Int;
    readonly purpose: Schema.Literals<readonly ["review", "verify"]>;
    readonly candidate: Schema.optional<Schema.Int>;
    readonly engine: Schema.Literals<readonly ["claude", "codex"]>;
    readonly model: Schema.String;
    readonly attempt: Schema.Int;
    readonly status: Schema.Literals<readonly ["completed", "failed"]>;
    readonly message: Schema.String;
    readonly completion: Schema.optional<Schema.Struct<{
        readonly status: Schema.Literals<readonly ["completed", "refused", "incomplete"]>;
        readonly coverage: Schema.$Array<Schema.Struct<{
            readonly checkId: Schema.NonEmptyString;
            readonly status: Schema.Literals<readonly ["completed", "incomplete"]>;
            readonly evidence: Schema.NonEmptyString;
        }>>;
        readonly missingContext: Schema.$Array<Schema.NonEmptyString>;
        readonly findings: Schema.$Array<Schema.Struct<{
            readonly file: Schema.NonEmptyString;
            readonly line: Schema.Int;
            readonly severity: Schema.Literals<readonly ["info", "warning", "error"]>;
            readonly security: Schema.optional<Schema.Struct<{
                readonly checkId: Schema.String;
                readonly impact: Schema.Literals<readonly ["low", "medium", "high", "critical"]>;
                readonly verification: Schema.Literals<readonly ["suspected", "confirmed"]>;
                readonly releaseRecommendation: Schema.Literals<readonly ["allow", "review", "block"]>;
                readonly attackerPreconditions: Schema.NonEmptyString;
                readonly evidence: Schema.NonEmptyString;
                readonly nextConfirmationStep: Schema.NonEmptyString;
                readonly reproduction: Schema.optional<Schema.Struct<{
                    readonly revision: Schema.String;
                    readonly command: Schema.NonEmptyString;
                    readonly observedResult: Schema.NonEmptyString;
                }>>;
            }>>;
            readonly message: Schema.NonEmptyString;
        }>>;
    }>>;
}>;
/**
 * Result of one completed review: the reviewed changed paths and every
 * finding below the failOn threshold.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Report: Schema.Struct<{
    readonly files: Schema.$Array<Schema.String>;
    readonly findings: Schema.$Array<Schema.Struct<{
        readonly file: Schema.NonEmptyString;
        readonly line: Schema.Int;
        readonly severity: Schema.Literals<readonly ["info", "warning", "error"]>;
        readonly security: Schema.optional<Schema.Struct<{
            readonly checkId: Schema.String;
            readonly impact: Schema.Literals<readonly ["low", "medium", "high", "critical"]>;
            readonly verification: Schema.Literals<readonly ["suspected", "confirmed"]>;
            readonly releaseRecommendation: Schema.Literals<readonly ["allow", "review", "block"]>;
            readonly attackerPreconditions: Schema.NonEmptyString;
            readonly evidence: Schema.NonEmptyString;
            readonly nextConfirmationStep: Schema.NonEmptyString;
            readonly reproduction: Schema.optional<Schema.Struct<{
                readonly revision: Schema.String;
                readonly command: Schema.NonEmptyString;
                readonly observedResult: Schema.NonEmptyString;
            }>>;
        }>>;
        readonly message: Schema.NonEmptyString;
    }>>;
    readonly attempts: Schema.optional<Schema.$Array<Schema.Struct<{
        readonly batch: Schema.Int;
        readonly pass: Schema.Int;
        readonly purpose: Schema.Literals<readonly ["review", "verify"]>;
        readonly candidate: Schema.optional<Schema.Int>;
        readonly engine: Schema.Literals<readonly ["claude", "codex"]>;
        readonly model: Schema.String;
        readonly attempt: Schema.Int;
        readonly status: Schema.Literals<readonly ["completed", "failed"]>;
        readonly message: Schema.String;
        readonly completion: Schema.optional<Schema.Struct<{
            readonly status: Schema.Literals<readonly ["completed", "refused", "incomplete"]>;
            readonly coverage: Schema.$Array<Schema.Struct<{
                readonly checkId: Schema.NonEmptyString;
                readonly status: Schema.Literals<readonly ["completed", "incomplete"]>;
                readonly evidence: Schema.NonEmptyString;
            }>>;
            readonly missingContext: Schema.$Array<Schema.NonEmptyString>;
            readonly findings: Schema.$Array<Schema.Struct<{
                readonly file: Schema.NonEmptyString;
                readonly line: Schema.Int;
                readonly severity: Schema.Literals<readonly ["info", "warning", "error"]>;
                readonly security: Schema.optional<Schema.Struct<{
                    readonly checkId: Schema.String;
                    readonly impact: Schema.Literals<readonly ["low", "medium", "high", "critical"]>;
                    readonly verification: Schema.Literals<readonly ["suspected", "confirmed"]>;
                    readonly releaseRecommendation: Schema.Literals<readonly ["allow", "review", "block"]>;
                    readonly attackerPreconditions: Schema.NonEmptyString;
                    readonly evidence: Schema.NonEmptyString;
                    readonly nextConfirmationStep: Schema.NonEmptyString;
                    readonly reproduction: Schema.optional<Schema.Struct<{
                        readonly revision: Schema.String;
                        readonly command: Schema.NonEmptyString;
                        readonly observedResult: Schema.NonEmptyString;
                    }>>;
                }>>;
                readonly message: Schema.NonEmptyString;
            }>>;
        }>>;
    }>>>;
    /** What a budgeted review spent: model calls and estimated prompt tokens. */
    readonly usage: Schema.optional<Schema.Struct<{
        readonly modelCalls: Schema.Int;
        readonly promptTokens: Schema.Int;
    }>>;
    /** With a finding store: the persisted run, its provenance, and each finding's stable fingerprint. */
    readonly run: Schema.optional<Schema.String>;
    readonly manifest: Schema.optional<Schema.suspend<Schema.Codec<{
        readonly version: 1;
        readonly revisions?: {
            readonly base: string;
            readonly head: string;
        } | undefined;
        readonly policy: {
            readonly digest: string;
            readonly prompt: string;
            readonly rubric: string;
            readonly securityChecks?: readonly string[] | undefined;
            readonly failOn: "error" | "info" | "warning";
            readonly scope: "all" | "changed";
            readonly batchSize: number;
            readonly contextTokens: number;
        };
        readonly engine: {
            readonly transport: "cli" | "seat" | "tool-free";
            readonly seats: readonly {
                readonly engine: "claude" | "codex";
                readonly model: string;
            }[];
            readonly executable?: {
                readonly path: string;
                readonly sha256: string;
            } | undefined;
        };
        readonly context: readonly {
            readonly path: string;
            readonly sha256: string;
            readonly bytes: number;
        }[];
        readonly batches: readonly {
            readonly changed: readonly {
                readonly path: string;
                readonly deleted?: true | undefined;
                readonly firstLine: number;
                readonly lastLine: number;
                readonly sha256: string;
            }[];
            readonly related: readonly {
                readonly path: string;
                readonly sha256: string;
            }[];
            readonly omittedRelated: readonly string[];
        }[];
    }, {
        readonly version: 1;
        readonly revisions?: {
            readonly base: string;
            readonly head: string;
        } | undefined;
        readonly policy: {
            readonly digest: string;
            readonly prompt: string;
            readonly rubric: string;
            readonly securityChecks?: readonly string[] | undefined;
            readonly failOn: "error" | "info" | "warning";
            readonly scope: "all" | "changed";
            readonly batchSize: number;
            readonly contextTokens: number;
        };
        readonly engine: {
            readonly transport: "cli" | "seat" | "tool-free";
            readonly seats: readonly {
                readonly engine: "claude" | "codex";
                readonly model: string;
            }[];
            readonly executable?: {
                readonly path: string;
                readonly sha256: string;
            } | undefined;
        };
        readonly context: readonly {
            readonly path: string;
            readonly sha256: string;
            readonly bytes: number;
        }[];
        readonly batches: readonly {
            readonly changed: readonly {
                readonly path: string;
                readonly deleted?: true | undefined;
                readonly firstLine: number;
                readonly lastLine: number;
                readonly sha256: string;
            }[];
            readonly related: readonly {
                readonly path: string;
                readonly sha256: string;
            }[];
            readonly omittedRelated: readonly string[];
        }[];
    }, never, never>>>;
    readonly fingerprints: Schema.optional<Schema.$Array<Schema.String>>;
}>;
/**
 * Result of one completed review.
 *
 * @category models
 * @since 0.1.0
 */
export type Report = typeof Report.Type;
declare const ModelCliMissing_base: Schema.Class<ModelCliMissing, Schema.TaggedStruct<"smithers-build/ModelCliMissing", {
    readonly engine: Schema.Literals<readonly ["claude", "codex"]>;
    readonly executable: Schema.NonEmptyString;
    readonly message: Schema.NonEmptyString;
}>, Cause.YieldableError>;
/**
 * The engine CLI executable was not found on the host.
 *
 * `engine` names the engine the review selected and `executable` the binary
 * that was not found.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class ModelCliMissing extends ModelCliMissing_base {
}
declare const LlmReviewError_base: Schema.Class<LlmReviewError, Schema.TaggedStruct<"smithers-build/LlmReviewError", {
    readonly phase: Schema.Literals<readonly ["diff", "read", "review", "parse", "store"]>;
    readonly attempts: Schema.optional<Schema.$Array<Schema.Struct<{
        readonly batch: Schema.Int;
        readonly pass: Schema.Int;
        readonly purpose: Schema.Literals<readonly ["review", "verify"]>;
        readonly candidate: Schema.optional<Schema.Int>;
        readonly engine: Schema.Literals<readonly ["claude", "codex"]>;
        readonly model: Schema.String;
        readonly attempt: Schema.Int;
        readonly status: Schema.Literals<readonly ["completed", "failed"]>;
        readonly message: Schema.String;
        readonly completion: Schema.optional<Schema.Struct<{
            readonly status: Schema.Literals<readonly ["completed", "refused", "incomplete"]>;
            readonly coverage: Schema.$Array<Schema.Struct<{
                readonly checkId: Schema.NonEmptyString;
                readonly status: Schema.Literals<readonly ["completed", "incomplete"]>;
                readonly evidence: Schema.NonEmptyString;
            }>>;
            readonly missingContext: Schema.$Array<Schema.NonEmptyString>;
            readonly findings: Schema.$Array<Schema.Struct<{
                readonly file: Schema.NonEmptyString;
                readonly line: Schema.Int;
                readonly severity: Schema.Literals<readonly ["info", "warning", "error"]>;
                readonly security: Schema.optional<Schema.Struct<{
                    readonly checkId: Schema.String;
                    readonly impact: Schema.Literals<readonly ["low", "medium", "high", "critical"]>;
                    readonly verification: Schema.Literals<readonly ["suspected", "confirmed"]>;
                    readonly releaseRecommendation: Schema.Literals<readonly ["allow", "review", "block"]>;
                    readonly attackerPreconditions: Schema.NonEmptyString;
                    readonly evidence: Schema.NonEmptyString;
                    readonly nextConfirmationStep: Schema.NonEmptyString;
                    readonly reproduction: Schema.optional<Schema.Struct<{
                        readonly revision: Schema.String;
                        readonly command: Schema.NonEmptyString;
                        readonly observedResult: Schema.NonEmptyString;
                    }>>;
                }>>;
                readonly message: Schema.NonEmptyString;
            }>>;
        }>>;
    }>>>;
    readonly message: Schema.NonEmptyString;
}>, Cause.YieldableError>;
/**
 * A review round failed before producing findings: the git diff, a file read,
 * the engine CLI call, or response parsing.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class LlmReviewError extends LlmReviewError_base {
}
declare const FindingsError_base: Schema.Class<FindingsError, Schema.TaggedStruct<"smithers-build/FindingsError", {
    readonly failOn: Schema.Literals<readonly ["info", "warning", "error"]>;
    readonly attempts: Schema.optional<Schema.$Array<Schema.Struct<{
        readonly batch: Schema.Int;
        readonly pass: Schema.Int;
        readonly purpose: Schema.Literals<readonly ["review", "verify"]>;
        readonly candidate: Schema.optional<Schema.Int>;
        readonly engine: Schema.Literals<readonly ["claude", "codex"]>;
        readonly model: Schema.String;
        readonly attempt: Schema.Int;
        readonly status: Schema.Literals<readonly ["completed", "failed"]>;
        readonly message: Schema.String;
        readonly completion: Schema.optional<Schema.Struct<{
            readonly status: Schema.Literals<readonly ["completed", "refused", "incomplete"]>;
            readonly coverage: Schema.$Array<Schema.Struct<{
                readonly checkId: Schema.NonEmptyString;
                readonly status: Schema.Literals<readonly ["completed", "incomplete"]>;
                readonly evidence: Schema.NonEmptyString;
            }>>;
            readonly missingContext: Schema.$Array<Schema.NonEmptyString>;
            readonly findings: Schema.$Array<Schema.Struct<{
                readonly file: Schema.NonEmptyString;
                readonly line: Schema.Int;
                readonly severity: Schema.Literals<readonly ["info", "warning", "error"]>;
                readonly security: Schema.optional<Schema.Struct<{
                    readonly checkId: Schema.String;
                    readonly impact: Schema.Literals<readonly ["low", "medium", "high", "critical"]>;
                    readonly verification: Schema.Literals<readonly ["suspected", "confirmed"]>;
                    readonly releaseRecommendation: Schema.Literals<readonly ["allow", "review", "block"]>;
                    readonly attackerPreconditions: Schema.NonEmptyString;
                    readonly evidence: Schema.NonEmptyString;
                    readonly nextConfirmationStep: Schema.NonEmptyString;
                    readonly reproduction: Schema.optional<Schema.Struct<{
                        readonly revision: Schema.String;
                        readonly command: Schema.NonEmptyString;
                        readonly observedResult: Schema.NonEmptyString;
                    }>>;
                }>>;
                readonly message: Schema.NonEmptyString;
            }>>;
        }>>;
    }>>>;
    readonly findings: Schema.$Array<Schema.Struct<{
        readonly file: Schema.NonEmptyString;
        readonly line: Schema.Int;
        readonly severity: Schema.Literals<readonly ["info", "warning", "error"]>;
        readonly security: Schema.optional<Schema.Struct<{
            readonly checkId: Schema.String;
            readonly impact: Schema.Literals<readonly ["low", "medium", "high", "critical"]>;
            readonly verification: Schema.Literals<readonly ["suspected", "confirmed"]>;
            readonly releaseRecommendation: Schema.Literals<readonly ["allow", "review", "block"]>;
            readonly attackerPreconditions: Schema.NonEmptyString;
            readonly evidence: Schema.NonEmptyString;
            readonly nextConfirmationStep: Schema.NonEmptyString;
            readonly reproduction: Schema.optional<Schema.Struct<{
                readonly revision: Schema.String;
                readonly command: Schema.NonEmptyString;
                readonly observedResult: Schema.NonEmptyString;
            }>>;
        }>>;
        readonly message: Schema.NonEmptyString;
    }>>;
    readonly run: Schema.optional<Schema.String>;
    readonly manifest: Schema.optional<Schema.suspend<Schema.Codec<{
        readonly version: 1;
        readonly revisions?: {
            readonly base: string;
            readonly head: string;
        } | undefined;
        readonly policy: {
            readonly digest: string;
            readonly prompt: string;
            readonly rubric: string;
            readonly securityChecks?: readonly string[] | undefined;
            readonly failOn: "error" | "info" | "warning";
            readonly scope: "all" | "changed";
            readonly batchSize: number;
            readonly contextTokens: number;
        };
        readonly engine: {
            readonly transport: "cli" | "seat" | "tool-free";
            readonly seats: readonly {
                readonly engine: "claude" | "codex";
                readonly model: string;
            }[];
            readonly executable?: {
                readonly path: string;
                readonly sha256: string;
            } | undefined;
        };
        readonly context: readonly {
            readonly path: string;
            readonly sha256: string;
            readonly bytes: number;
        }[];
        readonly batches: readonly {
            readonly changed: readonly {
                readonly path: string;
                readonly deleted?: true | undefined;
                readonly firstLine: number;
                readonly lastLine: number;
                readonly sha256: string;
            }[];
            readonly related: readonly {
                readonly path: string;
                readonly sha256: string;
            }[];
            readonly omittedRelated: readonly string[];
        }[];
    }, {
        readonly version: 1;
        readonly revisions?: {
            readonly base: string;
            readonly head: string;
        } | undefined;
        readonly policy: {
            readonly digest: string;
            readonly prompt: string;
            readonly rubric: string;
            readonly securityChecks?: readonly string[] | undefined;
            readonly failOn: "error" | "info" | "warning";
            readonly scope: "all" | "changed";
            readonly batchSize: number;
            readonly contextTokens: number;
        };
        readonly engine: {
            readonly transport: "cli" | "seat" | "tool-free";
            readonly seats: readonly {
                readonly engine: "claude" | "codex";
                readonly model: string;
            }[];
            readonly executable?: {
                readonly path: string;
                readonly sha256: string;
            } | undefined;
        };
        readonly context: readonly {
            readonly path: string;
            readonly sha256: string;
            readonly bytes: number;
        }[];
        readonly batches: readonly {
            readonly changed: readonly {
                readonly path: string;
                readonly deleted?: true | undefined;
                readonly firstLine: number;
                readonly lastLine: number;
                readonly sha256: string;
            }[];
            readonly related: readonly {
                readonly path: string;
                readonly sha256: string;
            }[];
            readonly omittedRelated: readonly string[];
        }[];
    }, never, never>>>;
    readonly fingerprints: Schema.optional<Schema.$Array<Schema.String>>;
}>, Cause.YieldableError>;
/**
 * The review completed and at least one finding met the failOn threshold.
 *
 * `findings` carries the complete set, not only the failing ones.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class FindingsError extends FindingsError_base {
}
/**
 * Provenance of one review: every byte each request carried, the policy, the
 * immutable revisions, the inference engine and model configuration, and the
 * batch layout. Its SHA-256 digest is the review's run id.
 *
 * @category schemas
 * @since 1.0.0
 */
export declare const ReviewManifest: Schema.Struct<{
    readonly version: Schema.Literal<1>;
    readonly revisions: Schema.optional<Schema.Struct<{
        readonly base: Schema.String;
        readonly head: Schema.String;
    }>>;
    readonly policy: Schema.Struct<{
        readonly digest: Schema.String;
        readonly prompt: Schema.String;
        readonly rubric: Schema.String;
        readonly securityChecks: Schema.optional<Schema.$Array<Schema.String>>;
        readonly failOn: Schema.Literals<readonly ["info", "warning", "error"]>;
        readonly scope: Schema.Literals<readonly ["changed", "all"]>;
        readonly batchSize: Schema.Int;
        readonly contextTokens: Schema.Int;
    }>;
    readonly engine: Schema.Struct<{
        /** `seat` is a host {@link ReviewTransport}; `cli` an explicit executable; otherwise `tool-free`. */
        readonly transport: Schema.Literals<readonly ["tool-free", "cli", "seat"]>;
        readonly seats: Schema.$Array<Schema.Struct<{
            readonly engine: Schema.Literals<readonly ["claude", "codex"]>;
            readonly model: Schema.String;
        }>>;
        readonly executable: Schema.optional<Schema.Struct<{
            readonly path: Schema.String;
            readonly sha256: Schema.String;
        }>>;
    }>;
    readonly context: Schema.$Array<Schema.Struct<{
        readonly path: Schema.String;
        readonly sha256: Schema.String;
        readonly bytes: Schema.Int;
    }>>;
    readonly batches: Schema.$Array<Schema.Struct<{
        readonly changed: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            /** Present when the change deletes the file; its bytes are the base revision's. */
            readonly deleted: Schema.optional<Schema.Literal<true>>;
            readonly firstLine: Schema.Int;
            readonly lastLine: Schema.Int;
            readonly sha256: Schema.String;
        }>>;
        readonly related: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly sha256: Schema.String;
        }>>;
        readonly omittedRelated: Schema.$Array<Schema.String>;
    }>>;
}>;
/**
 * Provenance of one review.
 *
 * @category models
 * @since 1.0.0
 */
export type ReviewManifest = typeof ReviewManifest.Type;
/**
 * Where a review persists its run and findings, and who owns them.
 *
 * `directory` is an absolute path the review creates readable only by its
 * owner. `owner` names the responsible target or team on every record.
 *
 * @category models
 * @since 1.0.0
 */
export interface FindingStore {
    readonly directory: string;
    readonly owner?: string | undefined;
}
/**
 * One persisted finding: its stable fingerprint, owner, remediation state and
 * the private finding itself. `open` findings were reported by the latest run
 * of the same owner and policy that reviewed their file; `fixed-pending-retest`
 * ones were not; only a trusted host's reproduction receipt of the fix closes one.
 *
 * @category schemas
 * @since 1.0.0
 */
export declare const FindingRecord: Schema.Struct<{
    readonly fingerprint: Schema.String;
    readonly owner: Schema.optional<Schema.String>;
    /** Digest of the prompt, rubric and checks that reported it; only the same policy can retire it. */
    readonly policy: Schema.String;
    readonly state: Schema.Literals<readonly ["open", "fixed-pending-retest", "closed"]>;
    readonly reproductionSteps: Schema.String;
    readonly firstSeenRun: Schema.String;
    readonly lastSeenRun: Schema.String;
    readonly updatedAt: Schema.String;
    readonly finding: Schema.Struct<{
        readonly file: Schema.NonEmptyString;
        readonly line: Schema.Int;
        readonly severity: Schema.Literals<readonly ["info", "warning", "error"]>;
        readonly security: Schema.optional<Schema.Struct<{
            readonly checkId: Schema.String;
            readonly impact: Schema.Literals<readonly ["low", "medium", "high", "critical"]>;
            readonly verification: Schema.Literals<readonly ["suspected", "confirmed"]>;
            readonly releaseRecommendation: Schema.Literals<readonly ["allow", "review", "block"]>;
            readonly attackerPreconditions: Schema.NonEmptyString;
            readonly evidence: Schema.NonEmptyString;
            readonly nextConfirmationStep: Schema.NonEmptyString;
            readonly reproduction: Schema.optional<Schema.Struct<{
                readonly revision: Schema.String;
                readonly command: Schema.NonEmptyString;
                readonly observedResult: Schema.NonEmptyString;
            }>>;
        }>>;
        readonly message: Schema.NonEmptyString;
    }>;
    readonly closure: Schema.optional<Schema.Struct<{
        readonly revision: Schema.String;
        readonly command: Schema.NonEmptyString;
        readonly observedResult: Schema.NonEmptyString;
    }>>;
}>;
/**
 * One persisted finding.
 *
 * @category models
 * @since 1.0.0
 */
export type FindingRecord = typeof FindingRecord.Type;
/**
 * One persisted review run. A run records every completed batch as it
 * finishes; an `incomplete` or `failed` run resumes from them, a `completed`
 * run never does.
 *
 * @category schemas
 * @since 1.0.0
 */
export declare const RunRecord: Schema.Struct<{
    readonly run: Schema.String;
    readonly manifest: Schema.Struct<{
        readonly version: Schema.Literal<1>;
        readonly revisions: Schema.optional<Schema.Struct<{
            readonly base: Schema.String;
            readonly head: Schema.String;
        }>>;
        readonly policy: Schema.Struct<{
            readonly digest: Schema.String;
            readonly prompt: Schema.String;
            readonly rubric: Schema.String;
            readonly securityChecks: Schema.optional<Schema.$Array<Schema.String>>;
            readonly failOn: Schema.Literals<readonly ["info", "warning", "error"]>;
            readonly scope: Schema.Literals<readonly ["changed", "all"]>;
            readonly batchSize: Schema.Int;
            readonly contextTokens: Schema.Int;
        }>;
        readonly engine: Schema.Struct<{
            /** `seat` is a host {@link ReviewTransport}; `cli` an explicit executable; otherwise `tool-free`. */
            readonly transport: Schema.Literals<readonly ["tool-free", "cli", "seat"]>;
            readonly seats: Schema.$Array<Schema.Struct<{
                readonly engine: Schema.Literals<readonly ["claude", "codex"]>;
                readonly model: Schema.String;
            }>>;
            readonly executable: Schema.optional<Schema.Struct<{
                readonly path: Schema.String;
                readonly sha256: Schema.String;
            }>>;
        }>;
        readonly context: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly sha256: Schema.String;
            readonly bytes: Schema.Int;
        }>>;
        readonly batches: Schema.$Array<Schema.Struct<{
            readonly changed: Schema.$Array<Schema.Struct<{
                readonly path: Schema.String;
                /** Present when the change deletes the file; its bytes are the base revision's. */
                readonly deleted: Schema.optional<Schema.Literal<true>>;
                readonly firstLine: Schema.Int;
                readonly lastLine: Schema.Int;
                readonly sha256: Schema.String;
            }>>;
            readonly related: Schema.$Array<Schema.Struct<{
                readonly path: Schema.String;
                readonly sha256: Schema.String;
            }>>;
            readonly omittedRelated: Schema.$Array<Schema.String>;
        }>>;
    }>;
    readonly owner: Schema.optional<Schema.String>;
    readonly status: Schema.Literals<readonly ["running", "incomplete", "failed", "completed"]>;
    readonly total: Schema.Int;
    readonly batches: Schema.$Array<Schema.Struct<{
        readonly index: Schema.Int;
        readonly files: Schema.$Array<Schema.String>;
        readonly findings: Schema.$Array<Schema.Struct<{
            readonly file: Schema.NonEmptyString;
            readonly line: Schema.Int;
            readonly severity: Schema.Literals<readonly ["info", "warning", "error"]>;
            readonly security: Schema.optional<Schema.Struct<{
                readonly checkId: Schema.String;
                readonly impact: Schema.Literals<readonly ["low", "medium", "high", "critical"]>;
                readonly verification: Schema.Literals<readonly ["suspected", "confirmed"]>;
                readonly releaseRecommendation: Schema.Literals<readonly ["allow", "review", "block"]>;
                readonly attackerPreconditions: Schema.NonEmptyString;
                readonly evidence: Schema.NonEmptyString;
                readonly nextConfirmationStep: Schema.NonEmptyString;
                readonly reproduction: Schema.optional<Schema.Struct<{
                    readonly revision: Schema.String;
                    readonly command: Schema.NonEmptyString;
                    readonly observedResult: Schema.NonEmptyString;
                }>>;
            }>>;
            readonly message: Schema.NonEmptyString;
        }>>;
        readonly attempts: Schema.$Array<Schema.Struct<{
            readonly batch: Schema.Int;
            readonly pass: Schema.Int;
            readonly purpose: Schema.Literals<readonly ["review", "verify"]>;
            readonly candidate: Schema.optional<Schema.Int>;
            readonly engine: Schema.Literals<readonly ["claude", "codex"]>;
            readonly model: Schema.String;
            readonly attempt: Schema.Int;
            readonly status: Schema.Literals<readonly ["completed", "failed"]>;
            readonly message: Schema.String;
            readonly completion: Schema.optional<Schema.Struct<{
                readonly status: Schema.Literals<readonly ["completed", "refused", "incomplete"]>;
                readonly coverage: Schema.$Array<Schema.Struct<{
                    readonly checkId: Schema.NonEmptyString;
                    readonly status: Schema.Literals<readonly ["completed", "incomplete"]>;
                    readonly evidence: Schema.NonEmptyString;
                }>>;
                readonly missingContext: Schema.$Array<Schema.NonEmptyString>;
                readonly findings: Schema.$Array<Schema.Struct<{
                    readonly file: Schema.NonEmptyString;
                    readonly line: Schema.Int;
                    readonly severity: Schema.Literals<readonly ["info", "warning", "error"]>;
                    readonly security: Schema.optional<Schema.Struct<{
                        readonly checkId: Schema.String;
                        readonly impact: Schema.Literals<readonly ["low", "medium", "high", "critical"]>;
                        readonly verification: Schema.Literals<readonly ["suspected", "confirmed"]>;
                        readonly releaseRecommendation: Schema.Literals<readonly ["allow", "review", "block"]>;
                        readonly attackerPreconditions: Schema.NonEmptyString;
                        readonly evidence: Schema.NonEmptyString;
                        readonly nextConfirmationStep: Schema.NonEmptyString;
                        readonly reproduction: Schema.optional<Schema.Struct<{
                            readonly revision: Schema.String;
                            readonly command: Schema.NonEmptyString;
                            readonly observedResult: Schema.NonEmptyString;
                        }>>;
                    }>>;
                    readonly message: Schema.NonEmptyString;
                }>>;
            }>>;
        }>>;
    }>>;
    /** Model calls and estimated prompt tokens spent across every invocation of this run. */
    readonly usage: Schema.Struct<{
        readonly modelCalls: Schema.Int;
        readonly promptTokens: Schema.Int;
        /** Measured elapsed time; legacy runs measure only the time since their upgrade. */
        readonly elapsedMs: Schema.Int;
        /** Historical elapsed time was not recorded. Such a run cannot resume under a wall budget. */
        readonly legacyElapsedUnknown: Schema.optional<Schema.Literal<true>>;
    }>;
    readonly error: Schema.optional<Schema.String>;
    readonly startedAt: Schema.String;
    readonly updatedAt: Schema.String;
}>;
/**
 * One persisted review run.
 *
 * @category models
 * @since 1.0.0
 */
export type RunRecord = typeof RunRecord.Type;
/**
 * What a public issue may say about a restricted finding: no message, evidence
 * or preconditions, and its location only after the fix is reproduced.
 *
 * @category models
 * @since 1.0.0
 */
export interface PublicSummary {
    readonly fingerprint: string;
    readonly reference: string;
    readonly state: FindingRecord["state"];
    readonly severity: Severity;
    readonly owner?: string;
    readonly checkId?: string;
    readonly impact?: SecurityEvidence["impact"];
    readonly file?: string;
}
/**
 * Evidence and receipts a trusted host attaches to a security finding.
 *
 * @category models
 * @since 1.0.0
 */
export type SecurityEvidence = typeof SecurityEvidence.Type;
/**
 * The sanitized, disclosable view of one persisted finding.
 *
 * @category store
 * @since 1.0.0
 */
export declare const publicSummary: (record: FindingRecord) => PublicSummary;
/**
 * Every finding persisted in a store, in fingerprint order.
 *
 * @category store
 * @since 1.0.0
 */
export declare const storedFindings: (directory: string) => Effect.Effect<ReadonlyArray<FindingRecord>, LlmReviewError>;
/**
 * Closes a finding whose fix a trusted host reproduced: the finding must be
 * `fixed-pending-retest`, and the receipt records the executed retest at an
 * immutable revision. Model output is never a receipt.
 *
 * @category store
 * @since 1.0.0
 */
export declare const closeFinding: (directory: string, fingerprint: string, receipt: typeof Reproduction.Type) => Effect.Effect<FindingRecord, LlmReviewError>;
/**
 * Every failure an llm-review call can produce.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const ReviewError: Schema.Union<readonly [typeof ModelCliMissing, typeof LlmReviewError, typeof FindingsError]>;
/**
 * Every failure an llm-review call can produce.
 *
 * @category models
 * @since 0.1.0
 */
export type ReviewError = typeof ReviewError.Type;
/**
 * Aggregate limits over one review: model calls, estimated prompt tokens
 * (three bytes per token, the review's cost measure), and wall-clock time
 * across every call. Exhausting any of them fails the review.
 *
 * @category schemas
 * @since 1.0.0
 */
export declare const ReviewBudget: Schema.Struct<{
    readonly modelCalls: Schema.optional<Schema.Int>;
    readonly promptTokens: Schema.optional<Schema.Int>;
    readonly wallMs: Schema.optional<Schema.Int>;
}>;
/**
 * Aggregate limits over one review.
 *
 * @category models
 * @since 1.0.0
 */
export type ReviewBudget = typeof ReviewBudget.Type;
/**
 * Payload for one llm-review call.
 *
 * `base` is the git revision the diff runs against. `include` globs match
 * workspace-relative changed paths; a changed path the workspace no longer
 * holds is reviewed as deleted, with its base contents. `context` globs are read on every round
 * and appended to every batch prompt whether or not they changed.
 * `batchSize` caps how many changed files one model call reviews; related
 * changed files share a call, and unchanged included files they import or
 * are imported by travel with them. `contextTokens` is the selected model's
 * context window (default {@link defaultContextTokens}); every call fits it
 * with output capacity reserved, splitting an oversized file at top-level
 * symbol boundaries.
 * `failOn` is the severity that fails a generic review. With `securityChecks`,
 * findings require declared checks (including `general`) and structured evidence; release advice gates
 * the review instead of `failOn`. Model confirmation claims are never trusted.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Payload: Schema.Struct<{
    readonly base: Schema.NonEmptyString;
    readonly include: Schema.$Array<Schema.TaggedStruct<"Glob", {
        readonly pattern: Schema.NonEmptyString;
        readonly exclude: Schema.$Array<Schema.String>;
    }>>;
    readonly context: Schema.$Array<Schema.TaggedStruct<"Glob", {
        readonly pattern: Schema.NonEmptyString;
        readonly exclude: Schema.$Array<Schema.String>;
    }>>;
    readonly prompt: Schema.String;
    readonly rubric: Schema.String;
    readonly engine: Schema.Literals<readonly ["claude", "codex"]>;
    readonly model: Schema.NonEmptyString;
    readonly batchSize: Schema.Int;
    readonly failOn: Schema.Literals<readonly ["info", "warning", "error"]>;
    readonly securityChecks: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
    readonly contextTokens: Schema.optional<Schema.Int>;
    /**
     * A required review cannot pass without reviewing something: an empty
     * selection or a missing model executable fails it instead of passing or
     * skipping.
     */
    readonly required: Schema.optional<Schema.Boolean>;
    readonly budget: Schema.optional<Schema.Struct<{
        readonly modelCalls: Schema.optional<Schema.Int>;
        readonly promptTokens: Schema.optional<Schema.Int>;
        readonly wallMs: Schema.optional<Schema.Int>;
    }>>;
    /**
     * `changed` (the default) reviews the paths that differ from `base`. `all`
     * reviews every tracked or untracked, non-ignored path the include globs
     * match, whether or not it changed; `base` is then unused.
     */
    readonly scope: Schema.optional<Schema.Literals<readonly ["changed", "all"]>>;
}>;
/**
 * Payload for one llm-review call.
 *
 * @category models
 * @since 0.1.0
 */
export type Payload = typeof Payload.Type;
/**
 * The one sealed model action reviewing every batch of changed files.
 *
 * @category actions
 * @since 0.1.0
 */
export declare const LlmReview: Action.Declared<"smithers-build/llm-review", Schema.Struct<{
    readonly base: Schema.NonEmptyString;
    readonly include: Schema.$Array<Schema.TaggedStruct<"Glob", {
        readonly pattern: Schema.NonEmptyString;
        readonly exclude: Schema.$Array<Schema.String>;
    }>>;
    readonly context: Schema.$Array<Schema.TaggedStruct<"Glob", {
        readonly pattern: Schema.NonEmptyString;
        readonly exclude: Schema.$Array<Schema.String>;
    }>>;
    readonly prompt: Schema.String;
    readonly rubric: Schema.String;
    readonly engine: Schema.Literals<readonly ["claude", "codex"]>;
    readonly model: Schema.NonEmptyString;
    readonly batchSize: Schema.Int;
    readonly failOn: Schema.Literals<readonly ["info", "warning", "error"]>;
    readonly securityChecks: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
    readonly contextTokens: Schema.optional<Schema.Int>;
    /**
     * A required review cannot pass without reviewing something: an empty
     * selection or a missing model executable fails it instead of passing or
     * skipping.
     */
    readonly required: Schema.optional<Schema.Boolean>;
    readonly budget: Schema.optional<Schema.Struct<{
        readonly modelCalls: Schema.optional<Schema.Int>;
        readonly promptTokens: Schema.optional<Schema.Int>;
        readonly wallMs: Schema.optional<Schema.Int>;
    }>>;
    /**
     * `changed` (the default) reviews the paths that differ from `base`. `all`
     * reviews every tracked or untracked, non-ignored path the include globs
     * match, whether or not it changed; `base` is then unused.
     */
    readonly scope: Schema.optional<Schema.Literals<readonly ["changed", "all"]>>;
}>, Schema.Struct<{
    readonly files: Schema.$Array<Schema.String>;
    readonly findings: Schema.$Array<Schema.Struct<{
        readonly file: Schema.NonEmptyString;
        readonly line: Schema.Int;
        readonly severity: Schema.Literals<readonly ["info", "warning", "error"]>;
        readonly security: Schema.optional<Schema.Struct<{
            readonly checkId: Schema.String;
            readonly impact: Schema.Literals<readonly ["low", "medium", "high", "critical"]>;
            readonly verification: Schema.Literals<readonly ["suspected", "confirmed"]>;
            readonly releaseRecommendation: Schema.Literals<readonly ["allow", "review", "block"]>;
            readonly attackerPreconditions: Schema.NonEmptyString;
            readonly evidence: Schema.NonEmptyString;
            readonly nextConfirmationStep: Schema.NonEmptyString;
            readonly reproduction: Schema.optional<Schema.Struct<{
                readonly revision: Schema.String;
                readonly command: Schema.NonEmptyString;
                readonly observedResult: Schema.NonEmptyString;
            }>>;
        }>>;
        readonly message: Schema.NonEmptyString;
    }>>;
    readonly attempts: Schema.optional<Schema.$Array<Schema.Struct<{
        readonly batch: Schema.Int;
        readonly pass: Schema.Int;
        readonly purpose: Schema.Literals<readonly ["review", "verify"]>;
        readonly candidate: Schema.optional<Schema.Int>;
        readonly engine: Schema.Literals<readonly ["claude", "codex"]>;
        readonly model: Schema.String;
        readonly attempt: Schema.Int;
        readonly status: Schema.Literals<readonly ["completed", "failed"]>;
        readonly message: Schema.String;
        readonly completion: Schema.optional<Schema.Struct<{
            readonly status: Schema.Literals<readonly ["completed", "refused", "incomplete"]>;
            readonly coverage: Schema.$Array<Schema.Struct<{
                readonly checkId: Schema.NonEmptyString;
                readonly status: Schema.Literals<readonly ["completed", "incomplete"]>;
                readonly evidence: Schema.NonEmptyString;
            }>>;
            readonly missingContext: Schema.$Array<Schema.NonEmptyString>;
            readonly findings: Schema.$Array<Schema.Struct<{
                readonly file: Schema.NonEmptyString;
                readonly line: Schema.Int;
                readonly severity: Schema.Literals<readonly ["info", "warning", "error"]>;
                readonly security: Schema.optional<Schema.Struct<{
                    readonly checkId: Schema.String;
                    readonly impact: Schema.Literals<readonly ["low", "medium", "high", "critical"]>;
                    readonly verification: Schema.Literals<readonly ["suspected", "confirmed"]>;
                    readonly releaseRecommendation: Schema.Literals<readonly ["allow", "review", "block"]>;
                    readonly attackerPreconditions: Schema.NonEmptyString;
                    readonly evidence: Schema.NonEmptyString;
                    readonly nextConfirmationStep: Schema.NonEmptyString;
                    readonly reproduction: Schema.optional<Schema.Struct<{
                        readonly revision: Schema.String;
                        readonly command: Schema.NonEmptyString;
                        readonly observedResult: Schema.NonEmptyString;
                    }>>;
                }>>;
                readonly message: Schema.NonEmptyString;
            }>>;
        }>>;
    }>>>;
    /** What a budgeted review spent: model calls and estimated prompt tokens. */
    readonly usage: Schema.optional<Schema.Struct<{
        readonly modelCalls: Schema.Int;
        readonly promptTokens: Schema.Int;
    }>>;
    /** With a finding store: the persisted run, its provenance, and each finding's stable fingerprint. */
    readonly run: Schema.optional<Schema.String>;
    readonly manifest: Schema.optional<Schema.suspend<Schema.Codec<{
        readonly version: 1;
        readonly revisions?: {
            readonly base: string;
            readonly head: string;
        } | undefined;
        readonly policy: {
            readonly digest: string;
            readonly prompt: string;
            readonly rubric: string;
            readonly securityChecks?: readonly string[] | undefined;
            readonly failOn: "error" | "info" | "warning";
            readonly scope: "all" | "changed";
            readonly batchSize: number;
            readonly contextTokens: number;
        };
        readonly engine: {
            readonly transport: "cli" | "seat" | "tool-free";
            readonly seats: readonly {
                readonly engine: "claude" | "codex";
                readonly model: string;
            }[];
            readonly executable?: {
                readonly path: string;
                readonly sha256: string;
            } | undefined;
        };
        readonly context: readonly {
            readonly path: string;
            readonly sha256: string;
            readonly bytes: number;
        }[];
        readonly batches: readonly {
            readonly changed: readonly {
                readonly path: string;
                readonly deleted?: true | undefined;
                readonly firstLine: number;
                readonly lastLine: number;
                readonly sha256: string;
            }[];
            readonly related: readonly {
                readonly path: string;
                readonly sha256: string;
            }[];
            readonly omittedRelated: readonly string[];
        }[];
    }, {
        readonly version: 1;
        readonly revisions?: {
            readonly base: string;
            readonly head: string;
        } | undefined;
        readonly policy: {
            readonly digest: string;
            readonly prompt: string;
            readonly rubric: string;
            readonly securityChecks?: readonly string[] | undefined;
            readonly failOn: "error" | "info" | "warning";
            readonly scope: "all" | "changed";
            readonly batchSize: number;
            readonly contextTokens: number;
        };
        readonly engine: {
            readonly transport: "cli" | "seat" | "tool-free";
            readonly seats: readonly {
                readonly engine: "claude" | "codex";
                readonly model: string;
            }[];
            readonly executable?: {
                readonly path: string;
                readonly sha256: string;
            } | undefined;
        };
        readonly context: readonly {
            readonly path: string;
            readonly sha256: string;
            readonly bytes: number;
        }[];
        readonly batches: readonly {
            readonly changed: readonly {
                readonly path: string;
                readonly deleted?: true | undefined;
                readonly firstLine: number;
                readonly lastLine: number;
                readonly sha256: string;
            }[];
            readonly related: readonly {
                readonly path: string;
                readonly sha256: string;
            }[];
            readonly omittedRelated: readonly string[];
        }[];
    }, never, never>>>;
    readonly fingerprints: Schema.optional<Schema.$Array<Schema.String>>;
}>, Schema.Union<readonly [typeof ModelCliMissing, typeof LlmReviewError, typeof FindingsError]>, Action.Requirement<"smithers-build/llm-review">>;
/**
 * Value-free discovery delivered to a trusted host's private rotation workflow.
 * @category models
 * @since 1.0.0
 */
export interface CredentialDiscovery {
    readonly file: string;
    readonly line: number;
    readonly name: string;
}
/**
 * The document a review host writes to a trusted private rotation receiver:
 * the reviewed commit and each discovery's name and location, with no value,
 * file contents, provider output or diagnostics. `file` is a normalized
 * workspace path and `name` a credential name or kind, either of which may
 * carry a `<credential:kind:n>` placeholder where it spelled a detected value.
 * Receivers in other languages pin its JSON Schema, `Node.schemaIdentity` from
 * `@smthrs/plan/Node` with `onExcessProperty: "error"`: the document that does
 * not change with the installed `effect` release.
 * @category schemas
 * @since 1.0.0
 */
export declare const CredentialDelivery: Schema.Struct<{
    readonly revision: Schema.String;
    readonly discoveries: Schema.$Array<Schema.Struct<{
        readonly file: Schema.String;
        readonly line: Schema.Int;
        readonly name: Schema.String;
    }>>;
}>;
/**
 * The document a review host writes to a trusted private rotation receiver.
 * @category models
 * @since 1.0.0
 */
export type CredentialDelivery = typeof CredentialDelivery.Type;
/**
 * Masks credentials a standalone text reveals, such as a path or diagnostic
 * that never passed through a review's scan. Values become typed placeholders.
 *
 * @category execution
 * @since 1.0.0
 */
export declare const redactCredentials: (text: string) => string;
/**
 * Attempt receipts without their completion envelopes or messages, which can carry finding evidence.
 *
 * @category execution
 * @since 1.0.0
 */
export declare const publicAttempts: (attempts: ReadonlyArray<typeof ReviewAttempt.Type> | undefined) => {
    batch: number;
    pass: number;
    purpose: "review" | "verify";
    candidate?: number | undefined;
    engine: "claude" | "codex";
    model: string;
    attempt: number;
    status: "completed" | "failed";
}[] | undefined;
/**
 * A failed review's disclosable form, for every host that prints or returns it:
 * parse failures can quote model output, so their text stays in the private run
 * record; every other message is credential-masked.
 *
 * @category execution
 * @since 1.0.0
 */
export declare const publicError: (error: LlmReviewError | ModelCliMissing) => ModelCliMissing | {
    _tag: "smithers-build/LlmReviewError";
    phase: "diff" | "parse" | "read" | "review" | "store";
    message: string;
    attempts?: {
        batch: number;
        pass: number;
        purpose: "review" | "verify";
        candidate?: number | undefined;
        engine: "claude" | "codex";
        model: string;
        attempt: number;
        status: "completed" | "failed";
    }[] | undefined;
};
/**
 * One immutable snapshot file supplied by a trusted host, never executed.
 * @category models
 * @since 1.0.0
 */
export interface SnapshotFile {
    readonly path: string;
    readonly contents: string;
    readonly changed: boolean;
    readonly deleted?: boolean;
}
/**
 * The unchanged paths a snapshot host supplies so a review can relate changed
 * files to their relative-import dependencies and Go package siblings, plus
 * the extended regular expressions that find their importers (for example
 * with `git grep -E` at the reviewed revision). `available` is every path at
 * that revision; the host filters results to the review's include globs.
 *
 * @category execution
 * @since 1.0.0
 */
export declare const relatedCandidates: (changed: ReadonlyArray<{
    readonly path: string;
    readonly contents: string;
}>, available: ReadonlySet<string>) => {
    readonly paths: ReadonlyArray<string>;
    readonly callerPatterns: ReadonlyArray<string>;
};
/**
 * The default executable name of one engine.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const engineExecutable: (engine: Engine) => string;
/**
 * One review seat: the engine family and the model a request runs on.
 *
 * @category models
 * @since 1.0.0
 */
export interface ReviewSeat {
    readonly engine: Engine;
    readonly model: string;
}
/**
 * A trusted host's model for each review seat, in place of the tool-free
 * provider request and its API key: for example the host's subscription seats.
 * Every request it serves is still tool-free, bounded and masked the same way;
 * the manifest records the transport as `seat`. A failure to supply a model
 * fails the request and is never a skipped review.
 *
 * @category models
 * @since 1.0.0
 */
export type ReviewTransport = (seat: ReviewSeat) => Effect.Effect<{
    readonly model: Model.Model;
    readonly modelId: string;
}, Error>;
/**
 * Runs one prompt through a model CLI and returns the model's answer text.
 *
 * This generic utility invokes a trusted caller's CLI, independently of the
 * default tool-free review transport. It does not establish filesystem or
 * network confinement. `executable` overrides the engine's binary name.
 *
 * @category execution
 * @since 0.1.0
 */
export declare const promptEngine: (options: {
    readonly workspaceRoot: string;
    readonly executable?: string | undefined;
    readonly timeoutMs?: number | undefined;
    readonly sensitiveEnv?: ReadonlyArray<string> | undefined;
}, request: {
    readonly engine: Engine;
    readonly model: string;
    readonly prompt: string;
}) => Effect.Effect<string, ModelCliMissing | LlmReviewError>;
/**
 * Batches source, reviews it, and applies the failOn gate.
 *
 * Hosts may supply an immutable in-memory snapshot. Otherwise this library
 * function reads the trusted caller's workspace. With a {@link FindingStore},
 * every completed batch persists as it finishes, an unfinished run over the
 * same policy and bytes resumes, batches past {@link maximumReviewBatches}
 * wait for the next invocation, and results carry the run and each finding's
 * fingerprint. Default inference has no
 * tools and signs with the engine's API key; `transport` sends the same
 * tool-free requests through the host's model seats instead. `executable` is
 * an explicit trusted-host extension/test seam outside the review command's
 * containment contract.
 *
 * @category execution
 * @since 0.1.0
 */
export declare const review: (options: {
    readonly workspaceRoot: string;
    readonly snapshot?: ReadonlyArray<SnapshotFile> | undefined;
    readonly onCredentials?: ((discoveries: ReadonlyArray<CredentialDiscovery>) => Effect.Effect<void, unknown>) | undefined;
    readonly executable?: string | undefined;
    readonly transport?: ReviewTransport | undefined;
    readonly timeoutMs?: number | undefined;
    readonly sensitiveEnv?: ReadonlyArray<string> | undefined;
    readonly store?: FindingStore | undefined;
    readonly revisions?: {
        readonly base: string;
        readonly head: string;
    } | undefined;
}, untrustedPayload: Payload) => Effect.Effect<Report, ModelCliMissing | LlmReviewError | FindingsError>;
/**
 * Implements {@link LlmReview} with bounded source reads and tool-free inference.
 *
 * Provider credentials are required; failures never become skipped reviews.
 * Programmatic hosts are responsible for approving the payload's policy before
 * execution. The review command reads its policy from an operator-pinned commit
 * without evaluating candidate declarations.
 *
 * @category layers
 * @since 0.1.0
 */
export declare const LlmReviewLive: (options: {
    readonly workspaceRoot: string;
    readonly snapshot?: ReadonlyArray<SnapshotFile> | undefined;
    readonly onCredentials?: ((discoveries: ReadonlyArray<CredentialDiscovery>) => Effect.Effect<void, unknown>) | undefined;
    readonly executable?: string | undefined;
    readonly transport?: ReviewTransport | undefined;
    readonly timeoutMs?: number | undefined;
    readonly sensitiveEnv?: ReadonlyArray<string> | undefined;
    readonly store?: FindingStore | undefined;
    readonly revisions?: {
        readonly base: string;
        readonly head: string;
    } | undefined;
}) => Layer.Layer<Action.Requirement<"smithers-build/llm-review">, never, FlowRuntime.FlowRuntime>;
/**
 * Attributes for {@link LlmLint}.
 *
 * `changes` names the base revision whose diff selects the reviewed files.
 * `include` files and globs match workspace-relative changed paths; a path is reviewed
 * when it matches at least one declaration. `context` files and globs are always read into
 * every batch prompt whether or not they changed. Execution resolves context
 * from the workspace root (with optional `//`) and crosses nested `PACKAGE.ts`
 * boundaries: references can belong to other packages. Workspace confinement,
 * ignore rules, and symlink checks still apply. Nonempty context declarations
 * must match at least one file in total; individual unmatched globs are allowed.
 * Context is bounded by {@link maximumContextFiles}, {@link maximumReviewFileBytes},
 * and {@link maximumContextContentBytes}. Both sets are caller-owned declared
 * inputs harvested by {@link Target.make}; planner expansion remains package scoped.
 * `engine` selects the model CLI and defaults to `claude`. `contextTokens`
 * declares the model's context window (default {@link defaultContextTokens}).
 * `failOn` fails the target when any finding meets that severity and defaults
 * to `error`. With `securityChecks`, structured findings are required and
 * release recommendation `block` gates the review independently of `failOn`.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Attrs: Schema.Struct<{
    readonly changes: Schema.TaggedStruct<"GitDiff", {
        readonly base: Schema.NonEmptyString;
        readonly paths: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly added: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly addedLines: Schema.optional<Schema.NonEmptyString>;
    }>;
    readonly include: Schema.$Array<Schema.Union<readonly [Schema.TaggedStruct<"Glob", {
        readonly pattern: Schema.NonEmptyString;
        readonly exclude: Schema.$Array<Schema.String>;
    }>, Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>]>>;
    readonly context: Schema.withConstructorDefault<Schema.$Array<Schema.Union<readonly [Schema.TaggedStruct<"Glob", {
        readonly pattern: Schema.NonEmptyString;
        readonly exclude: Schema.$Array<Schema.String>;
    }>, Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>]>>>;
    readonly deps: Schema.$Array<Schema.declare<Target.AnyTarget, Target.AnyTarget>>;
    readonly prompt: Schema.String;
    readonly rubric: Schema.String;
    readonly engine: Schema.withConstructorDefault<Schema.Literals<readonly ["claude", "codex"]>>;
    readonly model: Schema.NonEmptyString;
    readonly batchSize: Schema.Int;
    readonly failOn: Schema.withConstructorDefault<Schema.Literals<readonly ["info", "warning", "error"]>>;
    readonly securityChecks: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
    /** The selected model's context window in tokens; defaults to {@link defaultContextTokens}. */
    readonly contextTokens: Schema.optional<Schema.Int>;
    /** Whether an empty selection or a missing model executable fails instead of passing or skipping. */
    readonly required: Schema.optional<Schema.Boolean>;
    /** Aggregate model-call, prompt-token and wall-clock limits; exhausting one fails the review. */
    readonly budget: Schema.optional<Schema.Struct<{
        readonly modelCalls: Schema.optional<Schema.Int>;
        readonly promptTokens: Schema.optional<Schema.Int>;
        readonly wallMs: Schema.optional<Schema.Int>;
    }>>;
    /**
     * `changed` (the default) reviews the files that differ from
     * `changes.base`; `all` reviews every included file.
     */
    readonly scope: Schema.withConstructorDefault<Schema.Literals<readonly ["changed", "all"]>>;
    /**
     * Whether a bare wildcard skips this review; a label or a named subtree
     * pattern (`//pkg/...:name`) still selects it. Defaults to false.
     */
    readonly manual: Schema.withConstructorDefault<Schema.Boolean>;
}>;
/**
 * Attributes for {@link LlmLint}.
 *
 * @category models
 * @since 0.1.0
 */
export type Attrs = typeof Attrs.Type;
/**
 * Reviews changed files with a model and fails on rubric findings.
 *
 * The plan is one {@link LlmReview} call. The git diff against `changes.base`
 * is a declared input the planner expands and digests, so the target re-keys
 * when the committed diff content changes. The planner also digests declared
 * `include` and `context` files within its package scope. Cross-package context
 * is read afresh at execution; model reviews are non-cacheable. Execution runs
 * through
 * {@link LlmReviewLive}: changed paths filtered by `include`, grouped with the
 * changed files they import or are imported by, packed into calls of at most
 * `batchSize` changed files that fit `contextTokens`, each carrying its
 * unchanged related included files, one tool-free model call per batch
 * selecting `model`, the context files appended to every batch prompt,
 * findings on files several calls saw deduplicated, findings parsed as
 * `{file, line, severity, message}`. Key material also contains dependency
 * keys, include and context patterns, prompt, rubric, engine, model and
 * model-layer identity, batch size, and the failOn threshold. Model output is
 * deliberately non-cacheable: a remote model is not a reproducible function
 * of those inputs.
 *
 * The target participates in `review` ALONE, and is gated to it. `lint`,
 * `build`, `test`, `docs`, and the aggregate `ci` therefore never plan one,
 * over any pattern, and cannot reach one through a dependency edge either.
 * The review command requires `--policy-revision <trusted-commit-sha>` and
 * consumes the approved target index as data. It does not run declaration
 * modules. Library hosts invoking the target directly must approve its policy
 * themselves. Missing provider credentials fail the review.
 *
 * @category targets
 * @since 0.1.0
 */
export declare const LlmLint: Target.Definition<"LlmLint", Schema.Struct<{
    readonly changes: Schema.TaggedStruct<"GitDiff", {
        readonly base: Schema.NonEmptyString;
        readonly paths: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly added: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly addedLines: Schema.optional<Schema.NonEmptyString>;
    }>;
    readonly include: Schema.$Array<Schema.Union<readonly [Schema.TaggedStruct<"Glob", {
        readonly pattern: Schema.NonEmptyString;
        readonly exclude: Schema.$Array<Schema.String>;
    }>, Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>]>>;
    readonly context: Schema.withConstructorDefault<Schema.$Array<Schema.Union<readonly [Schema.TaggedStruct<"Glob", {
        readonly pattern: Schema.NonEmptyString;
        readonly exclude: Schema.$Array<Schema.String>;
    }>, Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>]>>>;
    readonly deps: Schema.$Array<Schema.declare<Target.AnyTarget, Target.AnyTarget>>;
    readonly prompt: Schema.String;
    readonly rubric: Schema.String;
    readonly engine: Schema.withConstructorDefault<Schema.Literals<readonly ["claude", "codex"]>>;
    readonly model: Schema.NonEmptyString;
    readonly batchSize: Schema.Int;
    readonly failOn: Schema.withConstructorDefault<Schema.Literals<readonly ["info", "warning", "error"]>>;
    readonly securityChecks: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
    /** The selected model's context window in tokens; defaults to {@link defaultContextTokens}. */
    readonly contextTokens: Schema.optional<Schema.Int>;
    /** Whether an empty selection or a missing model executable fails instead of passing or skipping. */
    readonly required: Schema.optional<Schema.Boolean>;
    /** Aggregate model-call, prompt-token and wall-clock limits; exhausting one fails the review. */
    readonly budget: Schema.optional<Schema.Struct<{
        readonly modelCalls: Schema.optional<Schema.Int>;
        readonly promptTokens: Schema.optional<Schema.Int>;
        readonly wallMs: Schema.optional<Schema.Int>;
    }>>;
    /**
     * `changed` (the default) reviews the files that differ from
     * `changes.base`; `all` reviews every included file.
     */
    readonly scope: Schema.withConstructorDefault<Schema.Literals<readonly ["changed", "all"]>>;
    /**
     * Whether a bare wildcard skips this review; a label or a named subtree
     * pattern (`//pkg/...:name`) still selects it. Defaults to false.
     */
    readonly manual: Schema.withConstructorDefault<Schema.Boolean>;
}>, Schema.Struct<{
    readonly files: Schema.$Array<Schema.String>;
    readonly findings: Schema.$Array<Schema.Struct<{
        readonly file: Schema.NonEmptyString;
        readonly line: Schema.Int;
        readonly severity: Schema.Literals<readonly ["info", "warning", "error"]>;
        readonly security: Schema.optional<Schema.Struct<{
            readonly checkId: Schema.String;
            readonly impact: Schema.Literals<readonly ["low", "medium", "high", "critical"]>;
            readonly verification: Schema.Literals<readonly ["suspected", "confirmed"]>;
            readonly releaseRecommendation: Schema.Literals<readonly ["allow", "review", "block"]>;
            readonly attackerPreconditions: Schema.NonEmptyString;
            readonly evidence: Schema.NonEmptyString;
            readonly nextConfirmationStep: Schema.NonEmptyString;
            readonly reproduction: Schema.optional<Schema.Struct<{
                readonly revision: Schema.String;
                readonly command: Schema.NonEmptyString;
                readonly observedResult: Schema.NonEmptyString;
            }>>;
        }>>;
        readonly message: Schema.NonEmptyString;
    }>>;
    readonly attempts: Schema.optional<Schema.$Array<Schema.Struct<{
        readonly batch: Schema.Int;
        readonly pass: Schema.Int;
        readonly purpose: Schema.Literals<readonly ["review", "verify"]>;
        readonly candidate: Schema.optional<Schema.Int>;
        readonly engine: Schema.Literals<readonly ["claude", "codex"]>;
        readonly model: Schema.String;
        readonly attempt: Schema.Int;
        readonly status: Schema.Literals<readonly ["completed", "failed"]>;
        readonly message: Schema.String;
        readonly completion: Schema.optional<Schema.Struct<{
            readonly status: Schema.Literals<readonly ["completed", "refused", "incomplete"]>;
            readonly coverage: Schema.$Array<Schema.Struct<{
                readonly checkId: Schema.NonEmptyString;
                readonly status: Schema.Literals<readonly ["completed", "incomplete"]>;
                readonly evidence: Schema.NonEmptyString;
            }>>;
            readonly missingContext: Schema.$Array<Schema.NonEmptyString>;
            readonly findings: Schema.$Array<Schema.Struct<{
                readonly file: Schema.NonEmptyString;
                readonly line: Schema.Int;
                readonly severity: Schema.Literals<readonly ["info", "warning", "error"]>;
                readonly security: Schema.optional<Schema.Struct<{
                    readonly checkId: Schema.String;
                    readonly impact: Schema.Literals<readonly ["low", "medium", "high", "critical"]>;
                    readonly verification: Schema.Literals<readonly ["suspected", "confirmed"]>;
                    readonly releaseRecommendation: Schema.Literals<readonly ["allow", "review", "block"]>;
                    readonly attackerPreconditions: Schema.NonEmptyString;
                    readonly evidence: Schema.NonEmptyString;
                    readonly nextConfirmationStep: Schema.NonEmptyString;
                    readonly reproduction: Schema.optional<Schema.Struct<{
                        readonly revision: Schema.String;
                        readonly command: Schema.NonEmptyString;
                        readonly observedResult: Schema.NonEmptyString;
                    }>>;
                }>>;
                readonly message: Schema.NonEmptyString;
            }>>;
        }>>;
    }>>>;
    /** What a budgeted review spent: model calls and estimated prompt tokens. */
    readonly usage: Schema.optional<Schema.Struct<{
        readonly modelCalls: Schema.Int;
        readonly promptTokens: Schema.Int;
    }>>;
    /** With a finding store: the persisted run, its provenance, and each finding's stable fingerprint. */
    readonly run: Schema.optional<Schema.String>;
    readonly manifest: Schema.optional<Schema.suspend<Schema.Codec<{
        readonly version: 1;
        readonly revisions?: {
            readonly base: string;
            readonly head: string;
        } | undefined;
        readonly policy: {
            readonly digest: string;
            readonly prompt: string;
            readonly rubric: string;
            readonly securityChecks?: readonly string[] | undefined;
            readonly failOn: "error" | "info" | "warning";
            readonly scope: "all" | "changed";
            readonly batchSize: number;
            readonly contextTokens: number;
        };
        readonly engine: {
            readonly transport: "cli" | "seat" | "tool-free";
            readonly seats: readonly {
                readonly engine: "claude" | "codex";
                readonly model: string;
            }[];
            readonly executable?: {
                readonly path: string;
                readonly sha256: string;
            } | undefined;
        };
        readonly context: readonly {
            readonly path: string;
            readonly sha256: string;
            readonly bytes: number;
        }[];
        readonly batches: readonly {
            readonly changed: readonly {
                readonly path: string;
                readonly deleted?: true | undefined;
                readonly firstLine: number;
                readonly lastLine: number;
                readonly sha256: string;
            }[];
            readonly related: readonly {
                readonly path: string;
                readonly sha256: string;
            }[];
            readonly omittedRelated: readonly string[];
        }[];
    }, {
        readonly version: 1;
        readonly revisions?: {
            readonly base: string;
            readonly head: string;
        } | undefined;
        readonly policy: {
            readonly digest: string;
            readonly prompt: string;
            readonly rubric: string;
            readonly securityChecks?: readonly string[] | undefined;
            readonly failOn: "error" | "info" | "warning";
            readonly scope: "all" | "changed";
            readonly batchSize: number;
            readonly contextTokens: number;
        };
        readonly engine: {
            readonly transport: "cli" | "seat" | "tool-free";
            readonly seats: readonly {
                readonly engine: "claude" | "codex";
                readonly model: string;
            }[];
            readonly executable?: {
                readonly path: string;
                readonly sha256: string;
            } | undefined;
        };
        readonly context: readonly {
            readonly path: string;
            readonly sha256: string;
            readonly bytes: number;
        }[];
        readonly batches: readonly {
            readonly changed: readonly {
                readonly path: string;
                readonly deleted?: true | undefined;
                readonly firstLine: number;
                readonly lastLine: number;
                readonly sha256: string;
            }[];
            readonly related: readonly {
                readonly path: string;
                readonly sha256: string;
            }[];
            readonly omittedRelated: readonly string[];
        }[];
    }, never, never>>>;
    readonly fingerprints: Schema.optional<Schema.$Array<Schema.String>>;
}>, Schema.Union<readonly [typeof ModelCliMissing, typeof LlmReviewError, typeof FindingsError]>, Action.Requirement<"smithers-build/llm-review">>;
