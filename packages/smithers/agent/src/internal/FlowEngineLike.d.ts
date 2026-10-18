/**
 * Internal model-step recording for the durable agent engine port.
 *
 * These functions own retry closure state and record normalization. Keeping
 * them behind the package's null-mapped `internal/*` export prevents that
 * closure protocol from becoming a public compatibility promise.
 *
 * @since 1.0.0-rc.0
 */
import * as Model from "@smthrs/model/Model";
import * as ModelError from "@smthrs/model/ModelError";
import * as ModelEvent from "@smthrs/model/ModelEvent";
import * as ModelRequest from "@smthrs/model/ModelRequest";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
type RecordedModelStep = ReadonlyArray<ModelEvent.ModelEvent> | {
    readonly events: ReadonlyArray<ModelEvent.ModelEvent>;
    readonly error?: ModelError.ModelError | undefined;
    readonly correction?: number | undefined;
};
/**
 * Reads either recorded-model-step branch as the object form.
 *
 * @category conversions
 * @since 0.1.0
 */
export declare const normalizeRecordedModelStep: (recorded: RecordedModelStep) => {
    readonly events: ReadonlyArray<ModelEvent.ModelEvent>;
    readonly error?: ModelError.ModelError | undefined;
    readonly correction?: number | undefined;
};
/**
 * How many times one sealed step re-issues a call its budget cut off.
 *
 * The retry budget the transport codes share cannot be shared with an overrun,
 * because the two cost different things. A dropped session fails in
 * milliseconds, so five retries of it cost five backoffs; an overrun fails
 * only after spending the whole armed ceiling, so five retries of it cost five
 * ceilings. On the wave 7 default of 300,000 ms that is a single sealed step
 * spending 1,800 s of wall clock — 150% of the 1,200 s process budget that
 * wave gave a whole run, and 2.7x the 667 s call the budget was written to
 * bound. A budget that multiplies the failure it names is not a budget.
 *
 * One re-issue is the number the mechanism supports. Waiting cannot shorten an
 * answer, so the only thing a re-issue adds is {@link overrunTeaching}, and a
 * model that overran again *after* being told to answer directly has already
 * shown the teaching did not land; a third ask costs another full ceiling and
 * buys nothing new. With one re-issue a step spends at most twice the armed
 * budget — 600 s at the default, under the 667 s single call that motivated
 * the ceiling — and then fails the frame with the typed error, which is a
 * bound a report can state.
 *
 * @category policies
 * @since 0.1.0
 */
export declare const defaultModelOverruns = 1;
/**
 * Milliseconds a model stream may go without one event before it is cut off.
 *
 * A call's ceiling bounds how long it may take; this bounds how long it may
 * say nothing. The two fail differently. A long call that keeps streaming is
 * a model at work: Terminal-Bench 4.0's photonic-waveguide-routing
 * (2026-09-24) needed a 735 s design turn at `max` effort, and a total
 * ceiling short enough to catch a stall killed it. A stream that goes silent
 * is usually a dead socket or a stuck backend, and waiting out a long ceiling
 * on one is the cost this bound removes.
 *
 * 300,000 ms is stock Codex's `stream_idle_timeout_ms` default. The ChatGPT
 * route asks for reasoning summaries, so a long think streams summary deltas
 * and reasoning items: one live `gpt-6-sol` call at `high` effort on
 * 2026-09-24 streamed an event at least every 10 s. A stall is a transport
 * failure, re-issued without the overrun teaching, because the model did
 * nothing that needs correcting, and at most {@link defaultModelOverruns}
 * times, because each stall costs a whole window.
 *
 * The bound follows the request's `params.reasoningEffort`, as the ceiling
 * does:
 *
 * | effort                                            | idle bound |
 * | ------------------------------------------------- | ---------- |
 * | unset, `none`, `minimal`, `low`, `medium`, `high` | 300 s      |
 * | `xhigh`, `max`                                    | none       |
 *
 * At `xhigh` and `max` silence is not evidence of a stall. The steady stream
 * measured at `high` does not hold there, and a route that emits an event only
 * when an item completes, such as the Codex CLI route, says nothing through a
 * whole think: on Terminal-Bench 4.0 `wal-recovery-ordering` (2026-10-02) a
 * `gpt-6.1-sol` turn at `max` was cut off after 300 s of silence and the trial
 * was lost. Those calls are bounded by their ceiling alone, so a dead socket
 * there costs the whole ceiling and ends as `call_timeout`.
 *
 * Armed only when it is shorter than the call's ceiling, so a ceiling at or
 * below it is the only bound, as it was before this existed; a disarmed
 * ceiling disarms it too.
 *
 * @category policies
 * @since 1.0.0-rc.0
 */
