/**
 * The deterministic script sandbox port.
 *
 * A cell is arbitrary agent-authored JavaScript, so it never runs in the host
 * realm. It runs behind this port, which grants exactly one effectful
 * primitive — flow invocation against the capability-narrowed catalog the run
 * was given — and returns a serializable {@link Cell.Outcome}.
 *
 * The port opens a {@link Realm}, and a realm is the whole surface: it is
 * acquired once per run and every cell of that run is evaluated in it, so a
 * name one cell binds is still bound in the next. There is no per-cell
 * evaluation beside it. One binding ships — `QuickJSSandbox`, the QuickJS-WASM
 * binding that isolates a real separate realm in both Node and browsers — and a
 * composition that offers none is refused with {@link realmUnsupported}.
 *
 * Cancellation is fiber interruption and teardown is scope finalization; a
 * sandbox never installs a host abort signal.
 *
 * @since 0.1.0
 */
import { Context, Effect, Layer, Schema, type Scope } from "effect";
import * as Cell from "./Cell.ts";
import type { HarnessError } from "./HarnessError.ts";
import type * as VariablesPanel from "./VariablesPanel.ts";
/**
 * Stable failures raised by a sandbox binding itself, as opposed to failures
 * of the cell it was asked to run.
 *
 * A cell that throws is a {@link Cell.Raised} outcome, not a sandbox error.
 * These codes describe the sandbox being unable to do its job at all.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare const SandboxErrorCode: Schema.Literals<readonly ["unavailable", "unsupported", "runtime_failed"]>;
/**
 * Stable failures raised by a sandbox binding itself.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type SandboxErrorCode = typeof SandboxErrorCode.Type;
declare const SandboxError_base: Schema.Class<SandboxError, Schema.TaggedStruct<"flows/harness/SandboxError", {
    readonly code: Schema.Literals<readonly ["unavailable", "unsupported", "runtime_failed"]>;
    readonly message: Schema.String;
    readonly cause: Schema.optional<Schema.Defect>;
}>, import("effect/Cause").YieldableError>;
/**
 * A failure of the sandbox binding.
 *
 * @category errors
 * @since 0.1.0
 * @slop
 */
export declare class SandboxError extends SandboxError_base {
}
/**
 * One flow invocation requested from inside a running cell.
 *
 * `ordinal` is the zero-based execution order of the call within the cell. It
 * is the replay anchor: re-executing the same source reaches the same ordinal
 * with the same declaration, which is what lets a settled boundary replay
 * instead of re-running.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface Invocation {
    readonly ordinal: number;
    readonly flow: string;
    readonly input: Schema.Json;
    /**
     * Whatever the cell passed as the call's `at` option, undecoded.
     *
     * It arrives as the raw JSON the cell wrote rather than as an id because the
     * boundary, not the realm, decides whether it is a checkpoint: a cell that
     * passes a string, a failure envelope, or last frame's result gets an
     * resolved `invalid_input` failure naming what `at` takes. Throwing from inside
     * the sandbox would lose the calls the cell had already paid for.
     */
    readonly at?: Schema.Json | undefined;
    /**
     * What the frame's wall-clock backstop has left when the call is issued, in
     * milliseconds. Absent when the call does not spend that backstop. A
     * boundary that bounds its own settlements reads it through {@link callLimit}.
     */
    readonly remainingMs?: number | undefined;
    /**
     * Whether the cell made this call with the check it declared, rule 7's
     * `verification = { flow, input }`: the flow it named and the very input
     * object it bound there. The realm answers it at the call, by identity, so
     * a read or a search the run ran in passing is never mistaken for the run's
     * check (#3994). Absent means no.
     */
    readonly declared?: boolean | undefined;
}
/**
 * One request to pin the workspace, issued from inside a running cell.
 *
 * It carries only its ordinal because that is the whole of its identity: the
 * cell source and the frame are the boundary's, and the ordinal is what makes
 * the pin land where the cell wrote it. See {@link Minter}.
 *
 * @category models
 * @since 0.1.0
 */
