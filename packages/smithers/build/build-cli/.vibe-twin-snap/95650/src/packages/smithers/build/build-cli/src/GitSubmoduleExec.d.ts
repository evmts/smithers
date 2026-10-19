/**
 * Gitlink-keyed submodule planning for build-system execution.
 *
 * The git index is the version authority. `.gitmodules` selects paths, globs
 * are expanded before execution, and populated worktrees must already match
 * their pinned gitlink commit. Checkout is required only for missing/empty
 * paths and therefore implies a network-enabled sandbox.
 *
 * @since 0.1.0
 */
import type * as GitTarget from "@smthrs/targets/GitTarget";
/** One submodule selected and pinned by the repository index.
 *
 * @category models
 * @since 0.1.0
 */
export interface Gitlink {
    readonly path: string;
    readonly sha: string;
    readonly state: "missing" | "empty" | "matching" | "mismatch";
    readonly head?: string | undefined;
    readonly dirty?: boolean | undefined;
}
/** The complete plan for one Git.Submodule(s) target.
 *
 * @category models
 * @since 0.1.0
 */
export interface Plan {
    readonly paths: ReadonlyArray<string>;
    readonly gitlinks: ReadonlyArray<Gitlink>;
    /**
     * Absolute host directories the selected submodules clone from when their
     * `.gitmodules` url names a local repository (an absolute path or a
     * `file://` url). A confined `git submodule update` has to be able to read
     * them; a remote url needs the network the rule already asks for.
     */
    readonly sources: ReadonlyArray<string>;
    readonly refusal?: string | undefined;
}
/**
 * The operator variable naming the host directories a submodule's local url
 * may clone from, as a list separated by the platform path delimiter.
 *
 * It is read from the host environment, never from the checkout, because the
 * checkout is what the list constrains. Unset, only repositories inside the
 * workspace root may be local submodule sources.
 *
 * @category security
 * @since 0.1.0
 */
export declare const submoduleSourcesVariable = "SMITHERS_SUBMODULE_SOURCES";
/** Resolves paths, gitlink SHAs, and current worktree state.
 *
 * @category planning
 * @since 0.1.0
 */
export declare const plan: (options: {
    readonly root: string;
    readonly packagePath: string;
    readonly rule: "Git.Submodules";
    readonly attrs: (typeof GitTarget.SubmodulesAttrs)["Type"];
    /** Host environment read for {@link submoduleSourcesVariable}; defaults to `process.env`. */
    readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
} | {
    readonly root: string;
    readonly packagePath: string;
    readonly rule: "Git.Submodule";
    readonly attrs: (typeof GitTarget.SubmoduleAttrs)["Type"];
    /** Host environment read for {@link submoduleSourcesVariable}; defaults to `process.env`. */
    readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
}) => Promise<Plan>;
/** Whether every selected checkout is populated at its pinned SHA.
 *
 * @category execution
 * @since 0.1.0
 */
export declare const isMaterialized: (plan: Plan) => boolean;
/** Revalidates the selected worktrees after cache restore or checkout.
 *
 * @category execution
 * @since 0.1.0
 */
export declare const verify: (root: string, plan: Plan) => Promise<string | undefined>;
