/**
 * Agent sessions and the execution bodies of the `Agent.Lint`, `Agent.Diff`,
 * and `Agent.Pr` targets.
 *
 * A session is one bounded conversation with a coding agent CLI — `claude`
 * or `codex` — or with the scripted fake in `AgentFake.ts`. The runners in
 * this module implement the agent-target contract from the plan:
 *
 * - the gitDiff-derived data slice expands first, and an empty slice settles
 *   green with zero session spawns;
 * - payload inputs decode and MCP servers answer a reachability precheck
 *   before any model spend;
 * - the prompt travels over stdin to a CLI spawned with no tools, so the
 *   lane's `data` closure is rendered into it under `=== FILES ===` (one
 *   complete body per file, oversized and binary files listed by name) and
 *   the declared `S.Mcp.Http` servers reach the CLI through its MCP config;
 * - candidate edits apply through a {@link WriteSetApplier} overlay and are
 *   mechanically confined to the declared write-set;
 * - gates run against the exact candidate through a {@link GateRunner};
 * - the round loop is bounded, and exhaustion preserves the final candidate
 *   and gate report as typed artifacts;
 * - green results are admitted to a verdict cache under their full key
 *   (diff digest, prompt digest, agent identity, mode, gate identities) and
 *   replay with zero spawns.
 *
 * The spawn and envelope discipline is copied from
 * `@smthrs/targets/LlmLint` deliberately without importing it: the agent
 * stack must be able to evolve its session protocol without perturbing the
 * sealed review action.
 *
 * @since 0.1.0
 */
import type { Action, FlowRuntime } from "@smthrs/flow";
import * as AgentTarget from "@smthrs/targets/AgentTarget";
import type * as Input from "@smthrs/targets/Input";
import type * as Reference from "@smthrs/targets/Reference";
import * as Effect from "effect/Effect";
import type * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
/**
 * Maximum stdout bytes accepted from one agent CLI process.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumSessionOutputBytes: number;
/**
 * Maximum bytes of one expanded diff slice patch.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumDiffSliceBytes: number;
/**
 * Maximum bytes of one rendered session prompt.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumSessionPromptBytes: number;
/**
 * Default wall-clock timeout for one agent CLI process.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const defaultSessionTimeoutMs: number;
/**
 * Default wall-clock timeout for one MCP reachability probe.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const defaultMcpProbeTimeoutMs = 2500;
/**
 * Default wall-clock timeout for one git subprocess.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const defaultGitTimeoutMs = 30000;
/**
 * Schema of the one JSON object every agent session must answer with.
 *
 * `findings` is the lint verdict, `edits` the candidate edit set, `note` a
 * short free-text remark surfaced in feedback prompts. All three are
 * optional on the wire and normalized to empty values after decode.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const EnvelopeSchema: Schema.Struct<{
    readonly findings: Schema.optional<Schema.$Array<Schema.Struct<{
        readonly file: Schema.NonEmptyString;
        readonly line: Schema.Int;
        readonly severity: Schema.Literals<readonly ["info", "warning", "error"]>;
        readonly message: Schema.NonEmptyString;
    }>>>;
    readonly edits: Schema.optional<Schema.$Array<Schema.Struct<{
        readonly path: Schema.NonEmptyString;
        readonly contents: Schema.NullOr<Schema.String>;
    }>>>;
    readonly note: Schema.optional<Schema.String>;
}>;
/**
 * One normalized agent session answer.
 *
 * @category models
 * @since 0.1.0
 */
export interface SessionEnvelope {
    readonly findings: ReadonlyArray<AgentTarget.Finding>;
    readonly edits: ReadonlyArray<AgentTarget.CandidateEdit>;
    readonly note: string | undefined;
}
/**
 * Parses one session answer text into a normalized envelope.
 *
 * @category parsing
 * @since 0.1.0
 */
export declare const parseEnvelope: (text: string) => SessionEnvelope;
/**
 * What one session run is asked to produce.
 *
 * @category models
 * @since 0.1.0
 */
export interface SessionRequest {
    readonly purpose: "lint" | "fix" | "diff";
    readonly prompt: string;
}
/**
 * One open agent session.
 *
 * `identity` is key material: it names the resolved agent declaration (the
 * ordered engine/model list after pool expansion), so a changed declaration
 * re-keys every verdict produced through it.
 *
 * @category models
 * @since 0.1.0
 */
export interface AgentSession {
    readonly identity: string;
    readonly run: (request: SessionRequest) => Effect.Effect<SessionEnvelope, AgentTarget.AgentSessionError>;
}
/**
 * Opens sessions for declared agent references.
 *
 * @category models
 * @since 0.1.0
 */
