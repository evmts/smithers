/**
 * Host filesystem mechanics for build-system execution: PATH lookup and
 * version probes for tool references, the content-addressed artifact store
 * behind `Shell.Build` outDirs, git-based write-set snapshots with
 * out-of-set revert, and scratch copies for check-mode drift runs.
 *
 * Everything here is deliberately free of planning and scheduling concerns:
 * `PackageExec.ts` decides what to run and in which mode; this module owns
 * how trees are measured, captured, restored, and confined.
 *
 * @since 0.1.0
 */
import * as Exec from "@smthrs/targets/Exec";
import * as Data from "effect/Data";
import * as NodePath from "node:path";
import * as Environment from "./Environment.js";
import * as Path from "./internal/Path.js";
import { posix } from "./internal/Text.js";
import * as SharedNative from "./native-hatch.js";
import * as Native from "./PackageTree.native.js";
import { isConfinedRelative } from "./PackageTree.native.js";
/**
 * The sha256 hex digest of one buffer.
 *
 * @category hashing
 * @since 0.1.0
 */
export const digestBytes = (bytes) => SharedNative.hash("sha256").update(bytes).digest("hex");
/**
 * Whether a string is a lowercase sha256 hex digest: the only name the CAS
 * stores a blob under, and the only digest shape a manifest may carry.
 *
 * @category hashing
 * @since 0.1.0
 */
export const isSha256Hex = (value) => /^[0-9a-f]{64}$/.test(value);
/**
 * The sha256 hex digest of one file's bytes, streamed.
 *
 * @category hashing
 * @since 0.1.0
 */
export const digestFileBytes = Native.digestFileBytes;
/**
 * Searches the host PATH for one executable, returning its absolute path or
 * undefined.
 *
 * The lookup is the exec boundary's own: plan-time tool resolution and the
 * spawn must agree about which file a bare command name is, or a Windows host
 * refuses a manager the spawn would have found. `options.platform` is there so
 * a POSIX host can ask for the Windows answer.
 *
 * @category tools
 * @since 0.1.0
 */
export const findOnPath = (name, environment = Environment.ambientEnvironment(), options) => {
    return findAllOnPath(name, environment, options)[0];
};
/**
 * Searches every PATH entry for an executable, preserving PATH order.
 *
 * @category tools
 * @since 0.1.0
 */
export const findAllOnPath = (name, environment = Environment.ambientEnvironment(), options) => Exec.findAllOnPath(name, environment, options);
/**
 * Runs `<path> --version` once and captures bounded output.
 *
 * Tools without a `--version` flag still probe deterministically: whatever
 * they print plus their exit code is the identity. The probe result is key
 * material, so callers memoize it per command.
 *
 * `args` overrides the probe argv for a tool whose version lives behind a
 * subcommand rather than a flag (`go version`), and `cwd` runs the probe
 * inside a directory whose configuration selects the version (a Go module
 * whose `go.mod` makes `GOTOOLCHAIN` switch toolchains).
 *
 * @category tools
 * @since 0.1.0
 */
export const probeVersion = (path, options) => probeCommand(path, options?.args ?? ["--version"], {
    ...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
    ...(options?.environment === undefined ? {} : { environment: options.environment })
});
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
export const probeCommand = Native.probeCommand;
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
export const runGit = Native.runGit;
/**
 * Runs a resolved tool once at plan time and returns its stdout, throwing on
 * a non-zero exit with what the tool wrote to stderr. Unlike Git inventories,
 * these planner probes have a bounded capture: a planner asking `forge` or
 * `go` what it would do.
 *
 * @category planning
 * @since 0.1.0
 */
export const runCommand = Native.runCommand;
/**
 * Measures the state of one absolute path: missing, a symlink with its
 * target, or a file with its content digest and full permission bits.
 *
 * @category write sets
 * @since 0.1.0
 */
export const pathState = (absolute) => Native.statePath(absolute);
/**
 * Records the dirty state of a git workspace before a tool runs.
 * Requires trusted, coordinated writers from capture through rollback;
 * filesystem operations are path-based, not descriptor-anchored isolation.
 *
 * @category write sets
 * @since 0.1.0
 */
export const snapshotTree = Native.snapshotTree;
/**
 * The set of paths whose state changed since a snapshot, resolved through
 * symlinks: a write through an in-tree link is judged by where it landed.
 *
 * @category write sets
 * @since 0.1.0
 */
