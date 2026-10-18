/**
 * Declared filesystem and repository inputs for build targets.
 *
 * Constructors in this module only create values, so declaration evaluation
 * remains pure. The planner calls {@link expandGlob}, {@link digestFile}, and
 * {@link digestFiles} during discovery to turn declarations into content
 * digests.
 *
 * @since 0.1.0
 */
import * as Schema from "effect/Schema";
import * as SafeFs from "./SafeFs.ts";
/**
 * Schema for a lazily expanded glob.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Glob: Schema.TaggedStruct<"Glob", {
    readonly pattern: Schema.NonEmptyString;
    readonly exclude: Schema.$Array<Schema.String>;
}>;
/**
 * A lazily expanded glob.
 *
 * @category models
 * @since 0.1.0
 */
export type Glob = typeof Glob.Type;
/**
 * Schema for one declared file input.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const File: Schema.TaggedStruct<"File", {
    readonly path: Schema.NonEmptyString;
}>;
/**
 * One declared file input.
 *
 * @category models
 * @since 0.1.0
 */
export type File = typeof File.Type;
/**
 * Schema for a git diff treated as a content-digested declared input.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const GitDiff: Schema.TaggedStruct<"GitDiff", {
    readonly base: Schema.NonEmptyString;
    /** Glob patterns the diff is narrowed to before it becomes key material. */
    readonly paths: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
    /** Glob patterns restricting the diff to added files. */
    readonly added: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
    /** A regular expression source; only added lines matching it count. */
    readonly addedLines: Schema.optional<Schema.NonEmptyString>;
}>;
/**
 * A git diff treated as a content-digested declared input.
 *
 * @category models
 * @since 0.1.0
 */
export type GitDiff = typeof GitDiff.Type;
/**
 * Schema for a pnpm workspace definition whose members are planner inputs.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const PnpmWorkspace: Schema.TaggedStruct<"PnpmWorkspace", {
    readonly path: Schema.NonEmptyString;
}>;
/**
 * A pnpm workspace file expanded to its root and member manifests.
 *
 * @category models
 * @since 0.1.0
 */
export type PnpmWorkspace = typeof PnpmWorkspace.Type;
/**
 * Schema for every declared input value the planner understands.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Declared: Schema.Union<readonly [Schema.TaggedStruct<"Glob", {
    readonly pattern: Schema.NonEmptyString;
    readonly exclude: Schema.$Array<Schema.String>;
}>, Schema.TaggedStruct<"File", {
    readonly path: Schema.NonEmptyString;
}>, Schema.TaggedStruct<"GitDiff", {
    readonly base: Schema.NonEmptyString;
    /** Glob patterns the diff is narrowed to before it becomes key material. */
    readonly paths: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
    /** Glob patterns restricting the diff to added files. */
    readonly added: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
    /** A regular expression source; only added lines matching it count. */
    readonly addedLines: Schema.optional<Schema.NonEmptyString>;
}>, Schema.TaggedStruct<"PnpmWorkspace", {
    readonly path: Schema.NonEmptyString;
}>]>;
/**
 * Every declared input value the planner understands.
 *
 * @category models
 * @since 0.1.0
 */
export type Declared = typeof Declared.Type;
/**
 * A workspace-relative file path and the sha256 digest of its content.
 *
 * `digest` is undefined when the file does not exist.
 *
 * @category models
 * @since 0.1.0
 */
export interface FileDigest {
    readonly path: string;
    readonly digest: string | undefined;
}
/**
 * Creates a declared glob without reading the filesystem.
 *
 * @example
 * ```ts
 * import { Smithers } from "@smthrs/targets"
 *
 * const sources = Smithers.glob("src/*", { exclude: ["src/*.test.ts"] })
 * ```
 *
 * @category constructors
 * @since 0.1.0
 */
