/**
 * What a run may spend across its model calls, and what happens when it has
 * spent it.
 *
 * Two ceilings already existed and neither is this one. `Sandbox.Limits` bounds
 * one cell's own execution, and `Agent.Options.maxFrames` bounds one loop's
 * turns. Both are per call. Nothing accumulated what a run had spent across its
 * steps, so `Envelope.budget` — the tokens, dollars and milliseconds a control plane
 * APPROVED for a plan — bound nothing at all: a plan could be admitted for a
 * thousand tokens and spend a million.
 *
 * Old smithers spelled this `<Aspects tokenBudget latencySlo>` and enforced it
 * at dispatch, from usage accumulated over the run. This is the same rule at
 * the same place: the enforcement point is the model boundary in
 * {@link module:FlowEngineLike}, which every model call in the composition
 * passes through, so a budget cannot be evaded by a step that assembles its own
 * loop.
 *
 * Its accounting and admission rules are:
 *
 * - **The accumulator is per run, keyed by the model step's content key, and
 *   projected from the journal.** Every call writes a {@link usageEvent}
 *   record and the run's first question writes a {@link budgetStartedEvent}
 *   record on the journal's DURABLE channel. A skip-remaining refusal writes a
 *   {@link budgetLatchedEvent} record there too. A budget entering a run folds
 *   all three back before it decides anything. This is what makes a budget survive
 *   a restart: the engine resumes a run from its recorded NODE results and
 *   never re-enters a settled step's body, so memory-only usage would hand a
 *   resumed run a second token allowance and a memory-only clock would re-arm
 *   its latency allowance. Keying by the content key is the other half: a
 *   replayed call and its own recovered record are the same key, so it counts
 *   once. Keying the accumulator itself by execution id is the third: one
 *   layer built at composition level serves every run the engine drives, and a
 *   single shared tally would spend run A's tokens out of run B's allowance.
 * - **The accounting fails closed.** A budget whose record could not be
 *   written, whose ledger could not be read or decoded, or whose ledger is
 *   longer than one recovery reads raises {@link AccountingUnavailable}
 *   instead of answering. Every one of those is a run that would come back
 *   from a restart with an allowance it has already spent, and the difference
 *   between a budget and a decoration is that it refuses rather than guesses.
 *   Only the {@link budgetWarningEvent} record is allowed to be lost: nothing
 *   reads it back, so losing one costs a line in an operator view and no
 *   decision.
 * - **Admission reserves a soft forecast.** Before dispatch, `reserve` counts
 *   actual spend plus all in-flight estimates, using the largest observed
 *   call. Before a positive cost is known, one call holds the whole allowance.
 *   Zero refuses new calls unless `warn` explicitly permits them. Scope exit
 *   releases reservations; recorded usage replaces the estimate. `check` only
 *   previews admission and must not be used as a concurrency guard.
 * - **An evaluator reading is refused only by a spent ceiling.** A judge or
 *   monitor reading is small next to the primary call a forecast projects, so
 *   `admitReading` projects nothing: it refuses only once the run's ceiling is
 *   already spent (or latched), under the same `onExceeded` policy (#3010).
 *
 * A forecast is not a provider billing cap: admitted calls may cost more than
 * estimated, including the first call. One shared Budget instance coordinates
 * concurrent calls of each run; independent instances are not a distributed
 * quota service. Durable execution ownership must prevent multiple hosts from
 * dispatching the same run concurrently.
 *
 * - **A USD ceiling charges each call its price.** `usd` admits calls the same
 *   way `tokens` does, in dollars: each call costs its {@link Pricing.cost}, the
 *   provider's reported charge or its usage at the rate card. A call whose
 *   model has no price leaves the run's spend unknown, so admission under a USD
 *   ceiling then fails closed rather than counting it as free.
 *
 * `onExceeded` is the composition's choice of what that means: `fail` reports a
 * typed {@link BudgetExceeded}, `warn` journals and proceeds,
 * `skip-remaining` latches, so every later call in the run is refused without
 * asking a provider anything, and `park` refuses the call without latching so
 * the host can suspend the run until an operator approves a raised ceiling
 * ({@link raise}, {@link raisedBy}).
 *
 * @since 0.1.0
 */
import type * as ControlSchema from "@smthrs/control/ControlSchema";
import { FlowRuntime } from "@smthrs/flow";
import type * as RetryPolicy from "@smthrs/flow/RetryPolicy";
import type * as HarnessError from "@smthrs/harness/HarnessError";
import type * as ModelEvent from "@smthrs/model/ModelEvent";
import * as Pricing from "@smthrs/model/Pricing";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import type * as RunawayGuard from "./RunawayGuard.ts";
/**
 * What a composition wants done when a budget runs out.
 *
 * @category models
 * @since 0.1.0
 */
