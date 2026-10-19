/**
 * The package manager and runtime a target resolves from the workspace.
 *
 * `WORKSPACE.ts` declares the workspace's package manager and runtime once.
 * Before this module every PACKAGE.ts restated them: the root declaration
 * exported `packageManager` and `runtime` values and ~75 package declarations
 * imported them back so they could pass them as attrs. That is the workspace's
 * business, not a package's, and the import direction is the wrong one anyway
 * — `PackageLoader` refuses a PACKAGE.ts that imports WORKSPACE.ts.
 *
 * A rule now names the attrs it resolves from the workspace
 * ({@link Target.Metadata.workspaceAttrs}) and leaves them optional. The
 * planner fills each named attr in here, before it keys the node and before it
 * runs the body, so the manager and the interpreter stay key material and the
 * rule bodies keep computing their own argv from one declaration. A
 * declaration that passes the attr explicitly always wins: that is how the Bun
 * compatibility matrix re-runs a package's suite under a second interpreter.
 *
 * @since 0.1.0
 */
import * as Input from "@smthrs/targets/Input";
import * as PackageManager from "@smthrs/targets/PackageManager";
import * as Runtime from "@smthrs/targets/Runtime";
import type * as Target from "@smthrs/targets/Target";
import type * as WorkspaceDeclaration from "@smthrs/targets/WorkspaceDeclaration";
/**
 * The workspace-declared tool identities legacy rules resolve against.
 *
 * Either may be undefined: a Cargo or Go workspace declares no JavaScript
 * package manager at all, and a rule that needs one then refuses by name
 * rather than spawning whatever is on PATH.
 *
 * @category models
 * @since 0.1.0
 */
export interface WorkspaceToolchain {
    readonly packageManager: PackageManager.PackageManager | undefined;
    readonly runtime: Runtime.Runtime | undefined;
}
/**
 * Reads literal workspace toolchain declarations without I/O.
 * Manifest-derived fields stay unresolved until {@link resolve} is called.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const of: (workspace: WorkspaceDeclaration.WorkspaceDeclaration) => WorkspaceToolchain;
/**
 * A resolved workspace toolchain and the exact manifest texts it consumed.
 *
 * @category models
 * @since 1.0.0
 */
export interface ResolvedWorkspaceToolchain extends WorkspaceToolchain {
    readonly manifestDigests: ReadonlyArray<Input.FileDigest>;
}
/**
 * Resolves declared toolchain manifests within the workspace before keying.
 * Each bounded, validated text read supplies both the requirement and its
 * digest, so an intervening second read cannot key different manifest bytes.
 * No package manager or runtime is installed or executed while resolving.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const resolve: (workspace: WorkspaceDeclaration.WorkspaceDeclaration, options: {
    readonly root: string;
    readonly signal?: AbortSignal | undefined;
}) => Promise<ResolvedWorkspaceToolchain>;
/**
 * Fills a target's workspace-resolved attrs from the workspace declaration.
 *
 * Only the attrs the rule named are considered, and only when the declaration
 * left them absent, so a target that never declared one is returned untouched
 * and a target that declared one keeps what it wrote.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const fill: (workspaceAttrs: ReadonlyArray<Target.WorkspaceAttr>, attrs: unknown, toolchain: WorkspaceToolchain) => unknown;
