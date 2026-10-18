/**
 * Durable deferred-completion and clock-deadline state used by the flow
 * engine adapter.
 *
 * A parked run keeps the `suspended` status the run store admits; there is
 * no `waiting` status. The waiting taxonomy lives beside it on the run row
 * in the `waiting_reason`, `waiting_wake_at_ms`, `waiting_token`, and
 * `waiting_request` columns, written by `park` and cleared by `wake`. See
 * `docs/concepts/durable-waits.md`.
 *
 * @since 0.1.0
 */
import { DurableWriter } from "@smthrs/database/DurableWriter";
import type { OwnerId } from "@smthrs/run-store/Ownership";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import type { OnParentExit } from "./RunState.ts";
/**
 * A position in pending admission creation order.
 *
 * @since 1.0.0
 * @category models
 */
export interface PendingRunCursor {
    readonly runId: string;
    readonly createdAtMs: number;
}
/**
 * The durable address of a deferred result.
 *
 * @since 0.1.0
 * @category models
 */
export declare const DeferredAddress: Schema.Struct<{
    readonly flowName: Schema.NonEmptyString;
    readonly executionId: Schema.NonEmptyString;
    readonly deferredName: Schema.NonEmptyString;
}>;
/**
 * The durable address of a deferred result.
 *
 * @category models
 * @since 0.1.0
 */
export type DeferredAddress = typeof DeferredAddress.Type;
/**
 * The first durable completion recorded for a deferred.
 *
 * Correlation data remains opaque at this boundary. A future external-event
 * layer owns its schema and authorization policy.
 *
 * @since 0.1.0
 * @category models
 */
export declare const DeferredRow: Schema.Struct<{
    readonly flowName: Schema.NonEmptyString;
    readonly executionId: Schema.NonEmptyString;
    readonly deferredName: Schema.NonEmptyString;
    readonly exit: Schema.Unknown;
    readonly metadata: Schema.optionalKey<Schema.Unknown>;
    readonly completedAtMs: Schema.Int;
}>;
/**
 * The first durable completion recorded for a deferred.
 *
 * @category models
 * @since 0.1.0
 */
export type DeferredRow = typeof DeferredRow.Type;
/**
 * Result of a first-writer-wins deferred completion.
 *
 * @since 0.1.0
 * @category models
 */
export type CompleteDeferredOutcome = {
    readonly _tag: "Completed";
    readonly row: DeferredRow;
    readonly digest: DeferredDigest;
} | {
    readonly _tag: "Existing";
    readonly row: DeferredRow;
    readonly digest: DeferredDigest;
};
/**
 * The `JournalEvent.contentDigest` of a stored completion's encoded `exit`
 * and `metadata` text. The journal fact that announces a completion carries
 * these digests instead of the values, which stay in the row.
 *
 * @since 1.0.0
 * @category models
 */
export interface DeferredDigest {
    readonly exit: string;
    readonly metadata: string | null;
}
/**
 * The durable address of a clock.
 *
 * @since 0.1.0
 * @category models
 */
export declare const ClockAddress: Schema.Struct<{
    readonly flowName: Schema.NonEmptyString;
    readonly executionId: Schema.NonEmptyString;
    readonly clockName: Schema.NonEmptyString;
}>;
/**
 * The durable address of a clock.
 *
 * @category models
 * @since 0.1.0
 */
export type ClockAddress = typeof ClockAddress.Type;
/**
 * A durable absolute clock deadline.
 *
 * @since 0.1.0
 * @category models
 */
export declare const ClockRow: Schema.Struct<{
    readonly flowName: Schema.NonEmptyString;
    readonly executionId: Schema.NonEmptyString;
    readonly clockName: Schema.NonEmptyString;
    readonly deferredName: Schema.NonEmptyString;
    readonly dueAtMs: Schema.Int;
    readonly completedAtMs: Schema.NullOr<Schema.Int>;
}>;
/**
 * A durable absolute clock deadline.
 *
 * @category models
 * @since 0.1.0
 */