export declare const OnExceeded: Schema.Literals<readonly ["fail", "warn", "skip-remaining", "park"]>;
/**
 * What a composition wants done when a budget runs out.
 *
 * @category models
 * @since 0.1.0
 */
export type OnExceeded = typeof OnExceeded.Type;
/**
 * The soft token admission ceiling for one run, and what exceeding it means.
 * Actual provider charges can exceed their pre-dispatch forecasts.
 *
 * @category models
 * @since 0.1.0
 */
export interface TokenBudget {
    /** Non-negative safe integer; omit the whole token policy for no ceiling. */
    readonly max: number;
    readonly onExceeded?: OnExceeded | undefined;
}
/**
 * The active-time ceiling for one run, and what exceeding it means.
 *
 * It bounds when a call may START, not how long one may take: a call already
 * in flight is the provider's clock, and cutting it off is
 * `Agent.Options.modelCallMs`, which exists and is a different budget.
 * Its zero is the run's first budget question and is durable, so a park or
 * process restart does not grant the run the whole interval again. Time the
 * run spends suspended, waiting on an approval, a question, or a budget raise,
 * is not active time: {@link Service.suspend} and {@link Service.resume}
 * record those spans durably and the ceiling subtracts them (#2120).
 *
 * @category models
 * @since 0.1.0
 */
export interface LatencyBudget {
    /** Finite, non-negative milliseconds; fractional durations are allowed. */
    readonly maxMillis: number;
    readonly onExceeded?: OnExceeded | undefined;
}
/**
 * The soft USD admission ceiling for one run, and what exceeding it means.
 *
 * Each call is charged its {@link Pricing.cost} under {@link Policy.prices}
 * over the rate card; a forecast is the largest call so far, as for
 * {@link TokenBudget}. A recorded call with no price makes the run's spend
 * unknown, and admission then fails with {@link AccountingUnavailable}; price
 * such a model with a {@link Policy.prices} row. `park` asks for a raised
 * `Envelope.budget.usd`, as a token ceiling asks for raised `tokens`.
 *
 * @category models
 * @since 1.0.0-rc.1
 */
export interface UsdBudget {
    /** Finite, non-negative dollars. */
    readonly max: number;
    readonly onExceeded?: OnExceeded | undefined;
}
/**
 * Relative charges for uncached input, cache-read, cache-write and output
 * tokens: the shape of a {@link Pricing.Rates} row.
 * @category schemas
 * @since 0.1.0
 */
export declare const TokenWeights: Schema.Struct<{
    readonly input: Schema.Finite;
    readonly cacheRead: Schema.Finite;
    readonly cacheWrite: Schema.Finite;
    readonly output: Schema.Finite;
}>;
/** Per-model token charges keyed by canonical model ID.
 * @category models
 * @since 0.1.0
 */
export type Weights = Readonly<Record<string, typeof TokenWeights.Type>>;
/**
 * Everything one composition declares about spending.
 *
 * An empty policy is a real policy: it accumulates usage and refuses nothing,
 * which is what a run wants when the numbers are for reporting.
 *
 * @category models
 * @since 0.1.0
 */
export interface Policy {
    readonly weights?: Weights | undefined;
    /**
     * USD rate rows over {@link Pricing.table}, keyed by model id or seat. They
     * price the `costUsd` of each usage record; they never change the token ceiling.
     */
    readonly prices?: Readonly<Record<string, Pricing.Rates>> | undefined;
    readonly tokens?: TokenBudget | undefined;
    readonly usd?: UsdBudget | undefined;
    readonly latency?: LatencyBudget | undefined;
    /**
     * Tokens per UTC day across every run recorded in the {@link Options.ledger}.
     * A crossed cap always fails; it is a tripwire, never a park or a skip.
     */
    readonly daily?: DailyBudget | undefined;
}
/**
 * The per-UTC-day token ceiling across runs.
 *
 * @category models
 * @since 1.0.0-rc.1
 */
export interface DailyBudget {
    /** Positive safe integer. */
    readonly max: number;
}
/**
 * One charged model step as a {@link Ledger} keeps it.
 *
 * @category models
 * @since 1.0.0-rc.1
 */