export interface Mint {
    readonly ordinal: number;
}
/**
 * Pins the workspace on behalf of a running cell.
 *
 * A mint travels the same queue as a flow call and is settled by the same drive
 * loop, in issue order, one at a time. That ordering is the whole contract:
 * `ctx.checkpoint()` promises the tree as it stands *at the line it is written
 * on*, and the only way a cell can move the tree is by issuing a call, so a
 * queue that settles in issue order pins exactly the tree the cell was looking
 * at. A mint that runs on its own schedule — a side channel, a host callback,
 * anything the queue does not order — would pin whichever tree happened to be
 * there when it got round to it.
 *
 * The result is a {@link Cell.CallResult} like any other, so a host with no
 * store, a run past its checkpoint bound, and a store that failed are all
 * resolved `{ ok: false, error }` refusals rather than teardown.
 *
 * @category models
 * @since 0.1.0
 */
export type Minter = (mint: Mint) => Effect.Effect<Cell.CallResult, HarnessError>;
/**
 * The refusal a binding answers `ctx.checkpoint()` with when the caller wired
 * no minter.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const mintUnavailable: Minter;
/**
 * Resolves one invocation on behalf of a running cell.
 *
 * A {@link Cell.CallResult} of `failure` resolves in the cell as
 * `{ ok: false, error }`, where `error` contains `code`, `message`, and `hint`;
 * it does not throw. Success resolves with the flow's own value, unwrapped.
 * Branch on `.ok === false` and `.error.code` to recover. For a flow whose
 * successful result has a `stdout` field, a cell can retry a timed-out call:
 *
 * ```ts
 * let result = await ctx.call("bash", { command: "find . -name '*.ts'" })
 * if (result.ok === false && result.error.code === "timeout") {
 *   result = await ctx.call("bash", { command: "find src -name '*.ts'" })
 * }
 * console.log(result.ok === false ? result.error.code : result.stdout)
 * ```
 *
 * Anything the cell must not observe, such as a permission park, an abort,
 * or an engine failure, travels in the effect's error channel and tears the
 * cell down.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type Handler = (invocation: Invocation) => Effect.Effect<Cell.CallResult, HarnessError>;
/**
 * Realm memory ceiling and default execution limits for its evaluations.
 *
 * Bindings fill every ceiling they can enforce from {@link defaultLimits} when
 * the caller omits it. A binding that cannot honour an explicitly requested
 * limit fails with `unsupported` rather than silently ignoring it.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface Limits {
    /**
     * Maximum number of flow calls one cell may make; a non-negative safe integer.
     * A checkpoint mint settles on the same channel and counts against this budget.
     */
    readonly calls?: number | undefined;
    /** Maximum sandbox heap, in bytes; at least {@link minimumMemoryBytes}. */
    readonly memoryBytes?: number | undefined;
    /**
     * Maximum interpreter steps before the cell is stopped.
     *
     * A step is one interrupt check, not one bytecode operation: an interpreter
     * polls its budget periodically, so this bounds work rather than counting
     * individual operations. The limit is a safe integer of at least
     * {@link minimumSteps}.
     */
    readonly steps?: number | undefined;
    /**
     * Maximum cell-compute time in milliseconds; a safe integer of at least
     * {@link minimumTimeMs}.
     *
     * This bounds the cell's own JavaScript execution. Time spent suspended in
     * an outstanding `ctx.call` or `ctx.checkpoint()` does not count: host work
     * belongs to the boundary that runs it, and charging it here rejected every cell that
     * awaited a real test run — 57 of the 62 rejected frames in the first
     * SWE-bench benchmark were legitimate long `bash` calls hitting this clock.
     */
    readonly timeMs?: number | undefined;
    /**
     * Maximum whole-evaluation time in milliseconds, host calls included; a
     * non-negative safe integer.
     *
     * The backstop for a host call that never settles. Generous on purpose: a
     * cell awaiting a ten-minute test suite is working, not stuck.
     */
    readonly totalMs?: number | undefined;
    /** Flow names whose pending call time does not spend the frame backstop. */
    readonly pauseTotalMsFor?: ReadonlyArray<string> | undefined;
    /**
     * Maximum wall-clock time one flow call may take, in milliseconds; a
     * non-negative safe integer. A call that asks for longer with its own
     * `timeoutMs` gets that, within what its frame has left; see {@link callLimit}.
     *
     * The per-call budget {@link totalMs} cannot supply. `totalMs` is the frame's
     * last resort, and a call that overruns it takes the whole frame down with a
     * `limit_exceeded` rejection the model never sees as an answer: on the
     * SWE-bench django instance one broad `grep` held its cell for the entire
     * 900,000 ms ceiling, 75% of a 1,204-second run. This ceiling settles that
     * same call as an ordinary resolved failure instead, so the cell observes a
     * timeout it can narrow and retry inside the frame it is already in.
     */
    readonly callMs?: number | undefined;
}
/**
 * Per-frame overrides of a realm's opening limits. Omitted or undefined fields
 * inherit the realm defaults. The memory ceiling remains fixed for the run.
 *
 * @category models
 * @since 0.1.0
 */
