/**
 * Node.js `Jj` layer for programs that snapshot and restore workspace state.
 *
 * The exported layers satisfy the platform-independent `Jj` service by shelling
 * out to the `jj` CLI. There are two, and the difference between them is who
 * owns the child process:
 *
 * - {@link layer} spawns through `node:child_process` directly. `jj`
 *   invocations are argv arrays with no shell interpretation, and a host must
 *   be able to checkpoint work even where a spawner is unavailable, sandboxed,
 *   or gated behind a `proc:spawn` grant the user has not given.
 * - {@link layerSpawner} spawns through Effect's `ChildProcessSpawner`, so a
 *   host that decorates that service decorates jj as well. That is what puts a
 *   jj child in its own process group, in `@smthrs/kernel`'s `ProcessLedger`,
 *   and within reach of the reaper that sweeps a crashed incarnation: a
 *   `jj snapshot` that hangs is otherwise a process no host can account for.
 *   `@smthrs/platform-node`'s contained host bundle uses this one.
 *
 * Both bind the executable when the layer is built and spawn nothing then, so
 * a host without jj starts. The first operation awaits a version probe through
 * the operation runner, sharing a supported result per absolute executable
 * path and runner; a failed probe is retried by the next operation. Every
 * operation uses the path bound at build time, independent of later repository
 * cwd or PATH changes.
 *
 * Errors are classified from `jj`'s own stderr vocabulary onto the stable
 * `JjError` codes, the same way `NodeFileSystem` classifies errno, and both
 * layers share that classification.
 *
 * @since 1.0.0
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import { Jj, JjError } from "../Jj.ts";
/**
 * Minimum jj CLI version supported by the Node and Bun adapters.
 * Git patch path quoting is repaired by the shared adapter for 0.39.0.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const minimumVersion = "0.39.0";
/**
 * Milliseconds a layer's first operation waits for each version probe
 * attempt, before cleanup. A probe that times out, or that the spawner reports
 * `TimedOut` starting, is retried once, so the operation waits at most twice
 * this long. Provide this reference to a layer to override the 5000 ms
 * default; the layer reads it when it is built. Values must be positive,
 * finite, and within the host timer range (2147483647 ms); an invalid value
 * fails the probe before it spawns.
 *
 * @category configuration
 * @since 1.0.0
 */
export declare const StartupTimeoutMs: Context.Reference<number>;
/**
 * Milliseconds allowed to acquire both workspace and store fences.
 * Once acquired, this deadline never interrupts the protected operation.
 *
 * @category configuration
 * @since 1.0.0
 */
export declare const RepositoryMutationTimeoutMs: Context.Reference<number>;
/**
 * Share the workspace/store fences with host application of captured work.
 * The deadline bounds acquisition of both fences only, never execution.
 * Caller cancellation and operation failure release both fences.
 *
 * @category utils
 * @since 1.0.0
 */
export declare const withRepositoryMutation: <A, E, R>(method: string, from: string, effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | JjError, R>;
/**
 * Retry Git's shared index or ref-lock contention, for at most 1,200 retries.
 * Source conflicts, private index errors and other VCS failures retain their
 * original error. Never reclaim Git's active lock.
 *
 * @category utils
 * @since 1.0.0
 */
export declare const retryGitIndexLock: <A, E extends {
    readonly message: string;
}, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
/**
 * Provides the `Jj` service backed by the `jj` CLI, spawning its own children.
 *
 * Building it never fails and spawns nothing. The first operation checks the
 * jj version and fails with `not_installed` or `unsupported_version` when the
 * host has no usable jj, so a program that never calls `Jj` runs without one.
 *
 * This is the layer for a program that has no spawner to offer, so it starts
 * its children outside whatever kill policy a host has decided on: a `jj` this
 * layer starts leads no process group the host recorded, appears in no
 * `ProcessLedger`, and is not reaped by a later incarnation of a host that
 * died holding it.
 *
 * That is a bounded exposure rather than a leak, and the bound is what makes
 * this layer usable at all. Every command below is short-lived and starts no
 * long-lived children of its own: each one writes to a pipe, so jj starts no
 * pager, and no command opens an editor, because `snapshot` either passes
 * `-m` or runs no `describe` at all (`jj describe` without `-m` starts
 * `$JJ_EDITOR` and waits for it, which is exactly the child this bound
 * denies). The invocation holds the handle it started, so cancelling a flow
 * signals the process rather than losing it
 * (`packages/smithers/flows/jj/test/NodeJjLifetime.test.ts`,
 * `packages/smithers/flows/jj/test/NodeJj.test.ts`). A host that wants the process GROUP
 * contained, and a record a crash leaves behind, composes
 * {@link layerSpawner} under a contained spawner instead;
 * `@smthrs/platform-node`'s `NodeHost.layerContained` does exactly that.
 *
 * @category layers
 * @since 1.0.0
 */
export declare const layer: Layer.Layer<Jj>;
/**
 * Provides `Jj` bound to one absolute repository root.
 *
 * Binding makes repository authority explicit: later changes to
 * `process.cwd()` cannot redirect snapshots, restores, or diffs into another
 * checkout.
 *
 * Two consequences a caller has to know. A RELATIVE `path` handed to
 * `workspaceAdd` resolves against `repositoryRoot` here and against the
 * caller's working directory under {@link layer}, so pass absolute lane paths.
 * And `root(from)` is exempt from the binding by design: its argument names the
 * directory jj must run in, which is the whole question it answers.
 *
 * @category layers
 * @since 1.0.0
 */
export declare const layerAt: (repositoryRoot: string) => Layer.Layer<Jj>;
/**
 * Provides the `Jj` service backed by the `jj` CLI, spawning through the host's
 * `ChildProcessSpawner`.
 *
 * Like {@link layer}, it builds without jj and checks the version on the first
 * operation, through the same spawner.
 *
 * Use this one wherever the host contains what it starts. A jj child spawned
 * around the spawner leads no process group the host recorded, appears in no
 * `ProcessLedger`, and is never reaped, so a `jj` that hangs after the host
 * dies is a process nothing on the machine can account for. Routing it through
 * the spawner puts it under whatever policy the host has already decided on.
 *
 * @category layers
 * @since 1.0.0
 */
export declare const layerSpawner: Layer.Layer<Jj, never, ChildProcessSpawner>;
/**
 * Provides repository-bound `Jj` through the host's process spawner.
 *
 * The binding behaves exactly as {@link layerAt}'s, including how a relative
 * `workspaceAdd` path resolves and `root`'s exemption from it.
 *
 * @category layers
 * @since 1.0.0
 */
export declare const layerSpawnerAt: (repositoryRoot: string) => Layer.Layer<Jj, never, ChildProcessSpawner>;
