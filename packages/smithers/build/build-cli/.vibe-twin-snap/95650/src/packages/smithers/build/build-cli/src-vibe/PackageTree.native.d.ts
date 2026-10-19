import { type FileManifest, type IgnoredLimits, type IgnoredSnapshot, type IgnoredStash, type OutDirLimits, type OutDirManifest, type PathState, type PortalSnapshot, type Probe, type Quarantine, type TreeSnapshot } from "./PackageTree.vibe";
/** `NodeFs.realpathSync`, for PackageTree.vibe's plain `resolveChangedPath`. */
export declare const realpathSync: (path: string) => string;
/** `NodePath.dirname`. */
export declare const dirname: (path: string) => string;
/** `randomBytes(size).toString("hex")`, for `openQuarantine`'s stamp. */
export declare const randomHex: (size: number) => string;
/**
 * The sha256 hex digest of one file's bytes, streamed.
 *
 * @category hashing
 * @since 0.1.0
 */
export declare const digestFileBytes: (path: string) => Promise<string>;
/**
 * Runs one bounded tool identity/readiness command.
 *
 * The probe goes through the exec boundary's spawn shape, so a resolved
 * Windows batch shim is identified the same way it is run. Probing
 * `pnpm.cmd` directly would throw: Node has refused to spawn `.bat` and
 * `.cmd` without a shell since the v18 hardening.
 *
 * @category tools
 * @since 0.1.0
 */
export declare const probeCommand: (path: string, args: ReadonlyArray<string>, options?: {
    readonly cwd?: string | undefined;
    readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
}) => Promise<Probe>;
/**
 * Runs git in a workspace and returns stdout, throwing on a non-zero exit.
 *
 * Output is streamed and decoded fatally, exactly as `Workspace`
 * decodes its own git output. A path is bytes on POSIX, and git prints those
 * bytes verbatim under `-z`. Decoding them leniently substitutes U+FFFD for
 * every byte that is not valid UTF-8, which silently renames the path: the
 * write-set guard then judges a name no file has, reports it out of set, and
 * "reverts" it with a removal that cannot fail because it targets nothing.
 * The real write stays in the tree while the node fails claiming otherwise.
 * A path this decoder cannot read is a loud failure instead.
 *
 * A local Git marker is required. Otherwise Git can walk out of a jj-only
 * workspace and census an unrelated ancestor checkout. Large valid inventories
 * are not limited by execFile's former 256 MiB capture ceiling; callers still
 * retain the returned text, and ignored-file stashes keep their own limits.
 *
 * @category git
 * @since 0.1.0
 */
export declare const runGit: (root: string, args: ReadonlyArray<string>) => Promise<string>;
/**
 * Runs a resolved tool once at plan time and returns its stdout, throwing on
 * a non-zero exit with what the tool wrote to stderr. Unlike Git inventories,
 * these planner probes have a bounded capture: a planner asking `forge` or
 * `go` what it would do.
 *
 * @category planning
 * @since 0.1.0
 */
export declare const runCommand: (path: string, args: ReadonlyArray<string>, options: {
    readonly cwd: string;
    readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
}) => Promise<string>;
export declare const statePath: (absolute: string) => Promise<PathState>;
/**
 * Records the dirty state of a git workspace before a tool runs.
 * Requires trusted, coordinated writers from capture through rollback;
 * filesystem operations are path-based, not descriptor-anchored isolation.
 *
 * @category write sets
 * @since 0.1.0
 */
export declare const snapshotTree: (root: string, cacheDirectory: string) => Promise<TreeSnapshot>;
/**
 * The set of paths whose state changed since a snapshot, resolved through
 * symlinks: a write through an in-tree link is judged by where it landed.
 *
 * @category write sets
 * @since 0.1.0
 */
export declare const changedSinceSnapshot: (snapshot: TreeSnapshot, cacheDirectory: string) => Promise<ReadonlyArray<string>>;
/**
 * Restores one path to its snapshot state, first copying whatever stands at
 * the path now into `quarantine`.
 * Writers must remain trusted and coordinated throughout snapshot, execution,
 * and rollback; these path-based operations do not anchor parent descriptors.
 *
 * @category write sets
 * @since 0.1.0
 */
export declare const revertPath: (snapshot: TreeSnapshot, path: string, quarantine?: Quarantine) => Promise<void>;
/**
 * Releases the stash a snapshot holds.
 *
 * @category write sets
 * @since 0.1.0
 */