export type EvaluationLimits = Omit<Limits, "memoryBytes">;
/**
 * Which limits a binding can actually enforce.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface Capabilities {
    readonly calls: boolean;
    readonly memoryBytes: boolean;
    readonly steps: boolean;
    readonly timeMs: boolean;
}
/**
 * The execution ceilings a cell runs under when the caller declares none.
 *
 * Agent-authored source must never acquire an unbounded frame merely because a
 * host omitted configuration. These values are deliberately generous for a
 * cell, whose work is choosing flow calls and shaping JSON between them. There
 * is no spelling for "no ceiling": a host that needs more raises the relevant
 * finite value explicitly.
 *
 * @category constants
 * @since 0.1.0
 * @slop
 */
export declare const defaultLimits: Readonly<{
    calls: 64;
    memoryBytes: number;
    steps: 1000;
    timeMs: 30000;
    totalMs: 900000;
    callMs: 600000;
}>;
/**
 * Smallest interpreter-step budget a binding can enter a realm under.
 *
 * A zero budget interrupts the binding's own scaffolding before any cell source
 * runs, which escapes as a crash rather than a ceiling report, so the sandbox
 * boundary refuses it as `unsupported`.
 *
 * @category constants
 * @since 1.0.0-rc.0
 */
export declare const minimumSteps = 1;
/**
 * Smallest wall-clock budget, in milliseconds, a binding can enter a realm under.
 *
 * A zero budget interrupts the binding's own scaffolding before any cell source
 * runs, which escapes as a crash rather than a ceiling report, so the sandbox
 * boundary refuses it as `unsupported`.
 *
 * @category constants
 * @since 1.0.0-rc.0
 */
export declare const minimumTimeMs = 1;
/**
 * Smallest heap ceiling the QuickJS binding can initialize and tear down
 * safely.
 *
 * QuickJS needs space for its runtime and context before cell source runs.
 * Lower ceilings can leave a partially initialized context that aborts during
 * disposal, so they are refused at the sandbox boundary.
 *
 * @category constants
 * @since 0.1.0
 * @slop
 */
export declare const minimumMemoryBytes: number;
export { printFrameBytes, printRetainedBytes, printStatementFloor } from "./internal/printChannel.ts";
/**
 * Fills omitted ceilings from {@link defaultLimits} for limits a binding can
 * enforce.
 *
 * Capability gating applies only to defaults. An explicit unsupported limit is
 * passed through so the binding can refuse it instead of silently widening the
 * caller's authority.
 *
 * @category constructors
 * @since 0.1.0
 * @slop
 */
export declare const withDefaults: (capabilities: Capabilities, limits: Limits | undefined) => Limits;
/**
 * Merges and validates one frame's limits without changing the realm defaults.
 * Only per-frame ceilings can be overridden; memory belongs to the realm.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const evaluationLimits: (defaults: Limits, overrides: EvaluationLimits | undefined) => Effect.Effect<EvaluationLimits, SandboxError>;
/**
 * What a REPL cell asked the controller to do.
 *
 * A cell runs as a global async script in a persistent realm. Top-level
 * `await` is supported; top-level `return` is invalid. The first `ctx.done`
 * or `ctx.park` that records an intent seals the frame. Later `ctx.done` and
 * `ctx.park` calls do nothing. Ordinary JavaScript continues running, but later
 * `ctx.call` and `ctx.checkpoint` calls resolve with a `run_completed` failure
 * envelope without dispatching host work.
 *
 * @category models
 * @since 0.1.0
 */
