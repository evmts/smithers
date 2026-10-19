/**
 * Plan-time resolution of opaque local-repository target edges.
 *
 * Child declarations never enter the parent module graph. Resolution invokes
 * this same CLI in the child directory, parses its JSON query result, and
 * reduces every failure to data carried by the parent target.
 *
 * @since 0.1.0
 */
import * as Target from "@smthrs/targets/Target";
import type * as PackageIndex from "./PackageIndex.ts";
/**
 * The source entry point every child invocation executes.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const buildCliPath: string;
/**
 * The child metadata attached to one repository target at plan time.
 *
 * @category models
 * @since 0.1.0
 */
export interface Resolution {
    readonly repoName: string;
    readonly repoPath: string;
    readonly absolutePath: string;
    readonly label: string;
    readonly args: ReadonlyArray<string>;
    readonly kinds: ReadonlyArray<Target.Kind>;
    readonly refusal: string | undefined;
    readonly externalLabel: string;
}
/**
 * The git state that keys execution of a child repository.
 *
 * @category models
 * @since 0.1.0
 */
export interface GitState {
    readonly head: string;
    readonly dirty: boolean;
    readonly status: string;
}
declare const ExecutionError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "smithers-build/ExecutionError";
} & Readonly<A>;
/**
 * A child CLI execution failed after streaming its output.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class ExecutionError extends ExecutionError_base<{
    readonly code: "repo_target_failed";
    readonly exitCode: number;
    readonly stderrTail: string;
    readonly message: string;
}> {
    constructor(resolution: Resolution, exitCode: number, stderrTail: string);
}
/**
 * One operation's view of the workspace's child repositories: the index, the
 * environment every child spawn inherits, and the memoized resolutions keyed
 * by target identity.
 *
 * The environment is scrubbed on construction, so no child repository ever
 * inherits the parent's remote-cache credentials. Only `resolver` builds one.
 *
 * @category models
 * @since 0.1.0
 */
export declare class Resolver {
    readonly index: PackageIndex.PackageIndex;
    readonly environment: Readonly<Record<string, string | undefined>>;
    readonly cache: Map<Target.AnyTarget, Promise<Resolution>>;
    private constructor();
    /** @internal */
    static make(index: PackageIndex.PackageIndex, environment: Readonly<Record<string, string | undefined>>): Resolver;
}
/**
 * Builds the resolver one operation shares. `ambient` is the caller's host
 * environment; the default cache names and every credential name the
 * workspace declares are withheld from it before any child sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const resolver: (index: PackageIndex.PackageIndex, ambient: Readonly<Record<string, string | undefined>>) => Resolver;
/**
 * Resolves one repository target, memoized within the caller's operation.
 *
 * @category resolution
 * @since 0.1.0
 */
export declare const resolve: (resolver: Resolver, target: Target.AnyTarget, signal?: AbortSignal | undefined) => Promise<Resolution>;
/**
 * Returns a target's effective kinds, mirroring a repository target through
 * Alias while leaving every ordinary target unchanged.
 *
 * @category resolution
 * @since 0.1.0
 */
export declare const effectiveKinds: (resolver: Resolver, target: Target.AnyTarget, signal?: AbortSignal | undefined) => Promise<ReadonlyArray<Target.Kind>>;
/**
 * Reads the commit and dirty status used by one child execution key.
 *
 * @category resolution
 * @since 0.1.0
 */
export declare const gitState: (resolver: Resolver, resolution: Resolution, signal?: AbortSignal | undefined) => Promise<GitState>;
/**
 * Executes one repository target through this CLI, under the resolver's
 * scrubbed environment, and streams both output
 * pipes to `output` while retaining a bounded diagnostic tail. `output`
 * defaults to the parent process streams; a run passes its reporter so an
 * injected terminal receives the child's output.
 *
 * @category execution
 * @since 0.1.0
 */
export declare const execute: (resolver: Resolver, resolution: Resolution, options?: {
    readonly write?: boolean | undefined;
    readonly plan?: boolean | undefined;
    readonly signal?: AbortSignal | undefined;
    readonly output?: ((stream: "stdout" | "stderr", chunk: string) => void) | undefined;
    /** Extra child environment, such as the parent's approval bridge. */
    readonly environment?: Readonly<Record<string, string>> | undefined;
}) => Promise<void>;
export {};
