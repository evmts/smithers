/**
 * Ownership resolution over the package index: which owners a changed path
 * resolves to, why, and under which agent policy; plus the two projections
 * of that answer, `.github/CODEOWNERS` and the per-directory `OWNERS` tree.
 *
 * The declarations are inert data on `S.Package` and `S.Workspace`
 * (`@smthrs/targets/Owners`). This module is the only place they meet the
 * package tree and the dependency graph, so the CLI's `owners` command, the
 * `owners()` and `rdeps()` queries, and the two generated-file rules all read
 * one resolution.
 *
 * ## Terms
 *
 * A path belongs to the deepest package whose directory contains it. Its
 * **direct** owners are that package's `owners` plus every `perFile` rule the
 * path matches. Unless the package sets `noparent`, the walk continues to
 * the parent package and adds its owners as **inherited**, up to the root; a
 * path whose chain declares nothing resolves to the **workspace** owners.
 *
 * A package's **upstream** is the set of packages its targets depend on,
 * transitively, through declared dependencies: what `deps()` reaches. A
 * package that declares `upstream: "review"` or `"approve"` claims changes to
 * those packages: the claiming package's own owners join the resolution as
 * suggested reviewers or required approvers, tagged `upstream-of //pkg`.
 * `packages` bounds the claim to named labels or subtree patterns.
 *
 * @since 0.1.0
 */
import type * as Owners from "@smthrs/targets/Owners";
import * as Ansi from "./Ansi.ts";
import type { PackageIndex } from "./PackageIndex.ts";
/**
 * Why one owner is on a path.
 *
 * @category models
 * @since 0.1.0
 */
export type Reason = {
    readonly kind: "direct";
} | {
    readonly kind: "per-file";
    readonly pattern: string;
} | {
    readonly kind: "inherited";
    readonly from: string;
} | {
    readonly kind: "workspace";
} | {
    readonly kind: "upstream-of";
    readonly label: string;
};
/**
 * One resolved owner on a path: the reference as written, the role the
 * resolution gives it, and every reason it is there.
 *
 * @category models
 * @since 0.1.0
 */
export interface ResolvedOwner {
    readonly owner: Owners.Owner;
    readonly role: "approve" | "review";
    readonly reasons: ReadonlyArray<Reason>;
}
/**
 * One touched path and everything ownership says about it.
 *
 * @category models
 * @since 0.1.0
 */
export interface TouchedPath {
    readonly path: string;
    /** The owning package label, `//` for the root. */
    readonly package: string;
    readonly owners: ReadonlyArray<ResolvedOwner>;
    readonly agentPolicy: Owners.AgentPolicy;
    /** Every package with a say: the owning package and each upstream claimant. */
    readonly packages: ReadonlyArray<string>;
}
/**
 * The whole answer for one set of paths.
 *
 * @category models
 * @since 0.1.0
 */
export interface Resolution {
    readonly touchedPaths: ReadonlyArray<TouchedPath>;
    /** Owners with the `approve` role anywhere in the set, deduplicated and sorted. */
    readonly requiredApprovers: ReadonlyArray<Owners.Owner>;
    /** Owners with only the `review` role, deduplicated and sorted, never also required. */
    readonly suggestedReviewers: ReadonlyArray<Owners.Owner>;
}
/**
 * The deepest package whose directory contains the path, `""` for the root.
 *
 * @category resolution
 * @since 0.1.0
 */
export declare const packageOf: (index: PackageIndex, path: string) => string;
/**
 * The transitive set of packages one package depends on, through every
 * labeled target's dependency closure, excluding the package itself.
 *
 * @category resolution
 * @since 0.1.0
 */
export declare const upstreamPackages: (index: PackageIndex, packagePath: string) => ReadonlyArray<string>;
/**
 * The owners of one package directory itself, with inheritance and the
 * workspace fallback, but without per-file rules: what an upstream claim
 * contributes and what a CODEOWNERS package line lists.
 *
 * @category resolution
 * @since 0.1.0
 */
export declare const packageOwners: (index: PackageIndex, packagePath: string) => ReadonlyArray<ResolvedOwner>;
/**
 * The agent policy one path lands under: the nearest declaring package's
 * first matching override, else its default, walking up unless `noparent`;
 * the workspace declaration last; `human-approve` when nothing declares.
 *
 * @category resolution
 * @since 0.1.0
 */
export declare const agentPolicyOf: (index: PackageIndex, path: string) => Owners.AgentPolicy;
/**
 * Resolves ownership for a set of workspace-relative paths.
 *
 * @category resolution
 * @since 0.1.0
 */
export declare const resolve: (index: PackageIndex, paths: ReadonlyArray<string>) => Resolution;
/**
 * The workspace-relative paths changed since a git base, the same set an
 * `S.gitDiff(base)` input declares.
 *
 * @category resolution
 * @since 0.1.0
 */
export declare const changedPaths: (root: string, base: string) => Promise<ReadonlyArray<string>>;
/**
 * Every labeled target whose dependency closure reaches the target one
 * label names: the reverse of `deps()`.
 *
 * @category querying
 * @since 0.1.0
 */
export declare const rdeps: (index: PackageIndex, label: string) => ReadonlyArray<string>;
/**
 * The JSON shape the `--json` output and the Smithers landing gate share:
 * `touched_paths[]` with `{ login }` or `{ team }` owner objects, `role`,
 * `reasons` as strings, and `agent_policy`.
 *
 * @category formatting
 * @since 0.1.0
 */
export declare const toJson: (resolution: Resolution) => {
    readonly touched_paths: ReadonlyArray<{
        readonly path: string;
        readonly package: string;
        readonly owners: ReadonlyArray<{
            readonly login?: string;
            readonly team?: string;
            readonly role: string;
            readonly reasons: ReadonlyArray<string>;
        }>;
        readonly agent_policy: Owners.AgentPolicy;
        readonly packages: ReadonlyArray<string>;
    }>;
    readonly required_approvers: ReadonlyArray<string>;
    readonly suggested_reviewers: ReadonlyArray<string>;
};
/**
 * One reason rendered the way the JSON and the table both show it.
 *
 * @category rendering
 * @since 0.1.0
 */
export declare const reasonText: (reason: Reason) => string;
/**
 * Renders a resolution for a person: one block per path, owners with role
 * and reasons, then the required and suggested sets.
 *
 * @category formatting
 * @since 0.1.0
 */
export declare const text: (resolution: Resolution, style?: Ansi.Palette) => string;
/**
 * Renders `.github/CODEOWNERS`: least specific first, so GitHub's last-match
 * rule lands on the deepest package or per-file rule. Only required approvers
 * appear; a `review` upstream claim has no CODEOWNERS form.
 *
 * @category rendering
 * @since 0.1.0
 */
export declare const renderCodeowners: (index: PackageIndex, org: string) => string;
/**
 * Renders the `OWNERS` tree: one file per package that declares ownership,
 * plus the root when the workspace declares defaults. Format, per line:
 * `set noparent`, one owner per line (`team:<name>` kept as written),
 * `per-file <glob> = <owner>, <owner>`, `agents: <policy>` for the default
 * and `agents: <policy> <glob>` per override, and `reviewers: <owners>
 * # upstream-of //pkg` for upstream review claims; approve claims add the
 * claimant's owners as plain owner lines with the same trailing comment.
 *
 * @category rendering
 * @since 0.1.0
 */
export declare const renderOwnersTree: (index: PackageIndex, file?: string) => ReadonlyArray<{
    readonly path: string;
    readonly content: string;
}>;
