/**
 * Incur command surface for smithers build.
 *
 * Every command returns structured data for incur's envelope. Progress and
 * the human-facing rendering of that data go through {@link Reporter}: a
 * person at a terminal sees a live or coloured account on standard error and
 * a tree or table on standard output. Agents and CI get quiet structured
 * results with follow-up commands; an explicit format changes data encoding,
 * independently of a human's progress display.
 *
 * @since 0.1.0
 */
import { Cli, z } from "incur";
import * as Audience from "./Audience.ts";
import * as Executor from "./Executor.ts";
import * as PackageExec from "./PackageExec.ts";
import * as PackageIndex from "./PackageIndex.ts";
import * as Planner from "./Planner.ts";
import * as Reporter from "./Reporter.ts";
/** The flags every command shares.
 * @category models
 * @since 0.1.0
 */
export interface WorkspaceFlags {
    readonly workspace: string;
    readonly cacheDir?: string | undefined;
}
/** The flags shared by commands that execute targets.
 * @category models
 * @since 0.1.0
 */
export interface ExecutionFlags extends WorkspaceFlags {
    readonly plan: boolean;
    readonly jobs?: number | undefined;
    readonly lifecycle?: "evergreen" | "artifact" | "all" | undefined;
    readonly includeExclusive?: boolean | undefined;
    readonly cache: boolean;
}
/**
 * Process-scoped configuration captured before declaration evaluation.
 *
 * `stdout` and `stderr` default to the process streams; tests inject
 * in-memory terminals. `exit` records the exit code of a failure a
 * human renderer has already explained, so the envelope's error block is not
 * printed twice; without it the structured error is returned instead. The
 * process entry point supplies it, because deciding the exit code is a
 * choice only a process owner may make.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface RuntimeConfig {
    readonly cliName?: string | undefined;
    readonly cliVersion?: string | undefined;
    readonly cliDescription?: string | undefined;
    /** Packaged authoring skills included by the public skills installer. */
    readonly sync?: {
        cwd?: string | undefined;
        include?: Array<string> | undefined;
    } | undefined;
    readonly cacheUrl?: string | undefined;
    readonly cacheToken?: string | undefined;
    /** Optional durable step-cache commands supplied by the unified CLI. */
    readonly cacheSteps?: ReturnType<typeof Cli.create> | undefined;
    readonly signal?: AbortSignal | undefined;
    /**
     * The environment PACKAGE.ts execution reads for agent-fake selection
     * (`SMTHRS_AGENT_FAKE`), backend PATH lookups, and outward preconditions.
     * Defaults to `process.env`; tests inject a hermetic record.
     */
    readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
    readonly stdout?: Reporter.Terminal | undefined;
    readonly stderr?: Reporter.Terminal | undefined;
    readonly presentation?: Audience.Policy | undefined;
    readonly exit?: ((code: number) => void) | undefined;
    /** The durable approval store `approval: "required"` targets are checked against; absent, they refuse. */
    readonly approvals?: PackageExec.TargetApprovals | undefined;
}
/**
 * Opens the target index rooted by the nearest WORKSPACE.ts declaration.
 * From an overlay repository, the root is the materialized mount's checkout
 * (see `Mount.resolveWorkspace`).
 * @category querying
 * @since 0.1.0
 */
export declare const openPackageIndex: (flags: WorkspaceFlags, runtime?: RuntimeConfig) => Promise<PackageIndex.PackageIndex>;
/** The mode and invocation flags the PACKAGE.ts execution surface accepts.
 * @category models
 * @since 0.1.0
 */
export interface ModeFlags {
    readonly name?: string | undefined;
    readonly write?: boolean | undefined;
    readonly fix?: boolean | undefined;
    readonly message?: string | undefined;
    readonly sweep?: boolean | undefined;
    readonly input?: ReadonlyArray<string> | undefined;
}
/**
 * Runs one execution verb through the build executor.
 * @category execution
 * @since 0.1.0
 */
export declare const runPackageVerb: (verb: PackageExec.PackageVerb, patterns: ReadonlyArray<string>, flags: ExecutionFlags & ModeFlags, config: RuntimeConfig, reporter: Reporter.Reporter) => Promise<Executor.Summary | PackageExec.PlanReport>;
/**
 * Plans one target inertly and returns the revision an approval must name.
 * Refuses a label that selects no single target declaring `approval: "required"`.
 * @category execution
 * @since 1.0.0
 */