export interface LedgerEntry {
    /** The UTC day, `YYYY-MM-DD`, the step was charged on. */
    readonly day: string;
    readonly runId: string;
    readonly stepKey: string;
    readonly spent: number;
    /** The step's USD cost; absent when the model is unpriced. */
    readonly costUsd?: number | undefined;
    readonly costSource?: Pricing.CostSource | undefined;
}
/**
 * Durable spend that outlives one run and one process: what a per-day cap sums,
 * and what a run without a journal recovers its own spend from.
 *
 * `record` is idempotent in `(runId, stepKey)`; the first entry wins.
 *
 * @category services
 * @since 1.0.0-rc.1
 */
export interface Ledger {
    readonly total: (day: string) => Effect.Effect<number, unknown>;
    readonly record: (entry: LedgerEntry) => Effect.Effect<void, unknown>;
    /** One run's charged steps, by step key. */
    readonly run: (runId: string) => Effect.Effect<ReadonlyMap<string, Charge>, unknown>;
}
/**
 * What one step was charged: its tokens, and its USD when its model is priced.
 *
 * @category models
 * @since 1.0.0-rc.1
 */
export type Charge = Pick<LedgerEntry, "spent" | "costUsd">;
/**
 * An in-process {@link Ledger}, for tests and hosts with no durable store.
 *
 * @category constructors
 * @since 1.0.0-rc.1
 */
export declare const memoryLedger: () => Ledger;
declare const ConfigurationError_base: Schema.Class<ConfigurationError, Schema.TaggedStruct<"flows/agent/BudgetConfigurationError", {
    readonly message: Schema.String;
}>, import("effect/Cause").YieldableError>;
/**
 * Invalid spending policy or accounting bounds, rejected when the budget is
 * built, before a model can be dispatched. Omit a ceiling to leave it unbounded;
 * `NaN`, infinity, negative limits, and unknown exceeded policies are not opt-outs.
 *
 * @category errors
 * @since 1.0.0-rc.0
 */
export declare class ConfigurationError extends ConfigurationError_base {
}
declare const BudgetExceeded_base: Schema.Class<BudgetExceeded, Schema.TaggedStruct<"flows/agent/BudgetExceeded", {
    readonly scope: Schema.Literals<readonly ["tokens", "usd", "latency", "daily"]>;
    readonly onExceeded: Schema.Literals<readonly ["fail", "warn", "skip-remaining", "park"]>;
    readonly used: Schema.Number;
    /** Forecast held by other in-flight calls; absent on older encoded errors. */
    readonly reserved: Schema.optional<Schema.Number>;
    readonly max: Schema.Number;
    readonly next: Schema.Number;
    readonly message: Schema.String;
}>, import("effect/Cause").YieldableError>;
/**
 * A run that would exceed what it was approved for.
 *
 * `used` is actual spend, `reserved` the forecast held by other in-flight
 * calls, `max` the soft admission ceiling, and `next` the refused call's
 * forecast. The largest observed call sets forecasts; before a positive cost
 * is known, one call reserves the full token allowance.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class BudgetExceeded extends BudgetExceeded_base {
}
/**
 * The tag {@link Skipped} carries on the wire.
 *
 * @category errors
 * @since 0.1.0
 */
