/**
 * The stable wire rows the gateway serves for each projection, and the pure
 * folds that compute them from control-plane facts.
 *
 * These rows are the whole read contract. Nothing here exposes a store row, a
 * database column, or an engine type: every field is either a
 * `@smthrs/control` projection value or something folded out of the ordered
 * `ControlEvent` deltas `Control.watch` publishes. Wire names are the flows
 * names (`flowId`, `createdAt`, and the `ApprovalTarget.Node` envelope), so a
 * client written against the control plane reads these rows without a
 * translation table.
 *
 * @since 1.0.0
 */
import { ControlSchema, Health } from "@smthrs/control";
import { Schema } from "effect";
import * as Diagnosis from "./Diagnosis.ts";
/**
 * One run, everything a run card displays, and the diagnosis of what happened
 * to it.
 *
 * `flowId` carries what the old wire split across `run.workflowKey` and
 * `run.workflow`, and `createdAt` carries `run.createdAtMs`: one flows name
 * each, rather than two spellings of one fact.
 *
 * @since 1.0.0
 * @category models
 */
export declare const RunSummaryRow: Schema.Struct<{
    readonly runId: Schema.String;
    readonly flowId: Schema.String;
    readonly statusRollup: Schema.optional<Schema.Struct<{
        readonly subjectId: Schema.String;
        readonly state: Schema.Literals<readonly ["accepted", "running", "parked", "waiting-approval", "completed", "failed", "cancelled", "spawning", "exited"]>;
        readonly activity: Schema.Literals<readonly ["working", "idle", "needs-input", "unknown"]>;
        readonly health: Schema.Literals<readonly ["healthy", "stalled", "wedged-node", "runaway-loop", "awaiting-human", "failing", "unknown"]>;
        readonly attention: Schema.Literals<readonly ["none", "awaiting-approval", "needs-input", "needs-resume", "unhealthy"]>;
        readonly freshness: Schema.Literals<readonly ["fresh", "stale", "unobserved"]>;
        readonly reason: Schema.optional<Schema.Literals<readonly ["ok", "no-progress", "awaiting-reply", "prompt-detected", "quota-wait", "timer-wait", "event-wait", "released", "unreachable", "probe-timeout", "probe-error", "owner-changed"]>>;
        readonly provenance: Schema.optional<Schema.Struct<{
            readonly checkerId: Schema.String;
            readonly monitorId: Schema.String;
            readonly observedAt: Schema.Int;
            readonly expiresAt: Schema.Int;
            readonly evidenceSeq: Schema.Int;
            readonly incarnation: Schema.String;
            readonly version: Schema.Int;
        }>>;
        readonly updatedAt: Schema.Int;
    }>>;
    readonly status: Schema.Literals<readonly ["accepted", "running", "parked", "waiting-approval", "cancelled", "completed", "failed"]>;
    readonly lifecycleProvenance: Schema.optional<Schema.Struct<{
        readonly control: Schema.Literals<readonly ["events", "legacy-snapshot", "unverified-snapshot"]>;
        readonly execution: Schema.Literals<readonly ["control", "engine-observed", "engine-missing"]>;
        readonly baseline: Schema.optional<Schema.Literals<readonly ["created", "legacy"]>>;
        readonly fromSequence: Schema.optional<Schema.Number>;
        readonly throughSequence: Schema.optional<Schema.Number>;
    }>>;
    readonly executionProvenance: Schema.optional<Schema.Struct<{
        readonly source: Schema.Literals<readonly ["events", "legacy-observation", "unverified-observation"]>;
        readonly rootExecutionId: Schema.String;
        readonly humanWaits: Schema.optional<Schema.Literals<readonly ["events", "legacy-observation", "unverified-observation"]>>;
        readonly humanWaitSources: Schema.optional<Schema.$Array<Schema.Struct<{
            readonly executionId: Schema.String;
            readonly generation: Schema.Number;
            readonly baseline: Schema.Literals<readonly ["created", "legacy"]>;
            readonly fromSequence: Schema.Number;
            readonly throughSequence: Schema.Number;
        }>>>;
        readonly currentExecutionId: Schema.optional<Schema.String>;
        readonly generation: Schema.optional<Schema.Number>;
        readonly baseline: Schema.optional<Schema.Literals<readonly ["created", "legacy"]>>;
        readonly fromSequence: Schema.optional<Schema.Number>;
        readonly throughSequence: Schema.optional<Schema.Number>;
    }>>;
    readonly createdAt: Schema.Number;
    readonly updatedAt: Schema.Number;
    readonly planId: Schema.optional<Schema.String>;
    readonly planDigest: Schema.optional<Schema.String>;
    readonly parentRunId: Schema.optional<Schema.String>;
    readonly lineageId: Schema.optional<Schema.String>;
    readonly roundOrdinal: Schema.optional<Schema.Number>;
    readonly waitingReason: Schema.optional<Schema.String>;
    readonly steeringPending: Schema.optional<Schema.Number>;
    readonly cancellation: Schema.optional<Schema.Struct<{
        readonly requestedAt: Schema.Number;
        readonly source: Schema.Literals<readonly ["control", "engine", "cascade"]>;
        readonly principal: Schema.optional<Schema.Struct<{
            readonly id: Schema.String;
            readonly kind: Schema.String;
            readonly stampedAt: Schema.Number;
        }>>;
        readonly reason: Schema.optional<Schema.String>;
        readonly cascadedFrom: Schema.optional<Schema.String>;
    }>>;
    /** When the run's approved deadline passes; absent for a run with none. */
    readonly deadlineAt: Schema.optional<Schema.Number>;
    /** The model seat the run's last opened turn ran on. */
    readonly seat: Schema.optional<Schema.String>;
    readonly turns: Schema.Number;
    readonly calls: Schema.Number;
    readonly callsFailed: Schema.Number;
    readonly editsAttempted: Schema.Number;
    readonly editsSucceeded: Schema.Number;
    readonly inputTokens: Schema.Number;
    readonly outputTokens: Schema.Number;
    /**
     * One line: the run row's status plus the reason that most explains it.
     *
     * Lifecycle provenance distinguishes a covered control fact from a legacy
     * snapshot or a separate engine observation. Missing facts never silently
     * replace a newer observed state with the last recorded status.
     */
    readonly verdict: Schema.String;
    /** The whole diagnosis card, which the old wire called `whatHappened`. */
    readonly diagnosis: Schema.String;
    readonly finalOutput: Schema.optional<Schema.String>;
    /** The failed run's fault class and `<_tag>/<code>`, stamped when it failed. */
    readonly failureFault: Schema.optional<Schema.Literals<readonly ["user", "wait", "infra", "dependency", "bug", "factory", "policy"]>>;
    readonly failureMessage: Schema.optional<Schema.String>;
    readonly failureTag: Schema.optional<Schema.String>;
}>;
/**
 * One run, everything a run card displays, and its diagnosis.
 *
 * @since 1.0.0
 * @category models
 */
