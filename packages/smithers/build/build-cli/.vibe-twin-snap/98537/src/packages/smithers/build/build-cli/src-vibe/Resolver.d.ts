/**
 * Syntax-only import resolution and transitive closure over workspace files.
 *
 * The resolver parses TypeScript and JavaScript modules with the installed
 * `typescript` API — no type checking, no emit — extracts their import,
 * export-from, require, and dynamic-import specifiers, and resolves each one
 * against the workspace: relative paths with extension probing (`.js` maps to
 * its TypeScript sibling), `tsconfig.json` `baseUrl`/`paths`, and node_modules
 * specifiers validated through `package.json` `exports`/`main` to a
 * package-level node, never into the package. Local package `#imports` targets
 * join the file closure together with their controlling manifest. Every row outcome is explicit:
 * `resolved-file`, `package`, `builtin`, `unresolved`, or `dynamic`.
 *
 * A closure is a breadth-first walk over rows from a set of entry files. Its
 * result is the sorted `(path, digest)` reachable file set, the sorted
 * imported package set, and the unresolved and dynamic rows carried
 * explicitly so consumers can fail closed on them.
 *
 * Per-file parse rows are cached in the existing {@link Cache.CacheStore},
 * keyed on file digest, resolver-config digest, and the resolver
 * implementation fingerprint. A cached row elides parsing only: specifier
 * resolution re-runs against the current tree on every closure, because
 * resolution depends on neighbouring files a content digest cannot see
 * (creating `b.ts` changes what `./b` means without touching the importer).
 * Directory listings are read once per closure, so revalidation stays cheap;
 * exact-name membership in the listing decides existence, so a
 * case-insensitive filesystem cannot resolve a specifier Linux would refuse.
 *
 * The two layers at the bottom implement the resolver actions declared in
 * `@smthrs/targets/Compose`: {@link ImportClosureLive} executes
 * `S.ImportClosure` and {@link CheckFilesDifferenceLive} executes
 * `S.Test({expect: S.Files.difference(..), toBe: "empty"})`.
 *
 * @since 0.1.0
 */
import type { Action, FlowRuntime } from "@smthrs/flow";
import * as Compose from "@smthrs/targets/Compose";
import type * as Layer from "effect/Layer";
import type { CacheStore } from "./Cache.js";
/**
 * Identity of this resolver implementation, combined with the compiler version into
 * every resolver-config digest. Bump the trailing number whenever extraction,
 * probing order, or row shape changes behaviour, so stale rows can never
 * answer for a different algorithm.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const implementationFingerprint = "smthrs-resolver/3";
/**
 * Maximum files one closure may reach before it refuses loudly.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumClosureFiles = 200000;
/**
 * Maximum bytes of one module admitted to the parser.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumModuleBytes: number;
/**
 * The outcome of resolving one specifier.
 *
 * @category models
 * @since 0.1.0
 */
export type EdgeStatus = "resolved-file" | "package" | "builtin" | "unresolved" | "dynamic";
/**
 * One resolved specifier row: the specifier as written, its status, the
 * workspace-relative file it resolved to when `resolved-file`, and the
 * package-level name when `package`.
 *
 * @category models
 * @since 0.1.0
 */
export interface RowEdge {
    readonly specifier: string;
    readonly status: EdgeStatus;
    readonly resolved?: string | undefined;
    readonly packageName?: string | undefined;
}
/**
 * One extracted import site: the specifier text for a static site, the
 * bounded expression text for a dynamic one.
 *
 * @category models
 * @since 0.1.0
 */
export interface ExtractedImport {
    readonly specifier: string;
    readonly dynamic: boolean;
    /** Require sites select CommonJS imports-map conditions. */
    readonly mode?: "require" | undefined;
}
/**
 * A resolver row for one file: content digest plus every resolved specifier.
 *
 * @category models
 * @since 0.1.0
 */
