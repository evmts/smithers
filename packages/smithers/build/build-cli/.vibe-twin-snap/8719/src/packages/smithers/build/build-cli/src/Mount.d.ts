/**
 * Mount materialization: run an overlay repository's automation against an
 * upstream repository it never forks.
 *
 * An overlay repository's `.smithers/config.ts` default-exports `S.Mounts`.
 * A command run from the overlay materializes the named mount before it
 * plans: it fetches the pinned upstream commit into `.mounts/<name>` at the
 * overlay root, applies the declared patches as commits on top of the pin,
 * and lays the overlay's `.smithers/` over the checkout. The command then
 * plans against the checkout, so every `//` label and every relative upstream
 * config resolves as if the overlay's `.smithers/` lived upstream.
 *
 * The checkout is derived state. Materialization never discards work: edits
 * to upstream files survive while the pin and patches hold still and block a
 * re-materialization that would replace them, and an edit to a laid
 * `.smithers/` file blocks the next lay. The upstream repository is only ever
 * read. See `docs/concepts/mounts.md` for the design and its alternatives.
 *
 * @since 1.0.0
 */
import * as MountDeclaration from "@smthrs/targets/Mount";
/**
 * The overlay-relative directory every checkout lives under.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const checkoutsDirectory = ".mounts";
/**
 * The receipt a checkout's `.git` directory holds, naming what was
 * materialized so the next command can tell whether anything moved.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const receiptFile = "smithers-mount.json";
declare const MountError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "smithers-build/MountError";
} & Readonly<A>;
/**
 * Why a mount could not be materialized.
 *
 * - `mount_config_invalid`: `.smithers/config.ts` failed to evaluate, does
 *   not default-export `S.Mounts`, or names a missing patch file.
 * - `mount_ambiguous`: the overlay declares several mounts and the command
 *   did not name one.
 * - `mount_fetch_failed`: the pinned commit could not be fetched.
 * - `mount_drift`: the drift policy refused the tracked branch's state.
 * - `mount_patch_failed`: a declared patch does not apply to its base.
 * - `mount_dirty`: re-materializing would discard edits in the checkout.
 * - `mount_overlay_edited`: a laid `.smithers/` file was edited in the
 *   checkout, so laying the overlay again would discard the edit.
 * - `mount_overlay_collision`: an overlay file would replace a file the
 *   upstream repository tracks.
 *
 * @category errors
 * @since 1.0.0
 */
export declare class MountError extends MountError_base<{
    readonly code: "mount_config_invalid" | "mount_ambiguous" | "mount_fetch_failed" | "mount_drift" | "mount_patch_failed" | "mount_dirty" | "mount_overlay_edited" | "mount_overlay_collision";
    readonly message: string;
}> {
}
/**
 * How the tracked branch relates to the materialized commit.
 *
 * `untracked` means the mount names no branch; `unknown` means the branch
 * could not be read under the `warn` policy.
 *
 * @category models
 * @since 1.0.0
 */
export interface Drift {
    readonly state: "untracked" | "current" | "behind" | "unknown";
    readonly track?: string | undefined;
    readonly tip?: string | undefined;
}
/**
 * One materialized mount.
 *
 * `pin` is the declared commit, `base` the commit checked out (the pin, or
 * the tracked tip under `follow`), and `head` the commit after the patches.
 *
 * @category models
 * @since 1.0.0
 */
export interface Materialized {
    readonly name: string;
    readonly root: string;
    readonly overlayRoot: string;
    readonly repository: string;
    readonly pin: string;
    readonly base: string;
    readonly head: string;
    readonly patches: ReadonlyArray<string>;
    readonly drift: Drift;
}
/**
 * The host seams materialization reads: the environment git runs under,
 * the sink for the one-line mount report, and cancellation.
 *
 * @category models
 * @since 1.0.0
 */
export interface Options {
    readonly environment: Readonly<Record<string, string | undefined>>;
    readonly report: (line: string) => void;
    readonly signal?: AbortSignal | undefined;
}
/**
 * Where a command plans: the workspace directory to open, and the mount
 * materialized for it when the command ran from an overlay.
 *
 * @category models
 * @since 1.0.0
 */
export interface Resolved {
    readonly workspace: string;
    readonly mount: Materialized | undefined;
}
/**
 * Evaluates an overlay's `.smithers/config.ts` and returns its mounts.
 *
 * @category loading
 * @since 1.0.0
 */
export declare const loadConfig: (overlayRoot: string) => Promise<MountDeclaration.Mounts>;
/**
 * Materializes one named mount of an overlay and returns what was checked
 * out. The call is idempotent: with the pin, patches, and overlay unchanged
 * it fetches nothing and rewrites nothing.
 *
 * @category materialization
 * @since 1.0.0
 */
export declare const materialize: (overlayRoot: string, name: string, options: Options) => Promise<Materialized>;
/**
 * The one-line report a command prints after materializing a mount.
 *
 * @category presentation
 * @since 1.0.0
 */
export declare const summary: (mount: Materialized) => string;
/**
 * Decides where a command plans. From inside an overlay repository, the
 * selected mount is materialized and the command plans in its checkout, at
 * the same relative directory when the checkout has it. An overlay with one
 * mount selects it; an overlay with several selects the mount whose overlay
 * directory holds the starting directory. Anywhere else, including inside a
 * materialized checkout, the directory is returned as is.
 *
 * @category materialization
 * @since 1.0.0
 */
export declare const resolveWorkspace: (start: string, options: Options) => Promise<Resolved>;
export {};