export declare const skippedTag = "flows/agent/Skipped";
declare const Skipped_base: Schema.Class<Skipped, Schema.TaggedStruct<"flows/agent/Skipped", {
    readonly budget: typeof BudgetExceeded;
    readonly message: Schema.String;
}>, import("effect/Cause").YieldableError>;
/**
 * A model call refused because the run's budget already latched.
 *
 * `skip-remaining` is not the same verdict as `fail`. `fail` reports the call
 * that would have overspent; `skip-remaining` reports every call after it,
 * including calls in steps that had nothing to do with the overspend. An
 * operator reading a run needs to tell the step that broke the budget from the
 * steps the broken budget skipped, and a supervisor needs to know that no
 * retry can change the answer: the latch is permanent for the run.
 *
 * The failure carries the {@link BudgetExceeded} it latched on, so the numbers
 * are the same ones the first refusal reported.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class Skipped extends Skipped_base {
}
declare const AccountingUnavailable_base: Schema.Class<AccountingUnavailable, Schema.TaggedStruct<"flows/agent/BudgetAccountingUnavailable", {
    readonly phase: Schema.Literals<readonly ["record", "recover"]>;
    /** The run whose ledger is unavailable. */
    readonly runId: Schema.String;
    readonly message: Schema.String;
    /**
     * The encodable storage or codec failure that made the ledger unavailable.
     *
     * @since 1.0.0-rc.0
     */
    readonly cause: Schema.optional<Schema.Unknown>;
}>, import("effect/Cause").YieldableError>;
/**
 * The budget could not account a run, so it will not say what the run may
 * spend.
 *
 * A budget is a projection of a durable ledger, and every way that ledger can
 * be unavailable is a way a resumed run gets its allowance back: a usage
 * record that was not written, a ledger that could not be read, a ledger
 * longer than one recovery reads. None of them is a smaller number — they are
 * an UNKNOWN number, and answering "proceed" to an unknown is how a run that
 * has spent its whole envelope keeps spending.
 *
 * So the seam fails instead. `phase` says which half broke: `record` is the
 * write after a call the accumulator counted, `recover` is the read a run
 * makes before its first decision. A usage `record` failure is worth retrying:
 * the model step it accounts is sealed, so a re-dispatch replays the recorded
 * answer and writes the record again rather than paying a provider twice. A
 * clock-zero `record` failure happens before the call and retries the write.
 * `cause` preserves the encodable shape of the underlying storage failure so
 * an operator keeps its tag, code, and fields alongside the human summary.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class AccountingUnavailable extends AccountingUnavailable_base {
}
/**
 * The error tags no retry can turn into a success.
 *
 * A {@link Skipped} step is a verdict, not a transient failure: the latch is
 * set for the rest of the run, so a re-dispatch spends an attempt to be
 * refused identically without asking a provider anything.
 *
 * @category errors
 * @since 0.1.0
 */
export declare const nonRetryableTags: ReadonlyArray<string>;
/**
 * Adds {@link nonRetryableTags} to a retry policy.
 *
 * A composition that retries model-backed steps builds its policy through
 * this. `RetryPolicy` classifies by tag, and a policy that does not name
 * {@link Skipped} re-dispatches every skipped step through its whole ladder.
 *
 * @example
 * ```ts
 * import * as Budget from "@smthrs/agent/Budget"
 * import { RetryPolicy } from "@smthrs/flow"
 *
 * const policy = Budget.neverRetrySkipped(RetryPolicy.defaultRetryPolicy)
 * ```
 *
 * @category errors
 * @since 0.1.0
 */
export declare const neverRetrySkipped: (policy: RetryPolicy.RetryPolicy) => RetryPolicy.RetryPolicy;
/**
 * What one run has spent so far.
 *
 * @category models
 * @since 0.1.0
 */
export interface Usage {
    readonly tokens: number;
    /** Charged sealed steps and unsealed invocations, each counted exactly once. */
    readonly calls: number;
    /** The largest single call, which is what the next one is projected to cost. */
    readonly largestCall: number;
}
/**
 * The answer to "may this call be made".
 *
 * @category models
 * @since 0.1.0
 */
export type Verdict = {
    readonly _tag: "proceed";
} | {
    readonly _tag: "warn";
    readonly exceeded: BudgetExceeded;
} | {
    readonly _tag: "refuse";
    /** The ceiling and the numbers that broke it. */
    readonly exceeded: BudgetExceeded;
    /**
     * The error the caller raises. It is {@link Skipped} once the run has
     * latched and the {@link BudgetExceeded} itself otherwise, so the step
     * that broke the budget and the steps the broken budget skipped report
     * different failures.
     */
    readonly failure: BudgetExceeded | Skipped;
};
/**
 * The budget a composition enforces.
 *
 * @category services
 * @since 0.1.0
 */
