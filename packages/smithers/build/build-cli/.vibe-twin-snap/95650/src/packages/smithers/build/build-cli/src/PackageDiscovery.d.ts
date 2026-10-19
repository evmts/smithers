/**
 * Ignore-blind PACKAGE.ts / WORKSPACE.ts discovery.
 *
 * Discovery walks the filesystem from the canonical workspace root and never
 * consults git: gitignore status is irrelevant, so a gitignored or generated
 * PACKAGE.ts participates like any other. The walk prunes `.git`,
 * `node_modules`, distribution output (`dist`), nested checkouts (any directory
 * whose listing holds `.git` or `.jj`), caches tagged with `CACHEDIR.TAG`, the
 * resolved cache directory, declared child repositories, and the workspace's
 * declared `discovery.prune` paths, admits declaration files
 * through the shared SafeFs policy, and rejects a symlinked declaration file
 * outright.
 *
 * @since 0.1.0
 */
import * as SafeFs from "@smthrs/targets/SafeFs";
/**
 * The discovered declaration inventory of one workspace.
 *
 * All paths are workspace-relative posix, sorted by UTF-16 code unit.
 *
 * @category models
 * @since 0.1.0
 */
export interface Discovery {
    /** The canonical workspace root. */
    readonly root: string;
    /** `.smithers/WORKSPACE.ts`, or the root `WORKSPACE.ts` fallback. */
    readonly workspaceFile: string;
    /** The `FACTORY.ts` beside the workspace file, when the workspace declares a factory. */
    readonly factoryFile?: string | undefined;
    /** Every exact-case `PACKAGE.ts` in the tree. */
    readonly packageFiles: ReadonlyArray<string>;
    /** The cache directory the walk pruned. */
    readonly cacheDirectory: string;
    /** Declared opaque child repositories, sorted by name. */
    readonly repositories: ReadonlyArray<RepositoryBoundary>;
    /**
     * Directories the walk skipped whole: declared `discovery.prune` paths
     * that exist, nested checkouts, and `CACHEDIR.TAG` caches.
     */
    readonly pruned: ReadonlyArray<string>;
    /** How many directories the walk listed. */
    readonly directories: number;
}
/**
 * One named opaque child-repository boundary.
 *
 * @category models
 * @since 0.1.0
 */
export interface RepositoryBoundary {
    readonly name: string;
    readonly path: string;
}
/**
 * The nearest ancestor of `start` that holds a workspace declaration, or
 * undefined when no ancestor does.
 *
 * The presence probe is deliberately cheap; {@link discover} re-admits the
 * file under the full SafeFs policy.
 *
 * @category discovery
 * @since 0.1.0
 */
export declare const findWorkspaceRoot: (start: string) => Promise<string | undefined>;
/**
 * The workspace declaration file a root holds: `.smithers/WORKSPACE.ts`
 * first, the root `WORKSPACE.ts` fallback, or undefined when neither
 * exists. A cheap lstat probe like {@link findWorkspaceRoot}; {@link discover}
 * re-admits the file under the full SafeFs policy.
 *
 * @category discovery
 * @since 0.1.0
 */
export declare const workspaceFileOf: (root: string) => Promise<string | undefined>;
/**
 * Discovers the workspace's declaration files without evaluating any of
 * them.
 *
 * @category discovery
 * @since 0.1.0
 */
export declare const discover: (root: string, options?: {
    readonly cacheDirectory?: string | undefined;
    readonly repositories?: Readonly<Record<string, {
        readonly path: string;
    }>> | undefined;
    /** Workspace-relative posix directories the walk never enters (`discovery.prune`). */
    readonly prune?: ReadonlyArray<string> | undefined;
    readonly signal?: AbortSignal | undefined;
    /** The filesystem seam the walk lists through; tests count its calls. */
    readonly io?: SafeFs.Io | undefined;
}) => Promise<Discovery>;