export type ClockRow = typeof ClockRow.Type;
/**
 * Result of scheduling a durable clock.
 *
 * @since 0.1.0
 * @category models
 */
export type ScheduleClockOutcome = {
    readonly _tag: "Scheduled";
    readonly row: ClockRow;
} | {
    readonly _tag: "Existing";
    readonly row: ClockRow;
};
/**
 * Result of completing a durable clock.
 *
 * @since 0.1.0
 * @category models
 */
export type CompleteClockOutcome = {
    readonly _tag: "Completed";
    readonly row: ClockRow;
} | {
    readonly _tag: "AlreadyCompleted";
    readonly row: ClockRow;
} | {
    readonly _tag: "NotFound";
};
/**
 * The core wait-reason vocabulary a supervisor understands for wake policy.
 *
 * - `approval` — parked until a human (or policy) approves; woken by token.
 * - `event` — parked on an external event / deferred completion.
 * - `timer` — parked until `wakeAt`; woken by the durable clock sweep.
 * - `quota` — parked on provider quota; woken at `wakeAt` when known.
 * - `released` — the owning process released the run without settling it
 *   (shutdown, heartbeat self-interrupt; issue #39). A released row has no
 *   held lease and no `wakeAt`: any supervisor/sweeper MUST scan for this
 *   reason explicitly and re-drive the run through the claim path, or
 *   released runs are stranded forever (issue #67).
 * - `quarantine` — parked because a SUCCEEDED attempt row's recorded
 *   evidence measured corrupt under the strict verdict (issue #171). The
 *   row cannot be evicted/re-executed like a cache row (its side effects
 *   already ran), so the corrupt boundary evidence is quarantined off the
 *   row while its durable outcome stays intact. No sweeper auto-wakes this
 *   reason: the strict integrity verdict remains visible until an explicit
 *   resume, which completes from the recorded outcome without re-execution.
 *
 * Left open (`string & {}`) so a plugin can park on a reason the core
 * taxonomy has not named yet — the store persists whatever it is given
 * rather than rejecting unknown reasons.
 *
 * @since 0.1.0
 * @category models
 */
export declare const WaitingReason: Schema.NonEmptyString;
/**
 * The open wait-reason vocabulary.
 *
 * @category models
 * @since 0.1.0
 */
export type WaitingReason = typeof WaitingReason.Type;
/**
 * The payload recorded when a run parks.
 *
 * `reason` and `wakeAt` earn columns because a supervisor sweeper queries
 * them (`WHERE waiting_reason = 'quota' AND waiting_wake_at_ms <= ?`);
 * `token` is compare-and-swap/lookup material a wake handler matches
 * against.
 *
 * @since 0.1.0
 * @category models
 */
export declare const Waiting: Schema.Struct<{
    readonly reason: Schema.NonEmptyString;
    readonly wakeAt: Schema.optional<Schema.Int>;
    readonly token: Schema.optional<Schema.NonEmptyString>;
    /**
     * What the wait declared about itself: for a `HumanTask` park, the kind of
     * answer it wants, the prompt, and the attempt budget.
     *
     * `reason` and `token` say that a person owes the run an answer and which
     * wait point holds it. Neither says what was asked, and the question lives
     * in an action payload of an execution that has released its owner, so a
     * reader had nothing to render but the wait's own name. This is the question
     * itself, as the JSON TEXT the declaring flow wrote, stored and cleared with
     * the other waiting columns.
     */
    readonly request: Schema.optional<Schema.String>;
}>;
/**
 * The payload recorded when a run parks.
 *
 * @category models
 * @since 0.1.0
 */
export type Waiting = typeof Waiting.Type;
/**
 * A decoded waiting row for a parked run.
 *
 * @since 0.1.0
 * @category models
 */
