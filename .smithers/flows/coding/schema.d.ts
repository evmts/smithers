import { Schema } from "effect";
export declare const Revision: Schema.Struct<{
    readonly changeId: Schema.NonEmptyString;
    readonly commitId: Schema.NonEmptyString;
    readonly treeId: Schema.NonEmptyString;
    readonly operationId: Schema.NonEmptyString;
    readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
}>;
export type Revision = typeof Revision.Type;
/** A project Change groups native JJ changes. Planned atoms have no second ID. */
export declare const AtomicPlan: Schema.Struct<{
    readonly changeId: Schema.NullOr<Schema.NonEmptyString>;
    readonly message: Schema.NonEmptyString;
    readonly intent: Schema.NonEmptyString;
    readonly reads: Schema.$Array<Schema.NonEmptyString>;
    readonly writes: Schema.$Array<Schema.NonEmptyString>;
}>;
export declare const Check: Schema.Struct<{
    readonly id: Schema.String;
    readonly target: Schema.NonEmptyString;
    readonly flow: Schema.NonEmptyString;
    readonly flowDigest: Schema.NonEmptyString;
    readonly tier: Schema.Literals<readonly ["fast", "slow", "delivery"]>;
    readonly required: Schema.Boolean;
}>;
export type Check = typeof Check.Type;
export declare const Change: Schema.Struct<{
    readonly id: Schema.String;
    readonly title: Schema.NonEmptyString;
    readonly intent: Schema.NonEmptyString;
    readonly implementation: Schema.NonEmptyString;
    readonly implementationDigest: Schema.NonEmptyString;
    readonly atoms: Schema.$Array<Schema.Struct<{
        readonly changeId: Schema.NullOr<Schema.NonEmptyString>;
        readonly message: Schema.NonEmptyString;
        readonly intent: Schema.NonEmptyString;
        readonly reads: Schema.$Array<Schema.NonEmptyString>;
        readonly writes: Schema.$Array<Schema.NonEmptyString>;
    }>>;
    readonly checks: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly target: Schema.NonEmptyString;
        readonly flow: Schema.NonEmptyString;
        readonly flowDigest: Schema.NonEmptyString;
        readonly tier: Schema.Literals<readonly ["fast", "slow", "delivery"]>;
        readonly required: Schema.Boolean;
    }>>;
}>;
export type Change = typeof Change.Type;
/**
 * One cited row of a coding run's project memory: `[bank/key] text` in the
 * opening block. See `project-memory.ts`.
 */