export type Intent = {
    readonly _tag: "Done";
    readonly output: string;
    readonly value?: Schema.Json | undefined;
} | {
    readonly _tag: "Park";
    readonly reason: "waiting-input" | "waiting-event" | "waiting-quota";
    readonly message: string;
};
/**
 * Builds the durable transition one cell settled.
 *
 * A cell states its intent by calling, so this is the only place a
 * {@link Cell.Transition} is constructed. The realm is the run's memory and the
 * print buffer is what the next turn reads, so nothing is filed on the way out:
 * the transition carries only the current intent.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const replTransition: (intent: Intent | undefined, justification: string | undefined) => Cell.Transition;
/**
 * One cell evaluated inside a realm that outlives it.
 *
 * `frame` names the evaluation for the realm's own stack traces, so a throw
 * reported in frame 7 says which cell threw.
 *
 * @category models
 * @since 0.1.0
 */
export interface RealmEvaluation {
    /** Reconstruct a timed-out frame only through its recorded bridge prefix. */
    readonly replay?: {
        readonly boundary: typeof FrameBoundary.Type;
        readonly outcome: Cell.Outcome;
    } | undefined;
    /** Replaces ctx.flows with this frame's frozen catalog; omitted keeps the current catalog. */
    readonly flows?: Readonly<Record<string, Cell.FlowProjection>> | undefined;
    readonly cell: Cell.Source;
    /**
     * The program the controller's boundary parse already compiled from `cell`.
     *
     * A binding evaluates this verbatim when it is present, because the parse it
     * would do is the parse the boundary already did: a controller runs
     * {@link compile} before it commits a frame, so a binding that parses the
     * cell again parses every cell of the run twice. Omitted means the binding
     * compiles the cell itself, which is what a host driving a realm directly
     * does.
     */
    readonly program?: string | undefined;
    readonly frame: number;
    readonly call: Handler;
    /**
     * Settles a `ctx.checkpoint()` issued by this cell.
     *
     * Optional, and absent means the caller pins no trees — which the cell is
     * told through a resolved failure envelope at the line it asked. It is a
     * separate collaborator from `call` because a checkpoint is not a flow:
     * it is neither in the catalog nor
     * subject to the capability envelope, and the run's own bound on how many
     * trees it may pin is the controller's, not any flow's.
     */
    readonly mint?: Minter | undefined;
    /**
     * Whether the caller bounds each settlement itself.
     *
     * The loop's own {@link Limits.callMs} ceiling is a clock race it synthesizes
     * a failure from, and that failure is journaled nowhere: the call it
     * interrupted never settled, so nothing downstream holds a result for it. A
     * re-executed cell runs the same call again against a world that has moved
     * on, gets an answer this time, and takes a branch the original attempt never
     * took — with every irreversible effect below the fork bought twice.
     *
     * A caller that journals its settlements applies the same ceiling itself, in
     * front of the boundary that records what the ceiling produced, and sets this
     * so the loop adds none of its own — because two clocks racing one call means
     * the unrecorded one wins: the loop's starts first.
     */
    readonly bounded?: boolean | undefined;
    /** Validated overrides for this frame only; memory is fixed when the realm opens. */
    readonly limits?: EvaluationLimits | undefined;
}
/**
 * The bridge frontier at a frame limit. Ordinals are zero-based;
 * minus one means no dispatch or settlement occurred. A dispatched call may
 * have been interrupted before its settlement was delivered to JavaScript.
 * `timeout` requires truncating replay; `settled` identifies a limit the
 * interpreter completed itself, such as its step or call budget.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const FrameBoundary: Schema.Struct<{
    readonly terminal: Schema.Literals<readonly ["timeout", "settled"]>;
    readonly dispatched: Schema.Int;
    readonly settled: Schema.Int;
}>;
/**
 * Everything one REPL frame produced.
 *
 * @category models
 * @since 0.1.0
 */
