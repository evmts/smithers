/**
 * Review policy and source are immutable revision data, never executable
 * declarations. The review command reads them from Git; another host supplies
 * its own immutable revisions as a {@link ReviewSource}.
 * @since 1.0.0
 */
import * as LlmLint from "@smthrs/targets/LlmLint";
import * as Label from "./Label.ts";
/**
 * The budget a proposed-check review runs under when its trusted policy declares
 * none, a new review target's included: a candidate never chooses its own spend.
 * @category constants
 * @since 1.0.0
 */
export declare const defaultProposedBudget: LlmLint.ReviewBudget;
/**
 * One entry of a revision's tree: `id` identifies its type and contents, and
 * only a `regular` file can enter a review.
 * @category models
 * @since 1.0.0
 */
export interface SourceEntry {
    readonly id: string;
    readonly regular: boolean;
}
/**
 * Immutable revisions a review reads its policy and source from.
 *
 * `tree` lists every entry at a revision by normalized workspace path; a
 * changed path is one whose entry differs between the two revisions. `read`
 * returns one regular file's text, failing past `limit` bytes. `grep` lists
 * the files at a revision whose contents match any extended regular
 * expression; it may skip paths `candidate` rejects.
 * @category models
 * @since 1.0.0
 */
export interface ReviewSource {
    readonly tree: (revision: string) => Promise<ReadonlyMap<string, SourceEntry>>;
    readonly read: (revision: string, path: string, entry: SourceEntry, limit: number) => Promise<string>;
    readonly grep: (revision: string, patterns: ReadonlyArray<string>, candidate: (path: string) => boolean) => Promise<ReadonlyArray<string>>;
}
/**
 * Operator inputs; neither revision nor engine configuration comes from candidate declarations.
 * @category models
 * @since 1.0.0
 */
export interface Options {
    readonly workspace: string;
    readonly policyRevision: string;
    readonly revision?: string | undefined;
    readonly patterns: ReadonlyArray<string>;
    readonly plan?: boolean | undefined;
    /** Every selected review, policy reviews included, must review something and run. */
    readonly required?: boolean | undefined;
    /**
     * Absolute private directory persisting runs and findings; defaults to
     * `smithers/review-findings` in the repository's Git directory, which is never committed.
     */
    readonly findingsStore?: string | undefined;
    /**
     * Absolute executable that receives each review's credential discoveries
     * before inference; see {@link reviewPrepared}.
     */
    readonly credentialReceiver?: string | undefined;
    /** The credential receiver's environment; `process.env` when omitted. */
    readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
}
/**
 * Which trusted policies one review applies, and at which revisions: the
 * policy revision is both the trusted index and the diff base. Patterns are
 * target labels (`//...:security`); none selects every review.
 * @category models
 * @since 1.0.0
 */
export interface Selection {
    readonly policyRevision: string;
    readonly revision: string;
    readonly patterns: ReadonlyArray<Label.Pattern>;
    /** Every selected review, policy reviews included, must review something and run. */
    readonly required?: boolean | undefined;
}
/**
 * Reads and validates policy without importing any module from the repository.
 * @category execution
 * @since 1.0.0
 */
export declare const prepare: (options: Options) => Promise<{
    root: string;
    policyRevision: string;
    revision: string;
    changed: string[];
    policyChanges: string[];
    policies: {
        label: string;
        payload: LlmLint.Payload;
        snapshot?: ReadonlyArray<LlmLint.SnapshotFile>;
    }[];
    snapshot: LlmLint.SnapshotFile[];
}>;
/**
 * Reads the trusted policies a selection applies and the snapshot they review
 * from any immutable source, importing no module from the repository.
 * @category execution
 * @since 1.0.0
 */