export interface SessionFactory {
    readonly open: (ref: AgentTarget.AgentSelector | undefined, mcp?: ReadonlyArray<Reference.McpHttp>) => Effect.Effect<AgentSession, AgentTarget.AgentSessionError>;
}
/**
 * One concrete, spawnable agent after pool expansion.
 *
 * @category models
 * @since 0.1.0
 */
export interface ConcreteAgent {
    readonly name: string;
    readonly engine: "claude" | "codex";
    readonly model: string;
}
/**
 * Resolves an agent selector into the ordered concrete agents a session tries.
 *
 * An absent selector resolves the workspace's `default` agent. A reference
 * resolves against the workspace `S.Agents` declaration. An agent declared
 * inline on the lane resolves to itself and needs no workspace declaration at
 * all, which is what lets a repository that declares no `S.Agents` still name
 * the agent one lane runs on. A pool expands to its members in declared order,
 * recursively and cycle-safe, deduplicated by first appearance; an inline pool
 * still names siblings, so it resolves them against the workspace.
 *
 * @category resolution
 * @since 0.1.0
 */
export declare const resolveAgents: (agents: AgentTarget.AgentsDeclaration | undefined, ref: AgentTarget.AgentSelector | undefined) => ReadonlyArray<ConcreteAgent>;
/**
 * The key-material identity of one resolved agent list.
 *
 * @category resolution
 * @since 0.1.0
 */
export declare const agentIdentityOf: (resolved: ReadonlyArray<ConcreteAgent>) => string;
/**
 * The error messages a codex JSONL stream carries: `error` events,
 * `turn.failed` events, and completed items of type `error`. Codex reports a
 * rejected model or request this way on stdout and exits 1 with an empty
 * stderr, so without this the failure text is blank.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const codexErrorMessages: (stdout: string) => ReadonlyArray<string>;
/**
 * The `--mcp-config` document for the claude CLI: the lane's declared
 * `S.Mcp.Http` servers as streamable-HTTP entries. The document always
 * carries a `mcpServers` record, because the CLI rejects `{}` ("mcpServers:
 * Invalid input: expected record, received undefined"); a lane with no
 * servers gets an empty record, and `--strict-mcp-config` keeps the user's
 * own servers out of the session.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const claudeMcpConfig: (mcp: ReadonlyArray<Reference.McpHttp>) => string;
/**
 * Options for {@link makeCliSessionFactory}.
 *
 * @category models
 * @since 0.1.0
 */
export interface CliSessionOptions {
    readonly workspaceRoot: string;
    readonly agents: AgentTarget.AgentsDeclaration | undefined;
    readonly executables?: {
        readonly claude?: string;
        readonly codex?: string;
    } | undefined;
    readonly timeoutMs?: number | undefined;
    readonly sensitiveEnv?: ReadonlyArray<string> | undefined;
}
/**
 * A session factory over the real `claude` and `codex` CLIs.
 *
 * A pool reference tries its members in declared order: a spawn, protocol,
 * or parse failure falls through to the next member and the last failure of
 * every member is reported together. The prompt travels over stdin, never
 * argv.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const makeCliSessionFactory: (options: CliSessionOptions) => SessionFactory;
/**
 * One expanded gitDiff-derived data slice.
 *
 * `files` is the sorted union of matched changed paths, `patch` the bounded
 * diff content for exactly those paths, and `digest` the sha256 of the patch
 * — the diff-digest component of the verdict key.
 *
 * @category models
 * @since 0.1.0
 */
export interface DiffSlice {
    readonly files: ReadonlyArray<string>;
    readonly patch: string;
    readonly digest: string;
}
/**
 * Expands the gitDiff declarations of one agent target into its data slice.
 *
 * Per declaration: changed paths against `base` (added files only under
 * `added`), filtered by the declared globs, and — under `addedLines` —
 * narrowed to files with at least one added line matching the pattern. The
 * slice is the sorted union across declarations with one bounded patch over
 * exactly those files.
 *
 * @category execution
 * @since 0.1.0
 */
export declare const expandDiffSlice: (workspaceRoot: string, diffs: ReadonlyArray<Input.GitDiff>, timeoutMs?: number) => Effect.Effect<DiffSlice, AgentTarget.AgentSessionError>;
/**
 * One immutable candidate tree: agent edits layered over the worktree.
 *
 * @category models
 * @since 0.1.0
 */
export interface CandidateOverlay {
    readonly files: ReadonlyMap<string, string | null>;
    readonly read: (path: string) => Promise<string | undefined>;
    readonly render: () => string;
}
/**
 * Applies candidate edits confined to a write-set and materializes accepted
 * candidates.
 *
 * `apply` validates every edit mechanically — workspace-relative path shape,
 * write-set membership, no symlinked components — and returns a new overlay;
 * a violation rejects the whole candidate. `commit` writes an overlay to the
 * worktree (Lint `--fix` and explicit materialization).
 * Callers must trust and coordinate all workspace writers throughout apply,
 * commit, and any rollback: path checks are not descriptor-anchored and do
 * not protect against concurrent replacement of path components.
 *
 * This lane ships {@link makeLocalWriteSetApplier}; integration swaps in the
 * W2 write-set enforcement module behind the same interface.
 *
 * @category models
 * @since 0.1.0
 */