export declare const WaitingRow: Schema.Struct<{
    readonly runId: Schema.NonEmptyString;
    readonly reason: Schema.NonEmptyString;
    readonly wakeAt: Schema.NullOr<Schema.Int>;
    readonly token: Schema.NullOr<Schema.NonEmptyString>;
    /** The question {@link Waiting} declared, absent on a park that declared none. */
    readonly request: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
}>;
/**
 * A decoded waiting row for a parked run.
 *
 * @category models
 * @since 0.1.0
 */
export type WaitingRow = typeof WaitingRow.Type;
/**
 * A `running` row whose owner stopped heartbeating, and the lease it froze on.
 *
 * The heartbeat identifies the lease: a sweep that remembers a refusal against
 * one heartbeat must not apply it to a later stall of the same run.
 *
 * @category models
 * @since 1.0.0
 */
export interface StaleRunningRow {
    readonly runId: string;
    readonly heartbeatAtMs: number;
}
/**
 * A predicate over `waitingRuns` — omitted fields are unconstrained.
 *
 * @since 0.1.0
 * @category models
 */
export interface WaitingRunsFilter {
    readonly reason?: string;
    readonly dueBeforeMs?: number;
    /**
     * When `true`, only parked runs whose cancellation was durably requested
     * (`flows_runs.cancel_requested_at_ms IS NOT NULL`). Lets the parked-run
     * sweep fetch actionable rows instead of scanning every parked run and
     * probing each with a `store.get` (issue #68). The in-memory
     * implementation reads the flag from the `runs` view
     * (`MemoryRunView.cancelRequestedAtMs`); without a view it stays
     * permissive and the sweeper's own per-row guard decides.
     */
    readonly cancelRequested?: boolean;
}
/**
 * Result of recording that a run parked on a waiting reason.
 *
 * @since 0.1.0
 * @category models
 */
export type ParkOutcome = {
    readonly _tag: "Parked";
    readonly row: WaitingRow;
} | {
    readonly _tag: "NotFound";
};
/**
 * Result of clearing a run's waiting payload on wake.
 *
 * @since 0.1.0
 * @category models
 */
export type WakeOutcome = {
    readonly _tag: "Woken";
    readonly row: WaitingRow;
} | {
    readonly _tag: "NotWaiting";
} | {
    readonly _tag: "NotFound";
};
/**
 * A durable parent edge in the run DAG.
 *
 * The run row's `state_json` carries only the first (creating) parent; a
 * diamond gives a run a second parent the row cannot express. Cycle
 * detection must see every edge from every owner process and across
 * restarts (issues #40/#41), so edges are persisted here. `seq` is a
 * store-global insertion order used only to list a run's parents oldest
 * first (and to make the cycle walk deterministic); it no longer arbitrates
 * anything, so duplicate values would be harmless (issues #54/#66).
 *
 * @since 0.1.0
 * @category models
 */
export declare const RunParentEdge: Schema.Struct<{
    readonly childId: Schema.NonEmptyString;
    readonly parentId: Schema.NonEmptyString;
    readonly seq: Schema.Int;
}>;
/**
 * A durable parent edge in the run DAG.
 *
 * @category models
 * @since 0.1.0
 */
export type RunParentEdge = typeof RunParentEdge.Type;
/**
 * The surviving attempt rows of one action key: the earliest surviving
 * row's start time and the highest attempt number contiguous from it.
 *
 * @since 0.1.0
 * @category models
 */
export declare const AttemptSurvivors: Schema.Struct<{
    /**
     * The lowest surviving attempt number. Anything above 1 means the prune
     * job removed a leading run of attempts; the engine store applies the
     * pruned-prefix tolerance to it so both survivor paths agree (issue #96).
     */
    readonly earliestAttempt: Schema.Int;
    readonly earliestStartedAtMs: Schema.Int;
    readonly latest: Schema.Int;
}>;
/**
 * The surviving attempt range of one action key.
 *
 * @category models
 * @since 0.1.0
 */