export declare const MemoryRow: Schema.Struct<{
    readonly origin: Schema.Literal<"recall">;
    readonly bank: Schema.NonEmptyString;
    readonly key: Schema.NonEmptyString;
    readonly text: Schema.NonEmptyString;
}>;
export type MemoryRow = typeof MemoryRow.Type;
/** The bounded, cited block the implementation, repair and correction steps open with. */
export declare const ProjectMemory: Schema.$Array<Schema.Struct<{
    readonly origin: Schema.Literal<"recall">;
    readonly bank: Schema.NonEmptyString;
    readonly key: Schema.NonEmptyString;
    readonly text: Schema.NonEmptyString;
}>>;
export type ProjectMemory = typeof ProjectMemory.Type;
/** Identity and bytes captured together by an authorized wiki read. */
export declare const WikiCitation: Schema.Struct<{
    readonly slug: Schema.NonEmptyString;
    readonly pageID: Schema.NonEmptyString;
    readonly revision: Schema.Int;
    readonly digest: Schema.String;
}>;
export declare const Plan: Schema.Struct<{
    readonly prompt: Schema.NonEmptyString;
    readonly memoryRevision: Schema.NonEmptyString;
    readonly wikiCitations: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly slug: Schema.NonEmptyString;
        readonly pageID: Schema.NonEmptyString;
        readonly revision: Schema.Int;
        readonly digest: Schema.String;
    }>>>;
    readonly memory: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly origin: Schema.Literal<"recall">;
        readonly bank: Schema.NonEmptyString;
        readonly key: Schema.NonEmptyString;
        readonly text: Schema.NonEmptyString;
    }>>>;
    readonly base: Schema.Struct<{
        readonly changeId: Schema.NonEmptyString;
        readonly commitId: Schema.NonEmptyString;
        readonly treeId: Schema.NonEmptyString;
        readonly operationId: Schema.NonEmptyString;
        readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
    }>;
    readonly observedHead: Schema.optionalKey<Schema.Struct<{
        readonly changeId: Schema.NonEmptyString;
        readonly commitId: Schema.NonEmptyString;
        readonly treeId: Schema.NonEmptyString;
        readonly operationId: Schema.NonEmptyString;
        readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
    }>>;
    readonly changes: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly title: Schema.NonEmptyString;
        readonly intent: Schema.NonEmptyString;
        readonly implementation: Schema.NonEmptyString;
        readonly implementationDigest: Schema.NonEmptyString;
        readonly atoms: Schema.$Array<Schema.Struct<{
            readonly changeId: Schema.NullOr<Schema.NonEmptyString>;
            readonly message: Schema.NonEmptyString;
            readonly intent: Schema.NonEmptyString;
            readonly reads: Schema.$Array<Schema.NonEmptyString>;
            readonly writes: Schema.$Array<Schema.NonEmptyString>;
        }>>;
        readonly checks: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly target: Schema.NonEmptyString;
            readonly flow: Schema.NonEmptyString;
            readonly flowDigest: Schema.NonEmptyString;
            readonly tier: Schema.Literals<readonly ["fast", "slow", "delivery"]>;
            readonly required: Schema.Boolean;
        }>>;
    }>>;
}>;
export type Plan = typeof Plan.Type;
/**
 * The repository wiki the stack service published, handed to a stack request
 * so its lane plans with it instead of reviewing the pages again. Planning
 * keeps only the pages whose inputs still hash to the lane's source.
 */
export declare const SuppliedWiki: Schema.Struct<{
    readonly sourceRevision: Schema.NonEmptyString;
    readonly pages: Schema.$Array<Schema.Struct<{
        readonly id: Schema.NonEmptyString;
        readonly title: Schema.NonEmptyString;
        readonly kind: Schema.Literals<readonly ["current", "intent"]>;
        readonly body: Schema.NonEmptyString;
        readonly slug: Schema.optionalKey<Schema.NonEmptyString>;
        readonly revision: Schema.optionalKey<Schema.Int>;
        readonly inputDigest: Schema.NonEmptyString;
    }>>;
}>;
export type SuppliedWiki = typeof SuppliedWiki.Type;
/**
 * A question a person already answered for this request: the agent's
 * question, the person's answer and who gave it. The stack carries every
 * answer of a TODO into each later attempt, next to its steers (`feedback`).
 */
export declare const CarriedAnswer: Schema.Struct<{
    readonly question: Schema.NonEmptyString;
    readonly answer: Schema.NonEmptyString;
    readonly by: Schema.NonEmptyString;
}>;
export type CarriedAnswer = typeof CarriedAnswer.Type;
export declare const PlanningInput: Schema.Struct<{
    readonly prompt: Schema.NonEmptyString;
    readonly feedback: Schema.String;
    readonly wiki: Schema.optionalKey<Schema.NullOr<Schema.Struct<{
        readonly sourceRevision: Schema.NonEmptyString;
        readonly pages: Schema.$Array<Schema.Struct<{
            readonly id: Schema.NonEmptyString;
            readonly title: Schema.NonEmptyString;
            readonly kind: Schema.Literals<readonly ["current", "intent"]>;
            readonly body: Schema.NonEmptyString;
            readonly slug: Schema.optionalKey<Schema.NonEmptyString>;
            readonly revision: Schema.optionalKey<Schema.Int>;
            readonly inputDigest: Schema.NonEmptyString;
        }>>;
    }>>>;
    readonly answers: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly question: Schema.NonEmptyString;
        readonly answer: Schema.NonEmptyString;
        readonly by: Schema.NonEmptyString;
    }>>>;
}>;
/** The exact commit a request starts from, retained into this workspace's
 * source ref: the mythical stack tip, or the caller's pushed ref. */