export const changedSinceSnapshot = Native.changedSinceSnapshot;
/**
 * Resolves one changed path through symlinks to the workspace-relative
 * location the bytes actually landed at, or undefined when the real location
 * leaves the workspace.
 *
 * @category write sets
 * @since 0.1.0
 */
export const resolveChangedPath = (root, path) => {
    const absolute = SharedNative.join(root, path);
    let real;
    try {
        real = Native.realpathSync(absolute);
    }
    catch {
        // The path no longer exists (a deletion); judge it by its lexical spot
        // resolved through the nearest existing ancestor.
        try {
            real = SharedNative.join(Native.realpathSync(Native.dirname(absolute)), SharedNative.basename(absolute));
        }
        catch {
            return posix(path);
        }
    }
    const realRoot = Native.realpathSync(root);
    const relative = Path.containedRelative(realRoot, real);
    if (relative === undefined || relative === "")
        return undefined;
    return posix(relative);
};
/**
 * The changes a guarded body could have made: those whose resolved location
 * lies inside one of the workspace-relative `admitted` locations (`""` is the
 * whole workspace). Anything else was written by someone else while the body
 * ran, because the body could not write there, and the guard leaves it alone.
 * `undefined` admits every change: nothing bounds where the body wrote.
 *
 * @category write sets
 * @since 1.0.0
 */
export const judgedChanges = (root, changed, admitted) => {
    if (admitted === undefined)
        return changed;
    return changed.filter((path) => {
        const resolved = resolveChangedPath(root, path);
        if (resolved === undefined)
            return false;
        return admitted.some((location) => location === "" || resolved === location || resolved.startsWith(`${location}/`));
    });
};
/**
 * Names the quarantine for one guarded body. Nothing is created until a
 * revert copies bytes into it.
 *
 * @category write sets
 * @since 1.0.0
 */
export const openQuarantine = (root, cacheDirectory, label) => {
    const slug = label.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[_.]+|_+$/g, "") || "body";
    const stamp = `${new Date().toISOString().replace(/[:.]/g, "-")}-${Native.randomHex(3)}`;
    return { root, directory: `${posix(cacheDirectory)}/reverted/${slug}-${stamp}`, held: [] };
};
/**
 * Restores one path to its snapshot state, first copying whatever stands at
 * the path now into `quarantine`.
 * Writers must remain trusted and coordinated throughout snapshot, execution,
 * and rollback; these path-based operations do not anchor parent descriptors.
 *
 * @category write sets
 * @since 0.1.0
 */
export const revertPath = Native.revertPath;
/**
 * Releases the stash a snapshot holds.
 *
 * @category write sets
 * @since 0.1.0
 */
export const releaseSnapshot = Native.releaseSnapshot;
/**
 * The ceilings the gitignored census may not cross.
 *
 * The census records every gitignored path by `lstat` identity, and holds the
 * bytes of the ones the body's declared write set can name so a write to one
 * can be restored exactly. A stash shared across a run ({@link IgnoredStash})
 * is refreshed incrementally: a file whose identity the stash already holds is
 * not read again, so an unchanged file costs one `lstat` per census and only
 * the files that changed since the previous census are copied. A tree over
 * either ceiling is refused with {@link IgnoredCensusError} rather than
 * guarded partially: the guard has no mode in which a claimed rollback can
 * silently fail to hold. `node_modules` at any depth, the cache directory,
 * and version-control internals never count.
 *
 * Both ceilings count what the guard insures, which is the developer's own
 * gitignored state. They once counted a declared toolchain's build directory
 * too, which made `totalBytes` a census of the host's build artifacts: a
 * checkout with a built Rust `target/` crossed 1 GiB before any target ran
 * and had every `--write` refused. Those directories are host state now, so
 * the ceilings measure the guard's own work again — see
 * {@link IgnoredSnapshot}.
 *
 * @category write sets
 * @since 0.1.0
 */
export const ignoredLimits = {
    /** Gitignored files, links, and unentered directories counted. */
    entries: 50_000,
    /** Bytes across every gitignored file the census holds in its stash. */
    totalBytes: 1024 * 1024 * 1024
};
/**
 * A gitignored tree the write-set guard cannot restore exactly, so the
 * target behind it is refused before it runs.
 *
 * @category errors
 * @since 0.1.0
 */