export interface FileRow {
    readonly path: string;
    readonly digest: string;
    readonly edges: ReadonlyArray<RowEdge>;
}
declare const ResolverConfigError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "smithers-build/ResolverConfigError";
} & Readonly<A>;
/**
 * A resolver-configuration error: the tsconfig chain could not be read or
 * used, or an anchored entry lies outside the workspace.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class ResolverConfigError extends ResolverConfigError_base<{
    /** Which part of the configuration refused. */
    readonly reason: "outside_workspace" | "extends_too_deep" | "unreadable" | "invalid" | "unsupported";
    readonly message: string;
}> {
    constructor(reason: ResolverConfigError["reason"], message: string);
}
/**
 * The loaded resolver configuration one closure resolves under.
 *
 * `baseUrl` and `paths` are workspace-relative; `sources` records the
 * tsconfig chain that produced them; `configDigest` keys rows together with
 * each file's content digest and covers the implementation fingerprint, the
 * TypeScript version, probing order, and the chain's exact bytes. Row keys
 * further include the nearest package manifest's path and exact byte digest.
 *
 * @category models
 * @since 0.1.0
 */
export interface ResolverConfig {
    readonly workspaceRoot: string;
    readonly configDigest: string;
    readonly baseUrl: string | undefined;
    readonly paths: ReadonlyArray<{
        readonly pattern: string;
        readonly targets: ReadonlyArray<string>;
    }>;
    readonly sources: ReadonlyArray<{
        readonly path: string;
        readonly digest: string;
    }>;
}
/**
 * Loads the resolver configuration for one workspace.
 *
 * `tsconfig` names the workspace-relative tsconfig to honour; when omitted,
 * a root `tsconfig.json` is used when present and no tsconfig otherwise.
 * The file is read as JSONC; a single relative
 * `extends` chain is followed, later files overriding `baseUrl` and
 * replacing `paths` whole; every other `extends` form refuses loudly.
 *
 * @category configuration
 * @since 0.1.0
 */
export declare const loadResolverConfig: (options: {
    readonly workspaceRoot: string;
    readonly tsconfig?: string | undefined;
}) => Promise<ResolverConfig>;
/**
 * Extracts every import site from one module, without resolving anything.
 *
 * Covered syntax: `import ... from`, `export ... from`, `export * from`,
 * `import x = require(...)`, `require(...)`, `require.resolve(...)`, and
 * `import(...)`. A call whose argument is a string literal or an
 * untemplated template literal is a static site; any other argument is a
 * dynamic site carrying the bounded expression text. Type-only imports are
 * included: for reachability a type-only edge still makes a file live.
 *
 * The parse is syntax only. A file the parser cannot make sense of still
 * yields the sites the parser recovered, exactly as the compiler's own
 * error-tolerant parse does.
 *
 * @category extraction
 * @since 0.1.0
 */
export declare const extractSpecifiers: (path: string, text: string) => ReadonlyArray<ExtractedImport>;
/**
 * What one workspace path is: a regular file, a directory, or anything else.
 *
 * @category models
 * @since 0.1.0
 */
export type EntryKind = "file" | "dir" | "other";
/**
 * A read-only existence view of one workspace tree, the only filesystem
 * surface specifier resolution consumes.
 *
 * @category models
 * @since 0.1.0
 */
export interface TreeView {
    /** Absolute workspace root the relative paths anchor at. */
    readonly root: string;
    /** The kind of one workspace-relative posix path, or null when absent. */
    kind(relativePath: string): Promise<EntryKind | null>;
}
/**
 * Resolves one extracted import from one file into an explicit row edge.
 *
 * @category resolution
 * @since 0.1.0
 */
export declare const resolveSpecifier: (config: ResolverConfig, reader: TreeView, fromFile: string, site: ExtractedImport) => Promise<RowEdge>;
/**
 * The cache target name resolver rows are stored under.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const rowCacheTarget = "ImportClosureRow";
/**
 * The cache key of one resolver row: file digest, resolver-config digest
 * (which already covers the implementation fingerprint and TypeScript
 * version), bound under a row-namespace prefix.
 *
 * @category caching
 * @since 0.1.0
 */
export declare const rowCacheKey: (fileDigest: string, configDigest: string) => string;
/**
 * Work counters for one closure: `parsed` files went through extraction,
 * `cached` answered from stored rows.
 *
 * @category models
 * @since 0.1.0
 */
export interface ClosureStats {
    readonly parsed: number;
    readonly cached: number;
}
/**
 * One computed closure: the deterministic result and this run's counters.
 *
 * @category models
 * @since 0.1.0
 */