export declare function glob(pattern: string, options?: {
    readonly exclude?: ReadonlyArray<string>;
}): Glob;
export declare function glob(patterns: ReadonlyArray<string>): ReadonlyArray<Glob>;
/**
 * Creates a declared file input without reading it.
 *
 * @example
 * ```ts
 * import { Smithers } from "@smthrs/targets"
 *
 * const packageJson = Smithers.file("package.json")
 * ```
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const file: (path: string) => File;
/**
 * Creates a declared git diff input without invoking git.
 *
 * @example
 * ```ts
 * import { Smithers } from "@smthrs/targets"
 *
 * const changes = Smithers.gitDiff("origin/main")
 * ```
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const gitDiff: (options?: string | {
    readonly base?: string;
    readonly paths?: ReadonlyArray<string>;
    readonly added?: ReadonlyArray<string>;
    readonly addedLines?: string;
}) => GitDiff;
/**
 * Payload input declarations, `S.Input.String`, `S.Input.Optional`, and
 * `S.Input.Literals`. Defined in `Reference.ts`; re-exported here so the
 * `Smithers.Input` namespace carries the PACKAGE.ts spellings.
 *
 * @category constructors
 * @since 0.1.0
 */
export { inputLiterals as Literals, inputOptional as Optional, InputSpec as Spec, inputString as String } from "./Reference.ts";
/**
 * Creates a workspace-membership input without reading the filesystem.
 *
 * The planner parses the named pnpm workspace file, validates its `packages`
 * list, and expands the root and member `package.json` files. The workspace
 * file and every resolved manifest then contribute content to the target key.
 *
 * @example
 * ```ts
 * import { Smithers } from "@smthrs/targets"
 *
 * const workspace = Smithers.pnpmWorkspace("//pnpm-workspace.yaml")
 * ```
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const pnpmWorkspace: (path: string) => PnpmWorkspace;
/**
 * Validates a revision passed to `git diff` as an operand rather than an
 * option. The argv boundary also uses `--end-of-options`; this validation
 * keeps diagnostics deterministic on older Git versions and rejects text the
 * host cannot encode without replacement.
 *
 * @category validation
 * @since 0.1.0
 */
export declare const validateGitBase: (base: string) => string;
/**
 * Checks a descriptor-only copy so schema recognition cannot invoke author
 * getters or proxy traps before the target construction boundary sees them.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isDeclared: <I>(value: I) => value is I & Declared;
/**
 * Resolves a declared input path or pattern against its package directory.
 *
 * Values starting with `//` resolve from the workspace root. A value starting
 * with a single `/` is refused rather than read as package-relative. Everything
 * else resolves from `packageDir`, the workspace-relative package path. The result
 * is a normalized workspace-relative posix path. Paths that escape the
 * workspace are refused.
 *
 * @category expansion
 * @since 0.1.0
 */
export declare const resolvePath: (packageDir: string, value: string) => string;
/**
 * Renders one declared path the way an argv running from `cwd` needs it.
 *
 * A `//` path is workspace-rooted, and a child runs under the target's `cwd`.
 * Stripping the `//` and handing the remainder to the child resolves it
 * against `cwd` instead of the root, so `//scripts/check.mjs` under cwd
 * `packages/foo` silently means `packages/foo/scripts/check.mjs`. This walks
 * back out to the root first. A rendered path that starts with `-` keeps a
 * `./` prefix so the child reads it as a path, not an option. A
 * package-relative path is already what the child needs and passes through
 * unchanged.
 *
 * @category expansion
 * @since 0.1.0
 */
export declare const rootRelative: (cwd: string, value: string) => string;
/**
 * Resolves the directory of one declared file for a rule that runs there.
 *
 * A `//` path is workspace-rooted and yields the workspace-relative posix
 * directory: `//packages/x/package.json` is `packages/x` and `//package.json`
 * is `.`. A package-relative path resolves from the declaring package's
 * absolute `packageDirectory`; outside a PACKAGE.ts that base is the process
 * working directory. Exec resolves either shape against the workspace root
 * and refuses a directory that leaves it.
 *
 * @category expansion
 * @since 0.1.0
 */
export declare const declaredDirectory: (path: string, context: {
    readonly packageDirectory: string | undefined;
}) => string;
/**
 * Resource limits for one workspace traversal.
 *
 * @category models
 * @since 0.1.0
 */