export interface WriteSetApplier {
    readonly apply: (edits: ReadonlyArray<AgentTarget.CandidateEdit>, writeSet: ReadonlyArray<string>, base?: CandidateOverlay | undefined) => Effect.Effect<CandidateOverlay, AgentTarget.AgentWriteEscape | AgentTarget.AgentSessionError>;
    readonly commit: (overlay: CandidateOverlay) => Effect.Effect<ReadonlyArray<string>, AgentTarget.AgentSessionError>;
}
/**
 * The thin in-lane write-set applier: mechanical path validation, minimatch
 * write-set confinement, and refusal of any symlinked path component.
 * Requires trusted, coordinated workspace writers throughout apply, commit,
 * and rollback; validation is path-based, not descriptor-anchored isolation.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const makeLocalWriteSetApplier: (workspaceRoot: string) => WriteSetApplier;
/**
 * Runs the declared gates against the exact candidate tree of one round.
 *
 * The in-lane implementations are {@link unavailableGateRunner} (refuses
 * loudly) and test-scripted runners; integration binds the real executor
 * behind this interface, resolving each gate identity back to its planned
 * target.
 *
 * @category models
 * @since 0.1.0
 */
export interface GateRunner {
    /** Maps an execution identity to its report label; defaults to the identity itself. */
    readonly reportIdentity?: (gateIdentity: string) => string;
    readonly run: (gateIdentities: ReadonlyArray<string>, overlay: CandidateOverlay, round: number) => Effect.Effect<ReadonlyArray<AgentTarget.GateReportEntry>, AgentTarget.AgentSessionError>;
}
/**
 * The default gate runner: green for an empty gate set, a loud typed refusal
 * for anything else. No fake green — a declared gate without a bound
 * executor is an integration error, not a pass.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const unavailableGateRunner: GateRunner;
/**
 * Stores green agent verdicts under their full key.
 *
 * @category models
 * @since 0.1.0
 */
export interface AgentVerdictStore {
    readonly get: (key: string) => Effect.Effect<string | undefined, AgentTarget.AgentSessionError>;
    readonly put: (key: string, value: string) => Effect.Effect<void, AgentTarget.AgentSessionError>;
}
/**
 * The full verdict key of one agent execution.
 *
 * @category models
 * @since 0.1.0
 */
export interface VerdictKeyMaterial {
    readonly kind: "lint" | "diff" | "pr";
    readonly diffDigest: string;
    readonly promptDigest: string;
    readonly agentIdentity: string;
    readonly mode: string;
    readonly gateIdentities: ReadonlyArray<string>;
}
/**
 * Encodes the full verdict key material into one digest.
 *
 * @category execution
 * @since 0.1.0
 */
export declare const verdictKey: (material: VerdictKeyMaterial) => string;
/**
 * An in-memory verdict store; one command's lifetime.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const makeMemoryVerdictStore: () => AgentVerdictStore;
/**
 * A file-backed verdict store under one directory; keys become file names.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const makeFileVerdictStore: (directory: string) => AgentVerdictStore;
/**
 * Opens the accepted candidate of one Agent.Pr as a pull request.
 *
 * Experimental: the build CLI does not bind an opener. This lane only ships
 * {@link unavailablePrOpener}, which refuses with the candidate preserved.
 *
 * @category models
 * @since 0.1.0
 */
export interface PrOpener {
    readonly open: (candidate: {
        readonly diff: string;
        readonly gateReport: ReadonlyArray<AgentTarget.GateReportEntry>;
    }) => Effect.Effect<string, AgentTarget.AgentSessionError>;
}
/**
 * The default PR settle: a loud typed refusal naming the integration point.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const unavailablePrOpener: PrOpener;
/**
 * Everything one agent-target execution needs.
 *
 * `payloadValues` are the invoker-supplied `S.Input` values (from the CLI at
 * integration); they are validated against the declared spec before any
 * session spawn.
 *
 * @category models
 * @since 0.1.0
 */