export type AttemptSurvivors = typeof AttemptSurvivors.Type;
declare const RunParentCycleError_base: Schema.Class<RunParentCycleError, Schema.TaggedStruct<"@smthrs/engine-store/RunParentCycleError", {
    readonly path: Schema.$Array<Schema.String>;
}>, Cause.YieldableError>;
/**
 * Recording a parent edge would close a cycle in the run DAG.
 *
 * Raised from inside the same transaction that inserted the edge, which is
 * rolled back: a rejected edge leaves no durable trace anywhere (issues
 * #54/#55/#56). `path` lists execution ids from the child back to itself
 * through its would-be ancestors, matching the engine's
 * `FlowCycleDetected.path` shape.
 *
 * @since 0.1.0
 * @category errors
 */
export declare class RunParentCycleError extends RunParentCycleError_base {
}
declare const EngineStateFault_base: Schema.Class<EngineStateFault, Schema.TaggedStruct<"@smthrs/engine-store/EngineStateFault", {
    readonly reason: Schema.Literals<readonly ["value_not_serializable", "value_not_decodable", "deferred_completion_missing", "run_parent_edge_missing"]>;
    readonly field: Schema.optional<Schema.String>;
    readonly cause: Schema.optional<Schema.Defect>;
}>, Cause.YieldableError>;
/**
 * A durable engine-state invariant broke: a defect (a bug), never a typed
 * failure.
 *
 * `value_not_serializable` and `value_not_decodable` name the JSON column
 * (`field`) whose value could not be written or read back.
 * `deferred_completion_missing` and `run_parent_edge_missing` mean a row a
 * first-writer transaction just lost to was gone when read.
 *
 * @since 1.0.0
 * @category errors
 */
export declare class EngineStateFault extends EngineStateFault_base {
    get message(): string;
}
/**
 * Result of recording a durable parent edge (idempotent).
 *
 * @since 0.1.0
 * @category models
 */
export type RecordRunParentOutcome = {
    readonly _tag: "Recorded";
    readonly edge: RunParentEdge;
} | {
    readonly _tag: "Existing";
    readonly edge: RunParentEdge;
};
/**
 * Minimal durable state missing from the current `@smthrs/journal` contract.
 *
 * A successful mutation means the row is durable. Callers may therefore
 * journal and schedule a wake only after the mutation returns. Deferred and
 * clock state belong to this package for 1.0.
 *
 * @since 0.1.0
 * @category models
 */