export type RunSummaryRow = typeof RunSummaryRow.Type;
/**
 * One node of a run, as a tree view renders it.
 *
 * `label` carries what the old wire called `node.cardLabel`, and `seat`
 * carries `node.agent`: the model seat is the flows name for who ran a node.
 *
 * `nodeId` is the ordinal the call opened on, because the emitter names no
 * node. {@link runTree} says why.
 *
 * @since 1.0.0
 * @category models
 */
export declare const RunTreeRow: Schema.Struct<{
    readonly runId: Schema.String;
    readonly nodeId: Schema.String;
    readonly label: Schema.String;
    readonly status: Schema.Literals<readonly ["running", "completed", "failed"]>;
    readonly seat: Schema.optional<Schema.String>;
    readonly startedAt: Schema.Number;
    readonly endedAt: Schema.optional<Schema.Number>;
    readonly parentRunId: Schema.optional<Schema.String>;
}>;
/**
 * One node of a run, as a tree view renders it.
 *
 * @since 1.0.0
 * @category models
 */
export type RunTreeRow = typeof RunTreeRow.Type;
/**
 * One approval a run is parked on, carrying the exact payload that decides it.
 *
 * `title` carries the old `approval.requestTitle` and `request` the old
 * `approval.request`; `payload` is the `ApprovalTarget.Node` envelope a client
 * submits back unchanged, so no client reconstructs authority.
 *
 * @since 1.0.0
 * @category models
 */