export declare const approvalRevision: (label: string, flags: WorkspaceFlags & {
    readonly input?: ReadonlyArray<string> | undefined;
}, config: RuntimeConfig) => Promise<PackageExec.TargetApprovalRequest>;
/** Plans one verb and executes it unless `--plan` asked for the inert print.
 * @category execution
 * @since 0.1.0
 */
export declare const runVerb: (verb: "build" | "test" | "lint" | "run" | "docs" | "review", patterns: ReadonlyArray<string>, flags: ExecutionFlags & ModeFlags, config: RuntimeConfig, reporter: Reporter.Reporter) => Promise<Planner.Plan | Executor.Summary | PackageExec.PlanReport>;
/**
 * Creates the configured smithers-build CLI; every command refuses surplus positionals.
 *
 * @category constructors
 * @since 0.1.0
 * @slop
 */
export declare const makeCli: (config?: RuntimeConfig) => Cli.Cli<{
    "cache clear": {
        args: {};
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            dryRun: boolean;
            yes: boolean;
        };
    };
    "cache prune": {
        args: {};
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            olderThanDays: number;
            dryRun: boolean;
            yes: boolean;
        };
    };
    "cache status": {
        args: {};
        options: {
            workspace: string;
            cacheDir?: string | undefined;
        };
    };
} & {
    "show target": {
        args: {
            label: string;
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            verb?: "build" | "docs" | "lint" | "review" | "run" | "test" | undefined;
        };
    };
    "show workspace": {
        args: {};
        options: {
            workspace: string;
            cacheDir?: string | undefined;
        };
    };
} & {
    targets: {
        args: {
            pattern: string;
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
        };
    };
} & {
    info: {
        args: {};
        options: {
            workspace: string;
            cacheDir?: string | undefined;
        };
    };
} & {
    explain: {
        args: {
            label: string;
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            verb?: "build" | "docs" | "lint" | "review" | "run" | "test" | undefined;
        };
    };
} & {
    affected: {
        args: {
            patterns: string[];
            verb: "build" | "ci" | "docs" | "lint" | "review" | "run" | "test";
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            verbose: boolean;
            plan: boolean;
            jobs?: number | undefined;
            includeExclusive: boolean;
            cache: boolean;
            knownRed?: string | undefined;
            resultsFile?: string | undefined;
            lifecycle?: "all" | "artifact" | "evergreen" | undefined;
            base: string;
            head?: string | undefined;
            files?: string[] | undefined;
            list: boolean;
        };
    };
} & {
    clean: {
        args: {
            patterns: string[];
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            verbose: boolean;
            plan: boolean;
            jobs?: number | undefined;
            includeExclusive: boolean;
            cache: boolean;
            knownRed?: string | undefined;
            resultsFile?: string | undefined;
        };
    };
} & {
    watch: {
        args: {
            patterns: string[];
            verb: "build" | "ci" | "docs" | "lint" | "review" | "run" | "test";
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            verbose: boolean;
            plan: boolean;
            jobs?: number | undefined;
            includeExclusive: boolean;
            cache: boolean;
            knownRed?: string | undefined;
            resultsFile?: string | undefined;
            debounceMs: number;
            once: boolean;
        };
    };
} & {
    install: {
        args: {};
        options: {
            workspace: string;
            cacheDir?: string | undefined;
        };
    };
} & {
    build: {
        args: {
            patterns: string[];
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            verbose: boolean;
            plan: boolean;
            jobs?: number | undefined;
            includeExclusive: boolean;
            cache: boolean;
            knownRed?: string | undefined;
            resultsFile?: string | undefined;
        };
    };
} & {
    test: {
        args: {
            patterns: string[];
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            verbose: boolean;
            plan: boolean;
            jobs?: number | undefined;
            includeExclusive: boolean;
            cache: boolean;
            knownRed?: string | undefined;
            resultsFile?: string | undefined;
            lifecycle?: "all" | "artifact" | "evergreen" | undefined;
        };
    };
} & {
    lint: {
        args: {
            patterns: string[];
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            verbose: boolean;
            plan: boolean;
            jobs?: number | undefined;
            includeExclusive: boolean;
            cache: boolean;
            knownRed?: string | undefined;
            resultsFile?: string | undefined;
            fix: boolean;
        };
    };
} & {
    docs: {
        args: {
            patterns: string[];
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            verbose: boolean;
            plan: boolean;
            jobs?: number | undefined;
            includeExclusive: boolean;
            cache: boolean;
            knownRed?: string | undefined;
            resultsFile?: string | undefined;
            lifecycle?: "all" | "artifact" | "evergreen" | undefined;
            write: boolean;
        };
    };
} & {
    review: {
        args: {
            patterns: string[];
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            policyRevision: string;
            revision: string;
            plan: boolean;
            required: boolean;
            findingsStore?: string | undefined;
            credentialReceiver?: string | undefined;
        };
    };
} & {
    run: {
        args: {
            patterns: string[];
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            verbose: boolean;
            plan: boolean;
            jobs?: number | undefined;
            includeExclusive: boolean;
            cache: boolean;
            knownRed?: string | undefined;
            resultsFile?: string | undefined;
            message?: string | undefined;
            sweep: boolean;
            input?: string[] | undefined;
            name?: string | undefined;
        };
    };
} & {
    target: {
        args: {
            patterns: string[];
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            verbose: boolean;
            plan: boolean;
            jobs?: number | undefined;
            includeExclusive: boolean;
            cache: boolean;
            knownRed?: string | undefined;
            resultsFile?: string | undefined;
            message?: string | undefined;
            sweep: boolean;
            input?: string[] | undefined;
            write: boolean;
            fix: boolean;
        };
    };
} & {
    "git-hooks": {
        args: {};
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            write: boolean;
        };
    };
} & {
    ci: {
        args: {
            patterns: string[];
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            verbose: boolean;
            plan: boolean;
            jobs?: number | undefined;
            includeExclusive: boolean;
            cache: boolean;
            knownRed?: string | undefined;
            resultsFile?: string | undefined;
            lifecycle?: "all" | "artifact" | "evergreen" | undefined;
        };
    };
} & {
    query: {
        args: {
            expr: string;
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
        };
    };
} & {
    index: {
        args: {
            pattern: string;
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
        };
    };
} & {
    owners: {
        args: {
            paths?: string[] | undefined;
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            diff?: string | undefined;
        };
    };
} & {
    graph: {
        args: {
            pattern: string;
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            mermaid: boolean;
        };
    };
}, undefined, undefined, z.ZodObject<{
    audience: z.ZodDefault<z.ZodEnum<{
        agent: "agent";
        auto: "auto";
        human: "human";
    }>>;
    silent: z.ZodDefault<z.ZodBoolean>;
    ui: z.ZodDefault<z.ZodEnum<{
        auto: "auto";
        plain: "plain";
        stream: "stream";
        tty: "tty";
    }>>;
}, z.core.$strip>, string>;
/**
 * Rewrites a bare-label argv into the `target` command.
 *
 * `smithers-build '//src:lint'` — a first argument that is a label rather than a
 * command — executes the label under its flavor-implied verb. Every other
 * argv passes through unchanged.
 *
 * @category parsing
 * @since 0.1.0
 * @slop
 */
