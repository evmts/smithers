/**
 * Side-effect-free consumer detection and terminal presentation policy.
 * Detection is a UX hint, never an authentication or approval boundary.
 * @since 1.0.0
 */
/**
 * Explicit consumer selection, independent of output encoding.
 * @category models
 * @since 1.0.0
 */
export type Mode = "auto" | "human" | "agent";
/**
 * Inputs are injectable so tests and embedded CLIs never change process globals.
 * @category models
 * @since 1.0.0
 */
export interface Options {
    readonly env?: Readonly<Record<string, string | undefined>> | undefined;
    readonly stdin?: boolean | undefined;
    readonly stdout?: boolean | undefined;
    readonly stderr?: boolean | undefined;
    readonly audience?: Mode | undefined;
    readonly mcp?: boolean | undefined;
    readonly formatExplicit?: boolean | undefined;
    readonly silent?: boolean | undefined;
    readonly verbose?: boolean | undefined;
}
/**
 * One policy for results, progress, and prompting; evidence never contains env values.
 * @category models
 * @since 1.0.0
 */
export interface Policy {
    readonly audience: "human" | "agent";
    readonly source: "mcp" | "override" | "harness" | "ci" | "terminal" | "pipe";
    readonly harnesses: ReadonlyArray<string>;
    readonly structured: boolean;
    readonly progress: "silent" | "plain" | "live";
    readonly interactive: boolean;
}
/**
 * Audited shell markers, not installed applications, credentials, or config paths.
 * See docs/reference/agent-detection.md for evidence and unsupported harnesses.
 * @category models
 * @since 1.0.0
 */
export interface Marker {
    readonly harness: string;
    readonly variable: string;
    readonly equals?: string | undefined;
}
/**
 * Extend this registry only with a verified child-process marker and a source.
 * @category constants
 * @since 1.0.0
 */
export declare const markers: ReadonlyArray<Marker>;
/**
 * MCP wins; explicit selection wins over harnesses; CI and pipes are conservative fallbacks.
 * Human redirected stdout remains structured while stderr can still show live progress.
 * @category selection
 * @since 1.0.0
 */
export declare const resolve: (options?: Options) => Policy;
/**
 * Resolve executable presentation flags without loading a command or touching project files.
 * Incur/Effect still own flag validation. Tokens after -- are application arguments.
 * @category parsing
 * @since 1.0.0
 */
export declare const fromArguments: (argv: ReadonlyArray<string>, options?: Options) => Policy;
/**
 * Incur currently derives its agent bit from stdout TTY; select its structured
 * renderer explicitly for harness-owned PTYs, without monkey-patching streams.
 * @category parsing
 * @since 1.0.0
 */
export declare const incurArguments: (argv: ReadonlyArray<string>, policy: Policy) => Array<string>;
