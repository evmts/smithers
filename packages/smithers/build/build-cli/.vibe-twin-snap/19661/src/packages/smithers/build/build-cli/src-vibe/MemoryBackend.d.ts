/**
 * Executes `Memory.Retain` against the Smithers Cloud memory backend.
 *
 * The backend is the `smithers` CLI. It is resolved, never assumed: when the
 * workspace declares no `S.Memory.SmithersCloud` backend, or the CLI is not
 * on PATH, the invocation fails with the typed
 * {@link MemoryBackendUnavailable} notice. That notice is deliberately not
 * green and not a crash: the caller reports it as the target's outcome, so a
 * host without the backend says so instead of pretending the memory was
 * retained.
 *
 * The CLI invocation goes through the {@link MemoryCli} service so the
 * integration can respell the documented `smithers memory` surface in one
 * place; the default implementation shells out to the resolved binary.
 *
 * @since 0.1.0
 */
import type * as Target from "@smthrs/targets/Target";
import type * as WorkspaceDeclaration from "@smthrs/targets/WorkspaceDeclaration";
declare const MemoryBackendUnavailable_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "smithers-build/MemoryBackendUnavailable";
} & Readonly<A>;
/**
 * The memory backend is not available on this host or in this workspace.
 *
 * `no_backend_declared`: the WORKSPACE.ts declares no
 * `S.Memory.SmithersCloud`. `cli_not_found`: the `smithers` binary is not on
 * PATH. Either way nothing ran, nothing is green, and the message says what
 * to configure.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class MemoryBackendUnavailable extends MemoryBackendUnavailable_base<{
    readonly code: "no_backend_declared" | "cli_not_found";
    readonly message: string;
}> {
    constructor(code: "no_backend_declared" | "cli_not_found", message: string);
}
/**
 * Checks whether a value is the unavailable-backend notice.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isMemoryBackendUnavailable: (value: unknown) => value is MemoryBackendUnavailable;
/**
 * The subcommands `smithers memory` ships (`smithers memory --help`,
 * captured in `test/fixtures/smithers-memory-help.txt`). Every argv this
 * module builds names one of them; asking for anything else is a typed
 * {@link MemoryCapabilityMissing} refusal, never a blind spawn that exits 4
 * with no text.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const memoryCliCommands: ReadonlyArray<string>;
/**
 * Parses the `Commands:` section of `smithers memory --help` into the
 * subcommand names it lists. The captured-fixture test compares this
 * against {@link memoryCliCommands}, so a CLI surface drift fails a test
 * instead of a run.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const parseMemoryHelpCommands: (help: string) => ReadonlyArray<string>;
declare const MemoryCapabilityMissing_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "smithers-build/MemoryCapabilityMissing";
} & Readonly<A>;
/**
 * A required memory operation has no counterpart in the installed CLI.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class MemoryCapabilityMissing extends MemoryCapabilityMissing_base<{
    readonly capability: string;
    readonly message: string;
}> {
    constructor(capability: string);
}
/**
 * Checks whether a value is the missing-capability refusal.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isMemoryCapabilityMissing: (value: unknown) => value is MemoryCapabilityMissing;
/**
 * Asserts one subcommand is in the shipped `smithers memory` surface.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const assertMemoryCliCommand: (subcommand: string) => void;
declare const MemoryCommandFailed_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "smithers-build/MemoryCommandFailed";
} & Readonly<A>;
/**
 * The resolved backend ran and refused the retain.
 *
 * The message always names the argv; the body is stderr when the backend
 * wrote any, else stdout (smithers answers an unknown subcommand with exit
 * 4 and nothing on stderr), else an explicit "(no output)".
 *
 * @category errors
 * @since 0.1.0
 */