export class IgnoredCensusError extends Data.TaggedError("smithers-build/IgnoredCensusError") {
    constructor(reason, path, limits, options) {
        super({
            reason,
            path,
            message: reason === "entries"
                ? `the write-set guard cannot restore the gitignored tree: more than ${limits.entries} entries, at ${path}`
                : reason === "totalBytes"
                    ? `the write-set guard cannot restore the gitignored tree: more than ${limits.totalBytes} bytes, at ${path}`
                    : `the write-set guard cannot restore the gitignored tree: ${path} could not be read`,
            ...(options?.cause === undefined ? {} : { cause: options.cause })
        });
    }
}
/**
 * Opens an empty stash for gitignored bytes, removed by
 * {@link releaseIgnoredStash}.
 *
 * @category write sets
 * @since 0.1.0
 */
export const openIgnoredStash = Native.openIgnoredStash;
/**
 * Removes a stash and every file it holds.
 *
 * @category write sets
 * @since 0.1.0
 */
export const releaseIgnoredStash = Native.releaseIgnoredStash;
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
export const snapshotIgnored = Native.snapshotIgnored;
/**
 * The gitignored paths a tool created, overwrote, replaced, or deleted since
 * the snapshot, resolved through symlinks like {@link changedSinceSnapshot}.
 *
 * @category write sets
 * @since 0.1.0
 */
export const changedIgnored = Native.changedIgnored;
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
export const revertIgnored = Native.revertIgnored;
/**
 * Releases an ignored snapshot: the stash it opened for itself is removed,
 * and a stash it was given is left for the next census.
 *
 * @category write sets
 * @since 0.1.0
 */
export const releaseIgnored = Native.releaseIgnored;
/**
 * The largest portal target the guard measures.
 *
 * A larger one cannot be confined by this mechanism, so the target that would
 * have run behind it is refused rather than run unconfined.
 *
 * @category write sets
 * @since 0.1.0
 */
export const portalEntryCap = 20_000;
/**
 * A portal whose target could not be measured, so the write-set guard cannot
 * hold over it.
 *
 * The census used to swallow every failure — the documented overflow, but also
 * a permission error or a directory racing the walk — log a line, and run the
 * target anyway. A stated confinement guarantee that silently does not hold is
 * worse than no guarantee, so an unmeasurable portal now refuses the target.
 *
 * @category errors
 * @since 0.1.0
 */
export class PortalCensusError extends Data.TaggedError("smithers-build/PortalCensusError") {
    constructor(reason, link, options) {
        super({
            reason,
            link,
            message: reason === "too-large"
                ? `the write-set guard cannot confine ${link}: its target has more than ${portalEntryCap} entries`
                : `the write-set guard cannot confine ${link}: its target could not be read`,
            ...(options?.cause === undefined ? {} : { cause: options.cause })
        });
    }
}
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
export const snapshotPortals = Native.snapshotPortals;
/**
 * Reverts every write that landed through a portal since the snapshot and
 * returns the escaped paths, workspace-relative through their portal link.
 *
 * @category write sets
 * @since 0.1.0
 */
export const revertChangedPortals = Native.revertChangedPortals;
/**
 * Releases the stash a portal snapshot holds.
 *
 * @category write sets
 * @since 0.1.0
 */
export const releasePortals = Native.releasePortals;
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
export const scratchCopy = Native.scratchCopy;
/**
 * The ceilings one captured outDir may not cross.
 *
 * The capture walk used to have none, while the portal census sixty lines
 * above capped itself at {@link portalEntryCap} for exactly the reason an
 * unbounded walk is a hazard. A deep tree overflowed the stack, a very large
 * one exhausted memory and disk while hashing, and either published a cache
 * record every later run had to fetch. A crossed ceiling aborts the capture
 * before anything reaches the CAS, naming the path and the limit.
 *
 * @category artifacts
 * @since 0.1.0
 */
export const outDirLimits = {
    /** Directory nesting below the outDir root. */
    depth: 64,
    /** Files, directories, and symlinks visited. */
    entries: 200_000,
    /** UTF-8 bytes in one entry's outDir-relative path. */
    pathBytes: 4_096,
    /** Bytes in one captured file. */
    fileBytes: 4 * 1024 * 1024 * 1024,
    /** Bytes across every captured file in one outDir. */
    totalBytes: 16 * 1024 * 1024 * 1024,
    /** UTF-8 bytes in the encoded manifest entry array. */
    manifestBytes: 64 * 1024 * 1024
};
/**
 * A captured tree that crosses one of {@link outDirLimits}.
 *
 * @category errors
 * @since 0.1.0
 */
