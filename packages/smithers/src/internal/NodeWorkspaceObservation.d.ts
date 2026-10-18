/**
 * The Node host the workspace walk runs on.
 *
 * `WorkspaceObservation.fileSystemHost` spends two Effect `FileSystem` calls
 * on every entry: `readLink`, which fails with an error value on every regular
 * file, then `stat`. On this repository that was 3.4–5 s a measurement, twice
 * a frame, and a one-line `ctx.done()` answer reached the TUI 8 s after the
 * model wrote it. This host reads each entry's type off the directory listing,
 * so directories and symlinks cost no call at all, and measures a directory's
 * files with concurrent `lstat`s. `lstat` never follows a link, so the walk's
 * "a symlink is not part of the tree" rule holds without asking twice.
 *
 * Errors carry the tags Effect's own Node `FileSystem` gives them, so the walk
 * reads a vanished path and a denied one exactly as it does on the portable host.
 *
 * {@link changes} is the feed that lets a worker skip the walk entirely when
 * nothing under the root moved: a 15,000-path checkout still cost 3 to 15 s a
 * walk, twice a frame, on a loaded machine.
 *
 * @since 1.0.0
 */
import * as WorkspaceObservation from "@smthrs/agent/WorkspaceObservation";
import { Effect, type Scope } from "effect";
/**
 * Lists one directory with its entry types and measures its kept files together.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const host: WorkspaceObservation.Host;
/**
 * A change feed over one workspace root: a recursive `fs.watch` whose events
 * move the count, except those under a directory or name the walk skips.
 *
 * An event arrives after the write that caused it, so the `delivered` count
 * can miss a write made just before the call. `settled` first writes a fence
 * file and waits for its event: the feed delivers one root's events in order,
 * so once the fence is back, every earlier change is counted. The fence goes in
 * the first pruned directory other than node_modules the root holds (`.git` in a checkout), which the
 * walk never measures. A root with none, or a watch the host refuses or that
 * fails, answers `Option.none()`, and so does a fence that is not back within
 * `fenceTimeoutMillis`. `WorkspaceObservation.cached` races the fence
 * against the walk, so a slow feed costs no more than the walk. On Linux a
 * fence came back in 1 to 2 ms against a 150 ms walk of 15,000 paths. macOS
 * routes events through one system daemon: under a load average of 25 to 80 a
 * fence took 0.5 to 3 s, and a starved daemon delivered nothing for minutes.
 * The watch is not live the moment it returns, so construction sends one fence
 * ahead.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const changes: (root: string, options?: WorkspaceObservation.Options) => Effect.Effect<WorkspaceObservation.Changes, never, Scope.Scope>;