export declare const ApprovalRow: Schema.Struct<{
    readonly runId: Schema.String;
    /**
     * The execution holding the wait, when this gate is a question a person owes
     * an answer to and it is held below `runId`.
     *
     * `runId` is the run a person opened and the run a decision is addressed to;
     * a `HumanTask` in a nested flow parks its own execution, and the two are
     * different runs. Present only on such a gate, so a reader can tell a
     * question rolled up from a tree from one the named run raised itself, and
     * an inbox can list one question once however many ancestors carry it.
     */
    readonly waitRunId: Schema.optional<Schema.String>;
    readonly questionProvenance: Schema.optional<Schema.Literals<readonly ["events", "legacy-observation", "unverified-observation"]>>;
    readonly requestId: Schema.String;
    readonly title: Schema.String;
    readonly request: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly payload: Schema.Struct<{
        readonly target: Schema.Union<readonly [Schema.TaggedStruct<"Plan", {
            readonly planId: Schema.String;
            readonly digest: Schema.String;
            readonly envelope: Schema.Struct<{
                readonly capabilities: Schema.$Array<Schema.String>;
                readonly hostImports: Schema.optional<Schema.$Array<Schema.String>>;
                readonly flows: Schema.$Array<Schema.String>;
                readonly budget: Schema.Struct<{
                    readonly tokens: Schema.optional<Schema.Number>;
                    readonly milliseconds: Schema.optional<Schema.Number>;
                    readonly usd: Schema.optional<Schema.Number>;
                    readonly onExceeded: Schema.optional<Schema.Literals<readonly ["fail", "warn", "skip-remaining", "park"]>>;
                    readonly deadline: Schema.optional<Schema.Int>;
                }>;
                readonly host: Schema.optional<Schema.String>;
            }>;
        }>, Schema.TaggedStruct<"Node", {
            readonly runId: Schema.String;
            readonly requestId: Schema.String;
            readonly digest: Schema.String;
            readonly envelope: Schema.Struct<{
                readonly capabilities: Schema.$Array<Schema.String>;
                readonly hostImports: Schema.optional<Schema.$Array<Schema.String>>;
                readonly flows: Schema.$Array<Schema.String>;
                readonly budget: Schema.Struct<{
                    readonly tokens: Schema.optional<Schema.Number>;
                    readonly milliseconds: Schema.optional<Schema.Number>;
                    readonly usd: Schema.optional<Schema.Number>;
                    readonly onExceeded: Schema.optional<Schema.Literals<readonly ["fail", "warn", "skip-remaining", "park"]>>;
                    readonly deadline: Schema.optional<Schema.Int>;
                }>;
                readonly host: Schema.optional<Schema.String>;
            }>;
        }>]>;
        readonly scope: Schema.Literals<readonly ["once", "run", "remembered"]>;
        readonly idempotencyKey: Schema.String;
    }>;
    readonly requestedAt: Schema.Number;
    readonly status: Schema.Literals<readonly ["pending", "approved", "denied"]>;
}>;
/**
 * One approval a run is parked on.
 *
 * @since 1.0.0
 * @category models
 */
export type ApprovalRow = typeof ApprovalRow.Type;
/**
 * The output one node produced.
 *
 * @since 1.0.0
 * @category models
 */
export declare const NodeOutputRow: Schema.Struct<{
    readonly runId: Schema.String;
    readonly nodeId: Schema.String;
    readonly outcome: Schema.Literals<readonly ["success", "failure"]>;
    readonly output: Schema.String;
    readonly settledAt: Schema.Number;
}>;
/**
 * The output one node produced.
 *
 * @since 1.0.0
 * @category models
 */
export type NodeOutputRow = typeof NodeOutputRow.Type;
/**
 * How long one flow's nodes take, per action tag.
 *
 * `samples` is the number of measured executions behind the two percentiles,
 * and it is on the wire because a percentile over one sample and a percentile
 * over twenty are different claims. A tag with no measured execution has no
 * row at all: there is no shape here for an unmeasured prediction.
 *
 * @since 1.0.0
 * @category models
 */
export declare const FlowDurationRow: Schema.Struct<{
    readonly flowId: Schema.String;
    readonly actionTag: Schema.String;
    readonly samples: Schema.Number;
    readonly p50Ms: Schema.Number;
    readonly p90Ms: Schema.Number;
}>;
/**
 * How long one flow's nodes take, per action tag.
 *
 * @since 1.0.0
 * @category models
 */
export type FlowDurationRow = typeof FlowDurationRow.Type;
/**
 * One measured execution of one node, as a duration fold's sample.
 *
 * The action tag is the only part of a node's key material that survives a
 * re-key, which is why history is grouped by it rather than by node id or by
 * dispatch key.
 *
 * @since 1.0.0
 * @category models
 */
