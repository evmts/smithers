/**
 * Bounded-parallel execution of planned targets.
 *
 * Targets execute in dependency order with keep-going semantics: a failure
 * fails the run but skips only its dependent cone, every other target still
 * runs, and every result is collected. Each target's Flow runs through the
 * same in-memory flows runtime the install command uses, with the shared exec
 * action implemented by `ExecLive`, the generated-file actions implemented by
 * `WriteFileLive` and `CheckFileLive`, the documentation-parity action
 * implemented by `CheckDocsLive`, the file-group expansion implemented by
 * `ExpandFilegroupLive`, and cacheable green results stored in the
 * workspace cache.
 *
 * @since 0.1.0
 */
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import type * as Planner from "./Planner.ts";
/**
 * One target's reported execution outcome.
 *
 * `hit` answered from the cache, `ran` executed green, `failed` executed and
 * failed, and `skipped` never ran because a dependency did not succeed.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface TargetReport {
    /** Explicit advisory failures retain status and only a digest of diagnostics. */
    readonly blocking?: boolean | undefined;
    readonly failureDigest?: string | undefined;
    readonly label: string;
    readonly target: string;
    readonly status: "hit" | "ran" | "failed" | "skipped";
    readonly durationMs: number;
    readonly key: string;
    readonly error?: string | undefined;
    /** The dependency whose red outcome kept a `skipped` target from running. */
    readonly blockedBy?: string | undefined;
}
/**
 * Per-status result counts for one execution.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface StatusCounts {
    readonly hit: number;
    readonly ran: number;
    readonly failed: number;
    readonly skipped: number;
}
/**
 * What one execution reports: every target's outcome in plan order plus the
 * verdict `ok`, false when any target failed.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface Summary {
    readonly verb: string;
    readonly pattern: string;
    readonly jobs: number;
    readonly durationMs: number;
    readonly counts: StatusCounts;
    readonly ok: boolean;
    readonly results: ReadonlyArray<TargetReport>;
}
/**
 * Options accepted by {@link execute}.
 *
 * `jobs` bounds concurrent targets, must be a positive integer, and defaults
 * to the host parallelism.
 * `readCache` false bypasses cache reads while green results are still
 * written. `remoteCache` is resolved host state and never key material. `signal`
 * interrupts every running target. `reporter` receives every execution event;
 * without one, `log` receives one plain status line per settled target and
 * the end summary, and defaults to standard error.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
/**
 * Several verb plans over one pattern merged into a single execution set.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface MergedPlan {
    readonly roots: ReadonlyArray<string>;
    readonly targets: ReadonlyArray<Planner.PlannedTarget>;
    readonly edges: ReadonlyArray<Planner.Edge>;
    readonly warnings: ReadonlyArray<string>;
}
/**
 * Merges verb plans into the closure of the selected per-label views.
 *
 * Equal-key duplicate views collapse. When lint and a writing verb disagree,
 * lint wins so CI checks drift without mutating it. Two different non-lint
 * views are ambiguous and fail instead of silently dropping one action. The
 * dependency closure and edges are rebuilt from the winning views; otherwise
 * a dependency that belonged only to a discarded build view would still run.
 *
 * @category planning
 * @since 0.1.0
 * @slop
 */
export declare const mergePlans: (plans: ReadonlyArray<Planner.Plan>) => MergedPlan;
/**
 * Resolves the concurrency bound one execution runs under.
 *
 * The CLI validates its own flag, so this guards the programmatic call. A
 * non-integer bound is rejected instead of clamped: `NaN` silently scheduled
 * zero targets and reported a green summary for a run that never happened.
 *
 * @category execution
 * @since 0.1.0
 * @slop
 */
export declare const resolveJobs: (jobs?: number | undefined) => number;
/**
 * Runs a dependency frontier with scoped workers. Each worker releases its
 * resources before its completion can make a dependent ready.
 * @category execution
 * @since 1.0.0
 */
export declare const scheduleEffect: <E, R>(targets: ReadonlyArray<Planner.PlannedTarget>, jobs: number, runOne: (label: string) => Effect.Effect<void, E, R>, signal?: AbortSignal | undefined) => Effect.Effect<void, Error, Exclude<R, Scope.Scope>>;
/**
 * Drains a dependency-ordered work list with at most `jobs` in flight.
 *
 * Targets with `exclusive: true` attrs run alone. Ready ordinary work drains
 * first, then each ready exclusive target gets its own window. Dependencies
 * still run first, including exclusive prerequisites of ordinary targets.
 *
 * The work list and the concurrency bound are validated before anything is
 * dispatched, and an invalid one rejects without running a target. See
 * {@link validateWorkList}: a duplicate label, a duplicate or unknown or
 * self-referential dependency edge, and any cycle are all refused up front.
 * `jobs` must be a positive integer, because a fractional or non-finite bound
 * made the dispatch loop's `active < jobs` comparison false forever and
 * resolved a summary for a run that never happened.
 *
 * `runOne` reports an ordinary target failure itself and still resolves, which
 * is what keeps the run going. A rejection, or a synchronous throw, is
 * therefore an internal fault: no further target is dispatched, the targets
 * already in flight are awaited so nothing keeps mutating the workspace or the
 * cache after the caller has resumed, and the first rejection is the one
 * reported.
 *
 * Once `signal` aborts, no new target is dispatched. Targets already in flight
 * are still drained before the abort is reported, so they cannot keep mutating
 * the workspace after the caller regains control.
 *
 * The scheduler therefore always settles: it resolves only after dispatching
 * every target, and rejects in every other case.
 *
 * @category execution
 * @since 0.1.0
 * @slop
 */
export declare const schedule: (targets: ReadonlyArray<Planner.PlannedTarget>, jobs: number, runOne: (label: string) => Promise<void>, signal?: AbortSignal | undefined) => Promise<void>;
/**
 * Renders a failure value compactly for a status line.
 *
 * The walk is lossy and total: a member JSON cannot carry is replaced by a
 * marker naming what it was, and a value larger than one diagnostic may hold
 * is truncated where it overruns. Refusing instead — which is what the cache
 * encoder does, and what this shared with it — cost an operator the whole
 * reason: a `//apps/app:unitTests` failure carrying a 64 KiB stderr tail and a
 * 64 KiB stdout tail overran the byte budget, the clone threw, and the CI log
 * read `//apps/app:unitTests  failed  86.1s  target failed` and nothing else.
 *
 * Members are rendered in sorted key order, so `argv`, `code`, `cwd` and
 * `exitCode` all precede the stream tails and survive any later truncation.
 *
 * @category diagnostics
 * @since 0.1.0
 */
export declare const describeFailure: (value: unknown) => string;
/**
 * Encodes one schema-level wire value in an unambiguous cache envelope.
 *
 * @category caching
 * @since 0.1.0
 * @slop
 */
export declare const encodeCacheOutput: (value: unknown) => {
    readonly output: unknown;
} | {
    readonly reason: string;
};
/**
 * Decodes and revalidates the cache envelope without trusting its object shape.
 *
 * @category caching
 * @since 0.1.0
 * @slop
 */
export declare const decodeCacheOutput: (output: unknown) => {
    readonly value: unknown;
} | {
    readonly reason: string;
};
