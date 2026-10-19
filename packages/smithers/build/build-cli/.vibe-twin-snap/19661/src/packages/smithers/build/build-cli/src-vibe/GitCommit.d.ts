/**
 * Executes one `Git.Commit` target: stage, gate, message, commit.
 *
 * The sequence is fixed. A change the invocation does not own refuses it
 * before anything is staged; the owned paths are then staged and the staged
 * index is written as one git tree, the candidate. The gates run through the
 * injected {@link GateRunner} against that tree, materialized over a scratch
 * copy, never against the live working tree: an unstaged or untracked file
 * outside the scope is not in the commit, so it can neither pass nor fail a
 * gate. A red gate refuses the commit with a typed error and creates nothing. The
 * message is the `-m` override when the invoker passed one, the declared fixed
 * text otherwise, or the injected {@link AgentMessage} composition when the
 * declaration names an agent. Only then is the commit created, and it must
 * record exactly the judged tree: an index that changed after the gates ran,
 * or a hook that restaged a path, refuses with `candidate_changed` and leaves
 * HEAD where it was.
 *
 * Both collaborators are interfaces because their real implementations are
 * integration concerns: the real GateRunner is the executor running gate
 * targets against a scratch copy holding the candidate tree, and the real AgentMessage is the
 * workspace agent stack. This module owns the ordering, the git plumbing,
 * and the typed refusals; tests drive it with fakes in a throwaway
 * repository.
 *
 * @since 0.1.0
 */
import type * as Target from "@smthrs/targets/Target";
/**
 * The refusal codes one commit invocation can fail with.
 *
 * @category models
 * @since 0.1.0
 */
export type ErrorCode = "not_a_git_repository" | "invalid_paths" | "unrelated_changes" | "nothing_to_commit" | "gates_failed" | "candidate_changed" | "agent_message_unavailable" | "empty_message" | "git_failed" | "spawn_failed";
declare const GitCommitError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "smithers-build/GitCommitError";
} & Readonly<A>;
/**
 * One typed commit refusal.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class GitCommitError extends GitCommitError_base<{
    readonly code: ErrorCode;
    /** The per-gate failures behind a `gates_failed` refusal. */
    readonly failures: ReadonlyArray<GateFailure>;
    readonly message: string;
}> {
    constructor(code: ErrorCode, message: string, failures?: ReadonlyArray<GateFailure>);
}
/**
 * Checks whether a value is a commit refusal.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isGitCommitError: (value: unknown) => value is GitCommitError;
/**
 * One red gate: the gate target's rule id and its failure text.
 *
 * @category models
 * @since 0.1.0
 */
export interface GateFailure {
    readonly target: string;
    readonly message: string;
}
/**
 * The tree a commit will record, handed to the gates that approve it.
 *
 * @category models
 * @since 0.1.0
 */
export interface CandidateTree {
    /** The git tree object id the commit records. */
    readonly tree: string;
    /**
     * Makes `directory`, a copy of the working tree without `.git`, hold
     * exactly the candidate's tracked content: every path whose working-tree
     * content differs from the tree is rewritten from the tree or removed, and
     * every untracked, non-ignored path is removed. Ignored files, such as
     * installed dependencies and build outputs, stay as copied. Returns the
     * repository-relative paths it rewrote or removed.
     */
    readonly materialize: (directory: string) => Promise<ReadonlyArray<string>>;
}
/**
 * Runs the declared gate targets against the candidate tree.
 *
 * The integration binding is the executor: it materializes the candidate
 * over a scratch copy and judges each gate there, so a gate sees the commit's
 * tree and nothing else. A fake satisfies the interface in tests.
 *
 * @category models
 * @since 0.1.0
 */
export interface GateRunner {
    run(gates: ReadonlyArray<Target.AnyTarget>, candidate: CandidateTree): Promise<ReadonlyArray<GateFailure>>;
}
/**
 * Composes a commit message for an agent-written `message` declaration.
 *
 * The integration binding resolves the named workspace agent and prompts it
 * with the staged diff. A fake satisfies the interface in tests.
 *
 * @category models
 * @since 0.1.0
 */
export interface AgentMessage {
    compose(context: {
        readonly root: string;
        readonly agent: string;
        readonly stagedDiff: string;
    }): Promise<string>;
}
/**
 * The created commit.
 *
 * @category models
 * @since 0.1.0
 */
export interface CommitResult {
    readonly sha: string;
    readonly message: string;
    /**
     * The paths recorded in the created commit.
     *
     * An acknowledged sweep stages whatever the working tree carries, so callers
     * use this list to report what entered the commit instead of assuming.
     */
    readonly staged: ReadonlyArray<string>;
}
/**
 * Options accepted by {@link commit}.
 *
 * @category models
 * @since 0.1.0
 */
export interface CommitOptions {
    /** The repository root the commit is created in. */
    readonly root: string;
    /** Cancels every git subprocess when the run stops. */
    readonly signal?: AbortSignal | undefined;
    /** Per-command deadline in milliseconds. @default 60000 */
    readonly timeoutMs?: number | undefined;
    /** Host environment supplied by the runner. */
    readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
    /** Workspace cache credential names withheld from git and hooks. */
    readonly sensitiveNames?: ReadonlyArray<string> | undefined;
    /**
     * The pathspecs this commit owns, or undefined when it owns nothing.
     *
     * A scoped stage leaves a concurrent unrelated edit elsewhere unstaged and
     * uncommitted. A target-driven invocation receives the write set resolved
     * from the target's declared `changes` attr; a rule that declares none
     * arrives here undefined and is refused by {@link refuseUnrelated} rather
     * than sweeping the tree.
     */
    readonly paths?: ReadonlyArray<string> | undefined;
    /**
     * Acknowledges that this invocation intends to commit the whole working
     * tree, unrelated concurrent changes included.
     *
     * The acknowledgement exists so the sweep is a caller's stated intent rather
     * than the default a target inherits by declaring nothing. No target-driven
     * invocation passes it.
     */
    readonly sweepWorkingTree?: boolean | undefined;
    /** The `Git.Commit` target whose validated attrs drive the invocation. */
    readonly target: Target.AnyTarget;
    /** Runs the declared gates against the candidate tree. */
    readonly gateRunner: GateRunner;
    /** Composes an agent-written message; optional when the message is fixed text. */
    readonly agentMessage?: AgentMessage | undefined;
    /** The `-m` override; when present it wins over the declared message. */
    readonly messageOverride?: string | undefined;
}
/**
 * Executes one `Git.Commit` invocation: stage, gate, message, commit.
 *
 * @category execution
 * @since 0.1.0
 */
export declare const commit: (options: CommitOptions) => Promise<CommitResult>;
export {};