export interface Service {
    /**
     * Decides whether the model call keyed by `stepKey` may be made.
     *
     * The key is what makes a verdict attributable, and attribution is the whole
     * difference between a budget and a trap on a resumed run. A run resumes by
     * re-executing its frames, so it asks this again for every model step it has
     * already paid for — and those steps replay from the journal without asking a
     * provider anything. A projection that adds the next call's estimate to a
     * ledger that already holds this very step refuses a call that costs zero,
     * and a run killed after its last model call comes back dead on arrival.
     *
     * So a step the ledger has already counted proceeds, whatever the ceiling
     * says. `undefined` is the honest answer for a caller with no key, and it
     * gets the projection, because a call the ledger cannot recognize is a call
     * the run has not made.
     */
    readonly check: (stepKey: string | undefined) => Effect.Effect<Verdict, AccountingUnavailable>;
    /**
     * Atomically admits a sealed step and reserves its forecast until the
     * current scope closes. Use this at dispatch; `check` is advisory only.
     * `record` reconciles the forecast with actual usage. Duplicate keys share
     * one reservation, assuming the engine deduplicates their provider work.
     * One Budget instance must serve all concurrent calls of a run.
     */
    readonly reserve: (stepKey: string) => Effect.Effect<Verdict, AccountingUnavailable, Scope.Scope>;
    /**
     * Decides whether a paid evaluator reading, accounted later under
     * `stepKey`, may be taken.
     *
     * A reading is not projected at the size of the run's largest call, which
     * is a primary call's: it proceeds while any allowance is left, and is
     * refused only once the ceiling is already spent (tokens at or past their
     * maximum, the latency allowance or the UTC day's spend exhausted, or a
     * `skip-remaining` latch), under the same `onExceeded` policy a primary call
     * gets. A key the ledger already holds proceeds, as a replay does. It
     * reserves nothing: `record` accounts what the reading paid.
     */
    readonly admitReading: (stepKey: string) => Effect.Effect<Verdict, AccountingUnavailable>;
    /**
     * Accounts finite, non-negative usage, idempotently in its step key. A
     * failed/uncommitted write remains pending and retryable; new uncounted
     * steps fail closed until it commits. Retries must supply the same cost.
     */
    readonly record: (stepKey: string, usage: ModelEvent.Usage, modelId?: string) => Effect.Effect<void, AccountingUnavailable>;
    /** What the CURRENT run has spent. Outside a run, what the caller recorded. */
    readonly usage: Effect.Effect<Usage, AccountingUnavailable>;
    /**
     * What one named run has spent, whether or not this process is driving it.
     *
     * A budget accounts per run, so a composition-level service holds many
     * tallies and `usage` alone cannot name which. A run this process is driving
     * answers from its live accumulator; any other run answers from the durable
     * usage records it left, which is how a supervisor reads the spend of a run
     * that is parked, finished, or owned by another host.
     * {@link module:Budget.looseRunId} names the tally of calls recorded outside
     * any run.
     */
    readonly usageOf: (runId: string) => Effect.Effect<Usage, AccountingUnavailable>;
    /**
     * Records that the CURRENT run suspended now, so the time until it resumes
     * is not charged to its latency ceiling. A run already suspended keeps its
     * earlier start.
     */
    readonly suspend: Effect.Effect<void, AccountingUnavailable>;
    /**
     * Records that the CURRENT run is executing again, closing its open
     * suspension at `at` (now when omitted). Admission closes one too, because a
     * run making a model call is executing. A host that could not record the
     * resume retries it with the instant the run actually resumed, and does no
     * work until it succeeds: until then the span stays open, and the work would
     * be subtracted as parked time.
     */
    readonly resume: (at?: number) => Effect.Effect<void, AccountingUnavailable>;
}
declare const Budget_base: Context.ServiceClass<Budget, "@smthrs/agent/Budget", Service>;
/**
 * The {@link Service} tag.
 *
 * @category services
 * @since 0.1.0
 */
export declare class Budget extends Budget_base {
}
/**
 * A registered budget park: the wait the run suspends under, and the failure
 * that suspends its frame.
 *
 * @category models
 * @since 1.0.0-rc.1
 */
export interface Parked {
    readonly waiting: FlowRuntime.WaitingAnnotation;
    readonly failure: HarnessError.HarnessError;
}
declare const Parking_base: Context.ServiceClass<Parking, "@smthrs/agent/Budget/Parking", {
    readonly park: (exceeded: BudgetExceeded) => Effect.Effect<Parked, HarnessError.HarnessError>;
    /**
     * Whether a {@link RunawayGuard.Timeout} parks the run. When false every
     * timeout keeps its own behavior: an exhausted model call fails the run, and
     * a tool call or cell reports its timeout to the cell.
     */
    readonly guardsTimeouts: boolean;
    /**
     * Parks the run on a tripped timeout with its {@link RunawayGuard.incident}
     * facts. A subject the operator already continued asks again under a new
     * request; one the operator stopped fails with {@link RunawayGuard.stopped}.
     */
    readonly trip: (timeout: RunawayGuard.Timeout) => Effect.Effect<Parked, HarnessError.HarnessError>;
    /**
     * Admits work on a subject a timeout may have parked: how many times the
     * operator chose Continue for it, the park when its question is still
     * open, or {@link RunawayGuard.stopped} when the operator chose Stop. The
     * decisions are read once per host drive, because a decision only takes
     * effect by driving the run again.
     */
    readonly admit: (subject: string) => Effect.Effect<{
        readonly _tag: "proceed";
        readonly continued: number;
    } | {
        readonly _tag: "park";
        readonly parked: Parked;
    }, HarnessError.HarnessError>;
}>;
/**
 * Parks a run whose `park` budget refused a call.
 *
 * The host that owns approvals provides it: it registers the request for a
 * {@link raise}d budget and answers with the {@link Parked} wait. The model
 * boundary declares that wait when the frame suspends, not before, because
 * the run's other fibers re-declare their own waits until then. A composition
 * without it fails the call with the {@link BudgetExceeded}, as `fail` does.
 *
 * @category services
 * @since 1.0.0-rc.1
 */
