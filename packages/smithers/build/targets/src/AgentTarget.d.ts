/**
 * PACKAGE.ts agent target flavors and the workspace agent declarations:
 * `S.Agent.Lint`, `S.Agent.Diff`, `S.Agent.Pr`, `S.Agent.ClaudeCode`,
 * `S.Agent.Codex`, `S.Agent.Pool`, and the `S.Agents` reference surface.
 *
 * The target bodies are one sealed action call each: `Agent.Lint` plans an
 * {@link AgentLint} call, `Agent.Diff` plans an {@link AgentDiff} call, and
 * `Agent.Pr` plans an {@link AgentPr} call. The action payloads carry only
 * inert data — declared diffs, the prompt file path, payload input specs,
 * MCP declarations, write-set globs, and gate identities — so plan-time stays
 * pure. Execution is provided by the agent session layers in
 * `@smthrs/build-cli/AgentSession`.
 *
 * Agent references (`S.Agents.<name>`) are inert records validated against
 * the workspace `S.Agents({ ... })` declaration when the package index loads.
 *
 * @since 0.1.0
 */
import { Action } from "@smthrs/flow";
import * as Schema from "effect/Schema";
import * as Attr from "./Attr.ts";
import * as Input from "./Input.ts";
import * as Reference from "./Reference.ts";
import * as Target from "./Target.ts";
/**
 * Maximum bytes of one agent prompt file.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumPromptBytes: number;
/**
 * Schema for a Claude Code agent declaration.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const ClaudeCodeAgent: Schema.TaggedStruct<"AgentClaudeCode", {
    readonly model: Schema.NonEmptyString;
}>;
/**
 * A Claude Code agent declaration.
 *
 * @category models
 * @since 0.1.0
 */
export type ClaudeCodeAgent = typeof ClaudeCodeAgent.Type;
/**
 * Schema for a Codex agent declaration.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const CodexAgent: Schema.TaggedStruct<"AgentCodex", {
    readonly model: Schema.NonEmptyString;
}>;
/**
 * A Codex agent declaration.
 *
 * @category models
 * @since 0.1.0
 */
export type CodexAgent = typeof CodexAgent.Type;
/**
 * Schema for an agent pool declaration naming sibling agents.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const PoolAgent: Schema.TaggedStruct<"AgentPool", {
    readonly agents: Schema.$Array<Schema.NonEmptyString>;
}>;
/**
 * An agent pool declaration.
 *
 * @category models
 * @since 0.1.0
 */
export type PoolAgent = typeof PoolAgent.Type;
/**
 * Schema for one workspace agent declaration.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const AgentDeclaration: Schema.Union<readonly [Schema.TaggedStruct<"AgentClaudeCode", {
    readonly model: Schema.NonEmptyString;
}>, Schema.TaggedStruct<"AgentCodex", {
    readonly model: Schema.NonEmptyString;
}>, Schema.TaggedStruct<"AgentPool", {
    readonly agents: Schema.$Array<Schema.NonEmptyString>;
}>]>;
/**
 * One workspace agent declaration.
 *
 * @category models
 * @since 0.1.0
 */
export type AgentDeclaration = typeof AgentDeclaration.Type;
/**
 * Checks whether a value is one workspace agent declaration.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isAgentDeclaration: (value: unknown) => value is AgentDeclaration;
/**
 * Schema for the `agent` attr: a reference to a workspace-declared agent
 * (`S.Agents.luna`), or an agent declaration written where it is used
 * (`S.Agent.Codex("gpt-6-luna")`).
 *
 * Both spellings say the same thing about which agent runs. The reference
 * form names the workspace's reviewed set and is what a repository with an
 * `S.Agents({ ... })` declaration writes; the inline form is what a
 * repository without one writes, and it is not less explicit — the
 * declaration is right there in the lane.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const AgentSelector: Schema.Union<readonly [Schema.TaggedStruct<"AgentRef", {
    readonly name: Schema.NonEmptyString;
}>, Schema.Union<readonly [Schema.TaggedStruct<"AgentClaudeCode", {
    readonly model: Schema.NonEmptyString;
}>, Schema.TaggedStruct<"AgentCodex", {
    readonly model: Schema.NonEmptyString;
}>, Schema.TaggedStruct<"AgentPool", {
    readonly agents: Schema.$Array<Schema.NonEmptyString>;
}>]>]>;
/**
 * The `agent` attr: a workspace agent reference, or an inline declaration.
 *
 * @category models
 * @since 0.1.0
 */
export type AgentSelector = typeof AgentSelector.Type;
/**
 * Maximum findings accepted from one agent response.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumFindings = 10000;
/**
 * Maximum UTF-16 code units of one finding message.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumFindingMessage: number;
/**
 * Maximum UTF-16 code units of one workspace-relative path.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumPathLength: number;
/**
 * Maximum UTF-16 code units of one candidate edit's contents.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumEditLength: number;
/**
 * Maximum candidate edits accepted from one agent response.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumEdits = 4096;
/**
 * Maximum bounded rounds one Agent.Diff or Agent.Pr loop may declare.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumRounds = 16;
/**
 * Rounds an Agent.Pr declaration runs when it omits `maxRounds`.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const defaultPrRounds = 3;
/**
 * Maximum UTF-16 code units of one gate report detail.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumGateDetail: number;
/**
 * Rounds one bounded candidate and gate loop runs: a whole number from 1 to
 * {@link maximumRounds}.
 *
 * Every declaration that projects to a {@link DiffPayload} shares it, so a
 * declaration a rule accepts always projects to a payload the action accepts.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const RoundCount: Schema.Int;
/**
 * Rounds one bounded candidate and gate loop runs.
 *
 * @category models
 * @since 0.1.0
 */
export type RoundCount = typeof RoundCount.Type;
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
/**
 * One agent finding against a file in the reviewed diff slice.
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
    readonly message: Schema.NonEmptyString;
}>;
/**
 * One agent finding against a file in the reviewed diff slice.
 *
 * @category models
 * @since 0.1.0
 */
export type Finding = typeof Finding.Type;
/**
 * The execution mode of one Agent.Lint run: `check` reports findings and
 * `fix` also applies candidate edits confined to the `fixes` write-set.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Mode: Schema.Literals<readonly ["check", "fix"]>;
/**
 * The execution mode of one Agent.Lint run.
 *
 * @category models
 * @since 0.1.0
 */
export type Mode = typeof Mode.Type;
/**
 * One candidate file edit an agent session proposes: the complete next
 * contents of a workspace-relative path, or null to delete it.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const CandidateEdit: Schema.Struct<{
    readonly path: Schema.NonEmptyString;
    readonly contents: Schema.NullOr<Schema.String>;
}>;
/**
 * One candidate file edit an agent session proposes.
 *
 * @category models
 * @since 0.1.0
 */