export declare const normalizeArgv: (argv: ReadonlyArray<string>) => ReadonlyArray<string>;
/**
 * Programmatic CLI without process-scoped remote cache or interruption state.
 *
 * @category constructors
 * @since 0.1.0
 * @slop
 */
export declare const cli: Cli.Cli<{
    "cache clear": {
        args: {};
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            dryRun: boolean;
            yes: boolean;
        };
    };
    "cache prune": {
        args: {};
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            olderThanDays: number;
            dryRun: boolean;
            yes: boolean;
        };
    };
    "cache status": {
        args: {};
        options: {
            workspace: string;
            cacheDir?: string | undefined;
        };
    };
} & {
    "show target": {
        args: {
            label: string;
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            verb?: "build" | "docs" | "lint" | "review" | "run" | "test" | undefined;
        };
    };
    "show workspace": {
        args: {};
        options: {
            workspace: string;
            cacheDir?: string | undefined;
        };
    };
} & {
    targets: {
        args: {
            pattern: string;
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
        };
    };
} & {
    info: {
        args: {};
        options: {
            workspace: string;
            cacheDir?: string | undefined;
        };
    };
} & {
    explain: {
        args: {
            label: string;
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            verb?: "build" | "docs" | "lint" | "review" | "run" | "test" | undefined;
        };
    };
} & {
    affected: {
        args: {
            patterns: string[];
            verb: "build" | "ci" | "docs" | "lint" | "review" | "run" | "test";
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            verbose: boolean;
            plan: boolean;
            jobs?: number | undefined;
            includeExclusive: boolean;
            cache: boolean;
            knownRed?: string | undefined;
            resultsFile?: string | undefined;
            lifecycle?: "all" | "artifact" | "evergreen" | undefined;
            base: string;
            head?: string | undefined;
            files?: string[] | undefined;
            list: boolean;
        };
    };
} & {
    clean: {
        args: {
            patterns: string[];
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            verbose: boolean;
            plan: boolean;
            jobs?: number | undefined;
            includeExclusive: boolean;
            cache: boolean;
            knownRed?: string | undefined;
            resultsFile?: string | undefined;
        };
    };
} & {
    watch: {
        args: {
            patterns: string[];
            verb: "build" | "ci" | "docs" | "lint" | "review" | "run" | "test";
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            verbose: boolean;
            plan: boolean;
            jobs?: number | undefined;
            includeExclusive: boolean;
            cache: boolean;
            knownRed?: string | undefined;
            resultsFile?: string | undefined;
            debounceMs: number;
            once: boolean;
        };
    };
} & {
    install: {
        args: {};
        options: {
            workspace: string;
            cacheDir?: string | undefined;
        };
    };
} & {
    build: {
        args: {
            patterns: string[];
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            verbose: boolean;
            plan: boolean;
            jobs?: number | undefined;
            includeExclusive: boolean;
            cache: boolean;
            knownRed?: string | undefined;
            resultsFile?: string | undefined;
        };
    };
} & {
    test: {
        args: {
            patterns: string[];
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            verbose: boolean;
            plan: boolean;
            jobs?: number | undefined;
            includeExclusive: boolean;
            cache: boolean;
            knownRed?: string | undefined;
            resultsFile?: string | undefined;
            lifecycle?: "all" | "artifact" | "evergreen" | undefined;
        };
    };
} & {
    lint: {
        args: {
            patterns: string[];
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            verbose: boolean;
            plan: boolean;
            jobs?: number | undefined;
            includeExclusive: boolean;
            cache: boolean;
            knownRed?: string | undefined;
            resultsFile?: string | undefined;
            fix: boolean;
        };
    };
} & {
    docs: {
        args: {
            patterns: string[];
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            verbose: boolean;
            plan: boolean;
            jobs?: number | undefined;
            includeExclusive: boolean;
            cache: boolean;
            knownRed?: string | undefined;
            resultsFile?: string | undefined;
            lifecycle?: "all" | "artifact" | "evergreen" | undefined;
            write: boolean;
        };
    };
} & {
    review: {
        args: {
            patterns: string[];
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            policyRevision: string;
            revision: string;
            plan: boolean;
            required: boolean;
            findingsStore?: string | undefined;
            credentialReceiver?: string | undefined;
        };
    };
} & {
    run: {
        args: {
            patterns: string[];
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            verbose: boolean;
            plan: boolean;
            jobs?: number | undefined;
            includeExclusive: boolean;
            cache: boolean;
            knownRed?: string | undefined;
            resultsFile?: string | undefined;
            message?: string | undefined;
            sweep: boolean;
            input?: string[] | undefined;
            name?: string | undefined;
        };
    };
} & {
    target: {
        args: {
            patterns: string[];
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            verbose: boolean;
            plan: boolean;
            jobs?: number | undefined;
            includeExclusive: boolean;
            cache: boolean;
            knownRed?: string | undefined;
            resultsFile?: string | undefined;
            message?: string | undefined;
            sweep: boolean;
            input?: string[] | undefined;
            write: boolean;
            fix: boolean;
        };
    };
} & {
    "git-hooks": {
        args: {};
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            write: boolean;
        };
    };
} & {
    ci: {
        args: {
            patterns: string[];
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            verbose: boolean;
            plan: boolean;
            jobs?: number | undefined;
            includeExclusive: boolean;
            cache: boolean;
            knownRed?: string | undefined;
            resultsFile?: string | undefined;
            lifecycle?: "all" | "artifact" | "evergreen" | undefined;
        };
    };
} & {
    query: {
        args: {
            expr: string;
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
        };
    };
} & {
    index: {
        args: {
            pattern: string;
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
        };
    };
} & {
    owners: {
        args: {
            paths?: string[] | undefined;
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            diff?: string | undefined;
        };
    };
} & {
    graph: {
        args: {
            pattern: string;
        };
        options: {
            workspace: string;
            cacheDir?: string | undefined;
            mermaid: boolean;
        };
    };
}, undefined, undefined, z.ZodObject<{
    audience: z.ZodDefault<z.ZodEnum<{
        agent: "agent";
        auto: "auto";
        human: "human";
    }>>;
    silent: z.ZodDefault<z.ZodBoolean>;
    ui: z.ZodDefault<z.ZodEnum<{
        auto: "auto";
        plain: "plain";
        stream: "stream";
        tty: "tty";
    }>>;
}, z.core.$strip>, string>;
