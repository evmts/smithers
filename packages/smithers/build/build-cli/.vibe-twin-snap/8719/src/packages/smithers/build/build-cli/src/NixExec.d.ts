/**
 * Resolves a declared Nix environment to the closure its tools run from.
 *
 * A `S.Nix.Environment` names a flake and lock, or a Nix expression file. This
 * module turns that declaration into what the planner and the executor need:
 * the store path the environment evaluates to, the store hash that names it
 * in key material, the `PATH` a tool spawns with, the exported variables tools
 * need to run from the closure, and the transitive store closure a sandbox
 * may bind-mount as the toolchain read set.
 *
 * Resolution is fail-closed. A host without `nix`, a flake without its lock,
 * an evaluation that fails, or a closure that does not satisfy a declared
 * runtime version is a typed {@link NixEnvironmentError}, never a fallback to
 * whatever the host has on `PATH`.
 *
 * Evaluation runs once per declaration per process and its result is memoized
 * under the workspace cache directory, keyed on the declared inputs' digests,
 * the host system, and the `nix` version. A memoized entry is reused only
 * while its store path still exists on the host.
 *
 * @since 0.1.0
 */
import type * as Exec from "@smthrs/targets/Exec";
import * as Nix from "@smthrs/targets/Nix";
/**
 * The reasons a declared environment cannot be used.
 *
 * @category models
 * @since 0.1.0
 */
export type NixEnvironmentErrorCode = "nix_absent" | "nix_input_missing" | "nix_evaluation_failed" | "nix_environment_incomplete" | "nix_tool_absent" | "nix_version_mismatch";
declare const NixEnvironmentError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "smithers-build/NixEnvironmentError";
} & Readonly<A>;
/**
 * A declared Nix environment that cannot be resolved or does not satisfy the
 * workspace's declarations.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class NixEnvironmentError extends NixEnvironmentError_base<{
    readonly code: NixEnvironmentErrorCode;
    readonly message: string;
}> {
    constructor(code: NixEnvironmentErrorCode, message: string);
}
/**
 * One declared input file with its content digest.
 *
 * @category models
 * @since 0.1.0
 */
export interface EnvironmentInput {
    readonly path: string;
    readonly digest: string;
}
/**
 * A declared environment resolved on this host.
 *
 * @category models
 * @since 0.1.0
 */
export interface ResolvedEnvironment {
    /** The store path the environment evaluates to. */
    readonly storePath: string;
    /** The 32-character store hash of {@link storePath}; the `nix:<hash>` layer. */
    readonly hash: string;
    /** Every store path {@link storePath} references, itself included. */
    readonly closure: ReadonlyArray<string>;
    /** The `PATH` entries a tool spawns with, in order. */
    readonly path: ReadonlyArray<string>;
    /** Exported variables tools need to run from the closure. */
    readonly variables: Readonly<Record<string, string>>;
    /** The `nix` that evaluated the environment. */
    readonly nix: {
        readonly executable: string;
        readonly version: string;
    };
    /** The Nix system the environment was resolved for. */
    readonly system: string;
    /** The declared inputs and their digests at resolution time. */
    readonly inputs: ReadonlyArray<EnvironmentInput>;
}
/**
 * The exported variables carried from the closure into every tool spawn.
 *
 * `PATH` is handled on its own. The rest are the variables that tell a
 * closure's `curl`, `git`, and libc where the certificate bundle, the locale
 * archive, and the time zone database live; without them those programs
 * look in FHS paths the closure does not populate.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const carriedVariables: ReadonlyArray<string>;
/**
 * Maps the host to the Nix system name a flake is evaluated for.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const hostSystem: (platform?: string, arch?: string) => string;
/**
 * Resolves one declared environment on this host.
 *
 * @category resolution
 * @since 0.1.0
 */
export declare const resolveEnvironment: (options: {
    readonly root: string;
    readonly declaration: Nix.Environment;
    /** The workspace-relative cache directory the memo lives under; omit to skip the memo. */
    readonly cacheDirectory?: string | undefined;
    /** The host environment `nix` is looked up in and spawned with. */
    readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
    readonly signal?: AbortSignal | undefined;
    readonly log?: ((line: string) => void) | undefined;
}) => Promise<ResolvedEnvironment>;
/**
 * The exec-layer environment one resolved closure supplies.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const toolEnvironment: (resolved: ResolvedEnvironment) => Exec.ToolEnvironment;
/**
 * A host environment copy whose `PATH` is the closure's, for executable
 * lookups that read a whole environment record.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const hostEnvironmentWith: (resolved: ResolvedEnvironment, source: Readonly<Record<string, string | undefined>>) => Readonly<Record<string, string | undefined>>;
/**
 * The layer identity a resolved environment contributes to key material.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const layer: (resolved: ResolvedEnvironment) => string;
/**
 * Reports whether a measured version satisfies a declared requirement of the
 * two forms declarations use: `>=x.y.z`, or an exact `x.y.z`.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const satisfies: (measured: string, requirement: string) => boolean;
/**
 * Asserts that one tool the closure supplies satisfies the version the
 * workspace declared for it.
 *
 * The tool is looked up on the closure's `PATH` alone. An absent tool and a
 * version outside the requirement are both {@link NixEnvironmentError}s that
 * name the declaration and what the closure provides.
 *
 * @category resolution
 * @since 0.1.0
 */
export declare const assertToolVersion: (resolved: ResolvedEnvironment, tool: {
    readonly name: string;
    readonly executable?: string | undefined;
    readonly requirement: string;
}, options: {
    readonly root: string;
    readonly signal?: AbortSignal | undefined;
}) => Promise<string>;
export {};