export interface Service {
    readonly deferred: (address: DeferredAddress) => Effect.Effect<Option.Option<DeferredRow>>;
    /**
     * Marks an existing result observed without removing its replay evidence.
     * Returns whether this call consumed it: false when there is no result or
     * it was already consumed.
     */
    readonly consumeDeferred: (address: DeferredAddress, consumedAtMs: number) => Effect.Effect<boolean>;
    readonly completeDeferred: (row: DeferredRow) => Effect.Effect<CompleteDeferredOutcome>;
    readonly clock: (address: ClockAddress) => Effect.Effect<Option.Option<ClockRow>>;
    /**
     * Schedules a clock while the execution is running under the supplied owner.
     * An existing clock wins unchanged, even after ownership is lost. If no
     * clock exists and the ownership fence fails, the effect self-interrupts.
     */
    readonly scheduleClock: (row: ClockRow, owner: OwnerId) => Effect.Effect<ScheduleClockOutcome>;
    readonly completeClock: (address: ClockAddress, completedAtMs: number) => Effect.Effect<CompleteClockOutcome>;
    readonly dueClocks: (nowMs: number) => Effect.Effect<ReadonlyArray<ClockRow>>;
    /**
     * Completes every uncompleted clock row of one run in a single statement.
     *
     * A run that settled has no future: a timer that fires against it can only
     * schedule a resume nothing will drive. Terminal transitions call this in
     * their own transaction, so the rows stop being pending with the run rather
     * than lingering as durable work no sweep will ever finish.
     *
     * It takes the run id rather than a clock address because the caller is
     * closing a RUN, and it does not read the run row, so it composes with a
     * terminal transition in either order.
     */
    readonly completeRunClocks: (executionId: string, completedAtMs: number) => Effect.Effect<ReadonlyArray<ClockRow>>;
    /**
     * Lists uncompleted clock rows scoped to an execution or flow, with no
     * due-time bound. Suspension-reason derivation and registration-time
     * recovery use this instead of abusing `dueClocks` as an all-clocks
     * listing (issue #35): `dueClocks` is a due-timer sweeper query and may
     * grow a result cap without affecting park correctness.
     *
     * Rows belonging to a settled run are never listed. Registration sweeps
     * this to re-arm timers, so without the run-status join every restart armed
     * one timer per clock row a flow ever wrote, for runs that ended long ago.
     */
    readonly pendingClocks: (scope: {
        readonly executionId?: string;
        readonly flowName?: string;
    }) => Effect.Effect<ReadonlyArray<ClockRow>>;
    /** Whether one execution has an unconsumed completion or a due clock. */
    readonly hasDueWake: (executionId: string, nowMs: number) => Effect.Effect<boolean>;
    /**
     * Lists unconsumed completed deferred addresses for registration-time wake recovery.
     * Observed results remain readable through `deferred` but cannot re-drive a
     * run that has moved on to a later wait.
     *
     * Rows belonging to a settled run are never listed, for the reason
     * {@link Service.pendingClocks} gives: this is swept on every registration,
     * and one resume per completion in a flow's whole history is unbounded work
     * that can wake nothing.
     */
    readonly completedDeferreds: (flowName: string, executionId?: string) => Effect.Effect<ReadonlyArray<DeferredAddress>>;
    /**
     * Records the waiting-reason payload for a parked run, fenced to the
     * current owner so a stale process cannot park a run it no longer runs.
     */
    readonly park: (runId: string, waiting: Waiting, owner: OwnerId) => Effect.Effect<ParkOutcome>;
    /**
     * Clears a run's waiting payload on wake or resume. Idempotent: waking a
     * run that is not waiting reports `NotWaiting` rather than failing.
     */
    readonly wake: (runId: string) => Effect.Effect<WakeOutcome>;
    /**
     * Reads the current waiting payload for a run, if any.
     */
    readonly waiting: (runId: string) => Effect.Effect<Option.Option<WaitingRow>>;
    /**
     * Reads the waiting payloads of a run AND of every execution beneath it.
     *
     * A flow that calls another flow parks the CHILD execution, not the run an
     * operator named: `coding/request` sat at `waiting_reason = 'event'` while
     * the `HumanTask` a person actually had to answer was three executions down,
     * on `coding/PreparePlan`. Reading one row therefore answered "nothing is
     * waiting on you" about a run tree that was waiting on a person, which is
     * how run-3 parked forever with an empty approvals inbox.
     *
     * The walk follows every `flows_run_parents` spawn edge and `parent_run_id`
     * link, so it sees shared children, forks, and trampoline rounds alike.
     * Each run appears once, ordered by minimum depth, creation time, then run
     * ID; the named run comes first. Rows of a settled execution are never
     * listed — a wait a finished execution left behind is not one a person
     * can answer.
     *
     * A DETACHED child and everything under it are skipped. `onParentExit:
     * "detach"` is a fire-and-forget spawn whose whole point is to outlive the
     * run that started it, so its question is not one the run that started it is
     * waiting on, and reporting it here would tell a reader that a run which can
     * proceed cannot. Every other edge is attached: the run is waiting for that
     * child's value, whether its own row has flipped to `suspended` yet or not.
     * Trampoline links continue the same run, so an inherited detach policy
     * does not hide later rounds from that run's own tree.
     *
     * `{ detached: "include" }` walks detached subtrees too, for a caller asking
     * what an explicit resume of the run would restart rather than what the run
     * itself waits on.
     */
    readonly waitingTree: (runId: string, options?: WaitingTreeOptions | undefined) => Effect.Effect<ReadonlyArray<WaitingRow>>;
    /**
     * Lists parked runs matching an optional reason/due-before filter, ordered
     * for sweeper consumption (earliest wake first, untimed waits last, then
     * run id to break ties).
     */
    readonly waitingRuns: (filter?: WaitingRunsFilter) => Effect.Effect<ReadonlyArray<WaitingRow>>;
    /** Pending admissions ordered by creation, strictly after and through optional cursors. */
    readonly pendingRuns: (flowName: string, limit?: number | undefined, after?: PendingRunCursor | undefined, through?: PendingRunCursor | undefined, eligibleBeforeMs?: number | undefined) => Effect.Effect<ReadonlyArray<PendingRunCursor>>;
    /** Latest pending admission, bounding one finite recovery scan cycle. */
    readonly pendingRunTail: (flowName: string, eligibleBeforeMs?: number | undefined) => Effect.Effect<Option.Option<PendingRunCursor>>;
    /** Pending cancellation requests in bounded creation order; limit is zero or a positive safe integer. */
    readonly pendingCancellationRuns: (limit: number, after?: PendingRunCursor | undefined, through?: PendingRunCursor | undefined) => Effect.Effect<ReadonlyArray<PendingRunCursor>>;
    /** Latest pending cancellation, bounding one finite cleanup scan cycle. */
    readonly pendingCancellationTail: () => Effect.Effect<Option.Option<PendingRunCursor>>;
    /**
     * Lists the runs whose row is `running` with a heartbeat strictly older
     * than `staleBeforeMs`, each with that heartbeat — an owner that stopped heartbeating without
     * releasing the run (SIGKILL, OOM, power loss). Nothing else ever
     * revisits such a run: it has no waiting row for the parked-run sweep,
     * no pending clock, and no future deferred completion. A periodic
     * sweeper re-drives these through the ordinary claim/steal path — the
     * analog of Temporal's task-timeout re-dispatch (issue #53).
     *
     * `limit` caps one enumeration (issue #79): the rows come back oldest
     * heartbeat first, so a capped sweep drains a mass owner death across
     * ticks instead of waking every stale run in every driver every tick.
     */
    readonly staleRunningRuns: (staleBeforeMs: number, limit?: number | undefined) => Effect.Effect<ReadonlyArray<StaleRunningRow>>;
    /**
     * The surviving attempt rows for an action key, in one range read: the
     * earliest surviving row's start time (the durable retry origin when
     * attempt 1 itself was pruned, issue #69) and the highest attempt number
     * contiguous from it (the resumed attempt counter, issue #59).
     * `Option.none()` means no attempt row survives.
     *
     * Optional because only storage that can range-scan `flows_attempts`
     * implements it; when absent the engine store falls back to per-attempt
     * point reads against `AttemptStore` (issue #77).
     */
    readonly attemptSurvivors?: ((runId: string, stepKeyDigest: string) => Effect.Effect<Option.Option<AttemptSurvivors>>) | undefined;
    /**
     * Durably records a parent edge in the run DAG, first-writer-wins per
     * `(child, parent)` pair.
     *
     * The cycle check happens inside the same transaction as the insert: the
     * edge is inserted, the child's ancestor chain is walked over the durable
     * edges, and on a hit the transaction rolls back and the call fails with
     * `RunParentCycleError`. There is no window between insert and check, no
     * arbitration, and no withdrawal protocol — concurrent writers that
     * jointly close a cycle serialize on the write transaction and exactly
     * one of them fails (issues #29/#40/#54/#55/#56).
     */
    readonly recordRunParent: (childId: string, parentId: string) => Effect.Effect<RecordRunParentOutcome, RunParentCycleError>;
    /**
     * Removes every parent edge touching a run — both the edges naming it as
     * child and the edges naming it as parent. The cleanup half of run
     * deletion (issue #66): a lane that deletes run rows (time-travel,
     * retention) must call this so `runParents` and the cycle walk stop
     * seeing edges of runs that no longer exist.
     */
    readonly removeRunParentsForRun: (runId: string) => Effect.Effect<void>;
    /**
     * Lists the durably recorded parent edges of a run, oldest first.
     */
    readonly runParents: (childId: string) => Effect.Effect<ReadonlyArray<RunParentEdge>>;
    /**
     * Lists the durably recorded child edges of a run, oldest first.
     *
     * The reverse direction of `runParents`, and the only instance-independent
     * way to find the runs a cancelled parent linked to itself. Cancellation
     * cascade reads it rather than an in-process instance map, so a
     * cross-process cancel observed by a driver that never spawned the children
     * still reaches them (`docs/concepts/durable-waits.md`, "The run DAG").
     * Served by the
     * `flows_run_parents_parent_idx` index.
     */
    readonly runChildren: (parentId: string) => Effect.Effect<ReadonlyArray<RunParentEdge>>;
    /**
     * Runs `effect` inside one storage write transaction, so a caller can make
     * several store operations atomic — the run driver wraps the parent-edge
     * record and the run-row creation it guards, closing the crash window that
     * left a durable orphan edge for a run that was never created (issue #80).
     * Nested store writes become savepoints of this transaction. Storage
     * failures are defects, matching the store methods' own posture.
     *
     * The in-memory twin honors the same contract: it serializes every store
     * operation behind one permit, snapshots its state maps on entry, restores
     * them when the effect fails or dies, and treats a nested call on the same
     * fiber as a savepoint of the outer one. What it cannot offer is
     * durability: a process crash mid-transaction loses the whole state, not
     * only the uncommitted part.
     *
     * **Lock order.** A caller that needs this transaction AND the journal's
     * write transaction opens this one OUTSIDE. The SQL implementation cannot
     * tell the difference, because both are the same `DurableWriter`
     * transaction and either nests as a savepoint of the other; the memory twin
     * has a permit of its own, and a fiber that holds the journal's writer
     * while waiting for that permit deadlocks against a fiber doing the
     * opposite. Interruption is not a way out of that cycle: both boundaries
     * are acquired at the caller's own interruptibility, so a settlement that
     * masked interruption to finish its write keeps waiting. The same
     * rule applies to every single operation above, each of which takes the
     * permit for itself: inside an open journal transaction, call them only
     * under an enclosing `transaction` on the same fiber.
     */
    readonly transaction: <A, E, R>(effect: Effect.Effect<A, E, R>, options?: {
        /**
         * Receives an idempotent memory commit effect. A coordinating durable
         * transaction may run it after COMMIT, before publishing or capturing
         * state. This accepts the snapshot and releases its gate; subsequent
         * publication failures cannot restore the old snapshot. Without an
         * external boundary, returning successfully commits as usual. SQL owns
         * its commit boundary and does not need this callback.
         */
        readonly onCommit: (commit: Effect.Effect<void>) => void;
    }) => Effect.Effect<A, E, R>;
}
declare const DurableEngineState_base: Context.ServiceClass<DurableEngineState, "@smthrs/engine-store/DurableEngineState", Service>;
/**
 * Service tag for durable deferred completions and absolute clock deadlines.
 *
 * @since 0.1.0
 * @category services
 */
