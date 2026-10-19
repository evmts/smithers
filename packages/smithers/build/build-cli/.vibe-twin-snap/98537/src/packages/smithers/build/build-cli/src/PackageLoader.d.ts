/**
 * Trusted PACKAGE.ts / WORKSPACE.ts evaluation through tsx.
 *
 * One command evaluates one module instance per declaration file: every
 * discovered file is imported through a single generated entry module, so a
 * Package imported by three siblings and by the loader itself is one
 * namespace and its targets keep one identity — which is what lets one
 * target carry exactly one label.
 *
 * Before anything evaluates, a static import scan walks the transitive
 * relative-import closure of every PACKAGE.ts — helper modules included — so
 * a cycle routed through a helper still fails as `package_import_cycle` with
 * the full chain, a helper importing WORKSPACE.ts still fails the one-way
 * rule, and the per-process load cache re-keys when a helper changes. The
 * scan is lexical but comment- and string-aware; a specifier mentioned in a
 * comment never creates an edge. A specifier whose resolution names a
 * discovered PACKAGE.ts under different case is fatal: on a case-insensitive
 * filesystem it would evaluate a second module instance of the same physical
 * file and split one target identity in two.
 *
 * ## Trust boundary
 *
 * A PACKAGE.ts is executable TypeScript evaluated in this process, exactly
 * as trusted as the repository's own code. See `Workspace.importNamespace`
 * for the full statement; it applies unchanged here.
 *
 * @since 0.1.0
 */
import * as Package from "@smthrs/targets/Package";
import type * as WorkspaceDeclaration from "@smthrs/targets/WorkspaceDeclaration";
import { type LoadedFactory } from "./FactoryLoader.ts";
import type { Discovery } from "./PackageDiscovery.ts";
/**
 * One evaluated, validated PACKAGE.ts module.
 *
 * @category models
 * @since 0.1.0
 */
export interface LoadedPackage {
    /** The workspace-relative module path, for example `src/PACKAGE.ts`. */
    readonly file: string;
    /** The package path the file's directory derives, `""` for the root. */
    readonly packagePath: string;
    /** The validated Package value. */
    readonly value: Package.PackageValue;
}
/**
 * One command's evaluated declaration graph.
 *
 * @category models
 * @since 0.1.0
 */
export interface LoadedGraph {
    readonly root: string;
    readonly workspace: WorkspaceDeclaration.WorkspaceDeclaration;
    /** The factory declared beside the workspace, when `FACTORY.ts` exists. */
    readonly factory: LoadedFactory | undefined;
    readonly packages: ReadonlyArray<LoadedPackage>;
}
/**
 * Evaluates and validates every discovered declaration module, once per
 * content digest per process. The digest covers the transitive
 * relative-import closure — helper modules included — so editing any module
 * a PACKAGE.ts imports re-keys the load.
 *
 * @category loading
 * @since 0.1.0
 */
export declare const load: (discovery: Discovery) => Promise<LoadedGraph>;
/**
 * Evaluates only WORKSPACE.ts (with its own imports) and returns the
 * validated declaration, so discovery can read the two boundaries it bounds
 * itself with — the cache directory and the child repositories — before the
 * package walk.
 *
 * Every failure rejects: a typed `PackageError` from the scan or from the
 * declaration itself passes through untouched, and anything else is wrapped
 * as `module_import_failed` naming the workspace file. Nothing here resolves
 * to undefined, and this function keeps no memo of its own, so every call
 * re-evaluates the module.
 *
 * ## Evaluation lifetime
 *
 * Each call evaluates the workspace in a fresh tsx namespace, separate from
 * the one {@link load} uses. The full graph evaluates the workspace again,
 * with its packages sharing that graph's namespace, so target identity always
 * comes from the one real load and the namespace this call evaluates is
 * discarded once the declaration validates.
 *
 * @category loading
 * @since 0.1.0
 */
export declare const loadWorkspaceDeclaration: (root: string, workspaceFile: string) => Promise<WorkspaceDeclaration.WorkspaceDeclaration>;
/**
 * Reads the declared cache directory off the workspace declaration, so the
 * package walk can prune it before it lists anything.
 *
 * The probe is deliberately forgiving: any failure returns undefined and the
 * full load reports the real diagnostic. The memo below avoids repeating the
 * probe within one process; it does not invalidate module caches, and it
 * holds the probe alone — {@link loadWorkspaceDeclaration} above is
 * unmemoized.
 *
 * @category loading
 * @since 0.1.0
 */
export declare const probeCacheDirectory: (root: string, workspaceFile: string) => Promise<string | undefined>;