export interface NodeDuration {
    readonly actionTag: string;
    readonly durationMs: number;
}
/**
 * One line of a run's turn-by-turn transcript.
 *
 * @since 1.0.0
 * @category models
 */
export declare const TranscriptRow: Schema.Struct<{
    readonly runId: Schema.String;
    readonly sequence: Schema.Number;
    readonly turn: Schema.Number;
    readonly at: Schema.Number;
    readonly kind: Schema.String;
    /** Dispatch identity on current call records; absent on legacy history. */
    readonly callId: Schema.optional<Schema.String>;
    readonly text: Schema.String;
}>;
/**
 * One line of a run's turn-by-turn transcript.
 *
 * @since 1.0.0
 * @category models
 */
export type TranscriptRow = typeof TranscriptRow.Type;
/**
 * Folds one run's summary and events into the served `run-summary` row.
 *
 * @param run the control-plane run summary
 * @param events that run's ordered control events
 * @param now the instant the row is rendered at
 * @param carry the digest of the events a bounded reader dropped before them
 * @since 1.0.0
 * @category projections
 */
export declare const runSummary: (run: ControlSchema.RunSummary, events: ReadonlyArray<ControlSchema.ControlEvent>, now?: number, carry?: Diagnosis.Digest | undefined) => RunSummaryRow;
/**
 * Folds one run's events into its node rows.
 *
 * A node opens on `control.agent.cell-call-started` and settles on the
 * matching `control.agent.cell-call-settled`.
 *
 * AgentSession journals the same `callId` from the harness's dispatch identity
 * on both records. Settlements join on it even when same-name calls overlap
 * and finish out of order. The distinct-start ordinal remains the published
 * `call-N` node key, preserving existing node links. Legacy records without
 * callId retain same-name FIFO pairing, restricted to other legacy records
 * (including a newly identified settlement of an old parked call).
 *
 * The durable engine's own `flows.engine.*` records are not folded here, but
 * that is a choice rather than a limit. A host keeps the control plane and the
 * engine in two databases with two journals (`@smthrs/cli`
 * `NodeControl.databasePath` and `executionDatabasePath`), and
 * `EngineJournalProjection` copies every engine entry of the run into the
 * control journal as a `control.engine.event` envelope, which is how
 * {@link nodeDurations} reads the node records. A tree row is an agent cell
 * call, so what an engine step did reaches this projection as the call that
 * made it.
 *
 * A node that never settled stays `running`, which is how a live tree renders
 * work in flight.
 *
 * @param run the control-plane run summary
 * @param events that run's ordered control events
 * @since 1.0.0
 * @category projections
 */
export declare const runTree: (run: ControlSchema.RunSummary, events: ReadonlyArray<ControlSchema.ControlEvent>) => ReadonlyArray<RunTreeRow>;
/**
 * Folds one run's events into its approval rows.
 *
 * A request opens a pending row carrying the submit-ready payload; the
 * matching `control.approval.approved` or `control.approval.denied` closes it
 * without discarding the request, so a decided gate stays readable.
 *
 * A `HumanTask` declares its question on the parked row. Native execution
 * facts carry the redacted question and token digest; verified facts supply
 * its display metadata here. `@smthrs/control` rolls current open waits onto
 * the root as `pendingWaits`, which supply each row's protected wake address.
 * History alone cannot create an answerable human wait. Older observations
 * remain visible with explicit question provenance when native fact coverage
 * is unavailable. These rows come first because they still need an answer.
 *
 * A decision names the gate it closed by `tokenId`. `@smthrs/control`
 * `SqlControlRuntime.lookupApproval` mints that token id from the target, and
 * for the `Node` target a run parks on it is the request id itself, so the two
 * records join on one field. A decision whose `tokenId` or `requestId` names
 * no row is retained for an exact later request. Only a legacy decision that
 * names neither field closes the oldest pending legacy row in that run.
 * Current facts bind the target digest; duplicates cannot reopen a decision.
 *
 * @param events the run's ordered control events
 * @since 1.0.0
 * @category projections
 */
