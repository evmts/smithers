/**
 * The immutable label / target / owner index over one loaded package graph.
 *
 * Labels are a pure function of admitted PACKAGE.ts path plus explicit map
 * key — nothing else creates identity. One target value answers to one
 * label (`Alias` is the sanctioned second name because it is a distinct
 * target). Omission from a map is privacy: an unlisted target has no label
 * and is unreachable from query, completion, and patterns, while the owner
 * binding still records which package's public closure reaches it.
 *
 * @since 0.1.0
 */
import * as Owners from "@smthrs/targets/Owners";
import * as Target from "@smthrs/targets/Target";
import * as WorkspaceDeclaration from "@smthrs/targets/WorkspaceDeclaration";
import type { LoadedFactory } from "./FactoryLoader.js";
import type { LoadedGraph } from "./PackageLoader.js";
/**
 * One labeled target row.
 *
 * @category models
 * @since 0.1.0
 */
export interface IndexedTarget {
    readonly label: string;
    readonly packagePath: string;
    readonly key: string;
    readonly target: Target.AnyTarget;
}
/**
 * One classified dependency edge between labeled targets.
 *
 * There are exactly three edge kinds. Targets reached outside explicit
 * `gates` and `services` attrs are ordinary data dependencies.
 *
 * @category models
 * @since 0.1.0
 */
export interface Edge {
    readonly from: string;
    readonly to: string;
    readonly kind: "data" | "gates" | "services";
}
/**
 * The validated, immutable index of one loaded package graph.
 *
 * @category models
 * @since 0.1.0
 */
export declare class PackageIndex {
    readonly root: string;
    readonly workspace: WorkspaceDeclaration.WorkspaceDeclaration;
    /** The factory declared in FACTORY.ts beside the workspace, when one exists. */
    readonly factory: LoadedFactory | undefined;
    /** The cwd's package path, or undefined when cwd is outside the workspace. */
    readonly currentPackage: string | undefined;
    private readonly rows;
    private readonly byLabel;
    private readonly labelsByTarget;
    private readonly owners;
    private readonly packagePaths;
    private readonly packageOwners;
    private constructor();
    /**
     * Builds and validates the index from one loaded graph.
     *
     * @category constructors
     * @since 0.1.0
     */
    static make(graph: LoadedGraph, cwd?: string): PackageIndex;
    /**
     * Every labeled row, sorted by label.
     *
     * @category querying
     * @since 0.1.0
     */
    targets(): ReadonlyArray<IndexedTarget>;
    /**
     * The label of one indexed target, or undefined for a private local.
     *
     * @category querying
     * @since 0.1.0
     */
    labelOf(target: Target.AnyTarget): string | undefined;
    /**
     * The package that owns one target: its listing package, or — for a
     * private local — the package whose public closure reaches it.
     *
     * @category querying
     * @since 0.1.0
     */
    ownerOf(target: Target.AnyTarget): string | undefined;
    /**
     * Every discovered package path, sorted, `""` for the root.
     *
     * @category querying
     * @since 0.1.0
     */
    packages(): ReadonlyArray<string>;
    /**
     * Whether a package exists at exactly this path.
     *
     * @category querying
     * @since 0.1.0
     */
    hasPackage(packagePath: string): boolean;
    /**
     * The ownership declaration one package carries, or undefined when it
     * declares none and inherits.
     *
     * @category querying
     * @since 0.1.0
     */
    ownersOf(packagePath: string): Owners.Declaration | undefined;
    /**
     * Resolves one label or subtree pattern to indexed rows.
     *
     * A bare package label resolves only an explicit `default` key.
     *
     * @category querying
     * @since 0.1.0
     */
    resolve(patternText: string): ReadonlyArray<IndexedTarget>;
    /**
     * The classified edges among labeled targets selected by a pattern,
     * including edges reached through private locals.
     *
     * @category querying
     * @since 0.1.0
     */
    edges(selected: ReadonlyArray<IndexedTarget>): ReadonlyArray<Edge>;
}