export class OutDirLimitError extends Data.TaggedError("smithers-build/OutDirLimitError") {
    constructor(limit, path, ceiling = outDirLimits[limit]) {
        super({ limit, message: `captured output ${path} crosses the ${limit} limit of ${ceiling}` });
    }
}
/**
 * Captures one produced outDir tree into the CAS and returns its manifest.
 *
 * @category artifacts
 * @since 0.1.0
 */
export const captureOutDir = Native.captureOutDir;
/** Captures one declared output file into the CAS.
 *
 * @category artifacts
 * @since 0.1.0
 */
export const captureFile = Native.captureFile;
/** Decodes an untrusted file manifest.
 *
 * @category artifacts
 * @since 0.1.0
 */
export const decodeFileManifest = (value) => {
    if (typeof value !== "object" || value === null)
        return undefined;
    const path = value.path;
    const digest = value.digest;
    const executable = value.executable;
    if (typeof path !== "string" || !isConfinedRelative(path))
        return undefined;
    if (typeof digest !== "string" || !isSha256Hex(digest) || typeof executable !== "boolean")
        return undefined;
    return { path, digest, executable };
};
/** Verifies that one file manifest's CAS blob exists and matches its name.
 *
 * @category artifacts
 * @since 0.1.0
 */
export const verifyFileManifest = Native.verifyFileManifest;
/** Atomically restores one captured file output from the CAS.
 *
 * @category artifacts
 * @since 0.1.0
 */
export const materializeFile = Native.materializeFile;
const safeManifestPath = /^(?!\.\.(\/|$))(?!\/)[^\0]+$/;
/**
 * A symlink target that cannot point out of the tree it is materialized into:
 * not absolute, no `..` segment. A capture only ever records such targets;
 * an untrusted manifest that names an absolute or `..`-bearing target is
 * refused, because materializing it — or writing a later entry through it —
 * would leave the outDir.
 */
const isConfinedLinkTarget = (value) => value !== "" &&
    !value.includes("\0") &&
    !SharedNative.isAbsolute(value) &&
    !value.startsWith("/") &&
    !value.split("/").includes("..") &&
    !value.split(NodePath.sep).includes("..");
/**
 * Validates one untrusted manifest read back from the cache.
 *
 * The manifest is untrusted input: the local `.flows` entry file, a shared
 * remote body, a backup, or a hand edit. Every path it names is bound to the
 * outDir tree here so a poisoned entry cannot escape the workspace. `outDir`
 * is confined to a workspace-relative path with no `..` segment, every entry
 * path is likewise confined, and every link target is confined so a later
 * file entry cannot be written through a symlink that leaves the tree. The
 * caller must still bind the returned `outDir` to a declared output root
 * before materializing it.
 *
 * @category artifacts
 * @since 0.1.0
 */
export const decodeManifest = (value) => {
    if (typeof value !== "object" || value === null)
        return undefined;
    const outDir = value.outDir;
    const entries = value.entries;
    if (typeof outDir !== "string" || !isConfinedRelative(outDir) || !Array.isArray(entries))
        return undefined;
    const decoded = [];
    for (const entry of entries) {
        if (typeof entry !== "object" || entry === null)
            return undefined;
        const path = entry.path;
        const kind = entry.kind;
        const digest = entry.digest;
        const executable = entry.executable;
        const target = entry.target;
        if (typeof path !== "string" || !safeManifestPath.test(path) || !isConfinedRelative(path) ||
            (kind !== "file" && kind !== "link") ||
            typeof digest !== "string" ||
            (kind === "file" && !isSha256Hex(digest)) ||
            typeof executable !== "boolean" ||
            typeof target !== "string" ||
            (kind === "link" && !isConfinedLinkTarget(target)))
            return undefined;
        decoded.push({ path, kind, digest, executable, target });
    }
    return { outDir, entries: decoded };
};
/**
 * Verifies every blob a manifest names, returning the first problem or
 * undefined when the store can materialize the whole tree.
 *
 * @category artifacts
 * @since 0.1.0
 */
export const verifyManifestBlobs = Native.verifyManifestBlobs;
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
export const materializeManifest = Native.materializeManifest;
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
export const treeMatchesManifest = Native.treeMatchesManifest;