export declare const approvals: (events: ReadonlyArray<ControlSchema.ControlEvent>, run?: ControlSchema.RunSummary | undefined) => ReadonlyArray<ApprovalRow>;
/**
 * Folds one run's events into its node outputs, keyed the way {@link runTree}
 * keys its rows: by the ordinal the call opened on.
 *
 * A settled call carries the value it produced, so the row carries that value.
 * A run's own result reaches a client as `RunSummaryRow.finalOutput` instead.
 *
 * @param events the run's ordered control events
 * @since 1.0.0
 * @category projections
 */
export declare const nodeOutput: (events: ReadonlyArray<ControlSchema.ControlEvent>) => ReadonlyArray<NodeOutputRow>;
/**
 * Folds one run's events into the executions it measured.
 *
 * A node's work starts when the engine recorded it scheduled and ends when it
 * recorded it settled, so a duration is the distance between those two native
 * stamps. Four of the five outcomes contribute nothing: `clean` was served
 * from records rather than run, `failed` measures a collapse, `skipped` was
 * never reached, and `deferred` is scheduling debt. Only `built` ran.
 *
 * A settlement pairs with the LAST schedule of the same execution and node,
 * which is what makes a retried node measure its final attempt rather than
 * the span across every attempt. Two executions of one node id stay apart
 * because the pairing key carries the execution, and a settlement no schedule
 * opened measures nothing rather than measuring from zero.
 *
 * A record that names no action tag contributes nothing either: history is
 * grouped by tag, and a sample with no tag has nowhere honest to go.
 *
 * A called flow is measured once. The engine records one call twice: the
 * caller admits and settles the node that made it, and the callee's own
 * execution admits and settles its `root` over the same span with the same
 * action tag. {@link echoedRoot} drops the callee's copy, so one invocation
 * is one sample rather than two, and `samples` stays the count of executions
 * the flow performed.
 *
 * @param events the run's ordered control events
 * @param carry the digest of the events a bounded window dropped, when it dropped any
 * @since 1.0.0
 * @category projections
 */
export declare const nodeDurations: (events: ReadonlyArray<ControlSchema.ControlEvent>, carry?: Diagnosis.Digest | undefined) => ReadonlyArray<NodeDuration>;
/**
 * Folds every measured execution of one flow into one row per action tag.
 *
 * Both percentiles are nearest-rank, so each answer is a duration the flow
 * really took rather than an interpolation between two it did not. Rows are
 * ordered by tag, so two reads of the same history answer in the same order.
 *
 * A tag reaches this function only by having been measured, so every row
 * carries at least one sample, and a flow nothing has measured answers with
 * no rows at all.
 *
 * @param flowId the flow whose history was read
 * @param samples every measured execution of that flow's runs
 * @since 1.0.0
 * @category projections
 */
export declare const flowDurations: (flowId: string, samples: ReadonlyArray<NodeDuration>) => ReadonlyArray<FlowDurationRow>;
/**
 * Folds one run's events into a turn-numbered transcript.
 *
 * A row is reported for every `control.run.*` and `control.agent.*` event and
 * for an approval request, and for nothing else: the transcript is what a
 * reader follows, not the whole journal, which `run-events` already serves.
 * The turn counter advances on `control.agent.turn-opened`, so every row
 * carries the turn it belongs to, and each row's text is one display line, so
 * a multi-line seat, message, or question cannot split one row into several.
 *
 * `uniqueCallEvents` normalizes native step facts, so a module run's steps
 * report here too. The classes `Diagnosis` names apply, field by field:
 *
 * | Field  | Class     | Why                                                       |
 * | ------ | --------- | --------------------------------------------------------- |
 * | rows   | aggregate | every row is one event this run recorded, wherever it ran |
 * | `turn` | aggregate | a turn a step opened is a turn this run opened            |
 *
 * No row is root only, because no row claims to be the run's answer or state:
 * a `control.agent.resolved` row says one agent resolved, and the run's own
 * answer is served by `runSummary` from `Diagnosis`. A new field has to name
 * its class.
 *
 * @param events the run's ordered control events
 * @since 1.0.0
 * @category projections
 */
export declare const transcript: (events: ReadonlyArray<ControlSchema.ControlEvent>) => ReadonlyArray<TranscriptRow>;
/** Fold health from the same authoritative summary and committed event buffer as the run card.
 * Invalid observations and foreign incarnations cannot color the current owner.
 * @category projections
 * @since 1.0.0
 */
export declare const statusRollup: (run: ControlSchema.RunSummary, events: ReadonlyArray<ControlSchema.ControlEvent>, now: number) => Health.StatusRollup;