export declare const releaseSnapshot: (snapshot: TreeSnapshot) => Promise<void>;
/**
 * Opens an empty stash for gitignored bytes, removed by
 * {@link releaseIgnoredStash}.
 *
 * @category write sets
 * @since 0.1.0
 */
export declare const openIgnoredStash: () => Promise<IgnoredStash>;
/**
 * Removes a stash and every file it holds.
 *
 * @category write sets
 * @since 0.1.0
 */
export declare const releaseIgnoredStash: (stash: IgnoredStash) => Promise<void>;
/**
 * Records the gitignored paths present before a tool runs and brings the
 * stash up to date with their bytes, or refuses with
 * {@link IgnoredCensusError} when the tree crosses `limits` or holds a path
 * the census cannot read.
 *
 * The census is an `lstat` walk. With a `stash` from an earlier census, only
 * a file whose identity moved since the stash last held it is copied, and
 * one the stash already holds costs its `lstat` alone; without one the
 * snapshot opens a private stash, copies every file into it, and removes it
 * in {@link releaseIgnored}. The `census` field on the result accounts for
 * both.
 *
 * `hostTrees` names the directories a declared toolchain owns, which the
 * census skips whole exactly as it skips `node_modules`: see
 * {@link IgnoredSnapshot}.
 *
 * @category write sets
 * @since 0.1.0
 */
export declare const snapshotIgnored: (root: string, cacheDirectory: string, limits?: IgnoredLimits, stash?: IgnoredStash, hostTrees?: ReadonlyArray<string>) => Promise<IgnoredSnapshot>;
/**
 * The gitignored paths a tool created, overwrote, replaced, or deleted since
 * the snapshot, resolved through symlinks like {@link changedSinceSnapshot}.
 *
 * @category write sets
 * @since 0.1.0
 */
export declare const changedIgnored: (snapshot: IgnoredSnapshot, cacheDirectory: string) => Promise<ReadonlyArray<string>>;
/**
 * Restores one gitignored path to its snapshot state and reports whether it
 * could. A created path is removed; an overwritten or deleted file gets its
 * stashed bytes and mode back; a replaced link gets its target back. What
 * stands at the path now is first copied into `quarantine`.
 *
 * A path the census never measured, a directory git does not enter or
 * anything inside one, is left exactly as the tool left it and reported as
 * not restored: its contents were never stashed, so removal would be the
 * data loss this guard exists to prevent.
 *
 * @category write sets
 * @since 0.1.0
 */
export declare const revertIgnored: (snapshot: IgnoredSnapshot, path: string, quarantine?: Quarantine) => Promise<boolean>;
/**
 * Releases an ignored snapshot: the stash it opened for itself is removed,
 * and a stash it was given is left for the next census.
 *
 * @category write sets
 * @since 0.1.0
 */
export declare const releaseIgnored: (snapshot: IgnoredSnapshot) => Promise<void>;
/**
 * Records every escaping-symlink portal's target before a tool runs.
 *
 * Portals are the in-workspace symlinks, tracked, untracked, or gitignored,
 * whose real target leaves the workspace. `node_modules` at any depth,
 * version-control internals, and the cache are excluded (`node_modules` is
 * installed host state whose writes are expected). Git cannot see a write
 * that lands through such a symlink, so the portal's contents are measured
 * directly here and again after the run.
 *
 * The links under gitignored directories come from the gitignored census,
 * taken from `ignored` when the caller already holds that snapshot so the
 * tree is walked once per guarded body, and otherwise measured here under
 * {@link ignoredLimits} without descending into `hostTrees`, the same
 * declared host caches {@link snapshotIgnored} skips.
 *
 * A portal the census cannot measure — over {@link portalEntryCap} entries, or
 * unreadable — raises {@link PortalCensusError} and refuses the target. The
 * guard has no partial mode: a confinement claim it cannot keep is not made.
 *
 * @category write sets
 * @since 0.1.0
 */
export declare const snapshotPortals: (root: string, cacheDirectory: string, ignored?: IgnoredSnapshot, hostTrees?: ReadonlyArray<string>) => Promise<PortalSnapshot>;
/**
 * Reverts every write that landed through a portal since the snapshot and
 * returns the escaped paths, workspace-relative through their portal link.
 *
 * @category write sets
 * @since 0.1.0
 */
export declare const revertChangedPortals: (snapshot: PortalSnapshot) => Promise<ReadonlyArray<string>>;
/**
 * Releases the stash a portal snapshot holds.
 *
 * @category write sets
 * @since 0.1.0
 */