export type CandidateEdit = typeof CandidateEdit.Type;
/**
 * The verdict of one gate run against a candidate tree.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const GateStatus: Schema.Literals<readonly ["green", "red"]>;
/**
 * The verdict of one gate run against a candidate tree.
 *
 * @category models
 * @since 0.1.0
 */
export type GateStatus = typeof GateStatus.Type;
/**
 * One gate's verdict against the exact candidate tree of one round.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const GateReportEntry: Schema.Struct<{
    readonly gate: Schema.NonEmptyString;
    readonly status: Schema.Literals<readonly ["green", "red"]>;
    readonly detail: Schema.optional<Schema.String>;
}>;
/**
 * One gate's verdict against the exact candidate tree of one round.
 *
 * @category models
 * @since 0.1.0
 */
export type GateReportEntry = typeof GateReportEntry.Type;
declare const AgentSessionError_base: Schema.Class<AgentSessionError, Schema.TaggedStruct<"smithers-build/AgentSessionError", {
    readonly phase: Schema.Literals<readonly ["resolve", "diff", "read", "spawn", "parse", "apply", "gate", "settle", "cache"]>;
    readonly message: Schema.NonEmptyString;
}>, import("effect/Cause").YieldableError>;
/**
 * An agent execution step failed: resolving the agent, reading the prompt or
 * diff slice, spawning or parsing a session, applying edits, running gates,
 * settling, or consulting the verdict cache.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class AgentSessionError extends AgentSessionError_base {
}
declare const AgentNeedsInput_base: Schema.Class<AgentNeedsInput, Schema.TaggedStruct<"smithers-build/AgentNeedsInput", {
    readonly field: Schema.NonEmptyString;
    readonly expected: Schema.NonEmptyString;
    readonly message: Schema.NonEmptyString;
}>, import("effect/Cause").YieldableError>;
/**
 * A required payload input is missing or invalid; raised before any session
 * spawn.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class AgentNeedsInput extends AgentNeedsInput_base {
}
declare const AgentMcpUnreachable_base: Schema.Class<AgentMcpUnreachable, Schema.TaggedStruct<"smithers-build/AgentMcpUnreachable", {
    readonly name: Schema.NonEmptyString;
    readonly url: Schema.NonEmptyString;
    readonly message: Schema.NonEmptyString;
}>, import("effect/Cause").YieldableError>;
/**
 * A declared MCP server did not answer the reachability precheck; raised
 * before any session spawn.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class AgentMcpUnreachable extends AgentMcpUnreachable_base {
}
declare const AgentWriteEscape_base: Schema.Class<AgentWriteEscape, Schema.TaggedStruct<"smithers-build/AgentWriteEscape", {
    readonly path: Schema.NonEmptyString;
    readonly writeSet: Schema.$Array<Schema.String>;
    readonly message: Schema.NonEmptyString;
}>, import("effect/Cause").YieldableError>;
/**
 * An agent session proposed a write outside its declared write-set. The
 * candidate is rejected whole; no file changes.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class AgentWriteEscape extends AgentWriteEscape_base {
}
declare const AgentFindingsError_base: Schema.Class<AgentFindingsError, Schema.TaggedStruct<"smithers-build/AgentFindingsError", {
    readonly findings: Schema.$Array<Schema.Struct<{
        readonly file: Schema.NonEmptyString;
        readonly line: Schema.Int;
        readonly severity: Schema.Literals<readonly ["info", "warning", "error"]>;
        readonly message: Schema.NonEmptyString;
    }>>;
    readonly message: Schema.NonEmptyString;
}>, import("effect/Cause").YieldableError>;
/**
 * A check-mode Agent.Lint completed and the agent reported findings.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class AgentFindingsError extends AgentFindingsError_base {
}
declare const AgentRoundsExhausted_base: Schema.Class<AgentRoundsExhausted, Schema.TaggedStruct<"smithers-build/AgentRoundsExhausted", {
    readonly rounds: Schema.Int;
    readonly diff: Schema.String;
    readonly gateReport: Schema.$Array<Schema.Struct<{
        readonly gate: Schema.NonEmptyString;
        readonly status: Schema.Literals<readonly ["green", "red"]>;
        readonly detail: Schema.optional<Schema.String>;
    }>>;
    readonly message: Schema.NonEmptyString;
}>, import("effect/Cause").YieldableError>;
/**
 * The bounded candidate/gate loop exhausted `maxRounds` without a green gate
 * set. `diff` and `gateReport` preserve the final candidate as artifacts.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class AgentRoundsExhausted extends AgentRoundsExhausted_base {
}
declare const AgentPrSettleRefused_base: Schema.Class<AgentPrSettleRefused, Schema.TaggedStruct<"smithers-build/AgentPrSettleRefused", {
    readonly diff: Schema.String;
    readonly gateReport: Schema.$Array<Schema.Struct<{
        readonly gate: Schema.NonEmptyString;
        readonly status: Schema.Literals<readonly ["green", "red"]>;
        readonly detail: Schema.optional<Schema.String>;
    }>>;
    readonly message: Schema.NonEmptyString;
}>, import("effect/Cause").YieldableError>;
/**
 * The Agent.Pr loop converged but the PR settle action is not bound. The
 * candidate and its gate report are preserved as artifacts. Opening the pull
 * request is the Github lane's interface; this build refuses rather than
 * faking the outward action.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class AgentPrSettleRefused extends AgentPrSettleRefused_base {
}
/**
 * Every failure one Agent.Lint execution can produce.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const LintError: Schema.Union<readonly [typeof AgentSessionError, typeof AgentWriteEscape, typeof AgentFindingsError]>;
/**
 * Every failure one Agent.Lint execution can produce.
 *
 * @category models
 * @since 0.1.0
 */
export type LintError = typeof LintError.Type;
/**
 * Every failure one Agent.Diff execution can produce.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const DiffError: Schema.Union<readonly [typeof AgentNeedsInput, typeof AgentMcpUnreachable, typeof AgentWriteEscape, typeof AgentRoundsExhausted, typeof AgentSessionError]>;
/**
 * Every failure one Agent.Diff execution can produce.
 *
 * @category models
 * @since 0.1.0
 */
export type DiffError = typeof DiffError.Type;
/**
 * Every failure one Agent.Pr execution can produce.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const PrError: Schema.Union<readonly [typeof AgentNeedsInput, typeof AgentMcpUnreachable, typeof AgentWriteEscape, typeof AgentRoundsExhausted, typeof AgentPrSettleRefused, typeof AgentSessionError]>;
/**
 * Every failure one Agent.Pr execution can produce.
 *
 * @category models
 * @since 0.1.0
 */