export declare const defaultModelIdleMs = 300000;
/**
 * What a re-issued call tells the model about the attempt that was cut off.
 *
 * A transport failure is repaired by waiting; an overrun is not. The provider
 * would happily spend the budget again on the same answer, so the re-issue has
 * to say something the first attempt did not, and the only party that can
 * shorten the answer is the model. The note is deliberately terse and states
 * one instruction, because it is prepended to a system context that already
 * carries the cell contract, the task, and the run's state.
 *
 * It says nothing about how many attempts have been spent, because
 * {@link defaultModelOverruns} allows exactly one: a call carrying this note is
 * always the last one the step will make.
 *
 * @category policies
 * @since 0.1.0
 */
export declare const overrunTeaching: (budgetMillis: number) => string;
/**
 * Re-issues one overrun call with the teaching prepended to its system context.
 *
 * The teaching goes at the front of `system` rather than at the end of the
 * transcript because the transcript is the cell's to shape — the controller
 * replaces it wholesale each frame from what the cell projected — while the
 * system context is the run's stable teaching, which is where an instruction
 * about how to answer belongs. The original request is never mutated; a later
 * attempt re-derives from it, so two overruns leave one note rather than two.
 *
 * @category combinators
 * @since 0.1.0
 */
export declare const withOverrunTeaching: (request: ModelRequest.ModelRequest, budgetMillis: number) => ModelRequest.ModelRequest;
/**
 * Retries transient provider failures inside the sealed step.
 *
 * The retry is deliberately here rather than on the action's `retryPolicy`.
 * The engine's policy classifies by error *tag*, and every provider failure
 * shares the one `flows/model/ModelError` tag, so a tag-level policy either
 * retries a bad API key four times or retries nothing. It also replaces an
 * exhausted failure with `RetryAttemptsExhausted`, which would hide the very
 * `code` the caller branches on. Retrying in place keeps the classification
 * precise and lets the original typed error surface unchanged when the
 * backoff gives up.
 *
 * Each retry states the delay the schedule chose for it. The delay cannot be
 * read back off the journal timestamps: every retry of one sealed step is
 * buffered and written when the step settles, so a run that backed off for
 * half a minute and one that did not back off at all are indistinguishable
 * there.
 *
 * The classification is a `Schedule.while` *inside* the schedule rather than
 * `Effect.retry`'s `while` option, and the tap sits outside it. Both placements
 * matter. `Effect.retry` applies its `while` after stepping the schedule, so a
 * tap under it fires once for a terminal failure too and records a retry that
 * never happened — a `quota_exceeded` run journaled a phantom `model-retried`
 * exactly that way. Stopping the schedule first means the tap only ever sees a
 * step that will really recur, and `duration` is then the delay actually
 * slept — jitter and bound already applied — not the nominal one the base
 * schedule would have produced.
 *
 * `budgetMillis` is the same retry, applied to the one failure the provider
 * never reports: a call that answers, slowly, forever. It is enforced here
 * rather than around the whole sealed step so an overrun is an attempt rather
 * than the end of the frame — it is interrupted, classified `call_timeout`,
 * and re-issued on this schedule with {@link overrunTeaching} in front of it.
 * Interruption is the only mechanism involved: `Effect.timeoutOrElse` closes
 * the attempt's scope, and the model layer's own request teardown follows from
 * that, so nothing threads an abort signal and nothing polls a flag.
 *
 * The overrun rides the schedule's delays but not its count. Every other
 * retryable code fails fast and costs a backoff; an overrun costs a whole
 * armed ceiling, so it stops after {@link defaultModelOverruns} re-issues and
 * the step's total model time stays bounded by twice the budget rather than by
 * six times it.
 *
 * `onUsage` observes cumulative spend across this invocation's provider
 * attempts. The caller uses its last snapshot when no sealed value survives
 * (capacity refusal, permission failure, or interruption); partial text is
 * never exposed. The callback must be synchronous and cannot perform I/O.
 *
 * @category execution
 * @since 0.1.0
 */
export declare const recordModelStep: (model: Model.Model, request: ModelRequest.ModelRequest, policy: Schedule.Schedule<unknown, Model.ModelFailure>, budgetMillis?: number | undefined, correction?: number | undefined, onUsage?: ((usage: ModelEvent.Usage) => void) | undefined, onEvent?: ((event: ModelEvent.ModelEvent) => Effect.Effect<void>) | undefined) => Effect.Effect<RecordedModelStep, Model.ModelFailure>;
export {};
