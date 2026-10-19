/**
 * Renders and installs the git hook scripts a WORKSPACE.ts declares.
 *
 * `S.Workspace(name, { gitHooks })` binds git hook events to ordinary
 * labeled targets. This module turns those bindings into
 * `{pre-commit,post-commit,pre-push,post-merge}` scripts in Git's hooks directory that
 * invoke the bound label through the public `smthrs` CLI. Hook installation is
 * generated, drift-checked output exactly like CI generation: `check`
 * byte-compares, `install` publishes atomically, and nothing else writes
 * these files.
 *
 * A hook script falls back to the legacy `smithers-build` binary, then fails open
 * when neither binary is present on PATH: it
 * prints a warning and exits 0, because a missing build CLI must never block
 * a commit. The scripts are deterministic bytes, pinned by goldens.
 *
 * @since 0.1.0
 */
import * as Target from "@smthrs/targets/Target";
import type * as WorkspaceDeclaration from "@smthrs/targets/WorkspaceDeclaration";
/**
 * The refusal codes hook rendering and installation can fail with.
 *
 * @category models
 * @since 0.1.0
 */
export type ErrorCode = "unlabeled_hook_target" | "invalid_label" | "not_a_git_repository" | "hooks_path_outside_repository" | "write_failed";
declare const GitHooksError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "smithers-build/GitHooksError";
} & Readonly<A>;
/**
 * One typed git-hooks refusal.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class GitHooksError extends GitHooksError_base<{
    readonly code: ErrorCode;
    readonly message: string;
}> {
    constructor(code: ErrorCode, message: string);
}
/**
 * Checks whether a value is a git-hooks refusal.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isGitHooksError: (value: unknown) => value is GitHooksError;
/**
 * The label lookup hook rendering needs from the package index.
 *
 * @category models
 * @since 0.1.0
 */
export interface LabelResolver {
    labelOf(target: Target.AnyTarget): string | undefined;
}
/**
 * The workspace hook event names, in render order.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const hookNames: readonly ["preCommit", "postCommit", "prePush", "postMerge"];
/**
 * One workspace hook event name.
 *
 * @category models
 * @since 0.1.0
 */
export type HookName = (typeof hookNames)[number];
/**
 * The git hook file each workspace event installs to.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const hookFiles: Readonly<Record<HookName, string>>;
/**
 * The exact label grammar a rendered script may carry: one shell word.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const labelPattern: RegExp;
/**
 * Resolves the workspace `gitHooks` bindings to labels through the index.
 *
 * Every bound hook target must be labeled: an unlisted target has no CLI
 * spelling for a script to invoke, so binding one is a graph error, not a
 * silently skipped hook.
 *
 * @category rendering
 * @since 0.1.0
 */
export declare const resolveHookLabels: (workspace: WorkspaceDeclaration.WorkspaceDeclaration, resolve: LabelResolver) => Readonly<Partial<Record<HookName, string>>>;
/**
 * Renders the deterministic hook script set for resolved bindings.
 *
 * The result maps git hook file names (`pre-commit`, ...) to script bytes,
 * in the fixed {@link hookNames} order.
 *
 * @category rendering
 * @since 0.1.0
 */
export declare const render: (bindings: Readonly<Partial<Record<HookName, string>>>) => ReadonlyArray<{
    readonly file: string;
    readonly content: string;
}>;
/**
 * One hook file's drift classification.
 *
 * @category models
 * @since 0.1.0
 */
export interface CheckEntry {
    readonly file: string;
    readonly status: "clean" | "stale" | "missing";
}
/**
 * Byte-compares the rendered hook scripts against Git's active hooks directory.
 *
 * @category checking
 * @since 0.1.0
 */
export declare const check: (root: string, rendered: ReadonlyArray<{
    readonly file: string;
    readonly content: string;
}>) => Promise<{
    readonly clean: boolean;
    readonly entries: ReadonlyArray<CheckEntry>;
}>;
/**
 * Installs the rendered hook scripts into Git's active hooks directory.
 *
 * Each script lands executable via a same-directory temporary name and
 * rename. A root that is not a git repository, or whose hooks directory lies
 * outside the repository, is a typed refusal. An existing hook this module
 * did not generate is copied privately and atomically renamed to `<hook>.bak`
 * before it is replaced, without following an existing backup link.
 *
 * @category writing
 * @since 0.1.0
 */
export declare const install: (root: string, rendered: ReadonlyArray<{
    readonly file: string;
    readonly content: string;
}>) => Promise<{
    readonly wrote: ReadonlyArray<string>;
}>;
export {};