export declare class Parking extends Parking_base {
}
/**
 * The journal event one allowed-over-budget call writes.
 *
 * @category records
 * @since 0.1.0
 */
export declare const budgetWarningEvent = "flows.agent.budget-warning.v1";
/**
 * The journal event one accounted model call writes.
 *
 * Unlike {@link budgetWarningEvent}, which is evidence, this record is READ
 * BACK: a budget entering a resumed run projects its accumulator from these
 * records, because the engine resumes from recorded node results and never
 * re-enters a settled step. That is why it goes on the DURABLE channel and the
 * warning does not. The lossy channel is documented as droppable telemetry —
 * `Dropped` receipts and `drop-oldest` evictions are acceptable there — and a
 * dropped record here would silently hand a resumed run a second allowance.
 *
 * The write is unfenced. A budget is a client of the run it accounts for, not
 * its owner, and the record advances nothing. A stable producer identity per
 * step deduplicates retries durably; different usage under that identity is
 * an error. The accumulator counts actual spend immediately but keeps its
 * write pending until the outer transaction commits, so rollback or an
 * interrupted write can never turn a retry into a successful no-op. A
 * composition with no journal at all (the reference memory engine) still
 * accounts within one process and simply recovers nothing across a restart.
 *
 * A write that FAILS is a different thing from a composition that keeps no
 * journal, and it is not ignored: it raises {@link AccountingUnavailable}, so
 * the step that made the call fails rather than the run continuing with spend
 * only this process remembers. The read side fails closed the same way when a
 * current-version record does not decode through {@link UsageRecord}: that is
 * a ledger this budget cannot read, not evidence that the call never happened.
 * If forward-compatible skipping is ever wanted, it must be gated on an
 * explicit version-field mismatch rather than on a failed current-version
 * decode.
 *
 * @category records
 * @since 0.1.0
 */
export declare const usageEvent = "flows.agent.usage.v1";
/**
 * The payload one {@link usageEvent} record carries.
 *
 * This is the wire format of a DURABLE record read back on resume, so it has
 * an owner on both the write and read side. A record that does not decode is a
 * ledger this budget cannot read rather than a call that never happened, and
 * recovery fails closed instead of handing the run that allowance again.
 *
 * The cost field is `spent` and not `tokens` because the journal REDACTS a
 * field whose name reads as a credential: `@smthrs/journal`'s
 * `Redaction.isSensitiveKey` strips one trailing plural and tests the suffix,
 * so `tokens` canonicalizes to `token` and the production `SqlJournal` writes
 * `"[REDACTED]"` in place of the number. Under the old field name every usage
 * record this module wrote came back unreadable, and the read side dropped it
 * silently, so the durable projection was a no-op wherever a real journal was
 * composed. `spent` names the same number and names no credential. Records
 * written under the old name do not decode; they never carried a readable
 * number either, so nothing is lost by refusing them.
 *
 * @category records
 * @since 1.0.0-rc.0
 */
export declare const UsageRecord: Schema.Struct<{
    readonly stepKey: Schema.String;
    readonly spent: Schema.Finite;
    /** Absent for an unpriced model and in records written before pricing. */
    readonly costUsd: Schema.optional<Schema.Finite>;
    readonly costSource: Schema.optional<Schema.Literals<readonly ["reported", "estimated"]>>;
    /**
     * What the spend was for, as the controller declared it when it made the
     * call: an `EngineLike.SpendPurpose`. A string and not that closed set,
     * because this record is read back on resume and a purpose a later host
     * adds must not make an older one refuse the ledger. Absent for a spend
     * nothing declared, and in records written before spends were labelled.
     */
    readonly purpose: Schema.optional<Schema.String>;
    /** The controller's frame the spend belongs to; travels with `purpose`. */
    readonly frame: Schema.optional<Schema.Finite>;
    /**
     * Present when this one charge covers readings of more than one purpose:
     * each purpose's share of `spent` and of `costUsd`, counted the way the
     * record itself is. A reader totalling by purpose takes the parts in place
     * of `purpose`; they add up to `spent`.
     */
    readonly parts: Schema.optional<Schema.$Array<Schema.Struct<{
        readonly purpose: Schema.String;
        readonly spent: Schema.Finite;
        readonly costUsd: Schema.optional<Schema.Finite>;
    }>>>;
}>;
/**
 * The journal event one run's latency clock zero is written to.
 *
 * Like {@link usageEvent}, this record is READ BACK on resume. A run whose
 * zero is not recovered re-arms its whole latency allowance on every park,
 * reclaim, or process restart, so the run's first budget decision writes it
 * durably and later recoveries keep the earliest value they find. Suspended
 * spans closed before it are not subtracted from the latency clock.
 *
 * @category records
 * @since 1.0.0-rc.0
 */
