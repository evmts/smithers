/**
 * Resolves the package graph and its content identities without executing target bodies.
 *
 * @since 1.0.0
 */
import * as BundlerTarget from "@smthrs/targets/BundlerTarget";
import * as Compose from "@smthrs/targets/Compose";
import * as Target from "@smthrs/targets/Target";
import type * as PackageIndexModule from "../PackageIndex.js";
import * as Planner from "../Planner.js";
import type { PackageNode, PackagePlan, RunOptions } from "./PackageOptions.js";
/**
 * Cache-key salt for PACKAGE.ts execution semantics.
 *
 * @category keys
 * @since 0.1.0
 */
export declare const PACKAGE_EXECUTION_FORMAT = 3;
/** Whether a node's workspace snapshot must exclude every concurrent peer.
 * @category execution
 * @since 0.1.0
 */
export declare const takesExclusiveTreePermit: (node: Pick<PackageNode, "rule" | "mode"> & Partial<Pick<PackageNode, "overlays">>) => boolean;
/**
 * The placeholder a bundler build's key template carries where the graph
 * dependency's key goes. Execution substitutes the resolved graph digest
 * (`bundler-graph:<digest>`) once the resolve node has settled, so a build
 * keys on the graph it bundles rather than on the declared universe; the
 * plan-time preview substitutes the digest when the cache already holds it
 * and the resolve node's own key otherwise.
 *
 * @category keys
 * @since 0.1.0
 */
export declare const graphKeySentinel = "{smthrs:bundler-graph-key}";
/**
 * Substitutes the graph key into a bundler build's key template: the `graph`
 * attr reference and the dependency row both carry the sentinel.
 *
 * @category keys
 * @since 0.1.0
 */
export declare const keyMaterialWithGraph: (template: Planner.KeyMaterial, key: string) => Planner.KeyMaterial;
/**
 * Collects tagged records of one tag inside an attr value.
 *
 * @category internal
 * @since 1.0.0
 */
export declare const collectTagged: (value: unknown, tag: string, into: Array<Record<string, unknown>>, seen: Set<object>) => void;
/**
 * Reads one own attribute without invoking an accessor.
 *
 * @category internal
 * @since 1.0.0
 */
export declare const attrMember: (attrs: unknown, name: string) => unknown;
/**
 * The canonical digest of one closure result: files, packages, and issue
 * rows. Consumers of an ImportClosure key on it.
 *
 * @category keys
 * @since 0.1.0
 */
export declare const closureResultDigest: (result: Compose.ClosureResult) => string;
/**
 * Cache-output shape one bundler resolve stores.
 *
 * @category internal
 * @since 1.0.0
 */
export interface StoredResolve {
    readonly kind: "bundler-resolve";
    readonly result: BundlerTarget.ResolveResult;
}
/**
 * Validates the cached bundler graph before it contributes to a key.
 *
 * @category internal
 * @since 1.0.0
 */
export declare const decodeStoredResolve: (output: unknown) => BundlerTarget.ResolveResult | undefined;
/**
 * The scratch directory bundler children redirect resolve emit and caches into.
 *
 * @category internal
 * @since 1.0.0
 */
export declare const bundlerScratchDirectory: (root: string, cacheDirectory: string) => string;
/**
 * Identifies executable bytes and their interpreter chain for planning and revalidation.
 *
 * @category internal
 * @since 1.0.0
 */
export declare const binaryIdentity: (context: {
    readonly root: string;
    readonly toolBytes: Map<string, Promise<string>>;
    readonly environment: Readonly<Record<string, string | undefined>>;
}, path: string, ancestors?: ReadonlySet<string>) => Promise<unknown>;
/**
 * The placeholder a planned argv carries where the absolute workspace root
 * goes.
 *
 * A path built from the workspace root would otherwise be key material that
 * differs between two checkouts of the same tree, so the plan keeps the
 * workspace-relative form and the spawn substitutes the root.
 *
 * @category keys
 * @since 0.1.0
 */
export declare const workspaceRootToken = "{smthrs:root}";
/**
 * The non-glob directory prefix of one write-set pattern.
 *
 * @category internal
 * @since 1.0.0
 */
export declare const staticPrefixOf: (pattern: string) => string;
/**
 * The workspace-relative files the package manager itself opens before it runs
 * anything: the manifest that names it, the lockfile it validates against, and
 * the workspace file that bounds the tree.
 *
 * The declaration lives on the workspace, not on the target, so it never
 * reaches a consumer's declared inputs. Without it a confined `pnpm exec tsc`
 * dies reading `package.json` — the manifest is what a corepack shim resolves
 * the manager version from, and what pnpm resolves the workspace root from.
 *
 * @category internal
 * @since 1.0.0
 */
export declare const managerFilesOf: (workspace: PackageIndexModule.PackageIndex["workspace"]) => ReadonlyArray<string>;
/**
 * Whether a bare wildcard (`//...`, `//pkg/...`) leaves a target out: an
 * exclusive target under `test` or an unattended plan unless exclusive runs
 * were asked for, a target declared for other hosts, a manual target, and in
 * an unattended plan a rule that spawns an agent. A pattern that names the
 * target keeps it, except that an unattended plan drops attended rules always.
 *
 * @category planning
 * @since 1.0.0
 */
export declare const wildcardOmits: (target: Target.AnyTarget, options: {
    readonly verb: string;
    readonly unattended?: boolean | undefined;
    readonly includeExclusive?: boolean | undefined;
    readonly platform?: string | undefined;
    readonly artifactRun?: "ci" | "never" | undefined;
}) => boolean;
/**
 * Whether a target is a rule that spawns an agent, which an unattended plan
 * drops however it was selected.
 *
 * @category planning
 * @since 1.0.0
 */
export declare const attended: (target: Target.AnyTarget) => boolean;
/**
 * Plans one PACKAGE.ts invocation: resolves roots, walks the graph,
 * resolves tools, and keys every node.
 *
 * @category planning
 * @since 0.1.0
 */
export declare const plan: (options: RunOptions) => Promise<PackagePlan>;
