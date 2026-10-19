/**
 * Go-specific planning kept out of the package executor's dispatch switch.
 *
 * @since 0.1.0
 */
import type * as WorkspaceDeclaration from "@smthrs/targets/WorkspaceDeclaration";
import type * as NixExec from "./NixExec.ts";
/**
 * Where one Go rule is being planned: the workspace root, the declaring
 * package, and the workspace declaration whose toolchain shapes the build.
 *
 * @category models
 * @since 0.1.0
 */
export interface Context {
    readonly root: string;
    /** Cancels planning subprocesses when the run stops. */
    readonly signal?: AbortSignal | undefined;
    /** Per-probe override in milliseconds; go list defaults to 60000, Nix to 300000. */
    readonly timeoutMs?: number | undefined;
    readonly packagePath: string;
    readonly workspace: WorkspaceDeclaration.WorkspaceDeclaration;
    /** The target environment used to select the executable and switched SDK. */
    readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
    /** The workspace's resolved Nix environment, when it declares one. */
    readonly nix?: NixExec.ResolvedEnvironment | undefined;
}
/**
 * The result of planning one Go rule: either a refusal, or the argv, the
 * environment, the outputs, and the key material the executor needs.
 *
 * @category models
 * @since 0.1.0
 */
export interface Planned {
    readonly refusal?: string;
    readonly argv?: ReadonlyArray<string>;
    readonly env: Readonly<Record<string, string>>;
    readonly outDirs: ReadonlyArray<string>;
    readonly writeSet: ReadonlyArray<string>;
    /**
     * The workspace-relative files the spawned toolchain reads: the module
     * authority (`go.mod`, `go.sum`) plus every compiler input `go list`
     * reports for the selected packages.
     *
     * A `Go.*` rule names its work with import patterns, not with `S.file`
     * declarations, so the target has no declared inputs and the confinement
     * would otherwise hide the module from its own compiler. The read set is
     * the same closure the key is computed over, which keeps "what the sandbox
     * admits" and "what the key covers" one answer rather than two.
     */
    readonly readSet: ReadonlyArray<string>;
    readonly closureIdentity?: unknown;
}
/**
 * Locates the host `go` toolchain and describes it as key material, or refuses
 * with the reason the target cannot run.
 *
 * @category planning
 * @since 0.1.0
 */
export declare const resolveGo: (context: Context) => Promise<{
    readonly ok: true;
    readonly path: string;
    readonly identity: unknown;
    readonly executables: ReadonlyArray<string>;
    /** The selected SDK's `GOROOT`, which the compiler reads far beyond its `bin`. */
    readonly sdkRoot: string;
} | {
    readonly ok: false;
    readonly refusal: string;
    readonly identity: unknown;
}>;
/**
 * Locates `nix` and the declared dev shell, returning either the resolved
 * interpreter path plus its key material or the reason it is unavailable.
 *
 * @category planning
 * @since 0.1.0
 */
export declare const resolveNix: (name: string, context: Context) => Promise<{
    readonly ok: true;
    readonly path: string;
    readonly identity: unknown;
} | {
    readonly ok: false;
    readonly refusal: string;
    readonly identity: unknown;
}>;
/**
 * One package selection's key material plus the workspace-relative files it
 * was computed over.
 *
 * @category models
 * @since 0.1.0
 */
export interface Closure {
    /** The value the target key records for this selection. */
    readonly identity: unknown;
    /** Workspace-relative paths of the compiler inputs that live in the tree. */
    readonly files: ReadonlyArray<string>;
}
/**
 * The environment a Go toolchain probe runs under: the declared toolchain
 * settings with no target-specific additions.
 *
 * @category planning
 * @since 0.1.0
 */
export declare const toolchainEnvironment: (context: Context) => Readonly<Record<string, string>>;
/**
 * Plans one `Go.*` rule into argv, environment, outputs, and the closure the
 * cache key is computed over.
 *
 * @category planning
 * @since 0.1.0
 */
export declare const planRule: (rule: string, attrs: Record<string, unknown>, context: Context, goPath: string) => Promise<Planned>;