export declare class DurableEngineState extends DurableEngineState_base {
}
/**
 * How far {@link Service.waitingTree} walks: detached subtrees are skipped
 * unless `detached` is `"include"`.
 *
 * @since 1.0.0
 * @category models
 */
export interface WaitingTreeOptions {
    readonly detached?: "skip" | "include" | undefined;
}
/**
 * The deepest nesting {@link Service.waitingTree} walks.
 *
 * A run tree is authored, not generated: `agent/run` → `coding/request` →
 * `coding/Request` → `coding/PrepareWithWiki` → `coding/PreparePlan` is five,
 * and the deepest composition in this repository is well inside this. The cap
 * exists so a tree whose edges were corrupted outside the engine costs a
 * bounded read rather than the whole table.
 *
 * @since 1.0.0
 * @category constants
 */
export declare const waitingTreeMaxDepth = 64;
/**
 * Constructs the database-backed durable-state implementation.
 *
 * Clock creation is fenced against the current run owner. Deferred completion
 * and clock firing are external trigger admissions protected by first-writer
 * and compare-and-set semantics; execution remains claim-gated by `RunStore`.
 *
 * @since 0.1.0
 * @category constructors
 */
export declare const make: Effect.Effect<Service, never, DurableWriter | SqlClient.SqlClient>;
/**
 * Provides database-backed durable engine state.
 *
 * @since 0.1.0
 * @category layers
 */
