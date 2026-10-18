/**
 * Workspace configuration declared in the root PACKAGE.ts file.
 *
 * A configuration value is inert: {@link Workspace} validates its fields and
 * performs no I/O, so PACKAGE.ts evaluation stays pure. The CLI discovers the
 * declaration and resolves it against the `--cache-dir` flag. The CLI passes
 * the result explicitly to input expansion and tool execution as host state.
 *
 * The resolved cache directory is explicit host state rather than target attrs
 * on purpose. It names where scratch and cache files live on one host, so it
 * must never reach a cache key or a content digest.
 *
 * @since 0.1.0
 */
import type * as Attr from "./Attr.ts";
import type * as WorkspaceDeclaration from "./WorkspaceDeclaration.ts";
/**
 * Runtime marker for a workspace configuration declaration.
 *
 * @category type ids
 * @since 0.1.0
 */
export declare const TypeId: unique symbol;
/**
 * The cache directory used when no PACKAGE.ts declaration and no flag name one.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const defaultCacheDirectory = ".flows";
/**
 * Maximum UTF-8 size of a normalized cache-directory path.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumCacheDirectoryBytes: number;
/**
 * Maximum UTF-8 size of one cache-directory path segment.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumCacheDirectorySegmentBytes = 255;
/**
 * A pure workspace configuration declaration.
 *
 * `cacheDirectory` is a workspace-relative directory holding the result cache
 * and target scratch files. `gitignored` asks the CLI to keep a root
 * `.gitignore` entry for it.
 *
 * @category models
 * @since 0.1.0
 */
export interface Workspace {
    readonly [TypeId]: typeof TypeId;
    readonly cacheDirectory: string;
    readonly gitignored: boolean;
    /**
     * The confinement every tool-running target executes under. `"none"` is
     * the explicit opt-out; `{}` is the default confinement (declared reads and
     * writes only, no network); `{ network: "loopback" }` and
     * `{ network: true }` open the network in steps.
     */
    readonly sandbox: Attr.Sandbox;
    /** The mechanism that enforces the confinement, when the platform default is not wanted. */
    readonly sandboxes: WorkspaceDeclaration.SandboxesDeclaration | undefined;
}
/**
 * Options accepted by {@link Workspace}.
 *
 * @category models
 * @since 0.1.0
 */
export interface Options {
    /** @default ".flows" */
    readonly cacheDirectory?: string | undefined;
    /** @default false */
    readonly gitignored?: boolean | undefined;
    /** @default "none" */
    readonly sandbox?: Attr.Sandbox | undefined;
    /** @default undefined, meaning the platform's own mechanism */
    readonly sandboxes?: WorkspaceDeclaration.SandboxesDeclaration | undefined;
}
/**
 * Checks whether a value is a sandbox policy: `"none"`, or an object whose
 * only member is an optional `network` of `true`, `false`, or `"loopback"`.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isSandboxPolicy: (value: unknown) => value is Attr.Sandbox;
/**
 * Validates one declared cache directory and returns its normalized posix
 * form.
 *
 * The value names a single workspace-relative directory. Surrounding
 * whitespace, redundant separators, and `.` segments are dropped. An empty
 * value, an absolute path, and any `..` segment are refused, so the directory
 * can never escape the workspace.
 *
 * @category validation
 * @since 0.1.0
 */
export declare const normalizeCacheDirectory: (value: string) => string;
/**
 * Creates a pure workspace configuration declaration using PACKAGE.ts syntax.
 *
 * @example
 * ```ts
 * import { Workspace } from "@smthrs/targets/Config"
 *
 * export const workspace = Workspace({
 *   cacheDirectory: ".flows",
 *   gitignored: true
 * })
 * ```
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const Workspace: (options?: Options) => Workspace;
/**
 * Checks whether a PACKAGE.ts export is a workspace configuration declaration.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isWorkspace: (value: unknown) => value is Workspace;