export interface ClosureOutcome {
    readonly result: Compose.ClosureResult;
    readonly stats: ClosureStats;
}
declare const ClosureError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "smithers-build/ClosureError";
} & Readonly<A>;
/**
 * A closure computation failed: an entry does not exist, a file vanished
 * between probe and read, a module exceeds the parse bound, or the closure
 * exceeded {@link maximumClosureFiles}.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class ClosureError extends ClosureError_base<{
    /** Which bound or read refused. */
    readonly reason: "unreadable" | "too_many_files" | "invalid_entry" | "missing_entry";
    readonly message: string;
}> {
    constructor(reason: ClosureError["reason"], message: string);
}
/**
 * Computes the transitive import closure of `entries` under one
 * configuration.
 *
 * Entries are workspace-relative files and must exist. Every reachable file
 * joins the result with its content digest; files whose extension is not a
 * module extension join as leaves without parsing. Unresolved and dynamic
 * rows are carried explicitly. The result is fully sorted, so two runs over
 * one tree are byte-identical regardless of traversal order or cache state.
 *
 * @category closure
 * @since 0.1.0
 */
export declare const computeClosure: (options: {
    readonly config: ResolverConfig;
    readonly entries: ReadonlyArray<string>;
    readonly cache?: CacheStore | undefined;
    readonly maximumFiles?: number | undefined;
}) => Promise<ClosureOutcome>;
/**
 * Maps one anchored base onto its workspace-relative package path.
 *
 * @category expansion
 * @since 0.1.0
 */
export declare const packageDirectoryOf: (workspaceRoot: string, base: string) => string;
/**
 * Expands anchored sources to a sorted set of workspace-relative files.
 *
 * Globs expand through `Input.expandGlob`, so package scope, `.gitignore`,
 * and host-state exclusion apply exactly as they do to declared inputs.
 * Declared files that do not exist are dropped when `requireFiles` is false
 * and refused loudly when it is true.
 *
 * @category expansion
 * @since 0.1.0
 */
export declare const expandAnchoredSources: (options: {
    readonly workspaceRoot: string;
    readonly cacheDirectory?: string | undefined;
    readonly sources: ReadonlyArray<Compose.AnchoredSource>;
    readonly requireFiles: boolean;
}) => Promise<ReadonlyArray<string>>;
/**
 * Options shared by the resolver layers.
 *
 * `cache` is the store per-file rows are memoized in; omit it and every
 * closure parses from scratch. `tsconfig` overrides the workspace-relative
 * tsconfig; the default honours a root `tsconfig.json` when present.
 *
 * @category models
 * @since 0.1.0
 */
export interface LiveOptions {
    readonly workspaceRoot: string;
    readonly cacheDirectory?: string | undefined;
    readonly tsconfig?: string | undefined;
    readonly cache?: CacheStore | undefined;
}
/**
 * Loads the resolver configuration, expands anchored entry sources, and
 * computes the closure — the one-call surface the package executor binds.
 *
 * @category closure
 * @since 0.1.0
 */
export declare const closureOfEntries: (options: LiveOptions, entries: ReadonlyArray<Compose.AnchoredSource>) => Promise<Compose.ClosureResult>;
/**
 * Implements the `smithers-build/import-closure` action with the resolver.
 *
 * @category layers
 * @since 0.1.0
 */
export declare const ImportClosureLive: (options: LiveOptions) => Layer.Layer<Action.Requirement<"smithers-build/import-closure">, never, FlowRuntime.FlowRuntime>;
/**
 * Reduces one file-algebra operand to its path set. A closure operand with
 * unresolved or dynamic rows fails closed with a typed `FilesTestError`.
 *
 * @category expansion
 * @since 0.1.0
 */
export declare const operandPaths: (options: LiveOptions, operand: Compose.FilesCheckOperand, side: "left" | "right") => Promise<ReadonlyArray<string>>;
/**
 * Implements the `smithers-build/files-difference` action: expands both
 * operands, subtracts right from left by path, and requires emptiness.
 *
 * @category layers
 * @since 0.1.0
 */
export declare const CheckFilesDifferenceLive: (options: LiveOptions) => Layer.Layer<Action.Requirement<"smithers-build/files-difference">, never, FlowRuntime.FlowRuntime>;
export {};