export declare const prepareSource: (source: ReviewSource, options: Selection) => Promise<{
    policyRevision: string;
    revision: string;
    changed: string[];
    policyChanges: string[];
    policies: {
        label: string;
        payload: LlmLint.Payload;
        snapshot?: ReadonlyArray<LlmLint.SnapshotFile>;
    }[];
    snapshot: LlmLint.SnapshotFile[];
}>;
/**
 * A selection's policies and the snapshot they review, as {@link prepareSource} reads them.
 * @category models
 * @since 1.0.0
 */
export type Prepared = Awaited<ReturnType<typeof prepareSource>>;
/**
 * Only the prepared policies that have something to review: a proposed-policy
 * review, or a policy whose include selects a changed file (any included file
 * for `scope: "all"`). A required review of the others would fail as empty.
 * @category execution
 * @since 1.0.0
 */
export declare const governing: (prepared: Prepared) => Prepared;
type Restrictable = {
    readonly findings: ReadonlyArray<LlmLint.Finding>;
    readonly fingerprints?: ReadonlyArray<string> | undefined;
};
/**
 * Replaces a stored review's findings with their disclosable summaries; the
 * findings themselves stay in the private store.
 * @category execution
 * @since 1.0.0
 */
export declare const restrictFindings: <A extends Restrictable>(store: string, value: A) => Promise<Omit<A, "findings" | "fingerprints"> & {
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
    findings: LlmLint.PublicSummary[];
}>;
declare const CredentialReceiverError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "smithers-build/CredentialReceiverError";
} & Readonly<A>;
/**
 * The credential receiver is not an absolute executable file, or it exited
 * nonzero for a review's discoveries.
 * @category errors
 * @since 1.0.0
 */
export declare class CredentialReceiverError extends CredentialReceiverError_base<{
    readonly code: "unusable_receiver" | "nonzero_exit";
    readonly message: string;
}> {
}
/**
 * Runs every prepared policy against its snapshot. Findings persist in the
 * private `findingsStore`; the result carries only their public summaries.
 * `transport` sends the reviews through a trusted host's model seats instead
 * of tool-free provider requests. Aborting `signal` interrupts the running
 * review, whose completed batches stay in the store, and starts no other.
 *
 * With a `credentialReceiver`, a review that discovers credentials first runs
 * that trusted executable, without arguments, in `root` with `environment`,
 * and writes the reviewed revision and each discovery's name and location to
 * its stdin as one {@link LlmLint.CredentialDelivery} JSON document. Its
 * output is discarded. A nonzero exit fails that review before inference.
 * Each review delivers its own discoveries; the receiver owns durable
 * deduplication and retry.
 * @category execution
 * @since 1.0.0
 */
export declare const reviewPrepared: (prepared: Prepared, options: {
    readonly root: string;
    readonly findingsStore: string;
    readonly transport?: LlmLint.ReviewTransport | undefined;
    readonly signal?: AbortSignal | undefined;
    readonly credentialReceiver?: string | undefined;
    readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
}) => Promise<{
    ok: boolean;
    reviews: ({
        files: readonly string[];
        attempts?: (readonly {
            readonly batch: number;
            readonly pass: number;
            readonly purpose: "review" | "verify";
            readonly candidate?: number | undefined;
            readonly engine: "claude" | "codex";
            readonly model: string;
            readonly attempt: number;
            readonly status: "completed" | "failed";
            readonly message: string;
            readonly completion?: {
                readonly status: "completed" | "incomplete" | "refused";
                readonly coverage: readonly {
                    readonly checkId: string;
                    readonly status: "completed" | "incomplete";
                    readonly evidence: string;
                }[];
                readonly missingContext: readonly string[];
                readonly findings: readonly {
                    readonly file: string;
                    readonly line: number;
                    readonly severity: "error" | "info" | "warning";
                    readonly security?: {
                        readonly checkId: string;
                        readonly impact: "critical" | "high" | "low" | "medium";
                        readonly verification: "confirmed" | "suspected";
                        readonly releaseRecommendation: "allow" | "block" | "review";
                        readonly attackerPreconditions: string;
                        readonly evidence: string;
                        readonly nextConfirmationStep: string;
                        readonly reproduction?: {
                            readonly revision: string;
                            readonly command: string;
                            readonly observedResult: string;
                        } | undefined;
                    } | undefined;
                    readonly message: string;
                }[];
            } | undefined;
        }[] & {
            batch: number;
            pass: number;
            purpose: "review" | "verify";
            candidate?: number | undefined;
            engine: "claude" | "codex";
            model: string;
            attempt: number;
            status: "completed" | "failed";
        }[]) | undefined;
        usage?: {
            readonly modelCalls: number;
            readonly promptTokens: number;
        } | undefined;
        run?: string | undefined;
        manifest?: {
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
        } | undefined;
        findings: LlmLint.PublicSummary[];
        label: string;
        representation?: string;
        status: "completed";
    } | {
        label: string;
        representation?: string;
        status: "failed";
        error: LlmLint.ModelCliMissing | {
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
        } | (Omit<LlmLint.FindingsError, "findings" | "fingerprints"> & {
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
            findings: LlmLint.PublicSummary[];
        });
    })[];
}>;
/**
 * Runs pinned policy against pinned source with tool-free inference.
 * @category execution
 * @since 1.0.0
 */