export declare const layer: Layer.Layer<DurableEngineState, never, DurableWriter | SqlClient.SqlClient>;
/**
 * A run's ownership view as the in-memory implementation needs it for the
 * same fences the SQL implementation reads from `flows_runs`.
 *
 * @since 0.1.0
 * @category models
 */
export interface MemoryRunView {
    readonly flowName?: string | undefined;
    readonly createdAtMs?: number | undefined;
    readonly status: "pending" | "running" | "suspended" | "completed" | "failed" | "cancelled";
    readonly owner: OwnerId | null;
    /**
     * The run's last heartbeat instant, mirroring `flows_runs.heartbeat_at_ms`.
     * `undefined` means unknown — such a run never surfaces from
     * `staleRunningRuns` (issue #53).
     */
    readonly heartbeatAtMs?: number | null | undefined;
    /**
     * The run's durable cancel request, mirroring
     * `flows_runs.cancel_requested_at_ms`. `undefined`/`null` means not
     * requested — such a run never surfaces from a
     * `waitingRuns({ cancelRequested: true })` query (issue #68).
     */
    readonly cancelRequestedAtMs?: number | null | undefined;
    /**
     * What this run does when the run that spawned it ends, mirroring
     * `RunState.onParentExit`. `undefined` reads as `cancel`, the default and
     * the shape a `.child()` boundary takes, so a view that does not record it
     * describes an attached child.
     */
    readonly onParentExit?: OnParentExit | undefined;
}
/**
 * Options for the in-memory durable-state implementation.
 *
 * @since 0.1.0
 * @category models
 */
