/**
 * Filesystem reads that hold the workspace trust boundary.
 *
 * Discovery reads files a workspace owns, and only files a workspace owns. A
 * path is a name, not an object: between the moment discovery decides a name
 * is admissible and the moment it reads through that name, the name can be
 * pointed at something else. This module reads through descriptors instead,
 * and re-checks every decision against the descriptor it actually holds.
 *
 * Three targets apply to everything here.
 *
 * 1. **Confinement.** A read is confined to a canonical workspace root. The
 *    directory holding the entry is resolved with `realpath` before the entry
 *    is touched, so a symbolic link anywhere in the path — including one
 *    swapped in above the entry — cannot move the read outside the root.
 * 2. **Regular files only.** A FIFO blocks the reader forever, a device is not
 *    repository content, and a directory is not a file. Each is refused rather
 *    than read. `O_NOFOLLOW` and `O_NONBLOCK` are added where the platform has
 *    them so the kernel refuses a link or a FIFO swapped in after the `lstat`,
 *    and `fstat` on the descriptor decides the question again regardless.
 * 3. **Only ENOENT means absent.** A permission error, a corrupt directory, or
 *    an unsupported entry type is reported. Converting one into "the file is
 *    not there" turns a broken workspace into a green one.
 *
 * @since 0.1.0
 */
import * as NodeFs from "node:fs";
/**
 * The size of the reusable buffer content streams through.
 *
 * File contents are deliberately not capped for digests: a declared input may
 * be any size. Only the buffer that hashes it is bounded, so a one-gigabyte
 * input costs this many bytes of heap rather than a gigabyte.
 *
 * @category models
 * @since 0.1.0
 */
export declare const chunkBytes: number;
/**
 * The default size limit for a file read into memory as text.
 *
 * Text reads — a `.gitignore`, for instance — are bounded, because the whole
 * decoded string is held at once. A file over the limit fails the read rather
 * than being silently truncated into a matcher that ignores the wrong paths.
 *
 * @category models
 * @since 0.1.0
 */
export declare const defaultTextBytes: number;
/**
 * Hard ceiling for any text file materialized by this boundary.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumTextBytes: number;
/**
 * Maximum entries one directory listing may return.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumDirectoryEntries = 100000;
/**
 * Filesystem metadata with lossless bigint fields in production.
 *
 * @category models
 * @since 0.1.0
 */
export type Stats = NodeFs.Stats | NodeFs.BigIntStats;
/**
 * One open file, reduced to the three operations a confined read performs on
 * it.
 *
 * `stat` must describe the open description itself, not the path it was opened
 * through, so a swap after the open cannot change the answer.
 *
 * @category models
 * @since 0.1.0
 */
export interface OpenFile {
    readonly stat: () => Promise<Stats>;
    readonly read: (into: Uint8Array) => Promise<number>;
    readonly close: () => Promise<void>;
}
/**
 * The filesystem seam confined reads go through.
 *
 * Nothing in this module calls `node:fs` directly; it calls this. Production
 * supplies {@link defaultIo}, and a test supplies a wrapper that swaps a path
 * between two named calls. A traversal race is therefore reproduced by
 * choosing when the swap happens rather than by racing a timer, so the
 * regression is deterministic on every host.
 *
 * @category models
 * @since 0.1.0
 */
export interface Io {
    readonly realpath: (path: string) => Promise<string>;
    readonly lstat: (path: string) => Promise<Stats>;
    readonly readdir: (path: string, limit?: number) => Promise<ReadonlyArray<NodeFs.Dirent>>;
    readonly open: (path: string) => Promise<OpenFile>;
}
/**
 * Reads the real filesystem through `node:fs`.
 *
 * @category execution
 * @since 0.1.0
 */
export declare const defaultIo: Io;
/**
 * The `code` of a rejected filesystem call, when it has one.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const errorCode: (cause: unknown) => string | undefined;
/**
 * Reports whether `candidate` is `root` or below it, lexically.
 *
 * Both arguments must already be canonical: this decides containment, it does
 * not resolve links.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const inside: (root: string, candidate: string) => boolean;
/**
 * Resolves a workspace root to the canonical path every confinement check is
 * made against.
 *
 * Hosts rewrite paths: macOS resolves `/var` to `/private/var`, and a
 * workspace reached through a symlinked parent has two equally valid
 * spellings. Comparing an unresolved root against a resolved candidate reports
 * a false escape, so the root resolves once and every check uses that answer.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const canonicalRoot: (root: string, io?: Io) => Promise<string>;
/**
 * One filesystem object, named by the canonical path it was found at and
 * described by the `lstat` that admitted it.
 *
 * @category models
 * @since 0.1.0
 */