export interface RealmFrame {
    /** Present when evaluation ended at a frame limit. */
    readonly boundary?: typeof FrameBoundary.Type | undefined;
    readonly outcome: Cell.Outcome;
    /** What the cell printed, already bounded; empty when it printed nothing. */
    readonly prints: string;
    /** Every name the realm holds after the cell ran. */
    readonly bindings: ReadonlyArray<VariablesPanel.Binding>;
}
/**
 * A JavaScript realm that persists across the cells of one run.
 *
 * Teardown is scope closure, so a realm is acquired by the loop that uses it and
 * cancellation is still fiber interruption.
 *
 * @category services
 * @since 0.1.0
 */
export interface Realm {
    readonly evaluate: (evaluation: RealmEvaluation) => Effect.Effect<RealmFrame, SandboxError | HarnessError>;
}
/**
 * The initial catalog and limits a realm is opened with.
 *
 * @category models
 * @since 0.1.0
 */
export interface RealmOptions {
    /** The original request, exposed as immutable `ctx.task` without model output. */
    readonly task?: string | undefined;
    readonly flows: Readonly<Record<string, Cell.FlowProjection>>;
    /**
     * The ceilings the realm enforces. `memoryBytes` becomes a **run** budget once
     * a realm outlives a cell, judged at each frame's start against what the
     * realm's own names weigh; a frame that opens over it runs nothing and is told
     * which names to free. Every other ceiling stays per-frame, because they are
     * counters the interrupt handler reads rather than properties of the runtime.
     */
    readonly limits?: Limits | undefined;
}
/**
 * The deterministic script sandbox.
 *
 * @category services
 * @since 0.1.0
 * @slop
 */
export interface Sandbox {
    readonly capabilities: Capabilities;
    /**
     * Opens the realm the run's cells share.
     *
     * Absent on a binding that has no persistent realm to offer, which is what a
     * host composing such a binding is told when the run opens rather than in the
     * middle of a frame. A realm is the only way a cell runs: there is no
     * per-frame evaluation beside it, because a cell that could not see what the
     * cell before it bound was the surface this harness deleted.
     */
    readonly openRealm?: (options: RealmOptions) => Effect.Effect<Realm, SandboxError, Scope.Scope>;
}
/**
 * Context service for the selected sandbox binding.
 *
 * @category services
 * @since 0.1.0
 * @slop
 */
export declare const Sandbox: Context.Service<Sandbox, Sandbox>;
/**
 * Constructs a sandbox from an implementation.
 *
 * @category constructors
 * @since 0.1.0
 * @slop
 */
export declare const make: (implementation: Sandbox) => Sandbox;
/**
 * Provides a sandbox implementation.
 *
 * @category layers
 * @since 0.1.0
 * @slop
 */
export declare const layer: (implementation: Sandbox) => Layer.Layer<Sandbox>;
/**
 * Constructs an unavailable sandbox stub, optionally overriding operations.
 *
 * It offers no realm, which is what a run composed against it is told: see
 * {@link realmUnsupported}.
 *
 * @category constructors
 * @since 0.1.0
 * @slop
 */
export declare const makeNoop: (overrides?: Partial<Sandbox>) => Sandbox;
/**
 * Provides an unavailable sandbox stub.
 *
 * @category layers
 * @since 0.1.0
 * @slop
 */