export interface ScanLimits {
    readonly entries: number;
    readonly files: number;
    readonly directories: number;
    readonly depth: number;
    readonly ignoreBytes: number;
}
/**
 * Default and hard traversal ceilings. Smaller overrides are useful to hosts and tests.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumScanLimits: ScanLimits;
/**
 * Default traversal ceilings used when a caller supplies no override.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const defaultScanLimits: ScanLimits;
/**
 * Expands one declared glob against the real filesystem.
 *
 * The walk starts at the pattern's static prefix, honors every `.gitignore`
 * from the workspace root down, and skips `.git`, `node_modules`, and the
 * configured cache directory, and the fixed `.flows/store` directory.
 * Skipping host state is unconditional: replayable cache, scratch, and store
 * data must never reach a content digest even when it is not ignored. The
 * result is a sorted list of workspace-relative posix file paths, so repeated
 * expansion of an unchanged tree is deterministic.
 *
 * Globs are package scoped, as they are in Bazel. The walk never descends
 * into a subdirectory that holds a PACKAGE.ts file, so a pattern declared in
 * `packages/smithers/flows/flow` matches `packages/smithers/flows/flow/src/index.ts` but not
 * `packages/smithers/flows/flow/examples/index.ts` once `packages/smithers/flows/flow/examples/PACKAGE.ts`
 * exists. The boundary applies even when a pattern's static prefix starts at
 * or below the subpackage: glob expansion cannot bypass Bazel package scope
 * by avoiding the filesystem walk through the marker directory. A `//` prefix
 * anchors pattern resolution at the workspace root but does not change the
 * declaring package's scope. Files in another package belong to that
 * package's own targets, and a target that wants them depends on its label
 * instead. The target applies to every glob in every target, not only to
 * `Filegroup`. The `packageScoped` option turns the boundary off for a caller
 * that is not expanding a declared input, such as the generated-output check
 * resolving the write set a generator declared.
 *
 * ## Confinement
 *
 * The walk stays inside the canonical workspace root. Every directory from the
 * root down to the static prefix, and every directory below it, must be a real
 * directory whose resolved path is still inside the root; a directory that
 * resolves outside fails the expansion rather than contributing files under
 * fabricated workspace-relative names. Symbolic links to directories are never
 * descended, so a link can neither leave the workspace nor make the walk loop.
 * A symbolic link to a file counts as an input on exactly the terms
 * {@link digestFile} applies to a declared file.
 *
 * A pattern whose static prefix does not exist, is not a real directory, or is
 * unreachable through real directories expands to an empty list, as does one
 * containing a `node_modules` segment or landing inside host state.
 *
 * @category expansion
 * @since 0.1.0
 */
export declare const expandGlob: (workspaceRoot: string, packageDir: string, pattern: string | Glob, options?: {
    readonly exclude?: ReadonlyArray<string>;
    readonly cacheDirectory?: string | undefined;
    readonly io?: SafeFs.Io | undefined;
    readonly limits?: Partial<ScanLimits> | undefined;
    /** Opaque child repositories that broad globs must not descend into. */
    readonly repositoryBoundaries?: ReadonlyArray<string> | undefined;
    /**
     * Whether a nested `PACKAGE.ts` bounds the expansion. Defaults to `true`,
     * which is what a declared input glob means. A declared write set is not
     * a glob over the declaring package, so the generated-output check passes
     * `false`: the paths a generator names are its own wherever they live.
     */
    readonly packageScoped?: boolean | undefined;
    readonly signal?: AbortSignal | undefined;
}) => Promise<ReadonlyArray<string>>;
/**
 * Lists every file a workspace owns, without consulting git.
 *
 * This is the same walk {@link expandGlob} performs, with the package boundary
 * removed: workspace discovery has to see every `PACKAGE.ts`, so it cannot stop
 * at the first one. Everything else is identical, which is the point — the
 * fallback listing and a glob agree on which `.gitignore` files apply, which
 * symbolic links name workspace content, which directories are confined to the
 * root, and which host-state paths are never listed at all.
 *
 * Nested repositories are a boundary here as they are for a glob: a directory
 * holding a `.git` gitfile or directory is skipped, and so is every path the
 * root `.gitmodules` declares. A workspace listing is therefore the same
 * whether or not the host has run `git submodule update`.
 *
 * `.gitignore` files apply from the workspace root down, not only at the root,
 * so the listing matches what git would have reported. The result is sorted by
 * UTF-16 code unit.
 *
 * @category discovery
 * @since 0.1.0
 */