export declare const StackBase: Schema.Struct<{
    readonly commitId: Schema.String;
    readonly ref: Schema.String;
}>;
export type StackBase = typeof StackBase.Type;
export declare const RequestInput: Schema.Struct<{
    readonly prompt: Schema.NonEmptyString;
    readonly planApproval: Schema.optionalKey<Schema.Union<readonly [Schema.Literals<readonly ["always", "never"]>, Schema.String]>>;
    readonly feedback: Schema.optionalKey<Schema.String>;
    readonly answers: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly question: Schema.NonEmptyString;
        readonly answer: Schema.NonEmptyString;
        readonly by: Schema.NonEmptyString;
    }>>>;
    readonly maxRounds: Schema.optionalKey<Schema.Int>;
    readonly base: Schema.optionalKey<Schema.Struct<{
        readonly commitId: Schema.String;
        readonly ref: Schema.String;
    }>>;
    readonly wiki: Schema.optionalKey<Schema.NullOr<Schema.Struct<{
        readonly sourceRevision: Schema.NonEmptyString;
        readonly pages: Schema.$Array<Schema.Struct<{
            readonly id: Schema.NonEmptyString;
            readonly title: Schema.NonEmptyString;
            readonly kind: Schema.Literals<readonly ["current", "intent"]>;
            readonly body: Schema.NonEmptyString;
            readonly slug: Schema.optionalKey<Schema.NonEmptyString>;
            readonly revision: Schema.optionalKey<Schema.Int>;
            readonly inputDigest: Schema.NonEmptyString;
        }>>;
    }>>>;
}>;
export declare const Finding: Schema.Struct<{
    readonly owner: Schema.String;
    readonly message: Schema.NonEmptyString;
    readonly sourceCommitId: Schema.NonEmptyString;
    readonly output: Schema.optionalKey<Schema.NonEmptyString>;
}>;
export type Finding = typeof Finding.Type;
export declare const Implementation: Schema.Struct<{
    readonly change: Schema.String;
    readonly parent: Schema.Struct<{
        readonly changeId: Schema.NonEmptyString;
        readonly commitId: Schema.NonEmptyString;
        readonly treeId: Schema.NonEmptyString;
        readonly operationId: Schema.NonEmptyString;
        readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
    }>;
    readonly atoms: Schema.$Array<Schema.Struct<{
        readonly changeId: Schema.NonEmptyString;
        readonly commitId: Schema.NonEmptyString;
        readonly treeId: Schema.NonEmptyString;
        readonly operationId: Schema.NonEmptyString;
        readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
    }>>;
    readonly head: Schema.Struct<{
        readonly changeId: Schema.NonEmptyString;
        readonly commitId: Schema.NonEmptyString;
        readonly treeId: Schema.NonEmptyString;
        readonly operationId: Schema.NonEmptyString;
        readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
    }>;
    readonly reads: Schema.$Array<Schema.NonEmptyString>;
    readonly writes: Schema.$Array<Schema.NonEmptyString>;
}>;
export type Implementation = typeof Implementation.Type;
export declare const Receipt: Schema.Struct<{
    readonly checkId: Schema.String;
    readonly target: Schema.NonEmptyString;
    readonly tier: Schema.Literals<readonly ["fast", "slow", "delivery"]>;
    readonly change: Schema.String;
    readonly commitId: Schema.NonEmptyString;
    readonly treeId: Schema.NonEmptyString;
    readonly inputDigest: Schema.NonEmptyString;
    readonly status: Schema.Literals<readonly ["passed", "failed", "superseded"]>;
    readonly fault: Schema.optionalKey<Schema.Literals<readonly ["infra", "factory"]>>;
    readonly startedAt: Schema.optionalKey<Schema.Int>;
    readonly finishedAt: Schema.optionalKey<Schema.Int>;
    readonly evidence: Schema.String;
    readonly findings: Schema.$Array<Schema.Struct<{
        readonly owner: Schema.String;
        readonly message: Schema.NonEmptyString;
        readonly sourceCommitId: Schema.NonEmptyString;
        readonly output: Schema.optionalKey<Schema.NonEmptyString>;
    }>>;
}>;
export type Receipt = typeof Receipt.Type;
export declare const ValidatedChange: Schema.Struct<{
    readonly implementation: Schema.Struct<{
        readonly change: Schema.String;
        readonly parent: Schema.Struct<{
            readonly changeId: Schema.NonEmptyString;
            readonly commitId: Schema.NonEmptyString;
            readonly treeId: Schema.NonEmptyString;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
        }>;
        readonly atoms: Schema.$Array<Schema.Struct<{
            readonly changeId: Schema.NonEmptyString;
            readonly commitId: Schema.NonEmptyString;
            readonly treeId: Schema.NonEmptyString;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
        }>>;
        readonly head: Schema.Struct<{
            readonly changeId: Schema.NonEmptyString;
            readonly commitId: Schema.NonEmptyString;
            readonly treeId: Schema.NonEmptyString;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
        }>;
        readonly reads: Schema.$Array<Schema.NonEmptyString>;
        readonly writes: Schema.$Array<Schema.NonEmptyString>;
    }>;
    readonly receipts: Schema.$Array<Schema.Struct<{
        readonly checkId: Schema.String;
        readonly target: Schema.NonEmptyString;
        readonly tier: Schema.Literals<readonly ["fast", "slow", "delivery"]>;
        readonly change: Schema.String;
        readonly commitId: Schema.NonEmptyString;
        readonly treeId: Schema.NonEmptyString;
        readonly inputDigest: Schema.NonEmptyString;
        readonly status: Schema.Literals<readonly ["passed", "failed", "superseded"]>;
        readonly fault: Schema.optionalKey<Schema.Literals<readonly ["infra", "factory"]>>;
        readonly startedAt: Schema.optionalKey<Schema.Int>;
        readonly finishedAt: Schema.optionalKey<Schema.Int>;
        readonly evidence: Schema.String;
        readonly findings: Schema.$Array<Schema.Struct<{
            readonly owner: Schema.String;
            readonly message: Schema.NonEmptyString;
            readonly sourceCommitId: Schema.NonEmptyString;
            readonly output: Schema.optionalKey<Schema.NonEmptyString>;
        }>>;
    }>>;
}>;
export type ValidatedChange = typeof ValidatedChange.Type;
export declare const Result: Schema.Struct<{
    readonly status: Schema.Literals<readonly ["validated", "changes-requested"]>;
    readonly changes: Schema.$Array<Schema.Struct<{
        readonly implementation: Schema.Struct<{
            readonly change: Schema.String;
            readonly parent: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
            readonly atoms: Schema.$Array<Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>>;
            readonly head: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
            readonly reads: Schema.$Array<Schema.NonEmptyString>;
            readonly writes: Schema.$Array<Schema.NonEmptyString>;
        }>;
        readonly receipts: Schema.$Array<Schema.Struct<{
            readonly checkId: Schema.String;
            readonly target: Schema.NonEmptyString;
            readonly tier: Schema.Literals<readonly ["fast", "slow", "delivery"]>;
            readonly change: Schema.String;
            readonly commitId: Schema.NonEmptyString;
            readonly treeId: Schema.NonEmptyString;
            readonly inputDigest: Schema.NonEmptyString;
            readonly status: Schema.Literals<readonly ["passed", "failed", "superseded"]>;
            readonly fault: Schema.optionalKey<Schema.Literals<readonly ["infra", "factory"]>>;
            readonly startedAt: Schema.optionalKey<Schema.Int>;
            readonly finishedAt: Schema.optionalKey<Schema.Int>;
            readonly evidence: Schema.String;
            readonly findings: Schema.$Array<Schema.Struct<{
                readonly owner: Schema.String;
                readonly message: Schema.NonEmptyString;
                readonly sourceCommitId: Schema.NonEmptyString;
                readonly output: Schema.optionalKey<Schema.NonEmptyString>;
            }>>;
        }>>;
    }>>;
    readonly findings: Schema.$Array<Schema.Struct<{
        readonly owner: Schema.String;
        readonly message: Schema.NonEmptyString;
        readonly sourceCommitId: Schema.NonEmptyString;
        readonly output: Schema.optionalKey<Schema.NonEmptyString>;
    }>>;
}>;
export type Result = typeof Result.Type;
/** Domain outcome is distinct from the enclosing engine execution finishing. */
export declare const CorrectionResult: Schema.Struct<{
    readonly status: Schema.Literals<readonly ["validated", "changes-requested", "blocked"]>;
    readonly rounds: Schema.Int;
    readonly result: Schema.NullOr<Schema.Struct<{
        readonly status: Schema.Literals<readonly ["validated", "changes-requested"]>;
        readonly changes: Schema.$Array<Schema.Struct<{
            readonly implementation: Schema.Struct<{
                readonly change: Schema.String;
                readonly parent: Schema.Struct<{
                    readonly changeId: Schema.NonEmptyString;
                    readonly commitId: Schema.NonEmptyString;
                    readonly treeId: Schema.NonEmptyString;
                    readonly operationId: Schema.NonEmptyString;
                    readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
                }>;
                readonly atoms: Schema.$Array<Schema.Struct<{
                    readonly changeId: Schema.NonEmptyString;
                    readonly commitId: Schema.NonEmptyString;
                    readonly treeId: Schema.NonEmptyString;
                    readonly operationId: Schema.NonEmptyString;
                    readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
                }>>;
                readonly head: Schema.Struct<{
                    readonly changeId: Schema.NonEmptyString;
                    readonly commitId: Schema.NonEmptyString;
                    readonly treeId: Schema.NonEmptyString;
                    readonly operationId: Schema.NonEmptyString;
                    readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
                }>;
                readonly reads: Schema.$Array<Schema.NonEmptyString>;
                readonly writes: Schema.$Array<Schema.NonEmptyString>;
            }>;
            readonly receipts: Schema.$Array<Schema.Struct<{
                readonly checkId: Schema.String;
                readonly target: Schema.NonEmptyString;
                readonly tier: Schema.Literals<readonly ["fast", "slow", "delivery"]>;
                readonly change: Schema.String;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly inputDigest: Schema.NonEmptyString;
                readonly status: Schema.Literals<readonly ["passed", "failed", "superseded"]>;
                readonly fault: Schema.optionalKey<Schema.Literals<readonly ["infra", "factory"]>>;
                readonly startedAt: Schema.optionalKey<Schema.Int>;
                readonly finishedAt: Schema.optionalKey<Schema.Int>;
                readonly evidence: Schema.String;
                readonly findings: Schema.$Array<Schema.Struct<{
                    readonly owner: Schema.String;
                    readonly message: Schema.NonEmptyString;
                    readonly sourceCommitId: Schema.NonEmptyString;
                    readonly output: Schema.optionalKey<Schema.NonEmptyString>;
                }>>;
            }>>;
        }>>;
        readonly findings: Schema.$Array<Schema.Struct<{
            readonly owner: Schema.String;
            readonly message: Schema.NonEmptyString;
            readonly sourceCommitId: Schema.NonEmptyString;
            readonly output: Schema.optionalKey<Schema.NonEmptyString>;
        }>>;
    }>>;
    readonly blocked: Schema.NullOr<Schema.Struct<{
        readonly executionId: Schema.String;
        readonly message: Schema.String;
    }>>;
    readonly stalled: Schema.optionalKey<Schema.Struct<{
        readonly _tag: Schema.Literal<"Stalled">;
        readonly signal: Schema.Literals<readonly ["tree", "checks", "output"]>;
        readonly rounds: Schema.Int;
        readonly on: Schema.Literals<readonly ["stop", "park", "escalate"]>;
    }>>;
}>;
/** The leaves Jev routes a TODO to (`factory/Todo`). */
export declare const Route: Schema.Literals<readonly ["implement", "bug", "feature", "close"]>;
export type Route = typeof Route.Type;
/** A TODO request also answers the route Jev gave it, on its result and on its failure. */
export declare const RequestResult: Schema.Struct<{
    readonly plan: Schema.Struct<{
        readonly prompt: Schema.NonEmptyString;
        readonly memoryRevision: Schema.NonEmptyString;
        readonly wikiCitations: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly slug: Schema.NonEmptyString;
            readonly pageID: Schema.NonEmptyString;
            readonly revision: Schema.Int;
            readonly digest: Schema.String;
        }>>>;
        readonly memory: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly origin: Schema.Literal<"recall">;
            readonly bank: Schema.NonEmptyString;
            readonly key: Schema.NonEmptyString;
            readonly text: Schema.NonEmptyString;
        }>>>;
        readonly base: Schema.Struct<{
            readonly changeId: Schema.NonEmptyString;
            readonly commitId: Schema.NonEmptyString;
            readonly treeId: Schema.NonEmptyString;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
        }>;
        readonly observedHead: Schema.optionalKey<Schema.Struct<{
            readonly changeId: Schema.NonEmptyString;
            readonly commitId: Schema.NonEmptyString;
            readonly treeId: Schema.NonEmptyString;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
        }>>;
        readonly changes: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly title: Schema.NonEmptyString;
            readonly intent: Schema.NonEmptyString;
            readonly implementation: Schema.NonEmptyString;
            readonly implementationDigest: Schema.NonEmptyString;
            readonly atoms: Schema.$Array<Schema.Struct<{
                readonly changeId: Schema.NullOr<Schema.NonEmptyString>;
                readonly message: Schema.NonEmptyString;
                readonly intent: Schema.NonEmptyString;
                readonly reads: Schema.$Array<Schema.NonEmptyString>;
                readonly writes: Schema.$Array<Schema.NonEmptyString>;
            }>>;
            readonly checks: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly target: Schema.NonEmptyString;
                readonly flow: Schema.NonEmptyString;
                readonly flowDigest: Schema.NonEmptyString;
                readonly tier: Schema.Literals<readonly ["fast", "slow", "delivery"]>;
                readonly required: Schema.Boolean;
            }>>;
        }>>;
    }>;
    readonly outcome: Schema.Struct<{
        readonly status: Schema.Literals<readonly ["validated", "changes-requested", "blocked"]>;
        readonly rounds: Schema.Int;
        readonly result: Schema.NullOr<Schema.Struct<{
            readonly status: Schema.Literals<readonly ["validated", "changes-requested"]>;
            readonly changes: Schema.$Array<Schema.Struct<{
                readonly implementation: Schema.Struct<{
                    readonly change: Schema.String;
                    readonly parent: Schema.Struct<{
                        readonly changeId: Schema.NonEmptyString;
                        readonly commitId: Schema.NonEmptyString;
                        readonly treeId: Schema.NonEmptyString;
                        readonly operationId: Schema.NonEmptyString;
                        readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
                    }>;
                    readonly atoms: Schema.$Array<Schema.Struct<{
                        readonly changeId: Schema.NonEmptyString;
                        readonly commitId: Schema.NonEmptyString;
                        readonly treeId: Schema.NonEmptyString;
                        readonly operationId: Schema.NonEmptyString;
                        readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
                    }>>;
                    readonly head: Schema.Struct<{
                        readonly changeId: Schema.NonEmptyString;
                        readonly commitId: Schema.NonEmptyString;
                        readonly treeId: Schema.NonEmptyString;
                        readonly operationId: Schema.NonEmptyString;
                        readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
                    }>;
                    readonly reads: Schema.$Array<Schema.NonEmptyString>;
                    readonly writes: Schema.$Array<Schema.NonEmptyString>;
                }>;
                readonly receipts: Schema.$Array<Schema.Struct<{
                    readonly checkId: Schema.String;
                    readonly target: Schema.NonEmptyString;
                    readonly tier: Schema.Literals<readonly ["fast", "slow", "delivery"]>;
                    readonly change: Schema.String;
                    readonly commitId: Schema.NonEmptyString;
                    readonly treeId: Schema.NonEmptyString;
                    readonly inputDigest: Schema.NonEmptyString;
                    readonly status: Schema.Literals<readonly ["passed", "failed", "superseded"]>;
                    readonly fault: Schema.optionalKey<Schema.Literals<readonly ["infra", "factory"]>>;
                    readonly startedAt: Schema.optionalKey<Schema.Int>;
                    readonly finishedAt: Schema.optionalKey<Schema.Int>;
                    readonly evidence: Schema.String;
                    readonly findings: Schema.$Array<Schema.Struct<{
                        readonly owner: Schema.String;
                        readonly message: Schema.NonEmptyString;
                        readonly sourceCommitId: Schema.NonEmptyString;
                        readonly output: Schema.optionalKey<Schema.NonEmptyString>;
                    }>>;
                }>>;
            }>>;
            readonly findings: Schema.$Array<Schema.Struct<{
                readonly owner: Schema.String;
                readonly message: Schema.NonEmptyString;
                readonly sourceCommitId: Schema.NonEmptyString;
                readonly output: Schema.optionalKey<Schema.NonEmptyString>;
            }>>;
        }>>;
        readonly blocked: Schema.NullOr<Schema.Struct<{
            readonly executionId: Schema.String;
            readonly message: Schema.String;
        }>>;
        readonly stalled: Schema.optionalKey<Schema.Struct<{
            readonly _tag: Schema.Literal<"Stalled">;
            readonly signal: Schema.Literals<readonly ["tree", "checks", "output"]>;
            readonly rounds: Schema.Int;
            readonly on: Schema.Literals<readonly ["stop", "park", "escalate"]>;
        }>>;
    }>;
    readonly route: Schema.optionalKey<Schema.Literals<readonly ["implement", "bug", "feature", "close"]>>;
}>;
declare const CodingError_base: Schema.Class<CodingError, Schema.TaggedStruct<"coding/Error", {
    readonly code: Schema.Literals<readonly ["invalid_plan", "invalid_request", "fast_gate", "check_infra", "check_configuration", "check_modified_tree", "stale_revision", "invalid_receipt", "unavailable", "isolation_required", "execution", "source_missing", "source_changed", "source_refused", "not_a_todo_run", "source_unavailable", "declined", "stalled", "evicted"]>;
    readonly message: Schema.NonEmptyString;
    readonly route: Schema.optionalKey<Schema.Literals<readonly ["implement", "bug", "feature", "close"]>>;
}>, import("effect/Cause").YieldableError>;
export declare class CodingError extends CodingError_base {
}
/** A check that could not measure the revision must never become repair feedback. */
export declare const receiptOutage: (receipt: Receipt) => CodingError | undefined;
/**
 * Validate invariants before any implementation or check is scheduled.
 *
 * A Change may carry any number of checks, including none: planning attaches
 * every required check the repository has (`finalize`), and a repository may
 * have one check or none (mvp.md J1.4). A lone check gates its own tier and
 * the final assessment, which reads every non-delivery receipt (`Assess`).
 */
export declare const validatePlan: (plan: Plan) => void;
export declare const receiptMatches: (implementation: Implementation, check: Check, receipt: Receipt) => boolean;
/** The existing canonical digest binds a receipt to the exact delegated inputs. */
export declare const checkInputDigest: (implementation: Implementation, check: Check) => string;
export declare const sameRevision: (left: Revision, right: Revision) => boolean;
export {};