export interface Entry {
    readonly path: string;
    readonly stats: Stats;
}
/**
 * How one confined read is performed.
 *
 * `root` is a canonical workspace root from {@link canonicalRoot}. Leaving it
 * undefined disables confinement, which is only correct for a path the caller
 * has already confined. `what` is the noun that appears in diagnostics.
 *
 * @category models
 * @since 0.1.0
 */
export interface Options {
    readonly root?: string | undefined;
    readonly io?: Io | undefined;
    readonly what?: string | undefined;
    readonly directoryEntries?: number | undefined;
    /** Optional byte ceiling for a streamed digest; omitted means no content-size ceiling. */
    readonly maximumBytes?: number | undefined;
    readonly signal?: AbortSignal | undefined;
    /** Whether a symbolic link in the final path component may be followed. */
    readonly symlinks?: "follow" | "reject" | undefined;
}
/**
 * Resolves one path to the regular file it names, inside the workspace.
 *
 * Returns undefined when nothing is there, including when a symbolic link
 * dangles: a link with no target names no file. Every other failure throws.
 *
 * ## Symbolic link policy
 *
 * A symbolic link is followed only when its whole resolution stays inside the
 * canonical root and ends at a regular file. A link that leaves the root is
 * refused by name, so a link planted in a workspace can never decide that
 * something outside it is repository content. This is the one policy every
 * caller shares: a declared file input, a `.gitignore`, and a `PACKAGE.ts` probe
 * all admit exactly the same set of files.
 *
 * The returned path is the resolved one. Reads happen through it, so the
 * descriptor identity check compares like with like.
 *
 * @category discovery
 * @since 0.1.0
 */
export declare const resolveFile: (path: string, options?: Options) => Promise<Entry | undefined>;
/**
 * Resolves one path to the real directory it names, inside the workspace.
 *
 * Returns undefined when nothing is there and when the entry is not a real
 * directory, which includes a symbolic link to one: a walk that followed a
 * directory link could leave the workspace or loop forever, so a link is not a
 * directory as far as traversal is concerned. A directory whose canonical path
 * is outside the root is refused, which is how a link above the entry is
 * caught.
 *
 * @category discovery
 * @since 0.1.0
 */
export declare const resolveDirectory: (path: string, options?: Options) => Promise<Entry | undefined>;
/**
 * Lists one confined directory, refusing an entry that was replaced while it
 * was being read.
 *
 * `expected` is the identity a previous observation recorded for the
 * directory. It is re-checked before and after the listing, so a directory
 * swapped for another between the decision to walk it and the walk itself
 * fails rather than contributing another tree's entries under this one's name.
 *
 * @category discovery
 * @since 0.1.0
 */
export declare const listDirectory: (path: string, expected: Entry, options?: Options) => Promise<ReadonlyArray<NodeFs.Dirent>>;
/**
 * Streams one file's SHA-256 through a bounded, reusable buffer.
 *
 * Returns undefined when the file does not exist, so a declared-but-missing
 * input still contributes deterministic key material. Every other failure —
 * a permission error, a FIFO, a device, a link out of the workspace, a file
 * that changed while it was read — is reported.
 *
 * @category digests
 * @since 0.1.0
 */
export declare const digestEntry: (entry: Entry, options?: Options) => Promise<string | undefined>;
/**
 * Streams one confined file's SHA-256 through a bounded, reusable buffer.
 *
 * Returns undefined when the file does not exist, so a declared-but-missing
 * input still contributes deterministic key material. Callers that previously
 * admitted an {@link Entry} can use {@link digestEntry} to bind that admission
 * to the exact object eventually hashed.
 *
 * @category digests
 * @since 0.1.0
 */
export declare const digestFile: (path: string, options?: Options) => Promise<string | undefined>;
/**
 * Reads one bounded regular file as UTF-8 text.
 *
 * Returns undefined when the file does not exist. A file larger than `limit`,
 * a file that is not valid UTF-8, and a file that changed while it was read
 * all fail: a truncated or lossily decoded `.gitignore` is a matcher that
 * ignores the wrong paths, which is worse than no answer at all.
 *
 * @category discovery
 * @since 0.1.0
 */
export declare const readText: (path: string, options?: Options & {
    readonly limit?: number | undefined;
}) => Promise<string | undefined>;
/**
 * Flushes one directory entry so a rename inside it survives power loss.
 *
 * Windows exposes no directory descriptor to sync, and a filesystem that
 * reports directory sync as unsupported has nothing to flush; both count as
 * done. Any other sync failure, and a close failure after the sync, is
 * reported, because the entry the caller just published may not be durable.
 * Every durable publication in the workspace, generated files, scaffolded
 * packages, and redacted deployment state, ends with this call.
 *
 * @category publication
 * @since 0.1.0
 */
export declare const syncDirectory: (directory: string) => Promise<void>;
