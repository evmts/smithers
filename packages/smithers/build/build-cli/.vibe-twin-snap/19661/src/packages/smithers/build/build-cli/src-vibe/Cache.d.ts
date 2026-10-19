/**
 * Read-through result cache: a content-addressed local file store fronting an
 * optional HTTP remote.
 *
 * The local store answers reads first. A remote lookup runs only on a local
 * miss, and a remote hit hydrates the local file so the next read stays on
 * disk. A put writes both stores. Any remote failure prints one warning line
 * and degrades the store to local-only for the rest of the process. A `429`
 * is not a failure: it costs only the request it answered.
 *
 * Every read on both sides is an untrusted read. A local entry file may have
 * been replaced by a symbolic link, a FIFO, or four gigabytes of noise; a
 * remote body may never end. Both are bounded and type-checked before anything
 * is parsed, and both degrade to a miss rather than to a hazard.
 *
 * @since 0.1.0
 */
import * as Fs from "node:fs/promises";
/**
 * One stored target execution result.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface CachedResult {
    readonly key: string;
    readonly target: string;
    readonly label: string;
    readonly exitOk: boolean;
    readonly output: unknown;
    readonly storedAt: string;
}
/**
 * The cache handle the engine reads and writes through.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface CacheStore {
    get(key: string): Promise<CachedResult | null>;
    /**
     * Stores a result. `shared: false` keeps it in the local tier only: a
     * result produced by an unconfined run is evidence for this machine and
     * nothing more, so it never reaches a store other machines read.
     */
    put(key: string, r: CachedResult, options?: {
        readonly shared?: boolean | undefined;
    }): Promise<void>;
    close(): Promise<void>;
}
/**
 * The largest entry either store will read.
 *
 * An entry is one action's success value. Sixteen mebibytes is far above any
 * legitimate one and far below a size that threatens the process, so a store
 * that has been filled with a huge file answers a miss instead of turning a
 * cache lookup into an out-of-memory failure.
 *
 * @category constants
 * @since 0.1.0
 * @slop
 */
export declare const entryLimit: number;
/**
 * The action-cache publication ceiling shared by both remote backends.
 *
 * Local entries retain the larger {@link entryLimit}; a remote tier stores
 * entries in a database row and deliberately accepts no more than one MiB.
 *
 * @category constants
 * @since 0.1.0
 * @slop
 */
export declare const remoteEntryLimit: number;
/**
 * Bounds CPU and bookkeeping for adversarial response streams of tiny chunks.
 *
 * @category constants
 * @since 0.1.0
 * @slop
 */
export declare const maximumRemoteBodyChunks = 16384;
/**
 * The default deadline for one remote request, including its whole body.
 *
 * @category constants
 * @since 0.1.0
 * @slop
 */
export declare const remoteTimeouts: {
    readonly get: 3000;
    readonly put: 8000;
};
/**
 * Maps a cache key onto a name that is safe as a single path segment.
 *
 * A key that starts with a letter or digit, uses only letters, digits, dots,
 * underscores, and dashes, and is at most 200 characters long passes through
 * unchanged. Every other key becomes the lowercase hex SHA-256 of its UTF-16
 * code units. UTF-16 is deliberate: UTF-8 encoding replaces an unpaired
 * surrogate, which let two distinct JavaScript strings map to one file name.
 * Hashing the code units is injective up to SHA-256 and keeps the file name
 * inside the cache directory.
 *
 * @category utilities
 * @since 0.1.0
 * @slop
 */
export declare const sanitizeKey: (key: string) => string;
/**
 * Creates the cache directory and refuses one that escapes the workspace.
 *
 * The check runs before the directory is created, so an existing link is
 * caught, and again afterwards, so a link created concurrently with the
 * `mkdir` is caught too.
 *
 * @category validation
 * @since 0.1.0
 * @slop
 */