export declare const discoverFiles: (workspaceRoot: string, options?: {
    readonly cacheDirectory?: string | undefined;
    readonly io?: SafeFs.Io | undefined;
    readonly limits?: Partial<ScanLimits> | undefined;
    readonly signal?: AbortSignal | undefined;
}) => Promise<ReadonlyArray<string>>;
/**
 * Lists the files of a declared output directory without source-input filters.
 *
 * The directory is literal. Ignore rules, package and repository markers, and
 * host-directory names do not remove produced files. Workspace confinement,
 * scan limits, cancellation, and file-link admission match declared input scans.
 * Directory links are never followed.
 *
 * @category expansion
 * @since 0.1.0
 */
export declare const listOutputFiles: (workspaceRoot: string, directory: string, options?: {
    readonly io?: SafeFs.Io | undefined;
    readonly limits?: Partial<ScanLimits> | undefined;
    readonly signal?: AbortSignal | undefined;
}) => Promise<ReadonlyArray<string>>;
/**
 * Expands a pnpm workspace declaration to the files resolution reads.
 *
 * Workspace package patterns are relative to the workspace file, including
 * pnpm's leading-`!` exclusions. The result includes the workspace file, its
 * adjacent root manifest, every matching member manifest, and every patch file
 * its `patchedDependencies` names (also relative to the workspace file). This
 * makes one declaration both the membership source and the complete lockfile
 * input: pnpm records each patch's hash in the lockfile and applies it on
 * install, so a patch edit re-keys the install without a hand-kept list.
 *
 * @category expansion
 * @since 0.1.0
 */
export declare const expandPnpmWorkspace: (workspaceRoot: string, packageDir: string, declaration: PnpmWorkspace, options?: {
    readonly cacheDirectory?: string | undefined;
    readonly io?: SafeFs.Io | undefined;
    readonly limits?: Partial<ScanLimits> | undefined;
    readonly signal?: AbortSignal | undefined;
}) => Promise<ReadonlyArray<string>>;
/**
 * Computes the sha256 hex digest of a string.
 *
 * @category digests
 * @since 0.1.0
 */
export declare const digestText: (text: string) => string;
/**
 * Computes the sha256 hex digest of one file's content.
 *
 * Returns undefined when the file does not exist, so a declared-but-missing
 * file still contributes deterministic key material. Only a missing file is
 * missing: a permission error, an unreadable directory, and every other
 * failure is reported instead of being digested as absence.
 *
 * The content streams through a bounded buffer, so a large input costs a fixed
 * amount of heap rather than its own size. The file is read through a
 * descriptor that is checked to be the same regular file the path named, and
 * checked again after the last byte, so a file replaced or rewritten while it
 * was being digested fails rather than producing a digest of a file that never
 * existed. An entry that is not a regular file — a FIFO, a socket, a device, a
 * directory — is refused rather than read; a FIFO would otherwise block
 * planning forever.
 *
 * `options.workspaceRoot` confines the read. With it, the directory holding
 * the file is resolved before the file is touched, so no symbolic link, at the
 * entry or above it, can move the read outside the workspace; a symbolic link
 * is followed only when it resolves, inside that root, to a regular file, and
 * one that leaves the workspace is refused by name. Callers that already hold
 * a workspace pass it. It is optional only because a caller may have confined
 * the path itself.
 *
 * @category digests
 * @since 0.1.0
 */
export declare const digestFile: (absolutePath: string, options?: {
    readonly workspaceRoot?: string | undefined;
    readonly io?: SafeFs.Io | undefined;
    readonly signal?: AbortSignal | undefined;
}) => Promise<string | undefined>;
/**
 * Maximum files admitted to one digest batch.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumDigestFiles = 500000;
/**
 * Default number of file descriptors used by one digest batch.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const defaultDigestConcurrency = 32;
/**
 * Digests a set of workspace-relative files in sorted order.
 *
 * Every path is read under the canonical workspace root, so a path that
 * resolves outside it fails rather than contributing another tree's content to
 * this workspace's key material. Ordering is by UTF-16 code unit, which is the
 * same on every host.
 *
 * @category digests
 * @since 0.1.0
 */
export declare const digestFiles: (workspaceRoot: string, paths: ReadonlyArray<string>, options?: {
    readonly io?: SafeFs.Io | undefined;
    readonly signal?: AbortSignal | undefined;
    readonly concurrency?: number | undefined;
    readonly maximumFiles?: number | undefined;
}) => Promise<ReadonlyArray<FileDigest>>;
