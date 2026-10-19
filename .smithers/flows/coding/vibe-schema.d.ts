/** Private browser-safe values projected from ordinary finalization receipts. */
import { Schema } from "effect";
export declare const VibeInput: Schema.Struct<{
    readonly requestExecutionId: Schema.NonEmptyString;
}>;
/** Original retention gates admission; cleaned retention gates append. */
export declare const PublicationInput: Schema.Struct<{
    readonly source: Schema.Struct<{
        readonly changeId: Schema.NonEmptyString;
        readonly commitId: Schema.NonEmptyString;
        readonly treeId: Schema.NonEmptyString;
        readonly operationId: Schema.NonEmptyString;
        readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
    }>;
    readonly phase: Schema.Literals<readonly ["original", "cleaned"]>;
}>;
export declare const VibeEvidence: Schema.Struct<{
    readonly requestExecutionId: Schema.NonEmptyString;
    readonly controlRunId: Schema.NonEmptyString;
    readonly planId: Schema.NonEmptyString;
    readonly planDigest: Schema.NonEmptyString;
    readonly pocExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
    readonly preparationExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
    readonly originalSource: Schema.Struct<{
        readonly changeId: Schema.NonEmptyString;
        readonly commitId: Schema.NonEmptyString;
        readonly treeId: Schema.NonEmptyString;
        readonly operationId: Schema.NonEmptyString;
        readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
    }>;
    readonly request: Schema.Struct<{
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
    readonly fromStack: Schema.optionalKey<Schema.Boolean>;
    readonly stackBase: Schema.optionalKey<Schema.NonEmptyString>;
}>;
export type VibeEvidence = typeof VibeEvidence.Type;
/** Admission is permission to begin cleanup, not a landed or shipped result. */
export declare const VibeAdmission: Schema.Struct<{
    readonly requestExecutionId: Schema.NonEmptyString;
    readonly controlRunId: Schema.NonEmptyString;
    readonly planId: Schema.NonEmptyString;
    readonly planDigest: Schema.NonEmptyString;
    readonly pocExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
    readonly preparationExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
    readonly originalSource: Schema.Struct<{
        readonly changeId: Schema.NonEmptyString;
        readonly commitId: Schema.NonEmptyString;
        readonly treeId: Schema.NonEmptyString;
        readonly operationId: Schema.NonEmptyString;
        readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
    }>;
    readonly request: Schema.Struct<{
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
    readonly fromStack: Schema.optionalKey<Schema.Boolean>;
    readonly stackBase: Schema.optionalKey<Schema.NonEmptyString>;
    readonly validatedHead: Schema.Struct<{
        readonly changeId: Schema.NonEmptyString;
        readonly commitId: Schema.NonEmptyString;
        readonly treeId: Schema.NonEmptyString;
        readonly operationId: Schema.NonEmptyString;
        readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
    }>;
}>;
export type VibeAdmission = typeof VibeAdmission.Type;
/** Descriptions and checks completed; publication and append still follow. */
export declare const VibeCleanup: Schema.Struct<{
    readonly admission: Schema.Struct<{
        readonly requestExecutionId: Schema.NonEmptyString;
        readonly controlRunId: Schema.NonEmptyString;
        readonly planId: Schema.NonEmptyString;
        readonly planDigest: Schema.NonEmptyString;
        readonly pocExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
        readonly preparationExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
        readonly originalSource: Schema.Struct<{
            readonly changeId: Schema.NonEmptyString;
            readonly commitId: Schema.NonEmptyString;
            readonly treeId: Schema.NonEmptyString;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
        }>;
        readonly request: Schema.Struct<{
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
        readonly fromStack: Schema.optionalKey<Schema.Boolean>;
        readonly stackBase: Schema.optionalKey<Schema.NonEmptyString>;
        readonly validatedHead: Schema.Struct<{
            readonly changeId: Schema.NonEmptyString;
            readonly commitId: Schema.NonEmptyString;
            readonly treeId: Schema.NonEmptyString;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
        }>;
    }>;
    readonly summary: Schema.NonEmptyString;
    readonly result: Schema.Struct<{
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
    readonly head: Schema.Struct<{
        readonly changeId: Schema.NonEmptyString;
        readonly commitId: Schema.NonEmptyString;
        readonly treeId: Schema.NonEmptyString;
        readonly operationId: Schema.NonEmptyString;
        readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
    }>;
}>;
export type VibeCleanup = typeof VibeCleanup.Type;
/** Why a cleanup is not the tip a lander may deliver, or undefined. */
export declare const cleanedTipRefusal: (cleanup: VibeCleanup) => string | undefined;
/** One appended main commit verified from the native landing receipt. Shipped is separate. */
export declare const VibeLanded: Schema.Struct<{
    readonly cleanup: Schema.Struct<{
        readonly admission: Schema.Struct<{
            readonly requestExecutionId: Schema.NonEmptyString;
            readonly controlRunId: Schema.NonEmptyString;
            readonly planId: Schema.NonEmptyString;
            readonly planDigest: Schema.NonEmptyString;
            readonly pocExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
            readonly preparationExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
            readonly originalSource: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
            readonly request: Schema.Struct<{
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
            readonly fromStack: Schema.optionalKey<Schema.Boolean>;
            readonly stackBase: Schema.optionalKey<Schema.NonEmptyString>;
            readonly validatedHead: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
        }>;
        readonly summary: Schema.NonEmptyString;
        readonly result: Schema.Struct<{
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
        readonly head: Schema.Struct<{
            readonly changeId: Schema.NonEmptyString;
            readonly commitId: Schema.NonEmptyString;
            readonly treeId: Schema.NonEmptyString;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
        }>;
    }>;
    readonly cleanedSource: Schema.Struct<{
        readonly status: Schema.Literal<"retained">;
        readonly requestId: Schema.String;
        readonly workspaceId: Schema.String;
        readonly repositoryId: Schema.Number;
        readonly ref: Schema.String;
        readonly source: Schema.Struct<{
            readonly changeId: Schema.String;
            readonly commitId: Schema.String;
            readonly treeId: Schema.String;
            readonly parentCommitIds: Schema.$Array<Schema.String>;
        }>;
    }>;
    readonly landing: Schema.Struct<{
        readonly requestId: Schema.String;
        readonly number: Schema.Int;
    }>;
    readonly taskId: Schema.Int;
    readonly mainCommitId: Schema.NonEmptyString;
    readonly landedCount: Schema.Int;
}>;
export type VibeLanded = typeof VibeLanded.Type;
/** A send-upstream Change: its GitHub pull request is open for a maintainer to merge. Not landed. */
export declare const VibeProposed: Schema.Struct<{
    readonly cleanup: Schema.Struct<{
        readonly admission: Schema.Struct<{
            readonly requestExecutionId: Schema.NonEmptyString;
            readonly controlRunId: Schema.NonEmptyString;
            readonly planId: Schema.NonEmptyString;
            readonly planDigest: Schema.NonEmptyString;
            readonly pocExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
            readonly preparationExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
            readonly originalSource: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
            readonly request: Schema.Struct<{
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
            readonly fromStack: Schema.optionalKey<Schema.Boolean>;
            readonly stackBase: Schema.optionalKey<Schema.NonEmptyString>;
            readonly validatedHead: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
        }>;
        readonly summary: Schema.NonEmptyString;
        readonly result: Schema.Struct<{
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
        readonly head: Schema.Struct<{
            readonly changeId: Schema.NonEmptyString;
            readonly commitId: Schema.NonEmptyString;
            readonly treeId: Schema.NonEmptyString;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
        }>;
    }>;
    readonly cleanedSource: Schema.Struct<{
        readonly status: Schema.Literal<"retained">;
        readonly requestId: Schema.String;
        readonly workspaceId: Schema.String;
        readonly repositoryId: Schema.Number;
        readonly ref: Schema.String;
        readonly source: Schema.Struct<{
            readonly changeId: Schema.String;
            readonly commitId: Schema.String;
            readonly treeId: Schema.String;
            readonly parentCommitIds: Schema.$Array<Schema.String>;
        }>;
    }>;
    readonly landing: Schema.Struct<{
        readonly requestId: Schema.String;
        readonly number: Schema.Int;
    }>;
    readonly pullRequest: Schema.Struct<{
        readonly landing_number: Schema.Int;
        readonly repository: Schema.String;
        readonly number: Schema.Int;
        readonly url: Schema.String;
        readonly state: Schema.Literals<readonly ["open", "closed"]>;
        readonly merged: Schema.Boolean;
        readonly head_ref: Schema.String;
        readonly head_sha: Schema.String;
        readonly base_ref: Schema.Literal<"main">;
        readonly created: Schema.Boolean;
    }>;
}>;
export type VibeProposed = typeof VibeProposed.Type;
/** A repository with a mythical stack: the result went to the stack service, which integrates it and proposes it. */
export declare const VibeSubmitted: Schema.Struct<{
    readonly cleanup: Schema.Struct<{
        readonly admission: Schema.Struct<{
            readonly requestExecutionId: Schema.NonEmptyString;
            readonly controlRunId: Schema.NonEmptyString;
            readonly planId: Schema.NonEmptyString;
            readonly planDigest: Schema.NonEmptyString;
            readonly pocExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
            readonly preparationExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
            readonly originalSource: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
            readonly request: Schema.Struct<{
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
            readonly fromStack: Schema.optionalKey<Schema.Boolean>;
            readonly stackBase: Schema.optionalKey<Schema.NonEmptyString>;
            readonly validatedHead: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
        }>;
        readonly summary: Schema.NonEmptyString;
        readonly result: Schema.Struct<{
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
        readonly head: Schema.Struct<{
            readonly changeId: Schema.NonEmptyString;
            readonly commitId: Schema.NonEmptyString;
            readonly treeId: Schema.NonEmptyString;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
        }>;
    }>;
    readonly cleanedSource: Schema.Struct<{
        readonly status: Schema.Literal<"retained">;
        readonly requestId: Schema.String;
        readonly workspaceId: Schema.String;
        readonly repositoryId: Schema.Number;
        readonly ref: Schema.String;
        readonly source: Schema.Struct<{
            readonly changeId: Schema.String;
            readonly commitId: Schema.String;
            readonly treeId: Schema.String;
            readonly parentCommitIds: Schema.$Array<Schema.String>;
        }>;
    }>;
    readonly lane: Schema.Struct<{
        readonly itemId: Schema.NonEmptyString;
        readonly state: Schema.NonEmptyString;
        readonly source: Schema.String;
    }>;
}>;
export type VibeSubmitted = typeof VibeSubmitted.Type;
/** A TODO delivered through the reserved candidate and proposal actions. */
export declare const VibeStackProposed: Schema.Struct<{
    readonly cleanup: Schema.Struct<{
        readonly admission: Schema.Struct<{
            readonly requestExecutionId: Schema.NonEmptyString;
            readonly controlRunId: Schema.NonEmptyString;
            readonly planId: Schema.NonEmptyString;
            readonly planDigest: Schema.NonEmptyString;
            readonly pocExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
            readonly preparationExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
            readonly originalSource: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
            readonly request: Schema.Struct<{
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
            readonly fromStack: Schema.optionalKey<Schema.Boolean>;
            readonly stackBase: Schema.optionalKey<Schema.NonEmptyString>;
            readonly validatedHead: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
        }>;
        readonly summary: Schema.NonEmptyString;
        readonly result: Schema.Struct<{
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
        readonly head: Schema.Struct<{
            readonly changeId: Schema.NonEmptyString;
            readonly commitId: Schema.NonEmptyString;
            readonly treeId: Schema.NonEmptyString;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
        }>;
    }>;
    readonly cleanedSource: Schema.Struct<{
        readonly status: Schema.Literal<"retained">;
        readonly requestId: Schema.String;
        readonly workspaceId: Schema.String;
        readonly repositoryId: Schema.Number;
        readonly ref: Schema.String;
        readonly source: Schema.Struct<{
            readonly changeId: Schema.String;
            readonly commitId: Schema.String;
            readonly treeId: Schema.String;
            readonly parentCommitIds: Schema.$Array<Schema.String>;
        }>;
    }>;
    readonly proposal: Schema.Struct<{
        readonly generation: Schema.Number;
        readonly head: Schema.String;
    }>;
}>;
export type VibeStackProposed = typeof VibeStackProposed.Type;
/** A host without the backend fast-forwarded main to the one verified candidate commit. */
export declare const VibeFastForwarded: Schema.Struct<{
    readonly cleanup: Schema.Struct<{
        readonly admission: Schema.Struct<{
            readonly requestExecutionId: Schema.NonEmptyString;
            readonly controlRunId: Schema.NonEmptyString;
            readonly planId: Schema.NonEmptyString;
            readonly planDigest: Schema.NonEmptyString;
            readonly pocExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
            readonly preparationExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
            readonly originalSource: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
            readonly request: Schema.Struct<{
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
            readonly fromStack: Schema.optionalKey<Schema.Boolean>;
            readonly stackBase: Schema.optionalKey<Schema.NonEmptyString>;
            readonly validatedHead: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
        }>;
        readonly summary: Schema.NonEmptyString;
        readonly result: Schema.Struct<{
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
        readonly head: Schema.Struct<{
            readonly changeId: Schema.NonEmptyString;
            readonly commitId: Schema.NonEmptyString;
            readonly treeId: Schema.NonEmptyString;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
        }>;
    }>;
    readonly prepared: Schema.Struct<{
        readonly lander: Schema.Literals<readonly ["pull-request", "fast-forward"]>;
        readonly main: Schema.Struct<{
            readonly changeId: Schema.String;
            readonly commitId: Schema.String;
            readonly treeId: Schema.String;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.String>;
        }>;
        readonly summary: Schema.NonEmptyString;
        readonly candidate: Schema.Struct<{
            readonly changeId: Schema.String;
            readonly commitId: Schema.String;
            readonly treeId: Schema.String;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.String>;
        }>;
    }>;
    readonly mainCommitId: Schema.NonEmptyString;
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
export type VibeFastForwarded = typeof VibeFastForwarded.Type;
/** A host without the backend opened the candidate's GitHub pull request; GitHub merged it or keeps it open. */
export declare const VibePullRequested: Schema.Struct<{
    readonly cleanup: Schema.Struct<{
        readonly admission: Schema.Struct<{
            readonly requestExecutionId: Schema.NonEmptyString;
            readonly controlRunId: Schema.NonEmptyString;
            readonly planId: Schema.NonEmptyString;
            readonly planDigest: Schema.NonEmptyString;
            readonly pocExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
            readonly preparationExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
            readonly originalSource: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
            readonly request: Schema.Struct<{
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
            readonly fromStack: Schema.optionalKey<Schema.Boolean>;
            readonly stackBase: Schema.optionalKey<Schema.NonEmptyString>;
            readonly validatedHead: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
        }>;
        readonly summary: Schema.NonEmptyString;
        readonly result: Schema.Struct<{
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
        readonly head: Schema.Struct<{
            readonly changeId: Schema.NonEmptyString;
            readonly commitId: Schema.NonEmptyString;
            readonly treeId: Schema.NonEmptyString;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
        }>;
    }>;
    readonly prepared: Schema.Struct<{
        readonly lander: Schema.Literals<readonly ["pull-request", "fast-forward"]>;
        readonly main: Schema.Struct<{
            readonly changeId: Schema.String;
            readonly commitId: Schema.String;
            readonly treeId: Schema.String;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.String>;
        }>;
        readonly summary: Schema.NonEmptyString;
        readonly candidate: Schema.Struct<{
            readonly changeId: Schema.String;
            readonly commitId: Schema.String;
            readonly treeId: Schema.String;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.String>;
        }>;
    }>;
    readonly pullRequest: Schema.Struct<{
        readonly number: Schema.Int;
        readonly url: Schema.String;
        readonly state: Schema.Literals<readonly ["open", "closed", "merged"]>;
        readonly headRef: Schema.String;
        readonly headSha: Schema.String;
        readonly baseRef: Schema.String;
        readonly mergeCommitId: Schema.NullOr<Schema.String>;
    }>;
    readonly merge: Schema.Union<readonly [Schema.Struct<{
        readonly status: Schema.Literal<"merged">;
        readonly mainCommitId: Schema.String;
    }>, Schema.Struct<{
        readonly status: Schema.Literal<"open">;
        readonly reason: Schema.String;
    }>]>;
}>;
export type VibePullRequested = typeof VibePullRequested.Type;
export declare const VibeDelivered: Schema.Union<readonly [Schema.Struct<{
    readonly cleanup: Schema.Struct<{
        readonly admission: Schema.Struct<{
            readonly requestExecutionId: Schema.NonEmptyString;
            readonly controlRunId: Schema.NonEmptyString;
            readonly planId: Schema.NonEmptyString;
            readonly planDigest: Schema.NonEmptyString;
            readonly pocExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
            readonly preparationExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
            readonly originalSource: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
            readonly request: Schema.Struct<{
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
            readonly fromStack: Schema.optionalKey<Schema.Boolean>;
            readonly stackBase: Schema.optionalKey<Schema.NonEmptyString>;
            readonly validatedHead: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
        }>;
        readonly summary: Schema.NonEmptyString;
        readonly result: Schema.Struct<{
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
        readonly head: Schema.Struct<{
            readonly changeId: Schema.NonEmptyString;
            readonly commitId: Schema.NonEmptyString;
            readonly treeId: Schema.NonEmptyString;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
        }>;
    }>;
    readonly cleanedSource: Schema.Struct<{
        readonly status: Schema.Literal<"retained">;
        readonly requestId: Schema.String;
        readonly workspaceId: Schema.String;
        readonly repositoryId: Schema.Number;
        readonly ref: Schema.String;
        readonly source: Schema.Struct<{
            readonly changeId: Schema.String;
            readonly commitId: Schema.String;
            readonly treeId: Schema.String;
            readonly parentCommitIds: Schema.$Array<Schema.String>;
        }>;
    }>;
    readonly landing: Schema.Struct<{
        readonly requestId: Schema.String;
        readonly number: Schema.Int;
    }>;
    readonly taskId: Schema.Int;
    readonly mainCommitId: Schema.NonEmptyString;
    readonly landedCount: Schema.Int;
}>, Schema.Struct<{
    readonly cleanup: Schema.Struct<{
        readonly admission: Schema.Struct<{
            readonly requestExecutionId: Schema.NonEmptyString;
            readonly controlRunId: Schema.NonEmptyString;
            readonly planId: Schema.NonEmptyString;
            readonly planDigest: Schema.NonEmptyString;
            readonly pocExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
            readonly preparationExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
            readonly originalSource: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
            readonly request: Schema.Struct<{
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
            readonly fromStack: Schema.optionalKey<Schema.Boolean>;
            readonly stackBase: Schema.optionalKey<Schema.NonEmptyString>;
            readonly validatedHead: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
        }>;
        readonly summary: Schema.NonEmptyString;
        readonly result: Schema.Struct<{
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
        readonly head: Schema.Struct<{
            readonly changeId: Schema.NonEmptyString;
            readonly commitId: Schema.NonEmptyString;
            readonly treeId: Schema.NonEmptyString;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
        }>;
    }>;
    readonly cleanedSource: Schema.Struct<{
        readonly status: Schema.Literal<"retained">;
        readonly requestId: Schema.String;
        readonly workspaceId: Schema.String;
        readonly repositoryId: Schema.Number;
        readonly ref: Schema.String;
        readonly source: Schema.Struct<{
            readonly changeId: Schema.String;
            readonly commitId: Schema.String;
            readonly treeId: Schema.String;
            readonly parentCommitIds: Schema.$Array<Schema.String>;
        }>;
    }>;
    readonly landing: Schema.Struct<{
        readonly requestId: Schema.String;
        readonly number: Schema.Int;
    }>;
    readonly pullRequest: Schema.Struct<{
        readonly landing_number: Schema.Int;
        readonly repository: Schema.String;
        readonly number: Schema.Int;
        readonly url: Schema.String;
        readonly state: Schema.Literals<readonly ["open", "closed"]>;
        readonly merged: Schema.Boolean;
        readonly head_ref: Schema.String;
        readonly head_sha: Schema.String;
        readonly base_ref: Schema.Literal<"main">;
        readonly created: Schema.Boolean;
    }>;
}>, Schema.Struct<{
    readonly cleanup: Schema.Struct<{
        readonly admission: Schema.Struct<{
            readonly requestExecutionId: Schema.NonEmptyString;
            readonly controlRunId: Schema.NonEmptyString;
            readonly planId: Schema.NonEmptyString;
            readonly planDigest: Schema.NonEmptyString;
            readonly pocExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
            readonly preparationExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
            readonly originalSource: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
            readonly request: Schema.Struct<{
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
            readonly fromStack: Schema.optionalKey<Schema.Boolean>;
            readonly stackBase: Schema.optionalKey<Schema.NonEmptyString>;
            readonly validatedHead: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
        }>;
        readonly summary: Schema.NonEmptyString;
        readonly result: Schema.Struct<{
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
        readonly head: Schema.Struct<{
            readonly changeId: Schema.NonEmptyString;
            readonly commitId: Schema.NonEmptyString;
            readonly treeId: Schema.NonEmptyString;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
        }>;
    }>;
    readonly cleanedSource: Schema.Struct<{
        readonly status: Schema.Literal<"retained">;
        readonly requestId: Schema.String;
        readonly workspaceId: Schema.String;
        readonly repositoryId: Schema.Number;
        readonly ref: Schema.String;
        readonly source: Schema.Struct<{
            readonly changeId: Schema.String;
            readonly commitId: Schema.String;
            readonly treeId: Schema.String;
            readonly parentCommitIds: Schema.$Array<Schema.String>;
        }>;
    }>;
    readonly lane: Schema.Struct<{
        readonly itemId: Schema.NonEmptyString;
        readonly state: Schema.NonEmptyString;
        readonly source: Schema.String;
    }>;
}>, Schema.Struct<{
    readonly cleanup: Schema.Struct<{
        readonly admission: Schema.Struct<{
            readonly requestExecutionId: Schema.NonEmptyString;
            readonly controlRunId: Schema.NonEmptyString;
            readonly planId: Schema.NonEmptyString;
            readonly planDigest: Schema.NonEmptyString;
            readonly pocExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
            readonly preparationExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
            readonly originalSource: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
            readonly request: Schema.Struct<{
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
            readonly fromStack: Schema.optionalKey<Schema.Boolean>;
            readonly stackBase: Schema.optionalKey<Schema.NonEmptyString>;
            readonly validatedHead: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
        }>;
        readonly summary: Schema.NonEmptyString;
        readonly result: Schema.Struct<{
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
        readonly head: Schema.Struct<{
            readonly changeId: Schema.NonEmptyString;
            readonly commitId: Schema.NonEmptyString;
            readonly treeId: Schema.NonEmptyString;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
        }>;
    }>;
    readonly cleanedSource: Schema.Struct<{
        readonly status: Schema.Literal<"retained">;
        readonly requestId: Schema.String;
        readonly workspaceId: Schema.String;
        readonly repositoryId: Schema.Number;
        readonly ref: Schema.String;
        readonly source: Schema.Struct<{
            readonly changeId: Schema.String;
            readonly commitId: Schema.String;
            readonly treeId: Schema.String;
            readonly parentCommitIds: Schema.$Array<Schema.String>;
        }>;
    }>;
    readonly proposal: Schema.Struct<{
        readonly generation: Schema.Number;
        readonly head: Schema.String;
    }>;
}>, Schema.Struct<{
    readonly cleanup: Schema.Struct<{
        readonly admission: Schema.Struct<{
            readonly requestExecutionId: Schema.NonEmptyString;
            readonly controlRunId: Schema.NonEmptyString;
            readonly planId: Schema.NonEmptyString;
            readonly planDigest: Schema.NonEmptyString;
            readonly pocExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
            readonly preparationExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
            readonly originalSource: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
            readonly request: Schema.Struct<{
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
            readonly fromStack: Schema.optionalKey<Schema.Boolean>;
            readonly stackBase: Schema.optionalKey<Schema.NonEmptyString>;
            readonly validatedHead: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
        }>;
        readonly summary: Schema.NonEmptyString;
        readonly result: Schema.Struct<{
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
        readonly head: Schema.Struct<{
            readonly changeId: Schema.NonEmptyString;
            readonly commitId: Schema.NonEmptyString;
            readonly treeId: Schema.NonEmptyString;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
        }>;
    }>;
    readonly prepared: Schema.Struct<{
        readonly lander: Schema.Literals<readonly ["pull-request", "fast-forward"]>;
        readonly main: Schema.Struct<{
            readonly changeId: Schema.String;
            readonly commitId: Schema.String;
            readonly treeId: Schema.String;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.String>;
        }>;
        readonly summary: Schema.NonEmptyString;
        readonly candidate: Schema.Struct<{
            readonly changeId: Schema.String;
            readonly commitId: Schema.String;
            readonly treeId: Schema.String;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.String>;
        }>;
    }>;
    readonly mainCommitId: Schema.NonEmptyString;
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
}>, Schema.Struct<{
    readonly cleanup: Schema.Struct<{
        readonly admission: Schema.Struct<{
            readonly requestExecutionId: Schema.NonEmptyString;
            readonly controlRunId: Schema.NonEmptyString;
            readonly planId: Schema.NonEmptyString;
            readonly planDigest: Schema.NonEmptyString;
            readonly pocExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
            readonly preparationExecutionId: Schema.optionalKey<Schema.NonEmptyString>;
            readonly originalSource: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
            readonly request: Schema.Struct<{
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
            readonly fromStack: Schema.optionalKey<Schema.Boolean>;
            readonly stackBase: Schema.optionalKey<Schema.NonEmptyString>;
            readonly validatedHead: Schema.Struct<{
                readonly changeId: Schema.NonEmptyString;
                readonly commitId: Schema.NonEmptyString;
                readonly treeId: Schema.NonEmptyString;
                readonly operationId: Schema.NonEmptyString;
                readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
            }>;
        }>;
        readonly summary: Schema.NonEmptyString;
        readonly result: Schema.Struct<{
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
        readonly head: Schema.Struct<{
            readonly changeId: Schema.NonEmptyString;
            readonly commitId: Schema.NonEmptyString;
            readonly treeId: Schema.NonEmptyString;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
        }>;
    }>;
    readonly prepared: Schema.Struct<{
        readonly lander: Schema.Literals<readonly ["pull-request", "fast-forward"]>;
        readonly main: Schema.Struct<{
            readonly changeId: Schema.String;
            readonly commitId: Schema.String;
            readonly treeId: Schema.String;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.String>;
        }>;
        readonly summary: Schema.NonEmptyString;
        readonly candidate: Schema.Struct<{
            readonly changeId: Schema.String;
            readonly commitId: Schema.String;
            readonly treeId: Schema.String;
            readonly operationId: Schema.NonEmptyString;
            readonly parentCommitIds: Schema.$Array<Schema.String>;
        }>;
    }>;
    readonly pullRequest: Schema.Struct<{
        readonly number: Schema.Int;
        readonly url: Schema.String;
        readonly state: Schema.Literals<readonly ["open", "closed", "merged"]>;
        readonly headRef: Schema.String;
        readonly headSha: Schema.String;
        readonly baseRef: Schema.String;
        readonly mergeCommitId: Schema.NullOr<Schema.String>;
    }>;
    readonly merge: Schema.Union<readonly [Schema.Struct<{
        readonly status: Schema.Literal<"merged">;
        readonly mainCommitId: Schema.String;
    }>, Schema.Struct<{
        readonly status: Schema.Literal<"open">;
        readonly reason: Schema.String;
    }>]>;
}>]>;
export type VibeDelivered = typeof VibeDelivered.Type;