export interface MemoryOptions {
    /**
     * Resolves a run's existence, status, and owner — the in-memory analogue
     * of the `flows_runs` lookups the SQL implementation performs for its
     * `park`/`wake`/`scheduleClock` fences. `Option.none()` means the run does
     * not exist. When omitted, every run is treated as running and owned by
     * whichever owner is presented (a deliberately permissive default for tests
     * that exercise only deferred/clock state without a run table).
     */
    readonly runs?: (runId: string) => Option.Option<MemoryRunView>;
    /**
     * Enumerates every known run — the in-memory analogue of scanning
     * `flows_runs`, which `staleRunningRuns` needs (the `runs` lookup alone
     * cannot enumerate). When omitted, `staleRunningRuns` reports no stale
     * rows.
     */
    readonly listRuns?: () => Iterable<readonly [string, MemoryRunView]>;
}
/**
 * Constructs a deterministic in-memory durable-state implementation.
 *
 * The returned service can be shared by multiple fresh engine instances in a
 * test to model process restart over the same storage. With `runs` supplied
 * it enforces the same ownership fences as the SQL implementation and is
 * held to the same contract suite
 * (`test/contract/DurableEngineStateContract.ts`).
 *
 * @since 0.1.0
 * @category constructors
 */
export declare const makeMemory: (options?: MemoryOptions) => Service;
/**
 * Provides deterministic in-memory durable engine state.
 *
 * @since 0.1.0
 * @category layers
 */
export declare const layerMemory: Layer.Layer<DurableEngineState>;
export {};