export declare const layerNoop: (overrides?: Partial<Sandbox>) => Layer.Layer<Sandbox>;
/**
 * Refuses a run on a binding that has no persistent realm.
 *
 * Stated rather than silently downgraded: a realm is the whole surface, so a
 * binding without one cannot run a cell at all and saying so at the open is the
 * only honest answer.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const realmUnsupported: SandboxError;
/**
 * Settles one overrunning flow call as a resolved failure envelope in the cell.
 *
 * The message is written for the model, because the model is who reads it: it
 * names the flow, the budget it spent, and the one action that recovers the
 * frame. A rejection at the whole-evaluation ceiling teaches the model nothing
 * — the frame is already gone by the time it could act.
 *
 * Exported so a caller that bounds its own settlements
 * ({@link RealmEvaluation.bounded}) synthesizes the same refusal the loop would
 * have: one ceiling means one sentence, whichever clock enforced it.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const callTimedOut: (flow: string, callMs: number) => Cell.CallResult;
/**
 * The wall-clock ceiling one call runs under, in milliseconds.
 *
 * `callMs` bounds a call that names no time of its own. A call that asks for
 * longer with `timeoutMs`, as `bash` and `test` take, runs that long instead,
 * because a ceiling under the call's own clock cuts work its flow promised to
 * wait for: on the 2026-10-14 SWE-bench Pro run, 9 of the 13 commands cut at a
 * 120 s ceiling had asked for 180 s or 600 s. The request is held to what the
 * frame has left, so the call settles as a timeout the cell reads instead of
 * taking its frame down unanswered.
 *
 * @category constructors
 * @since 1.0.0-rc.8
 */
export declare const callLimit: (callMs: number, invocation: Pick<Invocation, "input" | "remainingMs">) => number;
/**
 * Erases type-only syntax from a cell without evaluating or resolving modules.
 *
 * Only Node's strip-safe TypeScript subset is accepted. Constructs that need
 * JavaScript emit are refused instead of being silently transformed into new
 * runtime behaviour.
 *
 * The parse itself belongs to `CellValidation`, which the controller already
 * runs at the boundary before it commits a frame; this is the same answer, for
 * a binding that only needs the program or the reason there is none.
 *
 * @category conversions
 * @since 0.1.0
 * @slop
 */
export declare const compile: (cell: Cell.Source) => string | Cell.Rejected;
/**
 * A queued call awaiting resolution by a binding's driver.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface PendingCall {
    readonly ordinal: number;
    readonly flow: string;
    readonly input: Schema.Json;
    /** Undecoded `at` option; see {@link Invocation.at}. */
    readonly at?: Schema.Json | undefined;
    /** See {@link Invocation.declared}. */
    readonly declared?: boolean | undefined;
    /**
     * Whether this entry is a flow call or a request to pin the tree.
     *
     * Both ride one queue because both have to be ordered against each other: a
     * mint that overtook an edit, or an edit that overtook a mint, would pin the
     * wrong tree. Absent means `call`, so every binding that queues an ordinary
     * call is unchanged.
     */
    readonly kind?: "call" | "checkpoint" | undefined;
    readonly settle: (result: Cell.CallResult) => void;
    readonly abort: (message: string) => void;
}
/**
 * Drives one externally compiled cell to settlement: settle queued calls one at
 * a time, in the order the cell issued them, until the cell settles.
 *
 * One at a time is deliberate. Data-dependent calls are the normal case, and a
 * deterministic execution ordinal is what makes a mid-cell crash replayable.
 *
 * Bindings differ only in how a cell is compiled and how its promises are
 * settled, so the interleaving lives here once rather than in each of them.
 *
 * @category constructors
 * @since 0.1.0
 * @slop
 */
export declare const driveCell: (options: {
    readonly replay?: RealmEvaluation["replay"];
    readonly progress?: ((dispatched: number, settled: number) => void) | undefined;
    readonly pending: Array<PendingCall>;
    /** Called after each resolved call so a binding may flush its job queue. */
    readonly flush: () => void;
    readonly finished: () => Cell.Outcome | undefined;
    readonly abort: (message: string) => void;
    readonly handler: Handler;
    /** Settles a `ctx.checkpoint()`; omitted means the run pins none. */
    readonly mint?: Minter | undefined;
    /** Whether the caller bounds each settlement itself; see {@link RealmEvaluation.bounded}. */
    readonly bounded?: boolean | undefined;
    /** What the frame's backstop has left for a call to this flow; see {@link Invocation.remainingMs}. */
    readonly remainingMs?: ((flow: string) => number | undefined) | undefined;
    readonly limits?: Limits | undefined;
}) => Effect.Effect<Cell.Outcome, SandboxError | HarnessError>;
/**
 * Projects a thrown value into a stable serializable cell outcome.
 *
 * @category conversions
 * @since 0.1.0
 * @slop
 */
export declare const raisedOutcome: (error: unknown) => Cell.Raised;
