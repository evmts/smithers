/**
 * Where the `jj` executable comes from on a Node host.
 *
 * `NodeJj` binds its version probe and operations to the absolute host path
 * selected here. `smithers doctor` prints that selection and why an unusable
 * candidate was rejected.
 *
 * Resolution order:
 *
 * 1. `SMITHERS_JJ_PATH`. An
 *    override that names an existing file stays authoritative even when it is
 *    not executable, so a bad explicit path is reported instead of silently
 *    running a different binary.
 * 2. `PATH`, searched for an absolute executable path.
 *
 * rc.0 ships no vendored `jj` platform packages, so the 0.x bundled-package
 * branch has no counterpart here.
 *
 * @since 1.0.0
 */
/**
 * Where a resolved `jj` command came from.
 *
 * `env` is an override named by {@link overrideVariables}, `path` is a
 * candidate found on the host PATH, or the unresolved fallback name.
 *
 * @category models
 * @since 1.0.0
 */
export type Source = "env" | "path";
/**
 * The `jj` command a host should spawn, and what is known about it.
 *
 * `path` is absolute when a candidate was found. Relative overrides and PATH
 * entries resolve against the host working directory. When nothing is found,
 * it is the bare name `jj`; `NodeJj` reports `not_installed` without spawning it.
 *
 * `hint` is present only when the resolution is known to be unusable — an
 * override that is not executable, or nothing named `jj` on `PATH` — and
 * carries the operator guidance for that case.
 *
 * @category models
 * @since 1.0.0
 */
export interface Resolved {
    readonly path: string;
    readonly source: Source;
    readonly executable: boolean;
    readonly hint?: string | undefined;
    /** The override variable that supplied `path` when `source` is `env`. */
    readonly variable?: string | undefined;
    /**
     * An override variable that was set to a path nothing exists at, and was
     * therefore skipped. The resolution is unaffected, but an operator whose
     * typo'd `SMITHERS_JJ_PATH` was disregarded otherwise gets a healthy report
     * for a jj they did not choose.
     */
    readonly ignored?: {
        readonly variable: string;
        readonly path: string;
    } | undefined;
}
/**
 * The environment name this resolver reads.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const overrideVariables: ReadonlyArray<string>;
/**
 * Whether the operating system can execute a candidate.
 *
 * POSIX requires the execute bit; Windows selects a vendored `.exe` and does
 * not use POSIX mode bits, so existence is sufficient there. This is a probe,
 * never a `chmod`: an unusable candidate must be reported, not repaired.
 *
 * @category predicates
 * @since 1.0.0
 */
export declare const isExecutable: (file: string, options?: {
    readonly platform?: NodeJS.Platform | undefined;
    readonly access?: ((file: string, mode: number) => void) | undefined;
}) => boolean;
/**
 * A path rendered as one POSIX shell word.
 *
 * The permission hint is remediation an operator is expected to paste into a
 * shell, and the path in it is whatever they put in `SMITHERS_JJ_PATH`. Unquoted,
 * a space makes the advice silently wrong and a `;` or `$(...)` makes the paste
 * run commands the hint never named.
 *
 * @category conversions
 * @since 1.0.0
 */
export declare const shellQuote: (value: string) => string;
/**
 * The guidance printed when a named `jj` cannot be executed.
 *
 * The macOS quarantine tip appears only on darwin, where a downloaded binary
 * carries `com.apple.quarantine` and refuses to run with an error that names
 * neither the attribute nor the fix.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const permissionHint: (file: string, platform?: NodeJS.Platform) => string;
/**
 * Options accepted by {@link resolveJjBinary}. Every probe is injectable so
 * the resolution order can be pinned without staging a filesystem.
 *
 * @category models
 * @since 1.0.0
 */
export interface Options {
    readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
    readonly platform?: NodeJS.Platform | undefined;
    readonly exists?: ((file: string) => boolean) | undefined;
    readonly executable?: ((file: string) => boolean) | undefined;
}
/**
 * Resolves the `jj` command this host should spawn.
 *
 * Always returns a command. When jj is genuinely absent the bare name `jj` is
 * returned with `executable: false` and a hint, which keeps every caller's
 * soft-failure behavior: `NodeJj` reports `not_installed`, while `doctor` has
 * something specific to print.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const resolveJjBinary: (options?: Options) => Resolved;
/**
 * A one-line description of a resolution, for `smithers doctor`.
 *
 * @category conversions
 * @since 1.0.0
 */
export declare const describe: (resolved: Resolved) => string;