export declare const releasePortals: (snapshot: PortalSnapshot) => Promise<void>;
/**
 * Copies the workspace to a scratch directory for a check-mode run.
 *
 * Version-control state (`.git`, `.jj`), the cache directory, the root
 * `node_modules` contents, and every nested checkout (a directory carrying
 * its own `.git`, such as an agent worktree or a vendored clone) are skipped;
 * a package's own `node_modules` is copied because under pnpm it is a
 * directory of symlinks into the root store, which the scratch tree needs; symlinks — the e2e clone's
 * node_modules among them — are copied verbatim, so the scratch tree reads
 * the same installed tools without duplicating them. `skip` names further
 * workspace-relative roots the caller is going to clear anyway — an overlay
 * build's own `outDirs` — so a large previous output is not copied only to be
 * deleted. `hostTrees` names the declared host caches, which are linked like
 * the root `node_modules`: a tool reads the same cache, and a read-only cache
 * such as Go's module cache is neither copied nor left in a scratch tree its
 * removal cannot unlink.
 *
 * @category scratch
 * @since 0.1.0
 */
export declare const scratchCopy: (root: string, cacheDirectory: string, skip?: ReadonlyArray<string>, hostTrees?: ReadonlyArray<string>) => Promise<string>;
/**
 * Captures one produced outDir tree into the CAS and returns its manifest.
 *
 * @category artifacts
 * @since 0.1.0
 */
export declare const captureOutDir: (root: string, cacheDirectory: string, outDir: string, storeRoot?: string, limits?: Readonly<OutDirLimits>) => Promise<OutDirManifest>;
/** Captures one declared output file into the CAS.
 *
 * @category artifacts
 * @since 0.1.0
 */
export declare const captureFile: (root: string, cacheDirectory: string, path: string, storeRoot?: string) => Promise<FileManifest>;
/** Verifies that one file manifest's CAS blob exists and matches its name.
 *
 * @category artifacts
 * @since 0.1.0
 */
export declare const verifyFileManifest: (root: string, cacheDirectory: string, manifest: FileManifest) => Promise<string | undefined>;
/** Atomically restores one captured file output from the CAS.
 *
 * @category artifacts
 * @since 0.1.0
 */
export declare const materializeFile: (root: string, cacheDirectory: string, manifest: FileManifest) => Promise<void>;
/**
 * A workspace-relative path that cannot escape its root: non-empty, not
 * absolute, no `..` segment (in either separator), no NUL. Used for a
 * manifest's `outDir` and its entry paths, both read back from an untrusted
 * cache.
 */
export declare const isConfinedRelative: (value: string) => boolean;
/**
 * Verifies every blob a manifest names, returning the first problem or
 * undefined when the store can materialize the whole tree.
 *
 * @category artifacts
 * @since 0.1.0
 */
export declare const verifyManifestBlobs: (root: string, cacheDirectory: string, manifest: OutDirManifest) => Promise<string | undefined>;
/**
 * Materializes one manifest tree by fully staging a sibling, then publishing
 * with two renames. Replacing an existing output has a brief absence window;
 * readers must coordinate with publishers when they require continuous
 * visibility. A failed publication rename attempts rollback; if rollback also
 * fails, the error identifies the preserved backup.
 *
 * A destination-specific filesystem lock excludes competing publishers and
 * protects recovery of that destination's backup. Contention fails immediately.
 * After a process crash, remove its stranded lock only after confirming the
 * publisher has stopped, then retry to recover its uniquely owned backup.
 * Legacy unowned backups and ambiguous backups are left for an operator.
 *
 * @category artifacts
 * @since 0.1.0
 */
export declare const materializeManifest: (root: string, cacheDirectory: string, manifest: OutDirManifest) => Promise<void>;
/**
 * Compares one manifest against the current working tree, returning the first
 * difference or undefined when the tree matches it exactly.
 *
 * "Exactly" is what the caller acts on: `PackageExec` skips materialization
 * entirely when this answers undefined. Iterating only the manifest's own
 * entries and comparing only kind and digest therefore let a stale extra file
 * from a previous build and a lost or gained executable bit survive a cache hit
 * into the declared output tree. The tree is enumerated with the same no-follow
 * policy the capture uses, and the file and symlink sets are compared both
 * ways.
 *
 * A manifest omits directories, so their exact set is derived from every
 * entry's ancestors plus the outDir root. Any other directory is stale output
 * and makes the tree differ.
 *
 * @category artifacts
 * @since 0.1.0
 */
export declare const treeMatchesManifest: (root: string, manifest: OutDirManifest) => Promise<string | undefined>;