export interface AgentRuntime {
    readonly workspaceRoot: string;
    readonly sessions: SessionFactory;
    readonly writeSets: WriteSetApplier;
    readonly gates: GateRunner;
    readonly verdicts: AgentVerdictStore;
    readonly payloadValues?: Readonly<Record<string, string>> | undefined;
    /**
     * Workspace-relative files the prompt renders under `=== FILES ===`: the
     * lane's `data` closure minus the prompt and any git-diff declaration.
     * The session has no tools, so this is the only way it sees a source.
     */
    readonly dataFiles?: ReadonlyArray<string> | undefined;
    readonly prOpener?: PrOpener | undefined;
    readonly gitTimeoutMs?: number | undefined;
    readonly mcpProbeTimeoutMs?: number | undefined;
}
/**
 * Validates invoker payload values against the declared input spec.
 *
 * A missing required field, an out-of-set literal, or an undeclared value is
 * a typed {@link AgentTarget.AgentNeedsInput} raised before any session
 * spawn.
 *
 * @category execution
 * @since 0.1.0
 */
export declare const decodePayloadValues: (spec: Readonly<Record<string, Reference.InputSpec>>, values: Readonly<Record<string, string>>) => Effect.Effect<Readonly<Record<string, string>>, AgentTarget.AgentNeedsInput>;
/**
 * Prechecks every declared MCP server for reachability before model spend.
 *
 * Reachable means the server answered any HTTP status to a HEAD (or, when
 * HEAD itself throws, a GET) inside the probe deadline. A network failure or
 * timeout is a typed {@link AgentTarget.AgentMcpUnreachable}.
 *
 * @category execution
 * @since 0.1.0
 */
export declare const precheckMcp: (servers: ReadonlyArray<Reference.McpHttp>, timeoutMs?: number) => Effect.Effect<void, AgentTarget.AgentMcpUnreachable>;
/**
 * Largest data file rendered into a session prompt, in bytes. A larger file
 * is listed under `=== FILES ===` by name and size so the agent knows it
 * exists without the body.
 *
 * @category limits
 * @since 0.1.0
 */
export declare const maximumSessionFileBytes: number;
/**
 * Renders the lane's data files as the prompt's `=== FILES ===` section: one
 * `--- <path> ---` header and the complete body per file, in the given
 * order. A file over {@link maximumSessionFileBytes} or holding a NUL byte
 * is listed by name only. The empty list renders nothing.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const renderDataFiles: (workspaceRoot: string, files: ReadonlyArray<string>) => Effect.Effect<string, AgentTarget.AgentSessionError>;
/**
 * Executes one Agent.Lint payload.
 *
 * Order of refusals and short-circuits: no declared gitDiff refuses loudly;
 * an empty expanded slice settles green as `vacuous` with zero session
 * spawns; a cached green check verdict replays with zero spawns; findings in
 * check mode fail typed; fix mode applies session edits confined to the
 * `fixes` write-set and commits them, failing typed when findings remain.
 *
 * @category execution
 * @since 0.1.0
 */
export declare const runAgentLint: (runtime: AgentRuntime, payload: AgentTarget.LintPayload) => Effect.Effect<AgentTarget.LintReport, AgentTarget.LintError>;
/**
 * Executes one Agent.Diff payload: payload decode, MCP precheck, bounded
 * candidate/gate rounds, verdict caching.
 *
 * @category execution
 * @since 0.1.0
 */
export declare const runAgentDiff: (runtime: AgentRuntime, payload: AgentTarget.DiffPayload) => Effect.Effect<AgentTarget.DiffResult, AgentTarget.DiffError>;
/**
 * Executes one Agent.Pr payload: the same loop as Agent.Diff, then the PR
 * settle through {@link PrOpener}.
 *
 * The settle is an outward action and never replays from cache; a cached
 * loop verdict only skips the candidate production. Without a bound opener
 * the settle refuses with the candidate preserved as a typed artifact.
 *
 * @category execution
 * @since 0.1.0
 */
export declare const runAgentPr: (runtime: AgentRuntime, payload: AgentTarget.DiffPayload) => Effect.Effect<AgentTarget.PrResult, AgentTarget.PrError>;
/**
 * Implements the {@link AgentTarget.AgentLint} action with {@link runAgentLint}.
 *
 * @category layers
 * @since 0.1.0
 */
export declare const AgentLintLive: (runtime: AgentRuntime) => Layer.Layer<Action.Requirement<"smithers-build/agent-lint">, never, FlowRuntime.FlowRuntime>;
/**
 * Implements the {@link AgentTarget.AgentDiff} action with {@link runAgentDiff}.
 *
 * @category layers
 * @since 0.1.0
 */
export declare const AgentDiffLive: (runtime: AgentRuntime) => Layer.Layer<Action.Requirement<"smithers-build/agent-diff">, never, FlowRuntime.FlowRuntime>;
/**
 * Implements the {@link AgentTarget.AgentPr} action with {@link runAgentPr}.
 *
 * @category layers
 * @since 0.1.0
 */
export declare const AgentPrLive: (runtime: AgentRuntime) => Layer.Layer<Action.Requirement<"smithers-build/agent-pr">, never, FlowRuntime.FlowRuntime>;