export declare class MemoryCommandFailed extends MemoryCommandFailed_base<{
    readonly exitCode: number;
    readonly stderr: string;
    readonly stdout: string;
    readonly args: ReadonlyArray<string>;
    readonly message: string;
}> {
    constructor(exitCode: number, output: {
        readonly args: ReadonlyArray<string>;
        readonly stdout: string;
        readonly stderr: string;
    });
}
/**
 * Checks whether a value is a backend command failure.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isMemoryCommandFailed: (value: unknown) => value is MemoryCommandFailed;
/**
 * Finds the `smithers` binary, or undefined when the host has none.
 *
 * @category models
 * @since 0.1.0
 */
export interface CliLocator {
    find(): Promise<string | undefined>;
}
/**
 * Runs one resolved backend invocation.
 *
 * @category models
 * @since 0.1.0
 */
export interface MemoryCli {
    run(binary: string, args: ReadonlyArray<string>, cwd: string): Promise<{
        readonly exitCode: number;
        readonly stdout: string;
        readonly stderr: string;
    }>;
}
/**
 * The default locator: scans PATH for an executable `smithers`.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const pathLocator: (environment: Readonly<Record<string, string | undefined>>) => CliLocator;
/**
 * Options for {@link spawnCli}.
 *
 * @category models
 * @since 0.1.0
 */
export interface SpawnCliOptions {
    /** Positive wall-clock cap on one subprocess. @default 60000 */
    readonly timeoutMs?: number | undefined;
    /** Cancels both ref resolution and backend subprocesses. */
    readonly signal?: AbortSignal | undefined;
    /** Explicit host environment; cache credentials are removed before spawning. */
    readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
    /** Additional workspace cache credential names to withhold. */
    readonly sensitiveNames?: ReadonlyArray<string> | undefined;
}
/**
 * The default runner: spawns the resolved binary with no shell.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const spawnCli: (options?: SpawnCliOptions) => MemoryCli;
/**
 * Options accepted by {@link retain}.
 *
 * @category models
 * @since 0.1.0
 */
export interface RetainOptions extends SpawnCliOptions {
    /** The workspace root the CLI runs in. */
    readonly root: string;
    /** The `Memory.Retain` target whose validated attrs drive the invocation. */
    readonly target: Target.AnyTarget;
    /** The workspace memory declaration, or undefined when none is declared. */
    readonly memory: WorkspaceDeclaration.WorkspaceDeclaration["memory"];
    /** @default {@link pathLocator} over the process environment */
    readonly locator?: CliLocator | undefined;
    /** @default {@link spawnCli} */
    readonly cli?: MemoryCli | undefined;
    /** Resolves the declared source ref to a commit sha. @default git rev-parse in `root` */
    readonly resolveSource?: ((root: string, ref: string) => Promise<string>) | undefined;
}
/**
 * One written fact: its namespace, key, and the argv that wrote it.
 *
 * @category models
 * @since 0.1.0
 */
export interface RetainedFact {
    readonly namespace: string;
    readonly key: string;
    readonly args: ReadonlyArray<string>;
    readonly stdout: string;
}
/**
 * The completed retain: the binary that ran and the facts it wrote.
 *
 * @category models
 * @since 0.1.0
 */
export interface RetainResult {
    readonly binary: string;
    readonly facts: ReadonlyArray<RetainedFact>;
}
/**
 * Retains the referenced commit in the declared Smithers Cloud banks.
 *
 * The backend surface is the installed CLI's real command family
 * (`smithers memory get|list|rm|set`): a retained fact is one
 * `memory set <bank> commit:<sha> <record>` per declared bank, where the
 * sha comes from resolving the declared source ref in the workspace root
 * and the record is the structured JSON the declaration implies
 * (`{ source, commit, tags }`). Reading it back is
 * `smithers memory list <bank>`. The declaration's `init` and `autoInject`
 * options configure the bank's initialization script and agent-context
 * injection; neither gates a retain, so they are inert here. Any memory
 * operation the shipped CLI lacks is a typed
 * {@link MemoryCapabilityMissing} refusal naming the capability.
 *
 * @category execution
 * @since 0.1.0
 */
export declare const retain: (options: RetainOptions) => Promise<RetainResult>;
export {};