export declare const budgetStartedEvent = "flows.agent.budget-started.v1";
/**
 * The payload one {@link budgetStartedEvent} record carries.
 *
 * This is a durable wire format owned by both the first writer and every
 * resumed reader. An undecodable current-version payload leaves the latency
 * ledger unknown, so recovery fails closed instead of choosing a new zero.
 *
 * @category records
 * @since 1.0.0-rc.0
 */
export declare const BudgetStartedRecord: Schema.Struct<{
    readonly startedAt: Schema.Finite;
}>;
/**
 * The journal event a run's suspension start is written to.
 *
 * Read back with {@link budgetResumedEvent} on recovery: a run parked in one
 * process and answered in another must not be charged the parked wall time.
 *
 * @category records
 * @since 1.0.0-rc.1
 */
export declare const budgetSuspendedEvent = "flows.agent.budget-suspended.v1";
/**
 * The journal event that closes a run's open {@link budgetSuspendedEvent}.
 *
 * @category records
 * @since 1.0.0-rc.1
 */
export declare const budgetResumedEvent = "flows.agent.budget-resumed.v1";
/**
 * The payload {@link budgetSuspendedEvent} and {@link budgetResumedEvent}
 * carry: the wall-clock instant of the transition.
 *
 * @category records
 * @since 1.0.0-rc.1
 */
export declare const BudgetClockRecord: Schema.Struct<{
    readonly at: Schema.Finite;
}>;
/**
 * The durable skip-remaining decision, encoded as {@link BudgetExceeded}.
 * Recovery keeps the first decision even if its peer reservations were released
 * without usage. An undecodable record fails accounting closed.
 *
 * @category records
 * @since 1.0.0-rc.0
 */
export declare const budgetLatchedEvent = "flows.agent.budget-latched.v1";
/**
 * The tokens one model call cost.
 *
 * Providers report either a total or the parts, and some report both. The total
 * wins when it is there, because a provider that publishes one has already
 * decided what counts.
 * Every supplied counter must nevertheless be finite and non-negative. An
 * invalid component yields NaN so neither total precedence nor aggregation
 * can conceal malformed usage; record rejects it and blocks fresh admission.
 *
 * @category accounting
 * @since 0.1.0
 */
export declare const tokensOf: (usage: ModelEvent.Usage, weights?: typeof TokenWeights.Type) => number;
/**
 * How many journal entries one recovery reads before it gives up.
 *
 * A recovery pages to the END of the run's journal; this is not a stopping
 * point, it is the point at which the budget declares the ledger unreadable
 * and fails. The difference matters: a bound that stopped early would return a
 * PARTIAL ledger indistinguishable from a complete one, and hand a long run
 * back the allowance the entries past the bound describe. A million entries is
 * far past any run a budget guards, so reaching it is a broken journal rather
 * than a busy one.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const defaultRecoveryEntries = 1000000;
/**
 * The run id {@link Service.usageOf} answers about calls recorded outside any
 * run under.
 *
 * A budget accounts by execution id, and a caller with no run — a unit test, a
 * composition measuring before it executes anything — still has to account
 * somewhere. Its tally is held apart from the run map, so no bound evicts it.
 *
 * @category accounting
 * @since 0.1.0
 */