export declare const run: (options: Options) => Promise<{
    policyRevision: string;
    revision: string;
    policyChanges: string[];
    required: boolean;
    deletedFiles: string[];
    labels: string[];
    ok: boolean;
    planned: true;
    files: string[];
} | {
    policyRevision: string;
    revision: string;
    policyChanges: string[];
    required: boolean;
    deletedFiles: string[];
    labels: string[];
    findingsStore: string;
    ok: boolean;
    planned: false;
    reviews: ({
        files: readonly string[];
        attempts?: (readonly {
            readonly batch: number;
            readonly pass: number;
            readonly purpose: "review" | "verify";
            readonly candidate?: number | undefined;
            readonly engine: "claude" | "codex";
            readonly model: string;
            readonly attempt: number;
            readonly status: "completed" | "failed";
            readonly message: string;
            readonly completion?: {
                readonly status: "completed" | "incomplete" | "refused";
                readonly coverage: readonly {
                    readonly checkId: string;
                    readonly status: "completed" | "incomplete";
                    readonly evidence: string;
                }[];
                readonly missingContext: readonly string[];
                readonly findings: readonly {
                    readonly file: string;
                    readonly line: number;
                    readonly severity: "error" | "info" | "warning";
                    readonly security?: {
                        readonly checkId: string;
                        readonly impact: "critical" | "high" | "low" | "medium";
                        readonly verification: "confirmed" | "suspected";
                        readonly releaseRecommendation: "allow" | "block" | "review";
                        readonly attackerPreconditions: string;
                        readonly evidence: string;
                        readonly nextConfirmationStep: string;
                        readonly reproduction?: {
                            readonly revision: string;
                            readonly command: string;
                            readonly observedResult: string;
                        } | undefined;
                    } | undefined;
                    readonly message: string;
                }[];
            } | undefined;
        }[] & {
            batch: number;
            pass: number;
            purpose: "review" | "verify";
            candidate?: number | undefined;
            engine: "claude" | "codex";
            model: string;
            attempt: number;
            status: "completed" | "failed";
        }[]) | undefined;
        usage?: {
            readonly modelCalls: number;
            readonly promptTokens: number;
        } | undefined;
        run?: string | undefined;
        manifest?: {
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
        } | undefined;
        findings: LlmLint.PublicSummary[];
        label: string;
        representation?: string;
        status: "completed";
    } | {
        label: string;
        representation?: string;
        status: "failed";
        error: LlmLint.ModelCliMissing | {
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
        } | (Omit<LlmLint.FindingsError, "findings" | "fingerprints"> & {
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
            findings: LlmLint.PublicSummary[];
        });
    })[];
}>;
export {};
