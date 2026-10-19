/**
 * Process-side implementation of the `S.Bundler.Rspack` actions.
 *
 * The bundler is never imported into this process. Each action run writes a
 * small runner script plus a JSON request into a scratch directory and spawns
 * the host `node` on it through the shared {@link Exec.run} boundary (workspace
 * confinement, narrowed environment, bounded capture, kill-on-timeout). The
 * runner resolves `@rsbuild/core` from the *target workspace's* own
 * `node_modules`, loads the workspace's rsbuild config, and:
 *
 * - **resolve**: matches the requested entries to the config's environments,
 *   runs one development-mode compile with every emit and bundler cache
 *   redirected into the scratch directory, and enumerates `stats.modules`.
 *   A development compile is the documented choice: it is the cheapest
 *   complete module graph rspack produces (no minification, no module
 *   concatenation folding modules out of the stats), and rspack has no
 *   supported enumerate-without-compile API. The settled rows are written to
 *   a response file — never stdout, whose capture is bounded — and validated
 *   here against {@link BundlerTarget.ResolveResult} before anything trusts
 *   them.
 * - **build**: runs `rsbuild.build()` for exactly one environment and mode
 *   with the workspace's own config (real output paths, real bundler cache),
 *   and refuses a green exit whose declared outDirs were not created.
 *
 * A workspace without `@rsbuild/core`, a config without environments, an
 * entry matching no environment, and a truncated response all refuse loudly;
 * nothing degrades to an empty graph.
 *
 * @since 0.1.0
 */
import type { Action, FlowRuntime } from "@smthrs/flow";
import * as BundlerTarget from "@smthrs/targets/BundlerTarget";
import * as Exec from "@smthrs/targets/Exec";
import * as Effect from "effect/Effect";
import type * as Layer from "effect/Layer";
/**
 * Host wiring for one bundler runner: where the workspace is, where scratch
 * files (runner script, request, response, redirected resolve emit and
 * bundler caches) live, and how long one child may run.
 *
 * `scratchDirectory` must be absolute. It is host state, never key material.
 * Resolve runs direct every emit path there, so a read-only workspace can be
 * resolved without writing a byte into it; build runs write the workspace's
 * own declared output paths, exactly like every other build target.
 *
 * @category models
 * @since 0.1.0
 */
export interface RunnerOptions {
    readonly workspaceRoot: string;
    readonly scratchDirectory: string;
    /** Wall-clock bound for one bundler child. Defaults to 15 minutes. */
    readonly timeoutMs?: number | undefined;
}
/**
 * Default wall-clock bound for one bundler child process.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const defaultTimeoutMs: number;
/**
 * Resolves one module graph by running the workspace's own bundler.
 *
 * The settled result is validated row by row and its {@link
 * BundlerTarget.graphDigest} is computed here, from the validated rows, so a
 * child that wrote an inconsistent response can never publish a digest for a
 * graph it did not report. The per-call scratch tree is released after the
 * child exits and the response is read, including on failure or interruption.
 *
 * @category execution
 * @since 0.1.0
 */
export declare const resolveGraph: (options: RunnerOptions, payload: BundlerTarget.ResolvePayload) => Effect.Effect<BundlerTarget.ResolveResult, Exec.ExecError, never>;
/**
 * Runs one bundler build for one environment and mode in the workspace.
 *
 * The child's green exit is not trusted alone: the runner refuses a build
 * that created none of its declared outDirs, and the response file must
 * confirm the run reached its end. Content verification of the produced
 * trees belongs to the target's output-capture step, not here.
 *
 * @category execution
 * @since 0.1.0
 */
export declare const runBuild: (options: RunnerOptions, payload: BundlerTarget.BuildPayload) => Effect.Effect<Exec.Result, Exec.ExecError, never>;
/**
 * Implements {@link BundlerTarget.Resolve} with {@link resolveGraph}.
 *
 * @category layers
 * @since 0.1.0
 */
export declare const ResolveLive: (options: RunnerOptions) => Layer.Layer<Action.Requirement<"smithers-build/bundler-resolve">, never, FlowRuntime.FlowRuntime>;
/**
 * Implements {@link BundlerTarget.Build} with {@link runBuild}.
 *
 * @category layers
 * @since 0.1.0
 */
export declare const BuildLive: (options: RunnerOptions) => Layer.Layer<Action.Requirement<"smithers-build/bundler-build">, never, FlowRuntime.FlowRuntime>;