export declare const looseRunId = "";
/**
 * How many runs' tallies one budget keeps in memory by default.
 *
 * The accumulator has to be held between one run's model calls, and a run
 * publishes no "I am finished" the budget could listen for: `FlowInstance`'s
 * scope closes at the end of every NODE dispatch, not at the end of the run,
 * so it cannot be the lifetime. The bound is what keeps a control plane that
 * drives runs for weeks from holding one tally per run it ever drove. It is
 * an upper bound, not permission to forget spend: active operations,
 * uncommitted usage, and memory-only accounts cannot be evicted. If all slots
 * are pinned, admission fails with AccountingUnavailable. An evicted durable
 * account recovers its spend, original latency zero, and latch from the journal.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const defaultMaxRuns = 256;
/**
 * What a composition can tune about one budget instance.
 *
 * @category models
 * @since 0.1.0
 */
export interface Options {
    /** Positive safe integer; defaults to {@link defaultMaxRuns}. */
    readonly maxRuns?: number | undefined;
    /**
     * How many journal entries one recovery reads before it fails closed.
     * Positive safe integer; defaults to {@link defaultRecoveryEntries}.
     */
    readonly recoveryEntries?: number | undefined;
    /** Required by `policy.daily`; also where a run without a journal recovers its spend. */
    readonly ledger?: Ledger | undefined;
}
/**
 * Builds a budget over one policy.
 *
 * One instance serves a whole composition: the accumulator is keyed by
 * execution id, so a layer built once above an engine accounts every run it
 * drives separately. Validates and snapshots the configuration at acquisition;
 * subsequent mutations of the caller's objects cannot change enforcement.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const make: (declaredPolicy: Policy, declaredOptions?: Options) => Effect.Effect<Service, ConfigurationError>;
/**
 * A budget that accounts nothing and refuses nothing.
 *
 * This is an explicit decision to give up plan-envelope spending enforcement,
 * never a production default.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const makeUnbounded: () => Service;
/**
 * Provides one budget for the composition it is built in.
 *
 * @category layers
 * @since 0.1.0
 */
export declare const layer: (policy: Policy, options?: Options) => Layer.Layer<Budget, ConfigurationError>;
/**
 * Explicitly provides {@link makeUnbounded}.
 *
 * This gives up token, call, and latency ceilings for the composed run.
 *
 * @category layers
 * @since 0.1.0
 */
export declare const layerUnbounded: () => Layer.Layer<Budget>;
/**
 * Reads the budget a composition explicitly provided.
 *
 * There is deliberately no fallback. Every production composition must bind a
 * policy, normally with {@link layerFromEnvelope}, or explicitly opt into
 * {@link layerUnbounded}.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const current: Effect.Effect<Service, never, Budget>;
/**
 * Turns an approved plan envelope into a policy.
 *
 * This is the point of the whole module: `Envelope.budget` is what a control
 * plane approved, and until it becomes a {@link Policy} it is a number in a
 * record that nothing reads. A missing field is not a zero budget — it is no
 * budget at all — so an envelope that approves neither produces an empty policy
 * rather than a run that can spend nothing.
 *
 * The envelope's own `onExceeded` is what was approved, so it wins over
 * `options.onExceeded`, which is the composition's default.
 *
 * @category conversions
 * @since 0.1.0
 */
export declare const policyFromEnvelope: (envelope: ControlSchema.Envelope, options?: {
    readonly onExceeded?: OnExceeded | undefined;
    readonly weights?: Weights | undefined;
}) => Policy;
/**
 * Provides a budget built from an approved plan envelope.
 *
 * @category layers
 * @since 0.1.0
 */
export declare const layerFromEnvelope: (envelope: ControlSchema.Envelope, options?: {
    readonly onExceeded?: OnExceeded | undefined;
    readonly weights?: Weights | undefined;
}) => Layer.Layer<Budget, ConfigurationError>;
/**
 * The budget a parked run asks an operator to approve: the exceeded ceiling
 * raised to cover what the run has spent and holds, the refused call, and one
 * more of its original allowance. Tokens and milliseconds round up to whole
 * units and dollars to the cent.
 *
 * The ceiling is proposed rather than chosen at approval because an approval
 * must match the envelope it was requested with; approving this budget is the
 * operator's decision to let the run spend it.
 *
 * @category conversions
 * @since 1.0.0-rc.1
 */
export declare const raise: (budget: ControlSchema.Envelope["budget"], exceeded: BudgetExceeded) => ControlSchema.Envelope["budget"];
/**
 * An approved envelope with every approved raise applied: each ceiling is the
 * largest one approved, so a raise never lowers what was already granted.
 *
 * @category conversions
 * @since 1.0.0-rc.1
 */
export declare const raisedBy: (envelope: ControlSchema.Envelope, raises: ReadonlyArray<ControlSchema.Envelope["budget"]>) => ControlSchema.Envelope;
export {};