export declare const ensureCacheDirectory: (workspaceRoot: string, cacheDirectory: string) => Promise<string>;
/**
 * Fault-injection seams for the local store. Production callers omit this and
 * get the real filesystem. Tests substitute individual operations to reproduce
 * failures a real filesystem cannot produce deterministically — a directory
 * that refuses fsync, a close that fails, a temp file that cannot be removed.
 * Injection replaces which operation runs, never what the store does with its
 * result, so the tested policy is the production policy.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface CacheIo {
    readonly rename?: (from: string, to: string) => Promise<void>;
    readonly writeContents?: (handle: Fs.FileHandle, contents: string) => Promise<void>;
    readonly openDirectory?: (directory: string) => Promise<Fs.FileHandle>;
    readonly syncHandle?: (handle: Fs.FileHandle) => Promise<void>;
    readonly closeHandle?: (handle: Fs.FileHandle) => Promise<void>;
    readonly removeTemp?: (temp: string) => Promise<void>;
}
/**
 * Options for {@link openCache}.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface OpenCacheOptions {
    readonly workspaceRoot: string;
    readonly cacheDirectory?: string | undefined;
    readonly endpoint?: string | undefined;
    /** Reads the bearer token at the instant an outbound request is built. */
    readonly readToken?: (() => string | undefined) | undefined;
    /**
     * Reads the bearer token publications authenticate with. Omitted means the
     * deployment has one credential, and `readToken` serves both directions,
     * which is what every caller did before the credential split existed.
     */
    readonly writeToken?: (() => string | undefined) | undefined;
    /**
     * The trust domain this process publishes into. Omitted means the trusted
     * one, whose keys are exactly the content keys the planner computes.
     */
    readonly publishNamespace?: string | undefined;
    readonly fetch?: typeof globalThis.fetch | undefined;
    readonly warn?: ((line: string) => void) | undefined;
    readonly timeouts?: {
        readonly get: number;
        readonly put: number;
    } | undefined;
    readonly io?: CacheIo | undefined;
}
/**
 * Validates the trust domain a process publishes into.
 *
 * The published key is `<namespace>/<key>` and a content key is bare hex, so a
 * namespace that cannot contain a separator cannot name a key any trusted
 * build computes. An unusable value fails the command: a job that meant to
 * publish somewhere untrusted must not silently publish to trunk instead.
 *
 * @category validation
 * @since 0.1.0
 * @slop
 */
export declare const normalizePublishNamespace: (value: unknown, what?: string) => string | undefined;
/**
 * The trust domain a `SMITHERS_CACHE_NAMESPACE` value names.
 *
 * Unset or blank is the trusted keyspace: a post-merge publisher leaves the
 * variable out, and a CI job on `main` renders it empty, so both publish and
 * read the bare content key. Any other value must be a usable namespace.
 *
 * @category validation
 * @since 0.1.0
 */
export declare const publishNamespaceFromEnvironment: (value: string | undefined) => string | undefined;
/**
 * Opens the workspace cache.
 *
 * Local entries live under `<workspaceRoot>/<cacheDirectory>/cache` as JSON
 * files addressed by sanitized key and published atomically: an exclusively
 * created sibling temporary file is written, synced, and closed before it is
 * renamed onto the entry path, so a reader sees either no entry or the whole
 * entry. The cache directory must stay inside the workspace once symbolic
 * links resolve, checked when it is opened and again when an entry is written.
 * Every entry read from either store is bounded, type-checked, and must name
 * the requested key, so a truncated, oversize, forged, or misfiled entry is a
 * miss rather than another action's result. `cacheDirectory` is the
 * workspace-relative directory the CLI resolved and defaults to `.flows`. When
 * `endpoint` names an HTTP cache, the store also reads through its `/ac`
 * route: a local hit never touches the remote, a remote hit hydrates the local
 * file, and a put writes both sides.
 *
 * @category constructors
 * @since 0.1.0
 * @slop
 */
export declare const openCache: (opts: OpenCacheOptions) => Promise<CacheStore>;
