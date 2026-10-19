/**
 * Renders `Github.CiGen` declarations into GitHub Actions files.
 *
 * One `Github.CiGen` target owns a deterministic file set under its declaring
 * package directory (`.github` in the Force layout): one workflow YAML per
 * declared `Github.Workflow`, plus the shared composite setup action every
 * generated job starts with. Rendering is a pure function of the validated
 * declarations, the workspace toolchain declaration, and the package index's
 * labels — the same inputs produce the same bytes on every host and from
 * every working directory.
 *
 * `check` byte-compares the rendered set against the checked-in tree and is
 * the CiGen target's lint form; `write` publishes the rendered set
 * atomically. Hand-written files named in `preserve` are never written,
 * never deleted, and never reported as drift. Files inside the declared
 * `changes` write-set that the renderer no longer produces are stale
 * generated output: drift under `check`, removed under `write`. The renderer
 * refuses to write outside the declared write-set.
 *
 * @since 0.1.0
 */
import * as Target from "@smthrs/targets/Target";
import * as WorkspaceDeclaration from "@smthrs/targets/WorkspaceDeclaration";
/**
 * The refusal codes one render, check, or write can fail with.
 *
 * @category models
 * @since 0.1.0
 */
export type ErrorCode = "unlabeled_cigen" | "not_a_workflow" | "not_a_setup" | "invalid_workflow_name" | "duplicate_workflow_name" | "multiple_setups" | "unlabeled_run_target" | "invalid_label" | "duplicate_job_id" | "invalid_event_name" | "invalid_schedule" | "invalid_path" | "preserve_conflict" | "outside_write_set" | "write_failed" | "unsupported_affected";
declare const GithubRenderError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "smithers-build/GithubRenderError";
} & Readonly<A>;
/**
 * One typed CI-generation refusal.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class GithubRenderError extends GithubRenderError_base<{
    readonly code: ErrorCode;
    readonly message: string;
}> {
    constructor(code: ErrorCode, message: string);
}
/**
 * Checks whether a value is a CI-generation refusal.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isGithubRenderError: (value: unknown) => value is GithubRenderError;
/**
 * The one fact the renderer needs from the package index: a target's label.
 *
 * `PackageIndex` satisfies this shape structurally; tests may substitute a
 * map-backed fake.
 *
 * @category models
 * @since 0.1.0
 */
export interface LabelResolver {
    labelOf(target: Target.AnyTarget): string | undefined;
    targets?(): ReadonlyArray<{
        readonly label: string;
        readonly target: Target.AnyTarget;
    }>;
}
/**
 * One rendered file: a package-directory-relative POSIX path and its bytes.
 *
 * @category models
 * @since 0.1.0
 */
export interface RenderedFile {
    readonly path: string;
    readonly content: string;
}
/**
 * The complete rendered output of one `Github.CiGen` target.
 *
 * @category models
 * @since 0.1.0
 */
export interface CiRender {
    /** The CiGen target's own label, named in every generated header. */
    readonly label: string;
    /** The workspace-relative package directory the paths resolve against. */
    readonly packageDir: string;
    /** Every generated file, sorted by path. */
    readonly files: ReadonlyArray<RenderedFile>;
    /** Hand-written paths the generator must never touch. */
    readonly preserve: ReadonlyArray<string>;
    /** The declared write-set globs, package-directory-relative. */
    readonly changes: ReadonlyArray<string>;
}
/**
 * Renders the complete file set one `Github.CiGen` target owns.
 *
 * @category rendering
 * @since 0.1.0
 */
export declare const render: (options: {
    readonly ciGen: Target.AnyTarget;
    readonly workspace: WorkspaceDeclaration.WorkspaceDeclaration;
    readonly resolve: LabelResolver;
    readonly packageDir: string;
}) => CiRender;
/**
 * One file's drift classification.
 *
 * @category models
 * @since 0.1.0
 */
export type FileStatus = "clean" | "stale" | "missing" | "unexpected" | "preserved";
/**
 * One classified file row of a check report.
 *
 * @category models
 * @since 0.1.0
 */
export interface CheckEntry {
    readonly path: string;
    readonly status: FileStatus;
}
/**
 * The result of byte-comparing a rendered set against the checked-in tree.
 *
 * @category models
 * @since 0.1.0
 */
export interface CheckReport {
    readonly clean: boolean;
    readonly entries: ReadonlyArray<CheckEntry>;
}
/**
 * Byte-compares the rendered file set against the tree under `root`.
 *
 * A rendered file that matches is `clean`; different bytes are `stale`; an
 * absent file is `missing`. A file inside the declared write-set that is
 * neither rendered nor preserved is `unexpected` stale generated output.
 * Preserved files are reported `preserved` and never count as drift.
 *
 * @category checking
 * @since 0.1.0
 */
export declare const check: (root: string, rendered: CiRender) => Promise<CheckReport>;
/**
 * The result of publishing a rendered set.
 *
 * @category models
 * @since 0.1.0
 */
export interface WriteReport {
    readonly wrote: ReadonlyArray<string>;
    readonly unchanged: ReadonlyArray<string>;
    readonly removed: ReadonlyArray<string>;
    readonly preserved: ReadonlyArray<string>;
}
/**
 * Publishes the rendered file set under `root`, atomically per file.
 *
 * Every rendered path must fall inside the declared `changes` write-set when
 * one is declared. Each file lands via a same-directory temporary name and
 * rename, so a reader sees the old bytes or the new bytes, never a torn
 * write. Files inside the write-set that are neither rendered nor preserved
 * are stale generated output and are removed. Preserved files are never
 * written and never removed.
 *
 * @category writing
 * @since 0.1.0
 */
export declare const write: (root: string, rendered: CiRender) => Promise<WriteReport>;
export {};
