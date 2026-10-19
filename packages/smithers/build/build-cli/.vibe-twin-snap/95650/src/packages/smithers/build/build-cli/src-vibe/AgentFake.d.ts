/**
 * The scripted fake agent: a deterministic {@link AgentSession.SessionFactory}
 * that replays a JSON script of findings, candidate edits, and failures
 * instead of spawning a real `claude` or `codex` CLI process.
 *
 * The fake exists so every agent-target proof — vacuous green, bounded
 * rounds, write-set escapes, verdict-cache replay — runs without model spend
 * and with exact spawn accounting. Setting `SMTHRS_AGENT_FAKE=<script.json>`
 * selects it through {@link sessionFactoryFromEnvironment}; each session run
 * consumes the next scripted response in order and appends one line to a
 * spawn log next to the script, so an outside observer can prove how many
 * sessions ran (including zero).
 *
 * @since 0.1.0
 */
import * as AgentTarget from "@smthrs/targets/AgentTarget";
import * as Schema from "effect/Schema";
import type { CliSessionOptions, GateRunner, SessionFactory, SessionRequest } from "./AgentSession.js";
/**
 * The environment variable that selects the scripted fake: the path of a
 * script file decoded by {@link FakeScript}.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const fakeEnvironmentVariable = "SMTHRS_AGENT_FAKE";
/**
 * Environment variable naming the per-session wall-clock ceiling in
 * milliseconds for the real CLI factory. Unset, the factory keeps
 * {@link defaultSessionTimeoutMs}; a lane that rewrites large files with a
 * slow model raises it for one invocation without a declaration change.
 *
 * @category models
 * @since 0.1.0
 */
export declare const timeoutEnvironmentVariable = "SMTHRS_AGENT_TIMEOUT_MS";
/**
 * Reads the session ceiling from the environment: a positive integer of
 * milliseconds, or `undefined` when unset. Anything else refuses loudly,
 * because a silently ignored ceiling would look like the default.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const sessionTimeoutFromEnvironment: (env: Readonly<Record<string, string | undefined>>) => number | undefined;
/**
 * Schema of one scripted session response.
 *
 * A response with `fail` makes the run fail with that message. `purpose`,
 * when present, asserts what the run must have been asked for — a mismatch
 * fails loudly, because a fake that answers the wrong question would fake
 * green. `findings`, `edits`, and `note` mirror the live session envelope.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const ScriptedResponse: Schema.Struct<{
    readonly purpose: Schema.optional<Schema.Literals<readonly ["lint", "fix", "diff"]>>;
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
    readonly fail: Schema.optional<Schema.NonEmptyString>;
}>;
/**
 * One scripted session response.
 *
 * @category models
 * @since 0.1.0
 */
export type ScriptedResponse = typeof ScriptedResponse.Type;
/**
 * Schema of one fake script file.
 *
 * `identity` substitutes for the resolved agent identity in verdict keys, so
 * two scripts with different identities re-key each other's cached verdicts
 * exactly like two different real agent declarations would.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const FakeScript: Schema.Struct<{
    readonly identity: Schema.optional<Schema.NonEmptyString>;
    readonly responses: Schema.$Array<Schema.Struct<{
        readonly purpose: Schema.optional<Schema.Literals<readonly ["lint", "fix", "diff"]>>;
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
        readonly fail: Schema.optional<Schema.NonEmptyString>;
    }>>;
}>;
/**
 * One fake script.
 *
 * @category models
 * @since 0.1.0
 */
export type FakeScript = typeof FakeScript.Type;
/**
 * Reads and decodes one fake script file; an unreadable or invalid script
 * throws loudly rather than degrading into an empty fake.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const loadFakeScript: (path: string) => FakeScript;
/**
 * A scripted session factory with exact spawn accounting.
 *
 * `opens` counts sessions opened, `spawns` counts session runs (one run is
 * what one CLI subprocess spawn would be), and `requests` preserves every
 * run request in order for prompt-content assertions.
 *
 * @category models
 * @since 0.1.0
 */
export interface ScriptedSessionFactory extends SessionFactory {
    readonly opens: () => number;
    readonly spawns: () => number;
    readonly requests: () => ReadonlyArray<SessionRequest>;
}
/**
 * Options for {@link makeScriptedSessionFactory}.
 *
 * @category models
 * @since 0.1.0
 */
export interface ScriptedFactoryOptions {
    /** JSONL file appended with one line per session run, for cross-process spawn proofs. */
    readonly logPath?: string | undefined;
}
/**
 * The `--- <path> ---` headers under a prompt's `=== FILES ===` section, for
 * cross-process proofs that a lane rendered its data closure.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const promptFilesOf: (prompt: string) => ReadonlyArray<string>;
/**
 * A session factory that replays one {@link FakeScript} deterministically.
 *
 * The response cursor is shared across every session the factory opens: run
 * N answers with response N regardless of session boundaries, so a
 * multi-round loop consumes its rounds in declared order. Running past the
 * end of the script fails loudly — a fake that silently improvises would
 * fake green.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const makeScriptedSessionFactory: (script: FakeScript, options?: ScriptedFactoryOptions) => ScriptedSessionFactory;
/**
 * The session factory one command should use: the scripted fake when
 * `SMTHRS_AGENT_FAKE` names a script file, the real CLI factory otherwise.
 *
 * A relative script path resolves against the workspace root. The fake
 * appends its spawn log to `<script>.spawns.jsonl` so the invoking test can
 * count sessions from outside the process.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const sessionFactoryFromEnvironment: (options: CliSessionOptions, env: Readonly<Record<string, string | undefined>>) => SessionFactory;
/**
 * One recorded scripted gate-runner call.
 *
 * `files` are the candidate overlay paths the gates were shown, proving the
 * gates ran against the exact candidate tree of the round.
 *
 * @category models
 * @since 0.1.0
 */
export interface ScriptedGateCall {
    readonly round: number;
    readonly gates: ReadonlyArray<string>;
    readonly files: ReadonlyArray<string>;
}
/**
 * A scripted gate runner with call accounting.
 *
 * @category models
 * @since 0.1.0
 */
export interface ScriptedGateRunner extends GateRunner {
    readonly calls: () => ReadonlyArray<ScriptedGateCall>;
}
/**
 * A gate runner that replays one scripted report per call, in order.
 *
 * Calling past the end of the script fails loudly for the same reason the
 * session fake does: an improvised gate verdict is fake green.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const makeScriptedGateRunner: (reports: ReadonlyArray<ReadonlyArray<AgentTarget.GateReportEntry>>) => ScriptedGateRunner;