export type PrError = typeof PrError.Type;
/**
 * Payload of one {@link AgentLint} call.
 *
 * `promptPath` is the declared prompt file path (`//`-prefixed paths resolve
 * from the workspace root, everything else from `packageDirectory`).
 * `diffs` are the `S.gitDiff` declarations found in the target's `data`; the
 * expanded slice is the review subject and an empty expansion settles green
 * with zero session spawns. `fixes` is the write-set candidate fixes are
 * confined to in `fix` mode.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const LintPayload: Schema.Struct<{
    readonly agent: Schema.optional<Schema.Union<readonly [Schema.TaggedStruct<"AgentRef", {
        readonly name: Schema.NonEmptyString;
    }>, Schema.Union<readonly [Schema.TaggedStruct<"AgentClaudeCode", {
        readonly model: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"AgentCodex", {
        readonly model: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"AgentPool", {
        readonly agents: Schema.$Array<Schema.NonEmptyString>;
    }>]>]>>;
    readonly promptPath: Schema.NonEmptyString;
    readonly packageDirectory: Schema.optional<Schema.String>;
    readonly diffs: Schema.$Array<Schema.TaggedStruct<"GitDiff", {
        readonly base: Schema.NonEmptyString;
        readonly paths: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly added: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly addedLines: Schema.optional<Schema.NonEmptyString>;
    }>>;
    readonly fixes: Schema.$Array<Schema.NonEmptyString>;
    readonly mode: Schema.Literals<readonly ["check", "fix"]>;
}>;
/**
 * Payload of one {@link AgentLint} call.
 *
 * @category models
 * @since 0.1.0
 */
export type LintPayload = typeof LintPayload.Type;
/**
 * Result of one green Agent.Lint execution.
 *
 * `vacuous` is true when the expanded diff slice was empty and no agent
 * session was invoked; `note` then says so explicitly. `fixed` lists the
 * paths a `fix`-mode run rewrote.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const LintReport: Schema.Struct<{
    readonly vacuous: Schema.Boolean;
    readonly note: Schema.optional<Schema.String>;
    readonly files: Schema.$Array<Schema.String>;
    readonly findings: Schema.$Array<Schema.Struct<{
        readonly file: Schema.NonEmptyString;
        readonly line: Schema.Int;
        readonly severity: Schema.Literals<readonly ["info", "warning", "error"]>;
        readonly message: Schema.NonEmptyString;
    }>>;
    readonly fixed: Schema.$Array<Schema.String>;
}>;
/**
 * Result of one green Agent.Lint execution.
 *
 * @category models
 * @since 0.1.0
 */
export type LintReport = typeof LintReport.Type;
/**
 * Payload of one {@link AgentDiff} or {@link AgentPr} call.
 *
 * `payloadSpec` declares the invoker inputs; the values arrive at execution
 * time and are validated against this spec before any session spawn. `mcp`
 * lists the declared MCP servers prechecked for reachability before model
 * spend. `changes` is the write-set every candidate edit must stay inside.
 * `gateIdentities` are the structural identities of the declared gates, in
 * order; the gate runner resolves them back to executable targets.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const DiffPayload: Schema.Struct<{
    readonly agent: Schema.optional<Schema.Union<readonly [Schema.TaggedStruct<"AgentRef", {
        readonly name: Schema.NonEmptyString;
    }>, Schema.Union<readonly [Schema.TaggedStruct<"AgentClaudeCode", {
        readonly model: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"AgentCodex", {
        readonly model: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"AgentPool", {
        readonly agents: Schema.$Array<Schema.NonEmptyString>;
    }>]>]>>;
    readonly promptPath: Schema.NonEmptyString;
    readonly packageDirectory: Schema.optional<Schema.String>;
    readonly payloadSpec: Schema.$Record<Schema.String, Schema.Union<readonly [Schema.TaggedStruct<"InputString", {
        readonly description: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"InputLiterals", {
        readonly values: Schema.$Array<Schema.NonEmptyString>;
    }>, Schema.TaggedStruct<"InputOptional", {
        readonly inner: Schema.Union<readonly [Schema.TaggedStruct<"InputString", {
            readonly description: Schema.NonEmptyString;
        }>, Schema.TaggedStruct<"InputLiterals", {
            readonly values: Schema.$Array<Schema.NonEmptyString>;
        }>]>;
    }>]>>;
    readonly mcp: Schema.$Array<Schema.TaggedStruct<"McpHttp", {
        readonly name: Schema.NonEmptyString;
        readonly url: Schema.NonEmptyString;
    }>>;
    readonly diffs: Schema.$Array<Schema.TaggedStruct<"GitDiff", {
        readonly base: Schema.NonEmptyString;
        readonly paths: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly added: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly addedLines: Schema.optional<Schema.NonEmptyString>;
    }>>;
    readonly changes: Schema.$Array<Schema.NonEmptyString>;
    readonly gateIdentities: Schema.$Array<Schema.NonEmptyString>;
    readonly maxRounds: Schema.Int;
}>;
/**
 * Payload of one {@link AgentDiff} or {@link AgentPr} call.
 *
 * @category models
 * @since 0.1.0
 */
export type DiffPayload = typeof DiffPayload.Type;
/**
 * Result of one green Agent.Diff execution: the accepted candidate and the
 * gate report that admitted it.
 *
 * `vacuous` is true when the target declared `S.gitDiff` data and its
 * expansion was empty, so no session was invoked. `diff` is a rendered
 * listing of the candidate tree; `edits` is the exact accepted edit set.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const DiffResult: Schema.Struct<{
    readonly vacuous: Schema.Boolean;
    readonly rounds: Schema.Int;
    readonly diff: Schema.String;
    readonly edits: Schema.$Array<Schema.Struct<{
        readonly path: Schema.NonEmptyString;
        readonly contents: Schema.NullOr<Schema.String>;
    }>>;
    readonly gateReport: Schema.$Array<Schema.Struct<{
        readonly gate: Schema.NonEmptyString;
        readonly status: Schema.Literals<readonly ["green", "red"]>;
        readonly detail: Schema.optional<Schema.String>;
    }>>;
}>;
/**
 * Result of one green Agent.Diff execution.
 *
 * @category models
 * @since 0.1.0
 */
export type DiffResult = typeof DiffResult.Type;
/**
 * Result of one green Agent.Pr execution: the accepted candidate plus the
 * opened pull request reference.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const PrResult: Schema.Struct<{
    readonly vacuous: Schema.Boolean;
    readonly rounds: Schema.Int;
    readonly diff: Schema.String;
    readonly edits: Schema.$Array<Schema.Struct<{
        readonly path: Schema.NonEmptyString;
        readonly contents: Schema.NullOr<Schema.String>;
    }>>;
    readonly gateReport: Schema.$Array<Schema.Struct<{
        readonly gate: Schema.NonEmptyString;
        readonly status: Schema.Literals<readonly ["green", "red"]>;
        readonly detail: Schema.optional<Schema.String>;
    }>>;
    readonly pr: Schema.optional<Schema.String>;
}>;
/**
 * Result of one green Agent.Pr execution.
 *
 * @category models
 * @since 0.1.0
 */
export type PrResult = typeof PrResult.Type;
/**
 * The sealed action one Agent.Lint target plans.
 *
 * @category actions
 * @since 0.1.0
 */
export declare const AgentLint: Action.Declared<"smithers-build/agent-lint", Schema.Struct<{
    readonly agent: Schema.optional<Schema.Union<readonly [Schema.TaggedStruct<"AgentRef", {
        readonly name: Schema.NonEmptyString;
    }>, Schema.Union<readonly [Schema.TaggedStruct<"AgentClaudeCode", {
        readonly model: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"AgentCodex", {
        readonly model: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"AgentPool", {
        readonly agents: Schema.$Array<Schema.NonEmptyString>;
    }>]>]>>;
    readonly promptPath: Schema.NonEmptyString;
    readonly packageDirectory: Schema.optional<Schema.String>;
    readonly diffs: Schema.$Array<Schema.TaggedStruct<"GitDiff", {
        readonly base: Schema.NonEmptyString;
        readonly paths: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly added: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly addedLines: Schema.optional<Schema.NonEmptyString>;
    }>>;
    readonly fixes: Schema.$Array<Schema.NonEmptyString>;
    readonly mode: Schema.Literals<readonly ["check", "fix"]>;
}>, Schema.Struct<{
    readonly vacuous: Schema.Boolean;
    readonly note: Schema.optional<Schema.String>;
    readonly files: Schema.$Array<Schema.String>;
    readonly findings: Schema.$Array<Schema.Struct<{
        readonly file: Schema.NonEmptyString;
        readonly line: Schema.Int;
        readonly severity: Schema.Literals<readonly ["info", "warning", "error"]>;
        readonly message: Schema.NonEmptyString;
    }>>;
    readonly fixed: Schema.$Array<Schema.String>;
}>, Schema.Union<readonly [typeof AgentSessionError, typeof AgentWriteEscape, typeof AgentFindingsError]>, Action.Requirement<"smithers-build/agent-lint">>;
/**
 * The sealed action one Agent.Diff target plans.
 *
 * @category actions
 * @since 0.1.0
 */
export declare const AgentDiff: Action.Declared<"smithers-build/agent-diff", Schema.Struct<{
    readonly agent: Schema.optional<Schema.Union<readonly [Schema.TaggedStruct<"AgentRef", {
        readonly name: Schema.NonEmptyString;
    }>, Schema.Union<readonly [Schema.TaggedStruct<"AgentClaudeCode", {
        readonly model: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"AgentCodex", {
        readonly model: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"AgentPool", {
        readonly agents: Schema.$Array<Schema.NonEmptyString>;
    }>]>]>>;
    readonly promptPath: Schema.NonEmptyString;
    readonly packageDirectory: Schema.optional<Schema.String>;
    readonly payloadSpec: Schema.$Record<Schema.String, Schema.Union<readonly [Schema.TaggedStruct<"InputString", {
        readonly description: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"InputLiterals", {
        readonly values: Schema.$Array<Schema.NonEmptyString>;
    }>, Schema.TaggedStruct<"InputOptional", {
        readonly inner: Schema.Union<readonly [Schema.TaggedStruct<"InputString", {
            readonly description: Schema.NonEmptyString;
        }>, Schema.TaggedStruct<"InputLiterals", {
            readonly values: Schema.$Array<Schema.NonEmptyString>;
        }>]>;
    }>]>>;
    readonly mcp: Schema.$Array<Schema.TaggedStruct<"McpHttp", {
        readonly name: Schema.NonEmptyString;
        readonly url: Schema.NonEmptyString;
    }>>;
    readonly diffs: Schema.$Array<Schema.TaggedStruct<"GitDiff", {
        readonly base: Schema.NonEmptyString;
        readonly paths: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly added: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly addedLines: Schema.optional<Schema.NonEmptyString>;
    }>>;
    readonly changes: Schema.$Array<Schema.NonEmptyString>;
    readonly gateIdentities: Schema.$Array<Schema.NonEmptyString>;
    readonly maxRounds: Schema.Int;
}>, Schema.Struct<{
    readonly vacuous: Schema.Boolean;
    readonly rounds: Schema.Int;
    readonly diff: Schema.String;
    readonly edits: Schema.$Array<Schema.Struct<{
        readonly path: Schema.NonEmptyString;
        readonly contents: Schema.NullOr<Schema.String>;
    }>>;
    readonly gateReport: Schema.$Array<Schema.Struct<{
        readonly gate: Schema.NonEmptyString;
        readonly status: Schema.Literals<readonly ["green", "red"]>;
        readonly detail: Schema.optional<Schema.String>;
    }>>;
}>, Schema.Union<readonly [typeof AgentNeedsInput, typeof AgentMcpUnreachable, typeof AgentWriteEscape, typeof AgentRoundsExhausted, typeof AgentSessionError]>, Action.Requirement<"smithers-build/agent-diff">>;
/**
 * The sealed action one Agent.Pr target plans.
 *
 * @category actions
 * @since 0.1.0
 */
export declare const AgentPr: Action.Declared<"smithers-build/agent-pr", Schema.Struct<{
    readonly agent: Schema.optional<Schema.Union<readonly [Schema.TaggedStruct<"AgentRef", {
        readonly name: Schema.NonEmptyString;
    }>, Schema.Union<readonly [Schema.TaggedStruct<"AgentClaudeCode", {
        readonly model: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"AgentCodex", {
        readonly model: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"AgentPool", {
        readonly agents: Schema.$Array<Schema.NonEmptyString>;
    }>]>]>>;
    readonly promptPath: Schema.NonEmptyString;
    readonly packageDirectory: Schema.optional<Schema.String>;
    readonly payloadSpec: Schema.$Record<Schema.String, Schema.Union<readonly [Schema.TaggedStruct<"InputString", {
        readonly description: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"InputLiterals", {
        readonly values: Schema.$Array<Schema.NonEmptyString>;
    }>, Schema.TaggedStruct<"InputOptional", {
        readonly inner: Schema.Union<readonly [Schema.TaggedStruct<"InputString", {
            readonly description: Schema.NonEmptyString;
        }>, Schema.TaggedStruct<"InputLiterals", {
            readonly values: Schema.$Array<Schema.NonEmptyString>;
        }>]>;
    }>]>>;
    readonly mcp: Schema.$Array<Schema.TaggedStruct<"McpHttp", {
        readonly name: Schema.NonEmptyString;
        readonly url: Schema.NonEmptyString;
    }>>;
    readonly diffs: Schema.$Array<Schema.TaggedStruct<"GitDiff", {
        readonly base: Schema.NonEmptyString;
        readonly paths: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly added: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly addedLines: Schema.optional<Schema.NonEmptyString>;
    }>>;
    readonly changes: Schema.$Array<Schema.NonEmptyString>;
    readonly gateIdentities: Schema.$Array<Schema.NonEmptyString>;
    readonly maxRounds: Schema.Int;
}>, Schema.Struct<{
    readonly vacuous: Schema.Boolean;
    readonly rounds: Schema.Int;
    readonly diff: Schema.String;
    readonly edits: Schema.$Array<Schema.Struct<{
        readonly path: Schema.NonEmptyString;
        readonly contents: Schema.NullOr<Schema.String>;
    }>>;
    readonly gateReport: Schema.$Array<Schema.Struct<{
        readonly gate: Schema.NonEmptyString;
        readonly status: Schema.Literals<readonly ["green", "red"]>;
        readonly detail: Schema.optional<Schema.String>;
    }>>;
    readonly pr: Schema.optional<Schema.String>;
}>, Schema.Union<readonly [typeof AgentNeedsInput, typeof AgentMcpUnreachable, typeof AgentWriteEscape, typeof AgentRoundsExhausted, typeof AgentPrSettleRefused, typeof AgentSessionError]>, Action.Requirement<"smithers-build/agent-pr">>;
/**
 * Collects every `S.gitDiff` declaration from a `data` attr, in declaration
 * order, descending nested arrays.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const collectGitDiffs: (data: (typeof Attr.Data)["Type"]) => ReadonlyArray<Input.GitDiff>;
/**
 * The structural identity of one target: its definition name plus a digest of
 * its canonically encoded attrs and schema contracts.
 *
 * Agent gate identities are key material for the agent verdict cache, so two
 * instances of the same definition with different attrs must not collide, and
 * one instance must produce the same identity in every process. Nothing
 * process-local enters the digest for that second reason.
 * This is a plan-time stand-in for the planner's full target key, which also
 * digests expanded file inputs; the integration point swaps it for the
 * planner key without changing the payload shape.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const targetIdentity: (target: Target.AnyTarget) => string;
/**
 * Attrs for {@link Lint}.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const LintAttrs: Schema.Struct<{
    readonly agent: Schema.optional<Schema.Union<readonly [Schema.TaggedStruct<"AgentRef", {
        readonly name: Schema.NonEmptyString;
    }>, Schema.Union<readonly [Schema.TaggedStruct<"AgentClaudeCode", {
        readonly model: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"AgentCodex", {
        readonly model: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"AgentPool", {
        readonly agents: Schema.$Array<Schema.NonEmptyString>;
    }>]>]>>;
    readonly prompt: Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>;
    readonly data: Schema.$Array<Schema.Union<readonly [Schema.Union<readonly [Schema.declare<Target.AnyTarget, Target.AnyTarget>, Schema.Union<readonly [Schema.TaggedStruct<"Glob", {
        readonly pattern: Schema.NonEmptyString;
        readonly exclude: Schema.$Array<Schema.String>;
    }>, Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"GitDiff", {
        readonly base: Schema.NonEmptyString;
        readonly paths: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly added: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly addedLines: Schema.optional<Schema.NonEmptyString>;
    }>, Schema.TaggedStruct<"PnpmWorkspace", {
        readonly path: Schema.NonEmptyString;
    }>]>, Schema.TaggedStruct<"NodeModule", {
        readonly package: Schema.NonEmptyString;
    }>]>, Schema.$Array<Schema.Union<readonly [Schema.declare<Target.AnyTarget, Target.AnyTarget>, Schema.Union<readonly [Schema.TaggedStruct<"Glob", {
        readonly pattern: Schema.NonEmptyString;
        readonly exclude: Schema.$Array<Schema.String>;
    }>, Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"GitDiff", {
        readonly base: Schema.NonEmptyString;
        readonly paths: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly added: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly addedLines: Schema.optional<Schema.NonEmptyString>;
    }>, Schema.TaggedStruct<"PnpmWorkspace", {
        readonly path: Schema.NonEmptyString;
    }>]>, Schema.TaggedStruct<"NodeModule", {
        readonly package: Schema.NonEmptyString;
    }>]>>]>>;
    readonly fixes: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
}>;
/**
 * Projects decoded Agent.Lint attrs into the {@link AgentLint} payload.
 *
 * The mode is `check`; the `--fix` invocation reaches execution as a payload
 * override wired by the CLI, not as a second declaration.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const lintPayload: (attrs: (typeof LintAttrs)["Type"], context: Target.ImplementationContext) => LintPayload;
/**
 * An agent-judged lint over the declared data; an empty expanded diff is
 * vacuously green with zero agent spawns.
 *
 * @category targets
 * @since 0.1.0
 */
export declare const Lint: Target.Definition<"Agent.Lint", Schema.Struct<{
    readonly agent: Schema.optional<Schema.Union<readonly [Schema.TaggedStruct<"AgentRef", {
        readonly name: Schema.NonEmptyString;
    }>, Schema.Union<readonly [Schema.TaggedStruct<"AgentClaudeCode", {
        readonly model: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"AgentCodex", {
        readonly model: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"AgentPool", {
        readonly agents: Schema.$Array<Schema.NonEmptyString>;
    }>]>]>>;
    readonly prompt: Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>;
    readonly data: Schema.$Array<Schema.Union<readonly [Schema.Union<readonly [Schema.declare<Target.AnyTarget, Target.AnyTarget>, Schema.Union<readonly [Schema.TaggedStruct<"Glob", {
        readonly pattern: Schema.NonEmptyString;
        readonly exclude: Schema.$Array<Schema.String>;
    }>, Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"GitDiff", {
        readonly base: Schema.NonEmptyString;
        readonly paths: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly added: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly addedLines: Schema.optional<Schema.NonEmptyString>;
    }>, Schema.TaggedStruct<"PnpmWorkspace", {
        readonly path: Schema.NonEmptyString;
    }>]>, Schema.TaggedStruct<"NodeModule", {
        readonly package: Schema.NonEmptyString;
    }>]>, Schema.$Array<Schema.Union<readonly [Schema.declare<Target.AnyTarget, Target.AnyTarget>, Schema.Union<readonly [Schema.TaggedStruct<"Glob", {
        readonly pattern: Schema.NonEmptyString;
        readonly exclude: Schema.$Array<Schema.String>;
    }>, Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"GitDiff", {
        readonly base: Schema.NonEmptyString;
        readonly paths: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly added: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly addedLines: Schema.optional<Schema.NonEmptyString>;
    }>, Schema.TaggedStruct<"PnpmWorkspace", {
        readonly path: Schema.NonEmptyString;
    }>]>, Schema.TaggedStruct<"NodeModule", {
        readonly package: Schema.NonEmptyString;
    }>]>>]>>;
    readonly fixes: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
}>, Schema.Struct<{
    readonly vacuous: Schema.Boolean;
    readonly note: Schema.optional<Schema.String>;
    readonly files: Schema.$Array<Schema.String>;
    readonly findings: Schema.$Array<Schema.Struct<{
        readonly file: Schema.NonEmptyString;
        readonly line: Schema.Int;
        readonly severity: Schema.Literals<readonly ["info", "warning", "error"]>;
        readonly message: Schema.NonEmptyString;
    }>>;
    readonly fixed: Schema.$Array<Schema.String>;
}>, Schema.Union<readonly [typeof AgentSessionError, typeof AgentWriteEscape, typeof AgentFindingsError]>, Action.Requirement<"smithers-build/agent-lint">>;
/**
 * Attrs for {@link Diff}.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const DiffAttrs: Schema.Struct<{
    readonly agent: Schema.optional<Schema.Union<readonly [Schema.TaggedStruct<"AgentRef", {
        readonly name: Schema.NonEmptyString;
    }>, Schema.Union<readonly [Schema.TaggedStruct<"AgentClaudeCode", {
        readonly model: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"AgentCodex", {
        readonly model: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"AgentPool", {
        readonly agents: Schema.$Array<Schema.NonEmptyString>;
    }>]>]>>;
    readonly prompt: Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>;
    readonly payload: Schema.optional<Schema.$Record<Schema.String, Schema.Union<readonly [Schema.TaggedStruct<"InputString", {
        readonly description: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"InputLiterals", {
        readonly values: Schema.$Array<Schema.NonEmptyString>;
    }>, Schema.TaggedStruct<"InputOptional", {
        readonly inner: Schema.Union<readonly [Schema.TaggedStruct<"InputString", {
            readonly description: Schema.NonEmptyString;
        }>, Schema.TaggedStruct<"InputLiterals", {
            readonly values: Schema.$Array<Schema.NonEmptyString>;
        }>]>;
    }>]>>>;
    readonly mcp: Schema.optional<Schema.$Array<Schema.TaggedStruct<"McpHttp", {
        readonly name: Schema.NonEmptyString;
        readonly url: Schema.NonEmptyString;
    }>>>;
    readonly data: Schema.$Array<Schema.Union<readonly [Schema.Union<readonly [Schema.declare<Target.AnyTarget, Target.AnyTarget>, Schema.Union<readonly [Schema.TaggedStruct<"Glob", {
        readonly pattern: Schema.NonEmptyString;
        readonly exclude: Schema.$Array<Schema.String>;
    }>, Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"GitDiff", {
        readonly base: Schema.NonEmptyString;
        readonly paths: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly added: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly addedLines: Schema.optional<Schema.NonEmptyString>;
    }>, Schema.TaggedStruct<"PnpmWorkspace", {
        readonly path: Schema.NonEmptyString;
    }>]>, Schema.TaggedStruct<"NodeModule", {
        readonly package: Schema.NonEmptyString;
    }>]>, Schema.$Array<Schema.Union<readonly [Schema.declare<Target.AnyTarget, Target.AnyTarget>, Schema.Union<readonly [Schema.TaggedStruct<"Glob", {
        readonly pattern: Schema.NonEmptyString;
        readonly exclude: Schema.$Array<Schema.String>;
    }>, Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"GitDiff", {
        readonly base: Schema.NonEmptyString;
        readonly paths: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly added: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly addedLines: Schema.optional<Schema.NonEmptyString>;
    }>, Schema.TaggedStruct<"PnpmWorkspace", {
        readonly path: Schema.NonEmptyString;
    }>]>, Schema.TaggedStruct<"NodeModule", {
        readonly package: Schema.NonEmptyString;
    }>]>>]>>;
    readonly changes: Schema.$Array<Schema.NonEmptyString>;
    readonly gates: Schema.$Array<Schema.declare<Target.AnyTarget, Target.AnyTarget>>;
    readonly secrets: Schema.optional<Schema.$Array<Schema.TaggedStruct<"HttpCredential", {
        readonly secret: Schema.TaggedStruct<"Secret", {
            readonly env: Schema.NonEmptyString;
            readonly fallback: Schema.optional<Schema.NonEmptyString>;
        }>;
        readonly audiences: Schema.NonEmptyArray<Schema.NonEmptyString>;
    }>>>;
    readonly sandbox: Schema.optional<Schema.Union<readonly [Schema.Literal<"none">, Schema.Struct<{
        readonly network: Schema.optional<Schema.Union<readonly [Schema.Boolean, Schema.Literal<"loopback">]>>;
    }>]>>;
    readonly approval: Schema.optional<Schema.Literal<"required">>;
    readonly maxRounds: Schema.Int;
}>;
/**
 * Projects decoded Agent.Diff attrs into the {@link AgentDiff} payload.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const diffPayload: (attrs: (typeof DiffAttrs)["Type"], context: Target.ImplementationContext) => DiffPayload;
/**
 * An agent producing a bounded, gate-checked candidate diff inside the
 * declared write-set.
 *
 * @category targets
 * @since 0.1.0
 */
export declare const Diff: Target.Definition<"Agent.Diff", Schema.Struct<{
    readonly agent: Schema.optional<Schema.Union<readonly [Schema.TaggedStruct<"AgentRef", {
        readonly name: Schema.NonEmptyString;
    }>, Schema.Union<readonly [Schema.TaggedStruct<"AgentClaudeCode", {
        readonly model: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"AgentCodex", {
        readonly model: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"AgentPool", {
        readonly agents: Schema.$Array<Schema.NonEmptyString>;
    }>]>]>>;
    readonly prompt: Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>;
    readonly payload: Schema.optional<Schema.$Record<Schema.String, Schema.Union<readonly [Schema.TaggedStruct<"InputString", {
        readonly description: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"InputLiterals", {
        readonly values: Schema.$Array<Schema.NonEmptyString>;
    }>, Schema.TaggedStruct<"InputOptional", {
        readonly inner: Schema.Union<readonly [Schema.TaggedStruct<"InputString", {
            readonly description: Schema.NonEmptyString;
        }>, Schema.TaggedStruct<"InputLiterals", {
            readonly values: Schema.$Array<Schema.NonEmptyString>;
        }>]>;
    }>]>>>;
    readonly mcp: Schema.optional<Schema.$Array<Schema.TaggedStruct<"McpHttp", {
        readonly name: Schema.NonEmptyString;
        readonly url: Schema.NonEmptyString;
    }>>>;
    readonly data: Schema.$Array<Schema.Union<readonly [Schema.Union<readonly [Schema.declare<Target.AnyTarget, Target.AnyTarget>, Schema.Union<readonly [Schema.TaggedStruct<"Glob", {
        readonly pattern: Schema.NonEmptyString;
        readonly exclude: Schema.$Array<Schema.String>;
    }>, Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"GitDiff", {
        readonly base: Schema.NonEmptyString;
        readonly paths: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly added: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly addedLines: Schema.optional<Schema.NonEmptyString>;
    }>, Schema.TaggedStruct<"PnpmWorkspace", {
        readonly path: Schema.NonEmptyString;
    }>]>, Schema.TaggedStruct<"NodeModule", {
        readonly package: Schema.NonEmptyString;
    }>]>, Schema.$Array<Schema.Union<readonly [Schema.declare<Target.AnyTarget, Target.AnyTarget>, Schema.Union<readonly [Schema.TaggedStruct<"Glob", {
        readonly pattern: Schema.NonEmptyString;
        readonly exclude: Schema.$Array<Schema.String>;
    }>, Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"GitDiff", {
        readonly base: Schema.NonEmptyString;
        readonly paths: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly added: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly addedLines: Schema.optional<Schema.NonEmptyString>;
    }>, Schema.TaggedStruct<"PnpmWorkspace", {
        readonly path: Schema.NonEmptyString;
    }>]>, Schema.TaggedStruct<"NodeModule", {
        readonly package: Schema.NonEmptyString;
    }>]>>]>>;
    readonly changes: Schema.$Array<Schema.NonEmptyString>;
    readonly gates: Schema.$Array<Schema.declare<Target.AnyTarget, Target.AnyTarget>>;
    readonly secrets: Schema.optional<Schema.$Array<Schema.TaggedStruct<"HttpCredential", {
        readonly secret: Schema.TaggedStruct<"Secret", {
            readonly env: Schema.NonEmptyString;
            readonly fallback: Schema.optional<Schema.NonEmptyString>;
        }>;
        readonly audiences: Schema.NonEmptyArray<Schema.NonEmptyString>;
    }>>>;
    readonly sandbox: Schema.optional<Schema.Union<readonly [Schema.Literal<"none">, Schema.Struct<{
        readonly network: Schema.optional<Schema.Union<readonly [Schema.Boolean, Schema.Literal<"loopback">]>>;
    }>]>>;
    readonly approval: Schema.optional<Schema.Literal<"required">>;
    readonly maxRounds: Schema.Int;
}>, Schema.Struct<{
    readonly vacuous: Schema.Boolean;
    readonly rounds: Schema.Int;
    readonly diff: Schema.String;
    readonly edits: Schema.$Array<Schema.Struct<{
        readonly path: Schema.NonEmptyString;
        readonly contents: Schema.NullOr<Schema.String>;
    }>>;
    readonly gateReport: Schema.$Array<Schema.Struct<{
        readonly gate: Schema.NonEmptyString;
        readonly status: Schema.Literals<readonly ["green", "red"]>;
        readonly detail: Schema.optional<Schema.String>;
    }>>;
}>, Schema.Union<readonly [typeof AgentNeedsInput, typeof AgentMcpUnreachable, typeof AgentWriteEscape, typeof AgentRoundsExhausted, typeof AgentSessionError]>, Action.Requirement<"smithers-build/agent-diff">>;
/**
 * Attrs for {@link Pr}.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const PrAttrs: Schema.Struct<{
    readonly agent: Schema.optional<Schema.Union<readonly [Schema.TaggedStruct<"AgentRef", {
        readonly name: Schema.NonEmptyString;
    }>, Schema.Union<readonly [Schema.TaggedStruct<"AgentClaudeCode", {
        readonly model: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"AgentCodex", {
        readonly model: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"AgentPool", {
        readonly agents: Schema.$Array<Schema.NonEmptyString>;
    }>]>]>>;
    readonly prompt: Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>;
    readonly payload: Schema.optional<Schema.$Record<Schema.String, Schema.Union<readonly [Schema.TaggedStruct<"InputString", {
        readonly description: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"InputLiterals", {
        readonly values: Schema.$Array<Schema.NonEmptyString>;
    }>, Schema.TaggedStruct<"InputOptional", {
        readonly inner: Schema.Union<readonly [Schema.TaggedStruct<"InputString", {
            readonly description: Schema.NonEmptyString;
        }>, Schema.TaggedStruct<"InputLiterals", {
            readonly values: Schema.$Array<Schema.NonEmptyString>;
        }>]>;
    }>]>>>;
    readonly mcp: Schema.optional<Schema.$Array<Schema.TaggedStruct<"McpHttp", {
        readonly name: Schema.NonEmptyString;
        readonly url: Schema.NonEmptyString;
    }>>>;
    readonly data: Schema.$Array<Schema.Union<readonly [Schema.Union<readonly [Schema.declare<Target.AnyTarget, Target.AnyTarget>, Schema.Union<readonly [Schema.TaggedStruct<"Glob", {
        readonly pattern: Schema.NonEmptyString;
        readonly exclude: Schema.$Array<Schema.String>;
    }>, Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"GitDiff", {
        readonly base: Schema.NonEmptyString;
        readonly paths: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly added: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly addedLines: Schema.optional<Schema.NonEmptyString>;
    }>, Schema.TaggedStruct<"PnpmWorkspace", {
        readonly path: Schema.NonEmptyString;
    }>]>, Schema.TaggedStruct<"NodeModule", {
        readonly package: Schema.NonEmptyString;
    }>]>, Schema.$Array<Schema.Union<readonly [Schema.declare<Target.AnyTarget, Target.AnyTarget>, Schema.Union<readonly [Schema.TaggedStruct<"Glob", {
        readonly pattern: Schema.NonEmptyString;
        readonly exclude: Schema.$Array<Schema.String>;
    }>, Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"GitDiff", {
        readonly base: Schema.NonEmptyString;
        readonly paths: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly added: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly addedLines: Schema.optional<Schema.NonEmptyString>;
    }>, Schema.TaggedStruct<"PnpmWorkspace", {
        readonly path: Schema.NonEmptyString;
    }>]>, Schema.TaggedStruct<"NodeModule", {
        readonly package: Schema.NonEmptyString;
    }>]>>]>>;
    readonly changes: Schema.$Array<Schema.NonEmptyString>;
    readonly gates: Schema.$Array<Schema.declare<Target.AnyTarget, Target.AnyTarget>>;
    readonly secrets: Schema.optional<Schema.$Array<Schema.TaggedStruct<"HttpCredential", {
        readonly secret: Schema.TaggedStruct<"Secret", {
            readonly env: Schema.NonEmptyString;
            readonly fallback: Schema.optional<Schema.NonEmptyString>;
        }>;
        readonly audiences: Schema.NonEmptyArray<Schema.NonEmptyString>;
    }>>>;
    readonly sandbox: Schema.optional<Schema.Union<readonly [Schema.Literal<"none">, Schema.Struct<{
        readonly network: Schema.optional<Schema.Union<readonly [Schema.Boolean, Schema.Literal<"loopback">]>>;
    }>]>>;
    readonly approval: Schema.optional<Schema.Literal<"required">>;
    readonly maxRounds: Schema.optional<Schema.Int>;
}>;
/**
 * Projects decoded Agent.Pr attrs into the {@link AgentPr} payload.
 *
 * Payload inputs and MCP servers use the same contract as Agent.Diff;
 * `maxRounds` defaults to {@link defaultPrRounds}.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const prPayload: (attrs: (typeof PrAttrs)["Type"], context: Target.ImplementationContext) => DiffPayload;
/**
 * Experimental: an agent whose accepted candidate would become a pull request;
 * outward, so it runs only when named explicitly. The build CLI does not bind
 * a PR opener yet, so a converged candidate refuses at settle.
 *
 * @experimental
 *
 * @category targets
 * @since 0.1.0
 */
export declare const Pr: Target.Definition<"Agent.Pr", Schema.Struct<{
    readonly agent: Schema.optional<Schema.Union<readonly [Schema.TaggedStruct<"AgentRef", {
        readonly name: Schema.NonEmptyString;
    }>, Schema.Union<readonly [Schema.TaggedStruct<"AgentClaudeCode", {
        readonly model: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"AgentCodex", {
        readonly model: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"AgentPool", {
        readonly agents: Schema.$Array<Schema.NonEmptyString>;
    }>]>]>>;
    readonly prompt: Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>;
    readonly payload: Schema.optional<Schema.$Record<Schema.String, Schema.Union<readonly [Schema.TaggedStruct<"InputString", {
        readonly description: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"InputLiterals", {
        readonly values: Schema.$Array<Schema.NonEmptyString>;
    }>, Schema.TaggedStruct<"InputOptional", {
        readonly inner: Schema.Union<readonly [Schema.TaggedStruct<"InputString", {
            readonly description: Schema.NonEmptyString;
        }>, Schema.TaggedStruct<"InputLiterals", {
            readonly values: Schema.$Array<Schema.NonEmptyString>;
        }>]>;
    }>]>>>;
    readonly mcp: Schema.optional<Schema.$Array<Schema.TaggedStruct<"McpHttp", {
        readonly name: Schema.NonEmptyString;
        readonly url: Schema.NonEmptyString;
    }>>>;
    readonly data: Schema.$Array<Schema.Union<readonly [Schema.Union<readonly [Schema.declare<Target.AnyTarget, Target.AnyTarget>, Schema.Union<readonly [Schema.TaggedStruct<"Glob", {
        readonly pattern: Schema.NonEmptyString;
        readonly exclude: Schema.$Array<Schema.String>;
    }>, Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"GitDiff", {
        readonly base: Schema.NonEmptyString;
        readonly paths: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly added: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly addedLines: Schema.optional<Schema.NonEmptyString>;
    }>, Schema.TaggedStruct<"PnpmWorkspace", {
        readonly path: Schema.NonEmptyString;
    }>]>, Schema.TaggedStruct<"NodeModule", {
        readonly package: Schema.NonEmptyString;
    }>]>, Schema.$Array<Schema.Union<readonly [Schema.declare<Target.AnyTarget, Target.AnyTarget>, Schema.Union<readonly [Schema.TaggedStruct<"Glob", {
        readonly pattern: Schema.NonEmptyString;
        readonly exclude: Schema.$Array<Schema.String>;
    }>, Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"GitDiff", {
        readonly base: Schema.NonEmptyString;
        readonly paths: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly added: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
        readonly addedLines: Schema.optional<Schema.NonEmptyString>;
    }>, Schema.TaggedStruct<"PnpmWorkspace", {
        readonly path: Schema.NonEmptyString;
    }>]>, Schema.TaggedStruct<"NodeModule", {
        readonly package: Schema.NonEmptyString;
    }>]>>]>>;
    readonly changes: Schema.$Array<Schema.NonEmptyString>;
    readonly gates: Schema.$Array<Schema.declare<Target.AnyTarget, Target.AnyTarget>>;
    readonly secrets: Schema.optional<Schema.$Array<Schema.TaggedStruct<"HttpCredential", {
        readonly secret: Schema.TaggedStruct<"Secret", {
            readonly env: Schema.NonEmptyString;
            readonly fallback: Schema.optional<Schema.NonEmptyString>;
        }>;
        readonly audiences: Schema.NonEmptyArray<Schema.NonEmptyString>;
    }>>>;
    readonly sandbox: Schema.optional<Schema.Union<readonly [Schema.Literal<"none">, Schema.Struct<{
        readonly network: Schema.optional<Schema.Union<readonly [Schema.Boolean, Schema.Literal<"loopback">]>>;
    }>]>>;
    readonly approval: Schema.optional<Schema.Literal<"required">>;
    readonly maxRounds: Schema.optional<Schema.Int>;
}>, Schema.Struct<{
    readonly vacuous: Schema.Boolean;
    readonly rounds: Schema.Int;
    readonly diff: Schema.String;
    readonly edits: Schema.$Array<Schema.Struct<{
        readonly path: Schema.NonEmptyString;
        readonly contents: Schema.NullOr<Schema.String>;
    }>>;
    readonly gateReport: Schema.$Array<Schema.Struct<{
        readonly gate: Schema.NonEmptyString;
        readonly status: Schema.Literals<readonly ["green", "red"]>;
        readonly detail: Schema.optional<Schema.String>;
    }>>;
    readonly pr: Schema.optional<Schema.String>;
}>, Schema.Union<readonly [typeof AgentNeedsInput, typeof AgentMcpUnreachable, typeof AgentWriteEscape, typeof AgentRoundsExhausted, typeof AgentPrSettleRefused, typeof AgentSessionError]>, Action.Requirement<"smithers-build/agent-pr">>;
/**
 * Declares a Claude Code agent, by model name or as `{ model }`.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const ClaudeCode: (options: string | {
    readonly model: string;
}) => ClaudeCodeAgent;
/**
 * Declares a Codex agent, by model name or as `{ model }`.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const Codex: (options: string | {
    readonly model: string;
}) => CodexAgent;
/**
 * Declares a pool over sibling agent names.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const Pool: (agents: ReadonlyArray<string>) => PoolAgent;
/**
 * Runtime marker for the workspace agents declaration.
 *
 * @category type ids
 * @since 0.1.0
 */
export declare const AgentsTypeId: unique symbol;
/**
 * The workspace agents declaration: a validated name-to-agent record.
 *
 * @category models
 * @since 0.1.0
 */
export interface AgentsDeclaration {
    readonly [AgentsTypeId]: typeof AgentsTypeId;
    readonly agents: Readonly<Record<string, AgentDeclaration>>;
}
/**
 * Checks whether a value is the workspace agents declaration.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isAgentsDeclaration: (value: unknown) => value is AgentsDeclaration;
declare const makeAgents: (agents: Readonly<Record<string, AgentDeclaration>>) => AgentsDeclaration;
/**
 * The `S.Agents` surface: callable as the workspace declaration constructor
 * (`S.Agents({ default: ..., luna: ... })` in `.smithers/agents.ts`) and a
 * property-access reference surface (`S.Agents.luna` in a PACKAGE.ts).
 *
 * Property access mints a fresh inert {@link Reference.AgentRef}; the name
 * is validated against the workspace declaration at index time, so an
 * unknown agent name is a graph-load error, never a silent miss.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const Agents: typeof makeAgents & Record<string, Reference.AgentRef>;
export {};
