/**
 * Serializable events emitted by harness adapters.
 *
 * @since 0.1.0
 */
import * as Permission from "@smthrs/capability/Permission";
import type * as Classifier from "@smthrs/model/Classifier";
import * as Evaluator from "@smthrs/model/Evaluator";
import * as ModelEvent from "@smthrs/model/ModelEvent";
import * as ModelRequest from "@smthrs/model/ModelRequest";
import { Context, Effect, Schema } from "effect";
import * as Cell from "./Cell.ts";
import * as EngineLike from "./EngineLike.ts";
/**
 * Observes an event before the controller advances or parks. Durable hosts
 * finish their checkpoint here; stream consumers may lag behind the source.
 * @category services
 * @since 1.0.0-rc.0
 */
export declare const Observer: Context.Reference<(event: AgentEvent) => Effect.Effect<void>>;
/**
 * Journals an event into the run whose cell called the current flow. The
 * controller provides it around each flow call, so a flow that asks Jev
 * itself journals its receipts beside the run's own. Outside a run there is
 * no journal, and it does nothing.
 * @category services
 * @since 1.0.0-rc.0
 */
export declare const Journal: Context.Reference<(event: AgentEvent) => Effect.Effect<void>>;
/**
 * The kind of a human-provided item a relevance reading may withhold.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export declare const RelevanceKind: Schema.Literals<readonly ["flow", "skill", "instruction", "memory"]>;
/**
 * What a compaction reading did with one replaced message.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export declare const CompactionMark: Schema.Literals<readonly ["keep", "squash", "remove"]>;
/**
 * The invariant that kept a message from being removed, whatever it was marked.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export declare const CompactionPin: Schema.Literals<readonly ["summary", "person", "steering", "mutated", "failing", "pair", "budget"]>;
/**
 * Why a compaction ran: the context `budget` was crossed, or a drained
 * supervisor reading found a context above `Compaction.judgedAbove` tokens
 * carrying `outdated_context` or `irrelevant_context`.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export declare const CompactionCause: Schema.Literals<readonly ["budget", "outdated_context", "irrelevant_context"]>;
/**
 * What a supervisor monitor watches for.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export declare const MonitorKind: Schema.Literals<readonly ["mood", "skill", "lint"]>;
/**
 * The static stance a run's monitors deliver under.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export declare const Stance: Schema.Literals<readonly ["careful", "paranoid"]>;
/**
 * Why a crossed monitor was not delivered.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export declare const Suppression: Schema.Literals<readonly ["streak", "cooldown", "limit", "slot"]>;
/**
 * Why a reading could not be judged: `unconfigured`, `interrupted`, or the
 * transport's own error code.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export declare const UnjudgedReason: Schema.Literals<readonly ["interrupted", "unconfigured", "unreachable", "refused", "empty", "timeout", "invalid_answer", "invalid_question"]>;
declare const DisciplineArmed_base: Schema.Class<DisciplineArmed, Schema.TaggedStruct<"discipline-armed", {
    readonly eventType: Schema.Literal<"flows.harness.discipline-armed.v1">;
    /** Consecutive read-only frames allowed; zero means the cap is disarmed. */
    readonly readOnlyCap: Schema.Number;
    /** The frame budget the run stops at. */
    readonly maxFrames: Schema.Number;
    /**
     * Whether a human can answer this run.
     *
     * False says nothing is listening: a `park` transition is refused and
     * answered in the frame that returned it, because a run that waits for an
     * answer nobody will give has stopped working with its budget unspent.
     */
    readonly approvalChannel: Schema.Boolean;
    /**
     * Wall-clock milliseconds one model call may spend; zero means disarmed.
     *
     * Every other budget here caps the cell — the calls it makes, the memory and
     * time its code spends, the run's frames. This one caps the step in between,
     * which was the only unbounded thing the loop did.
     */
    readonly modelCallMs: Schema.Number;
    /**
     * Consecutive repeat-observation frames allowed; zero disarms the demand.
     *
     * Armed here for the same reason the read-only cap is: a run that never
     * reaches a control proves nothing about whether the control was armed, and
     * a grader must be able to tell "armed and never needed" from "never armed".
     */
    readonly repeatCap: Schema.Number;
    /**
     * Completions this run may have bounced for narrowed evidence; zero disarms.
     *
     * Journaled with the rest because the demand it governs fires at most once
     * in a run and often not at all, so its absence from a wave says nothing on
     * its own. One is the armed default: the loop names the missing check once,
     * and the answer that comes back is the answer that stands.
     */
    readonly narrowingCap: Schema.Number;
    /**
     * Completions this run may have bounced for an unmoved tree; zero disarms.
     *
     * Journaled for the same reason as the other two completion caps: the demand
     * fires at most once and usually not at all, so a wave that records none must
     * be able to say whether the control was armed and never needed.
     */
    readonly unmovedCap: Schema.Number;
    /**
     * Times one frame may answer its own unparseable cell before ending; zero
     * disarms the answer.
     *
     * Journaled with the rest because a wave that records no
     * `cell-rejected-in-frame` must be able to say whether the answer was armed
     * and never needed or never armed at all.
     */
    readonly revalidations: Schema.withDecodingDefaultKey<Schema.withConstructorDefault<Schema.Number>, never>;
    /**
     * Completions this run may have bounced for a failing check it replaced
     * rather than answered; zero disarms.
     */
    readonly unresolvedCap: Schema.Number;
    /**
     * Completions this run may have bounced for a claim its own record does not
     * support; zero disarms.
     *
     * Journaled with the other completion caps, and it says less than they do on
     * its own: the control it arms is also a no-op wherever no `Evaluator` is
     * bound, so an armed cap and no `claim-demanded` event anywhere in a run
     * means either that nothing was asked or that everything asked came back
     * inside the thresholds. Defaulted so journals written before this control
     * existed decode unchanged. See `CompletionClaim`.
     */
    readonly claimCap: Schema.withDecodingDefaultKey<Schema.withConstructorDefault<Schema.Number>, never>;
    /**
     * Whether a supervisor reading could nudge the run, as journals written
     * before {@link judged} said it. Later writers omit it: `judged` says the
     * same.
     */
    readonly supervisorSteer: Schema.optional<Schema.Boolean>;
    /** Maximum calls per cell, when this binding can enforce one. */
    readonly calls: Schema.optional<Schema.Number>;
    /** Maximum sandbox heap, when this binding can enforce one. */
    readonly memoryBytes: Schema.optional<Schema.Number>;
    /** Maximum interpreter steps, when this binding can enforce one. */
    readonly steps: Schema.optional<Schema.Number>;
    /** Maximum cell-compute time, when this binding can enforce one. */
    readonly timeMs: Schema.optional<Schema.Number>;
    /** Maximum whole-evaluation time, when this binding can enforce one. */
    readonly totalMs: Schema.optional<Schema.Number>;
    /** Maximum wall-clock time for one flow call. */
    readonly callMs: Schema.optional<Schema.Number>;
    /** Whether a judge was bound, so Jev's readings run. Absent before it existed. */
    readonly judged: Schema.optional<Schema.Boolean>;
    /** The relevance gate: the withhold threshold and the item ids never offered to it. */
    readonly relevance: Schema.optional<Schema.Struct<{
        readonly withholdAt: Schema.Number;
        readonly pinned: Schema.$Array<Schema.String>;
    }>>;
    /** The supervisor monitors armed, with their delivery gates. */
    readonly monitors: Schema.optional<Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly kind: Schema.Literals<readonly ["mood", "skill", "lint"]>;
        /** The probability at or above which the monitor crosses. */
        readonly at: Schema.Number;
        /** Consecutive crossed readings required before a delivery. */
        readonly consecutive: Schema.Int;
        /** Frames after a delivery during which the monitor is not delivered again. */
        readonly cooldownFrames: Schema.Int;
        /** Deliveries allowed in one run. */
        readonly limit: Schema.Int;
    }>>>;
    /** The static stance the monitors deliver under. */
    readonly stance: Schema.optional<Schema.Literals<readonly ["careful", "paranoid"]>>;
}>, {}>;
/**
 * The loop discipline a run was armed with, journaled once when it starts.
 *
 * Arming used to be observable only through the events a disciplined run
 * *reaches*: the read-cap failure proves the cap was armed, and a run that
 * times out before it fires proves nothing — so a grader could not tell "armed
 * but never reached" from "never armed", which is exactly what the 2026-08-19
 * SWE-bench wave could not decide about its django instance. This event is the
 * positive record: it says what was armed, before anything has had a chance to
 * fire.
 *
 * @category events
 * @since 0.1.0
 * @slop
 */
export declare class DisciplineArmed extends DisciplineArmed_base {
}
declare const TurnOpened_base: Schema.Class<TurnOpened, Schema.TaggedStruct<"turn-opened", {
    readonly eventType: Schema.Literal<"flows.harness.turn-opened.v1">;
    readonly seat: Schema.String;
    readonly modelParams: typeof ModelRequest.GenerationParams;
    /**
     * The tool set the turn opened with, which the cell-first controller always
     * opens empty: it declares no provider tools. The field stays on the event
     * so journals written before the provider-tool loop was retired keep
     * decoding, and so a foreign-adapter loop has somewhere to put one.
     */
    readonly activeToolNames: Schema.$Array<Schema.String>;
    readonly contextDigest: Schema.String;
}>, {}>;
/**
 * The serializable snapshot fixed when a turn opens.
 *
 * @category events
 * @since 0.1.0
 * @slop
 */
export declare class TurnOpened extends TurnOpened_base {
}
declare const ModelRequested_base: Schema.Class<ModelRequested, Schema.TaggedStruct<"model-requested", {
    readonly eventType: Schema.Literal<"flows.harness.model-requested.v1">;
    /** The run's session, which is the recorded scope of the step that made the call. */
    readonly scope: Schema.String;
    /** The controller's frame number for the turn this call belongs to. */
    readonly frame: Schema.Int;
    /** Which model call of that frame and purpose this is, counting from one. */
    readonly attempt: Schema.Int;
    /** What the call is for: the frame's own turn, or the compaction ahead of it. */
    readonly purpose: Schema.Literals<readonly ["frame", "compaction"]>;
    /** The seat the frame ran on, as `turn-opened` names it. */
    readonly seat: Schema.String;
    /** The route the host resolved, absent where the host names none. */
    readonly binding: Schema.optional<typeof EngineLike.Binding>;
    /** The request the provider is sent, whole: after any rewrite the host applies. */
    readonly request: typeof ModelRequest.ModelRequest;
    /**
     * Why the frame is asking again: the code `cell-rejected-in-frame` refused
     * the attempt before this one with. Absent on a frame's first call.
     */
    readonly reask: Schema.optional<Schema.Literals<readonly ["no_cell", "output_truncated", "imports_forbidden", "compile_failed", "invalid_transition", "unsupported_language", "limit_exceeded", "stalled"]>>;
}>, {}>;
/**
 * What one model call was asked, written before the call is made.
 *
 * `model-settled` journals what a call answered and what it cost, and until
 * this event nothing journaled what it was asked: the request existed only in
 * the sealed step's key material, as a digest. A reader that wants to open one
 * step and run it again needs the request itself, so this is the request
 * itself, carried whole here and bounded where it is journaled.
 *
 * It is written when the call is OPENED rather than when it settles, so a call
 * that never settles (a deadline, a refusal, a process that died mid-stream)
 * still leaves what it asked on the record.
 *
 * `scope`, `frame` and `attempt` are the join keys, and they are on the record
 * because position is not one. `scope` is the run's session, which for a
 * module step is the step's recorded scope; `frame` is the controller's own
 * frame number; `attempt` counts the model calls one frame made, from one,
 * and is the same number `cell-rejected-in-frame` names when it refuses that
 * call's answer. A compaction call runs before its frame's `turn-opened`, so a
 * reader counting turns would file it under the frame before; `purpose` and
 * `frame` say where it belongs.
 *
 * Credential-free by construction. The request is the provider-neutral
 * `ModelRequest`, which has no member a credential can occupy, and
 * {@link EngineLike.Binding} carries two names read off the prepared request
 * that exists before any secret is signed on.
 *
 * @category events
 * @since 1.0.0-rc.0
 */
export declare class ModelRequested extends ModelRequested_base {
}
declare const ModelSelected_base: Schema.Class<ModelSelected, Schema.TaggedStruct<"model-selected", {
    readonly eventType: Schema.Literal<"flows.harness.model-selected.v1">;
    readonly seat: Schema.String;
}>, {}>;
/**
 * The host selected the seat that will receive this capacity attempt.
 * @category events
 * @since 1.0.0-rc.1
 */
export declare class ModelSelected extends ModelSelected_base {
}
declare const SeatFailedOver_base: Schema.Class<SeatFailedOver, Schema.TaggedStruct<"seat-failed-over", {
    readonly eventType: Schema.Literal<"flows.harness.seat-failed-over.v1">;
    readonly from: Schema.String;
    readonly to: Schema.String;
    readonly code: Schema.Literals<readonly ["invalid_request", "context_overflow", "no_route", "authentication", "rate_limited", "quota_exceeded", "out_of_credit", "content_policy", "provider_internal", "transport", "call_timeout", "invalid_provider_output", "unknown"]>;
    readonly resetAtEpochMillis: Schema.optional<Schema.Number>;
    readonly retryAfterMillis: Schema.optional<Schema.Number>;
    readonly httpStatus: Schema.optional<Schema.Number>;
    readonly quotaScope: Schema.optional<Schema.Literals<readonly ["account", "model"]>>;
}>, {}>;
/**
 * A capacity refusal moved the current frame to another seat.
 * @category events
 * @since 1.0.0-rc.1
 */
export declare class SeatFailedOver extends SeatFailedOver_base {
}
declare const ModelParked_base: Schema.Class<ModelParked, Schema.TaggedStruct<"model-parked", {
    readonly eventType: Schema.Literal<"flows.harness.model-parked.v1">;
    readonly seat: Schema.String;
    readonly wakeAt: Schema.Number;
    readonly source: Schema.Literals<readonly ["reset", "retry-after", "default"]>;
    readonly code: Schema.Literals<readonly ["invalid_request", "context_overflow", "no_route", "authentication", "rate_limited", "quota_exceeded", "out_of_credit", "content_policy", "provider_internal", "transport", "call_timeout", "invalid_provider_output", "unknown"]>;
}>, {}>;
/**
 * All configured model seats are cooling until this instant.
 * @category events
 * @since 1.0.0-rc.1
 */
export declare class ModelParked extends ModelParked_base {
}
declare const ModelUnparked_base: Schema.Class<ModelUnparked, Schema.TaggedStruct<"model-unparked", {
    readonly eventType: Schema.Literal<"flows.harness.model-unparked.v1">;
    readonly seat: Schema.String;
    readonly at: Schema.Number;
}>, {}>;
/**
 * A parked model frame may issue a new request.
 * @category events
 * @since 1.0.0-rc.1
 */
export declare class ModelUnparked extends ModelUnparked_base {
}
declare const ModelDelta_base: Schema.Class<ModelDelta, Schema.TaggedStruct<"model-delta", {
    readonly eventType: Schema.Literal<"flows.harness.model-delta.v1">;
    readonly delta: Schema.Union<readonly [Schema.Struct<{
        readonly type: Schema.Literal<"text-start">;
        readonly id: Schema.String;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"text-delta">;
        readonly id: Schema.String;
        readonly text: Schema.String;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"text-end">;
        readonly id: Schema.String;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"thinking-start">;
        readonly id: Schema.String;
        readonly signature: Schema.optional<Schema.String>;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"thinking-delta">;
        readonly id: Schema.String;
        readonly text: Schema.String;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"thinking-end">;
        readonly id: Schema.String;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"tool-call-start">;
        readonly id: Schema.String;
        readonly name: Schema.String;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"tool-call-delta">;
        readonly id: Schema.String;
        readonly arguments: Schema.String;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"tool-call-end">;
        readonly id: Schema.String;
        readonly arguments: Schema.optional<Schema.String>;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"tool-result">;
        readonly id: Schema.String;
        readonly output: Schema.String;
        readonly isError: Schema.optional<Schema.Boolean>;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"usage">;
        readonly inputTokens: Schema.optional<Schema.Number>;
        readonly outputTokens: Schema.optional<Schema.Number>;
        readonly reasoningTokens: Schema.optional<Schema.Number>;
        readonly cachedInputTokens: Schema.optional<Schema.Number>;
        readonly cacheWriteTokens: Schema.optional<Schema.Number>;
        readonly totalTokens: Schema.optional<Schema.Number>;
        readonly costUsd: Schema.optional<Schema.Number>;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"retry">;
        readonly attempt: Schema.Int;
        readonly code: Schema.String;
        readonly delayMillis: Schema.withDecodingDefaultKey<Schema.withConstructorDefault<Schema.Number>, never>;
        readonly elapsedMs: Schema.optional<Schema.Number>;
        readonly httpStatus: Schema.optional<Schema.Number>;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"settle">;
        readonly stopReason: Schema.Literals<readonly ["stop", "length", "tool-calls", "content-filter", "error", "aborted", "unknown"]>;
        readonly responseId: Schema.optional<Schema.String>;
        readonly servedTier: Schema.optional<Schema.String>;
        readonly timing: Schema.optional<Schema.Struct<{
            readonly startedAt: Schema.optional<Schema.Number>;
            readonly attempts: Schema.optional<Schema.Int>;
            readonly requestBytes: Schema.optional<Schema.Number>;
            readonly preparedMs: Schema.optional<Schema.Number>;
            readonly signedMs: Schema.optional<Schema.Number>;
            readonly sentMs: Schema.optional<Schema.Number>;
            readonly headersMs: Schema.optional<Schema.Number>;
            readonly firstEventMs: Schema.optional<Schema.Number>;
            readonly firstThinkingMs: Schema.optional<Schema.Number>;
            readonly firstOutputMs: Schema.optional<Schema.Number>;
            readonly lastOutputMs: Schema.optional<Schema.Number>;
            readonly completedMs: Schema.optional<Schema.Number>;
            readonly closedMs: Schema.optional<Schema.Number>;
            readonly failedTries: Schema.optional<Schema.$Array<Schema.Struct<{
                readonly sentMs: Schema.optional<Schema.Number>;
                readonly failedMs: Schema.Number;
                readonly code: Schema.String;
                readonly httpStatus: Schema.optional<Schema.Number>;
            }>>>;
        }>>;
        readonly sessionId: Schema.optional<Schema.String>;
        readonly itemIds: Schema.optional<Schema.$Array<Schema.String>>;
    }>]> & {
        readonly tag: "type";
        readonly discriminants: readonly ["text-start", "text-delta", "text-end", "thinking-start", "thinking-delta", "thinking-end", "tool-call-start", "tool-call-delta", "tool-call-end", "tool-result", "usage", "retry", "settle"];
        readonly cases: {
            retry: Schema.Struct<{
                readonly type: Schema.Literal<"retry">;
                readonly attempt: Schema.Int;
                readonly code: Schema.String;
                readonly delayMillis: Schema.withDecodingDefaultKey<Schema.withConstructorDefault<Schema.Number>, never>;
                readonly elapsedMs: Schema.optional<Schema.Number>;
                readonly httpStatus: Schema.optional<Schema.Number>;
            }>;
            settle: Schema.Struct<{
                readonly type: Schema.Literal<"settle">;
                readonly stopReason: Schema.Literals<readonly ["stop", "length", "tool-calls", "content-filter", "error", "aborted", "unknown"]>;
                readonly responseId: Schema.optional<Schema.String>;
                readonly servedTier: Schema.optional<Schema.String>;
                readonly timing: Schema.optional<Schema.Struct<{
                    readonly startedAt: Schema.optional<Schema.Number>;
                    readonly attempts: Schema.optional<Schema.Int>;
                    readonly requestBytes: Schema.optional<Schema.Number>;
                    readonly preparedMs: Schema.optional<Schema.Number>;
                    readonly signedMs: Schema.optional<Schema.Number>;
                    readonly sentMs: Schema.optional<Schema.Number>;
                    readonly headersMs: Schema.optional<Schema.Number>;
                    readonly firstEventMs: Schema.optional<Schema.Number>;
                    readonly firstThinkingMs: Schema.optional<Schema.Number>;
                    readonly firstOutputMs: Schema.optional<Schema.Number>;
                    readonly lastOutputMs: Schema.optional<Schema.Number>;
                    readonly completedMs: Schema.optional<Schema.Number>;
                    readonly closedMs: Schema.optional<Schema.Number>;
                    readonly failedTries: Schema.optional<Schema.$Array<Schema.Struct<{
                        readonly sentMs: Schema.optional<Schema.Number>;
                        readonly failedMs: Schema.Number;
                        readonly code: Schema.String;
                        readonly httpStatus: Schema.optional<Schema.Number>;
                    }>>>;
                }>>;
                readonly sessionId: Schema.optional<Schema.String>;
                readonly itemIds: Schema.optional<Schema.$Array<Schema.String>>;
            }>;
            "text-delta": Schema.Struct<{
                readonly type: Schema.Literal<"text-delta">;
                readonly id: Schema.String;
                readonly text: Schema.String;
            }>;
            "text-end": Schema.Struct<{
                readonly type: Schema.Literal<"text-end">;
                readonly id: Schema.String;
            }>;
            "text-start": Schema.Struct<{
                readonly type: Schema.Literal<"text-start">;
                readonly id: Schema.String;
            }>;
            "thinking-delta": Schema.Struct<{
                readonly type: Schema.Literal<"thinking-delta">;
                readonly id: Schema.String;
                readonly text: Schema.String;
            }>;
            "thinking-end": Schema.Struct<{
                readonly type: Schema.Literal<"thinking-end">;
                readonly id: Schema.String;
            }>;
            "thinking-start": Schema.Struct<{
                readonly type: Schema.Literal<"thinking-start">;
                readonly id: Schema.String;
                readonly signature: Schema.optional<Schema.String>;
            }>;
            "tool-call-delta": Schema.Struct<{
                readonly type: Schema.Literal<"tool-call-delta">;
                readonly id: Schema.String;
                readonly arguments: Schema.String;
            }>;
            "tool-call-end": Schema.Struct<{
                readonly type: Schema.Literal<"tool-call-end">;
                readonly id: Schema.String;
                readonly arguments: Schema.optional<Schema.String>;
            }>;
            "tool-call-start": Schema.Struct<{
                readonly type: Schema.Literal<"tool-call-start">;
                readonly id: Schema.String;
                readonly name: Schema.String;
            }>;
            "tool-result": Schema.Struct<{
                readonly type: Schema.Literal<"tool-result">;
                readonly id: Schema.String;
                readonly output: Schema.String;
                readonly isError: Schema.optional<Schema.Boolean>;
            }>;
            usage: Schema.Struct<{
                readonly type: Schema.Literal<"usage">;
                readonly inputTokens: Schema.optional<Schema.Number>;
                readonly outputTokens: Schema.optional<Schema.Number>;
                readonly reasoningTokens: Schema.optional<Schema.Number>;
                readonly cachedInputTokens: Schema.optional<Schema.Number>;
                readonly cacheWriteTokens: Schema.optional<Schema.Number>;
                readonly totalTokens: Schema.optional<Schema.Number>;
                readonly costUsd: Schema.optional<Schema.Number>;
            }>;
        };
        readonly isAnyOf: <const Keys>(keys: readonly Keys[]) => (value: {
            readonly type: "text-start";
            readonly id: string;
        } | {
            readonly type: "text-delta";
            readonly id: string;
            readonly text: string;
        } | {
            readonly type: "text-end";
            readonly id: string;
        } | {
            readonly type: "thinking-delta";
            readonly id: string;
            readonly text: string;
        } | {
            readonly type: "thinking-end";
            readonly id: string;
        } | {
            readonly type: "tool-call-start";
            readonly id: string;
            readonly name: string;
        } | {
            readonly type: "tool-call-delta";
            readonly id: string;
            readonly arguments: string;
        } | {
            readonly type: "thinking-start";
            readonly id: string;
            readonly signature?: string | undefined;
        } | {
            readonly type: "tool-call-end";
            readonly id: string;
            readonly arguments?: string | undefined;
        } | {
            readonly type: "tool-result";
            readonly id: string;
            readonly output: string;
            readonly isError?: boolean | undefined;
        } | {
            readonly type: "usage";
            readonly inputTokens?: number | undefined;
            readonly outputTokens?: number | undefined;
            readonly reasoningTokens?: number | undefined;
            readonly cachedInputTokens?: number | undefined;
            readonly cacheWriteTokens?: number | undefined;
            readonly totalTokens?: number | undefined;
            readonly costUsd?: number | undefined;
        } | {
            readonly type: "retry";
            readonly attempt: number;
            readonly code: string;
            readonly delayMillis: number;
            readonly elapsedMs?: number | undefined;
            readonly httpStatus?: number | undefined;
        } | {
            readonly type: "settle";
            readonly stopReason: "aborted" | "content-filter" | "error" | "length" | "stop" | "tool-calls" | "unknown";
            readonly responseId?: string | undefined;
            readonly servedTier?: string | undefined;
            readonly timing?: {
                readonly startedAt?: number | undefined;
                readonly attempts?: number | undefined;
                readonly requestBytes?: number | undefined;
                readonly preparedMs?: number | undefined;
                readonly signedMs?: number | undefined;
                readonly sentMs?: number | undefined;
                readonly headersMs?: number | undefined;
                readonly firstEventMs?: number | undefined;
                readonly firstThinkingMs?: number | undefined;
                readonly firstOutputMs?: number | undefined;
                readonly lastOutputMs?: number | undefined;
                readonly completedMs?: number | undefined;
                readonly closedMs?: number | undefined;
                readonly failedTries?: readonly {
                    readonly sentMs?: number | undefined;
                    readonly failedMs: number;
                    readonly code: string;
                    readonly httpStatus?: number | undefined;
                }[] | undefined;
            } | undefined;
            readonly sessionId?: string | undefined;
            readonly itemIds?: readonly string[] | undefined;
        }) => value is Extract<{
            readonly type: "text-start";
            readonly id: string;
        }, {
            readonly type: Keys;
        }> | Extract<{
            readonly type: "text-delta";
            readonly id: string;
            readonly text: string;
        }, {
            readonly type: Keys;
        }> | Extract<{
            readonly type: "text-end";
            readonly id: string;
        }, {
            readonly type: Keys;
        }> | Extract<{
            readonly type: "thinking-delta";
            readonly id: string;
            readonly text: string;
        }, {
            readonly type: Keys;
        }> | Extract<{
            readonly type: "thinking-end";
            readonly id: string;
        }, {
            readonly type: Keys;
        }> | Extract<{
            readonly type: "tool-call-start";
            readonly id: string;
            readonly name: string;
        }, {
            readonly type: Keys;
        }> | Extract<{
            readonly type: "tool-call-delta";
            readonly id: string;
            readonly arguments: string;
        }, {
            readonly type: Keys;
        }> | Extract<{
            readonly type: "thinking-start";
            readonly id: string;
            readonly signature?: string | undefined;
        }, {
            readonly type: Keys;
        }> | Extract<{
            readonly type: "tool-call-end";
            readonly id: string;
            readonly arguments?: string | undefined;
        }, {
            readonly type: Keys;
        }> | Extract<{
            readonly type: "tool-result";
            readonly id: string;
            readonly output: string;
            readonly isError?: boolean | undefined;
        }, {
            readonly type: Keys;
        }> | Extract<{
            readonly type: "usage";
            readonly inputTokens?: number | undefined;
            readonly outputTokens?: number | undefined;
            readonly reasoningTokens?: number | undefined;
            readonly cachedInputTokens?: number | undefined;
            readonly cacheWriteTokens?: number | undefined;
            readonly totalTokens?: number | undefined;
            readonly costUsd?: number | undefined;
        }, {
            readonly type: Keys;
        }> | Extract<{
            readonly type: "retry";
            readonly attempt: number;
            readonly code: string;
            readonly delayMillis: number;
            readonly elapsedMs?: number | undefined;
            readonly httpStatus?: number | undefined;
        }, {
            readonly type: Keys;
        }> | Extract<{
            readonly type: "settle";
            readonly stopReason: "aborted" | "content-filter" | "error" | "length" | "stop" | "tool-calls" | "unknown";
            readonly responseId?: string | undefined;
            readonly servedTier?: string | undefined;
            readonly timing?: {
                readonly startedAt?: number | undefined;
                readonly attempts?: number | undefined;
                readonly requestBytes?: number | undefined;
                readonly preparedMs?: number | undefined;
                readonly signedMs?: number | undefined;
                readonly sentMs?: number | undefined;
                readonly headersMs?: number | undefined;
                readonly firstEventMs?: number | undefined;
                readonly firstThinkingMs?: number | undefined;
                readonly firstOutputMs?: number | undefined;
                readonly lastOutputMs?: number | undefined;
                readonly completedMs?: number | undefined;
                readonly closedMs?: number | undefined;
                readonly failedTries?: readonly {
                    readonly sentMs?: number | undefined;
                    readonly failedMs: number;
                    readonly code: string;
                    readonly httpStatus?: number | undefined;
                }[] | undefined;
            } | undefined;
            readonly sessionId?: string | undefined;
            readonly itemIds?: readonly string[] | undefined;
        }, {
            readonly type: Keys;
        }>;
        readonly guards: {
            retry: (u: unknown) => u is {
                readonly type: "retry";
                readonly attempt: number;
                readonly code: string;
                readonly delayMillis: number;
                readonly elapsedMs?: number | undefined;
                readonly httpStatus?: number | undefined;
            };
            settle: (u: unknown) => u is {
                readonly type: "settle";
                readonly stopReason: "aborted" | "content-filter" | "error" | "length" | "stop" | "tool-calls" | "unknown";
                readonly responseId?: string | undefined;
                readonly servedTier?: string | undefined;
                readonly timing?: {
                    readonly startedAt?: number | undefined;
                    readonly attempts?: number | undefined;
                    readonly requestBytes?: number | undefined;
                    readonly preparedMs?: number | undefined;
                    readonly signedMs?: number | undefined;
                    readonly sentMs?: number | undefined;
                    readonly headersMs?: number | undefined;
                    readonly firstEventMs?: number | undefined;
                    readonly firstThinkingMs?: number | undefined;
                    readonly firstOutputMs?: number | undefined;
                    readonly lastOutputMs?: number | undefined;
                    readonly completedMs?: number | undefined;
                    readonly closedMs?: number | undefined;
                    readonly failedTries?: readonly {
                        readonly sentMs?: number | undefined;
                        readonly failedMs: number;
                        readonly code: string;
                        readonly httpStatus?: number | undefined;
                    }[] | undefined;
                } | undefined;
                readonly sessionId?: string | undefined;
                readonly itemIds?: readonly string[] | undefined;
            };
            "text-delta": (u: unknown) => u is {
                readonly type: "text-delta";
                readonly id: string;
                readonly text: string;
            };
            "text-end": (u: unknown) => u is {
                readonly type: "text-end";
                readonly id: string;
            };
            "text-start": (u: unknown) => u is {
                readonly type: "text-start";
                readonly id: string;
            };
            "thinking-delta": (u: unknown) => u is {
                readonly type: "thinking-delta";
                readonly id: string;
                readonly text: string;
            };
            "thinking-end": (u: unknown) => u is {
                readonly type: "thinking-end";
                readonly id: string;
            };
            "thinking-start": (u: unknown) => u is {
                readonly type: "thinking-start";
                readonly id: string;
                readonly signature?: string | undefined;
            };
            "tool-call-delta": (u: unknown) => u is {
                readonly type: "tool-call-delta";
                readonly id: string;
                readonly arguments: string;
            };
            "tool-call-end": (u: unknown) => u is {
                readonly type: "tool-call-end";
                readonly id: string;
                readonly arguments?: string | undefined;
            };
            "tool-call-start": (u: unknown) => u is {
                readonly type: "tool-call-start";
                readonly id: string;
                readonly name: string;
            };
            "tool-result": (u: unknown) => u is {
                readonly type: "tool-result";
                readonly id: string;
                readonly output: string;
                readonly isError?: boolean | undefined;
            };
            usage: (u: unknown) => u is {
                readonly type: "usage";
                readonly inputTokens?: number | undefined;
                readonly outputTokens?: number | undefined;
                readonly reasoningTokens?: number | undefined;
                readonly cachedInputTokens?: number | undefined;
                readonly cacheWriteTokens?: number | undefined;
                readonly totalTokens?: number | undefined;
                readonly costUsd?: number | undefined;
            };
        };
        readonly match: {
            <Cases extends { [M in Schema.Struct<{
                readonly type: Schema.Literal<"text-start">;
                readonly id: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"text-delta">;
                readonly id: Schema.String;
                readonly text: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"text-end">;
                readonly id: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"thinking-start">;
                readonly id: Schema.String;
                readonly signature: Schema.optional<Schema.String>;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"thinking-delta">;
                readonly id: Schema.String;
                readonly text: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"thinking-end">;
                readonly id: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"tool-call-start">;
                readonly id: Schema.String;
                readonly name: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"tool-call-delta">;
                readonly id: Schema.String;
                readonly arguments: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"tool-call-end">;
                readonly id: Schema.String;
                readonly arguments: Schema.optional<Schema.String>;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"tool-result">;
                readonly id: Schema.String;
                readonly output: Schema.String;
                readonly isError: Schema.optional<Schema.Boolean>;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"usage">;
                readonly inputTokens: Schema.optional<Schema.Number>;
                readonly outputTokens: Schema.optional<Schema.Number>;
                readonly reasoningTokens: Schema.optional<Schema.Number>;
                readonly cachedInputTokens: Schema.optional<Schema.Number>;
                readonly cacheWriteTokens: Schema.optional<Schema.Number>;
                readonly totalTokens: Schema.optional<Schema.Number>;
                readonly costUsd: Schema.optional<Schema.Number>;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"retry">;
                readonly attempt: Schema.Int;
                readonly code: Schema.String;
                readonly delayMillis: Schema.withDecodingDefaultKey<Schema.withConstructorDefault<Schema.Number>, never>;
                readonly elapsedMs: Schema.optional<Schema.Number>;
                readonly httpStatus: Schema.optional<Schema.Number>;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"settle">;
                readonly stopReason: Schema.Literals<readonly ["stop", "length", "tool-calls", "content-filter", "error", "aborted", "unknown"]>;
                readonly responseId: Schema.optional<Schema.String>;
                readonly servedTier: Schema.optional<Schema.String>;
                readonly timing: Schema.optional<Schema.Struct<{
                    readonly startedAt: Schema.optional<Schema.Number>;
                    readonly attempts: Schema.optional<Schema.Int>;
                    readonly requestBytes: Schema.optional<Schema.Number>;
                    readonly preparedMs: Schema.optional<Schema.Number>;
                    readonly signedMs: Schema.optional<Schema.Number>;
                    readonly sentMs: Schema.optional<Schema.Number>;
                    readonly headersMs: Schema.optional<Schema.Number>;
                    readonly firstEventMs: Schema.optional<Schema.Number>;
                    readonly firstThinkingMs: Schema.optional<Schema.Number>;
                    readonly firstOutputMs: Schema.optional<Schema.Number>;
                    readonly lastOutputMs: Schema.optional<Schema.Number>;
                    readonly completedMs: Schema.optional<Schema.Number>;
                    readonly closedMs: Schema.optional<Schema.Number>;
                    readonly failedTries: Schema.optional<Schema.$Array<Schema.Struct<{
                        readonly sentMs: Schema.optional<Schema.Number>;
                        readonly failedMs: Schema.Number;
                        readonly code: Schema.String;
                        readonly httpStatus: Schema.optional<Schema.Number>;
                    }>>>;
                }>>;
                readonly sessionId: Schema.optional<Schema.String>;
                readonly itemIds: Schema.optional<Schema.$Array<Schema.String>>;
            }> as M["Type"]["type"]]: (value: M["Type"]) => any; }>(value: {
                readonly type: "text-start";
                readonly id: string;
            } | {
                readonly type: "text-delta";
                readonly id: string;
                readonly text: string;
            } | {
                readonly type: "text-end";
                readonly id: string;
            } | {
                readonly type: "thinking-delta";
                readonly id: string;
                readonly text: string;
            } | {
                readonly type: "thinking-end";
                readonly id: string;
            } | {
                readonly type: "tool-call-start";
                readonly id: string;
                readonly name: string;
            } | {
                readonly type: "tool-call-delta";
                readonly id: string;
                readonly arguments: string;
            } | {
                readonly type: "thinking-start";
                readonly id: string;
                readonly signature?: string | undefined;
            } | {
                readonly type: "tool-call-end";
                readonly id: string;
                readonly arguments?: string | undefined;
            } | {
                readonly type: "tool-result";
                readonly id: string;
                readonly output: string;
                readonly isError?: boolean | undefined;
            } | {
                readonly type: "usage";
                readonly inputTokens?: number | undefined;
                readonly outputTokens?: number | undefined;
                readonly reasoningTokens?: number | undefined;
                readonly cachedInputTokens?: number | undefined;
                readonly cacheWriteTokens?: number | undefined;
                readonly totalTokens?: number | undefined;
                readonly costUsd?: number | undefined;
            } | {
                readonly type: "retry";
                readonly attempt: number;
                readonly code: string;
                readonly delayMillis: number;
                readonly elapsedMs?: number | undefined;
                readonly httpStatus?: number | undefined;
            } | {
                readonly type: "settle";
                readonly stopReason: "aborted" | "content-filter" | "error" | "length" | "stop" | "tool-calls" | "unknown";
                readonly responseId?: string | undefined;
                readonly servedTier?: string | undefined;
                readonly timing?: {
                    readonly startedAt?: number | undefined;
                    readonly attempts?: number | undefined;
                    readonly requestBytes?: number | undefined;
                    readonly preparedMs?: number | undefined;
                    readonly signedMs?: number | undefined;
                    readonly sentMs?: number | undefined;
                    readonly headersMs?: number | undefined;
                    readonly firstEventMs?: number | undefined;
                    readonly firstThinkingMs?: number | undefined;
                    readonly firstOutputMs?: number | undefined;
                    readonly lastOutputMs?: number | undefined;
                    readonly completedMs?: number | undefined;
                    readonly closedMs?: number | undefined;
                    readonly failedTries?: readonly {
                        readonly sentMs?: number | undefined;
                        readonly failedMs: number;
                        readonly code: string;
                        readonly httpStatus?: number | undefined;
                    }[] | undefined;
                } | undefined;
                readonly sessionId?: string | undefined;
                readonly itemIds?: readonly string[] | undefined;
            }, cases: Cases): Cases[keyof Cases] extends (value: any) => infer R ? import("effect/Unify").Unify<R> : never;
            <Cases extends { [M in Schema.Struct<{
                readonly type: Schema.Literal<"text-start">;
                readonly id: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"text-delta">;
                readonly id: Schema.String;
                readonly text: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"text-end">;
                readonly id: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"thinking-start">;
                readonly id: Schema.String;
                readonly signature: Schema.optional<Schema.String>;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"thinking-delta">;
                readonly id: Schema.String;
                readonly text: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"thinking-end">;
                readonly id: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"tool-call-start">;
                readonly id: Schema.String;
                readonly name: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"tool-call-delta">;
                readonly id: Schema.String;
                readonly arguments: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"tool-call-end">;
                readonly id: Schema.String;
                readonly arguments: Schema.optional<Schema.String>;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"tool-result">;
                readonly id: Schema.String;
                readonly output: Schema.String;
                readonly isError: Schema.optional<Schema.Boolean>;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"usage">;
                readonly inputTokens: Schema.optional<Schema.Number>;
                readonly outputTokens: Schema.optional<Schema.Number>;
                readonly reasoningTokens: Schema.optional<Schema.Number>;
                readonly cachedInputTokens: Schema.optional<Schema.Number>;
                readonly cacheWriteTokens: Schema.optional<Schema.Number>;
                readonly totalTokens: Schema.optional<Schema.Number>;
                readonly costUsd: Schema.optional<Schema.Number>;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"retry">;
                readonly attempt: Schema.Int;
                readonly code: Schema.String;
                readonly delayMillis: Schema.withDecodingDefaultKey<Schema.withConstructorDefault<Schema.Number>, never>;
                readonly elapsedMs: Schema.optional<Schema.Number>;
                readonly httpStatus: Schema.optional<Schema.Number>;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"settle">;
                readonly stopReason: Schema.Literals<readonly ["stop", "length", "tool-calls", "content-filter", "error", "aborted", "unknown"]>;
                readonly responseId: Schema.optional<Schema.String>;
                readonly servedTier: Schema.optional<Schema.String>;
                readonly timing: Schema.optional<Schema.Struct<{
                    readonly startedAt: Schema.optional<Schema.Number>;
                    readonly attempts: Schema.optional<Schema.Int>;
                    readonly requestBytes: Schema.optional<Schema.Number>;
                    readonly preparedMs: Schema.optional<Schema.Number>;
                    readonly signedMs: Schema.optional<Schema.Number>;
                    readonly sentMs: Schema.optional<Schema.Number>;
                    readonly headersMs: Schema.optional<Schema.Number>;
                    readonly firstEventMs: Schema.optional<Schema.Number>;
                    readonly firstThinkingMs: Schema.optional<Schema.Number>;
                    readonly firstOutputMs: Schema.optional<Schema.Number>;
                    readonly lastOutputMs: Schema.optional<Schema.Number>;
                    readonly completedMs: Schema.optional<Schema.Number>;
                    readonly closedMs: Schema.optional<Schema.Number>;
                    readonly failedTries: Schema.optional<Schema.$Array<Schema.Struct<{
                        readonly sentMs: Schema.optional<Schema.Number>;
                        readonly failedMs: Schema.Number;
                        readonly code: Schema.String;
                        readonly httpStatus: Schema.optional<Schema.Number>;
                    }>>>;
                }>>;
                readonly sessionId: Schema.optional<Schema.String>;
                readonly itemIds: Schema.optional<Schema.$Array<Schema.String>>;
            }> as M["Type"]["type"]]: (value: M["Type"]) => any; }>(cases: Cases): (value: {
                readonly type: "text-start";
                readonly id: string;
            } | {
                readonly type: "text-delta";
                readonly id: string;
                readonly text: string;
            } | {
                readonly type: "text-end";
                readonly id: string;
            } | {
                readonly type: "thinking-delta";
                readonly id: string;
                readonly text: string;
            } | {
                readonly type: "thinking-end";
                readonly id: string;
            } | {
                readonly type: "tool-call-start";
                readonly id: string;
                readonly name: string;
            } | {
                readonly type: "tool-call-delta";
                readonly id: string;
                readonly arguments: string;
            } | {
                readonly type: "thinking-start";
                readonly id: string;
                readonly signature?: string | undefined;
            } | {
                readonly type: "tool-call-end";
                readonly id: string;
                readonly arguments?: string | undefined;
            } | {
                readonly type: "tool-result";
                readonly id: string;
                readonly output: string;
                readonly isError?: boolean | undefined;
            } | {
                readonly type: "usage";
                readonly inputTokens?: number | undefined;
                readonly outputTokens?: number | undefined;
                readonly reasoningTokens?: number | undefined;
                readonly cachedInputTokens?: number | undefined;
                readonly cacheWriteTokens?: number | undefined;
                readonly totalTokens?: number | undefined;
                readonly costUsd?: number | undefined;
            } | {
                readonly type: "retry";
                readonly attempt: number;
                readonly code: string;
                readonly delayMillis: number;
                readonly elapsedMs?: number | undefined;
                readonly httpStatus?: number | undefined;
            } | {
                readonly type: "settle";
                readonly stopReason: "aborted" | "content-filter" | "error" | "length" | "stop" | "tool-calls" | "unknown";
                readonly responseId?: string | undefined;
                readonly servedTier?: string | undefined;
                readonly timing?: {
                    readonly startedAt?: number | undefined;
                    readonly attempts?: number | undefined;
                    readonly requestBytes?: number | undefined;
                    readonly preparedMs?: number | undefined;
                    readonly signedMs?: number | undefined;
                    readonly sentMs?: number | undefined;
                    readonly headersMs?: number | undefined;
                    readonly firstEventMs?: number | undefined;
                    readonly firstThinkingMs?: number | undefined;
                    readonly firstOutputMs?: number | undefined;
                    readonly lastOutputMs?: number | undefined;
                    readonly completedMs?: number | undefined;
                    readonly closedMs?: number | undefined;
                    readonly failedTries?: readonly {
                        readonly sentMs?: number | undefined;
                        readonly failedMs: number;
                        readonly code: string;
                        readonly httpStatus?: number | undefined;
                    }[] | undefined;
                } | undefined;
                readonly sessionId?: string | undefined;
                readonly itemIds?: readonly string[] | undefined;
            }) => Cases[keyof Cases] extends (value: any) => infer R ? import("effect/Unify").Unify<R> : never;
        };
        readonly matchOrElse: {
            <Cases extends { [M in Schema.Struct<{
                readonly type: Schema.Literal<"text-start">;
                readonly id: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"text-delta">;
                readonly id: Schema.String;
                readonly text: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"text-end">;
                readonly id: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"thinking-start">;
                readonly id: Schema.String;
                readonly signature: Schema.optional<Schema.String>;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"thinking-delta">;
                readonly id: Schema.String;
                readonly text: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"thinking-end">;
                readonly id: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"tool-call-start">;
                readonly id: Schema.String;
                readonly name: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"tool-call-delta">;
                readonly id: Schema.String;
                readonly arguments: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"tool-call-end">;
                readonly id: Schema.String;
                readonly arguments: Schema.optional<Schema.String>;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"tool-result">;
                readonly id: Schema.String;
                readonly output: Schema.String;
                readonly isError: Schema.optional<Schema.Boolean>;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"usage">;
                readonly inputTokens: Schema.optional<Schema.Number>;
                readonly outputTokens: Schema.optional<Schema.Number>;
                readonly reasoningTokens: Schema.optional<Schema.Number>;
                readonly cachedInputTokens: Schema.optional<Schema.Number>;
                readonly cacheWriteTokens: Schema.optional<Schema.Number>;
                readonly totalTokens: Schema.optional<Schema.Number>;
                readonly costUsd: Schema.optional<Schema.Number>;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"retry">;
                readonly attempt: Schema.Int;
                readonly code: Schema.String;
                readonly delayMillis: Schema.withDecodingDefaultKey<Schema.withConstructorDefault<Schema.Number>, never>;
                readonly elapsedMs: Schema.optional<Schema.Number>;
                readonly httpStatus: Schema.optional<Schema.Number>;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"settle">;
                readonly stopReason: Schema.Literals<readonly ["stop", "length", "tool-calls", "content-filter", "error", "aborted", "unknown"]>;
                readonly responseId: Schema.optional<Schema.String>;
                readonly servedTier: Schema.optional<Schema.String>;
                readonly timing: Schema.optional<Schema.Struct<{
                    readonly startedAt: Schema.optional<Schema.Number>;
                    readonly attempts: Schema.optional<Schema.Int>;
                    readonly requestBytes: Schema.optional<Schema.Number>;
                    readonly preparedMs: Schema.optional<Schema.Number>;
                    readonly signedMs: Schema.optional<Schema.Number>;
                    readonly sentMs: Schema.optional<Schema.Number>;
                    readonly headersMs: Schema.optional<Schema.Number>;
                    readonly firstEventMs: Schema.optional<Schema.Number>;
                    readonly firstThinkingMs: Schema.optional<Schema.Number>;
                    readonly firstOutputMs: Schema.optional<Schema.Number>;
                    readonly lastOutputMs: Schema.optional<Schema.Number>;
                    readonly completedMs: Schema.optional<Schema.Number>;
                    readonly closedMs: Schema.optional<Schema.Number>;
                    readonly failedTries: Schema.optional<Schema.$Array<Schema.Struct<{
                        readonly sentMs: Schema.optional<Schema.Number>;
                        readonly failedMs: Schema.Number;
                        readonly code: Schema.String;
                        readonly httpStatus: Schema.optional<Schema.Number>;
                    }>>>;
                }>>;
                readonly sessionId: Schema.optional<Schema.String>;
                readonly itemIds: Schema.optional<Schema.$Array<Schema.String>>;
            }> as M["Type"]["type"]]+?: (value: M["Type"]) => any; } & { [K in Exclude<keyof Cases, "retry" | "settle" | "text-delta" | "text-end" | "text-start" | "thinking-delta" | "thinking-end" | "thinking-start" | "tool-call-delta" | "tool-call-end" | "tool-call-start" | "tool-result" | "usage">]: never; }, OrElse extends (value: Exclude<{
                readonly type: "text-start";
                readonly id: string;
            } | {
                readonly type: "text-delta";
                readonly id: string;
                readonly text: string;
            } | {
                readonly type: "text-end";
                readonly id: string;
            } | {
                readonly type: "thinking-delta";
                readonly id: string;
                readonly text: string;
            } | {
                readonly type: "thinking-end";
                readonly id: string;
            } | {
                readonly type: "tool-call-start";
                readonly id: string;
                readonly name: string;
            } | {
                readonly type: "tool-call-delta";
                readonly id: string;
                readonly arguments: string;
            } | {
                readonly type: "thinking-start";
                readonly id: string;
                readonly signature?: string | undefined;
            } | {
                readonly type: "tool-call-end";
                readonly id: string;
                readonly arguments?: string | undefined;
            } | {
                readonly type: "tool-result";
                readonly id: string;
                readonly output: string;
                readonly isError?: boolean | undefined;
            } | {
                readonly type: "usage";
                readonly inputTokens?: number | undefined;
                readonly outputTokens?: number | undefined;
                readonly reasoningTokens?: number | undefined;
                readonly cachedInputTokens?: number | undefined;
                readonly cacheWriteTokens?: number | undefined;
                readonly totalTokens?: number | undefined;
                readonly costUsd?: number | undefined;
            } | {
                readonly type: "retry";
                readonly attempt: number;
                readonly code: string;
                readonly delayMillis: number;
                readonly elapsedMs?: number | undefined;
                readonly httpStatus?: number | undefined;
            } | {
                readonly type: "settle";
                readonly stopReason: "aborted" | "content-filter" | "error" | "length" | "stop" | "tool-calls" | "unknown";
                readonly responseId?: string | undefined;
                readonly servedTier?: string | undefined;
                readonly timing?: {
                    readonly startedAt?: number | undefined;
                    readonly attempts?: number | undefined;
                    readonly requestBytes?: number | undefined;
                    readonly preparedMs?: number | undefined;
                    readonly signedMs?: number | undefined;
                    readonly sentMs?: number | undefined;
                    readonly headersMs?: number | undefined;
                    readonly firstEventMs?: number | undefined;
                    readonly firstThinkingMs?: number | undefined;
                    readonly firstOutputMs?: number | undefined;
                    readonly lastOutputMs?: number | undefined;
                    readonly completedMs?: number | undefined;
                    readonly closedMs?: number | undefined;
                    readonly failedTries?: readonly {
                        readonly sentMs?: number | undefined;
                        readonly failedMs: number;
                        readonly code: string;
                        readonly httpStatus?: number | undefined;
                    }[] | undefined;
                } | undefined;
                readonly sessionId?: string | undefined;
                readonly itemIds?: readonly string[] | undefined;
            }, { readonly [K in "type"]: keyof Cases; }>) => any>(value: {
                readonly type: "text-start";
                readonly id: string;
            } | {
                readonly type: "text-delta";
                readonly id: string;
                readonly text: string;
            } | {
                readonly type: "text-end";
                readonly id: string;
            } | {
                readonly type: "thinking-delta";
                readonly id: string;
                readonly text: string;
            } | {
                readonly type: "thinking-end";
                readonly id: string;
            } | {
                readonly type: "tool-call-start";
                readonly id: string;
                readonly name: string;
            } | {
                readonly type: "tool-call-delta";
                readonly id: string;
                readonly arguments: string;
            } | {
                readonly type: "thinking-start";
                readonly id: string;
                readonly signature?: string | undefined;
            } | {
                readonly type: "tool-call-end";
                readonly id: string;
                readonly arguments?: string | undefined;
            } | {
                readonly type: "tool-result";
                readonly id: string;
                readonly output: string;
                readonly isError?: boolean | undefined;
            } | {
                readonly type: "usage";
                readonly inputTokens?: number | undefined;
                readonly outputTokens?: number | undefined;
                readonly reasoningTokens?: number | undefined;
                readonly cachedInputTokens?: number | undefined;
                readonly cacheWriteTokens?: number | undefined;
                readonly totalTokens?: number | undefined;
                readonly costUsd?: number | undefined;
            } | {
                readonly type: "retry";
                readonly attempt: number;
                readonly code: string;
                readonly delayMillis: number;
                readonly elapsedMs?: number | undefined;
                readonly httpStatus?: number | undefined;
            } | {
                readonly type: "settle";
                readonly stopReason: "aborted" | "content-filter" | "error" | "length" | "stop" | "tool-calls" | "unknown";
                readonly responseId?: string | undefined;
                readonly servedTier?: string | undefined;
                readonly timing?: {
                    readonly startedAt?: number | undefined;
                    readonly attempts?: number | undefined;
                    readonly requestBytes?: number | undefined;
                    readonly preparedMs?: number | undefined;
                    readonly signedMs?: number | undefined;
                    readonly sentMs?: number | undefined;
                    readonly headersMs?: number | undefined;
                    readonly firstEventMs?: number | undefined;
                    readonly firstThinkingMs?: number | undefined;
                    readonly firstOutputMs?: number | undefined;
                    readonly lastOutputMs?: number | undefined;
                    readonly completedMs?: number | undefined;
                    readonly closedMs?: number | undefined;
                    readonly failedTries?: readonly {
                        readonly sentMs?: number | undefined;
                        readonly failedMs: number;
                        readonly code: string;
                        readonly httpStatus?: number | undefined;
                    }[] | undefined;
                } | undefined;
                readonly sessionId?: string | undefined;
                readonly itemIds?: readonly string[] | undefined;
            }, cases: Cases, orElse: OrElse): import("effect/Unify").Unify<{ [K in keyof Cases]-?: NonNullable<Cases[K]> extends (...args: Array<any>) => infer R ? R : never; }[keyof Cases] | ReturnType<OrElse>>;
            <Cases extends { [M in Schema.Struct<{
                readonly type: Schema.Literal<"text-start">;
                readonly id: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"text-delta">;
                readonly id: Schema.String;
                readonly text: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"text-end">;
                readonly id: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"thinking-start">;
                readonly id: Schema.String;
                readonly signature: Schema.optional<Schema.String>;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"thinking-delta">;
                readonly id: Schema.String;
                readonly text: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"thinking-end">;
                readonly id: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"tool-call-start">;
                readonly id: Schema.String;
                readonly name: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"tool-call-delta">;
                readonly id: Schema.String;
                readonly arguments: Schema.String;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"tool-call-end">;
                readonly id: Schema.String;
                readonly arguments: Schema.optional<Schema.String>;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"tool-result">;
                readonly id: Schema.String;
                readonly output: Schema.String;
                readonly isError: Schema.optional<Schema.Boolean>;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"usage">;
                readonly inputTokens: Schema.optional<Schema.Number>;
                readonly outputTokens: Schema.optional<Schema.Number>;
                readonly reasoningTokens: Schema.optional<Schema.Number>;
                readonly cachedInputTokens: Schema.optional<Schema.Number>;
                readonly cacheWriteTokens: Schema.optional<Schema.Number>;
                readonly totalTokens: Schema.optional<Schema.Number>;
                readonly costUsd: Schema.optional<Schema.Number>;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"retry">;
                readonly attempt: Schema.Int;
                readonly code: Schema.String;
                readonly delayMillis: Schema.withDecodingDefaultKey<Schema.withConstructorDefault<Schema.Number>, never>;
                readonly elapsedMs: Schema.optional<Schema.Number>;
                readonly httpStatus: Schema.optional<Schema.Number>;
            }> | Schema.Struct<{
                readonly type: Schema.Literal<"settle">;
                readonly stopReason: Schema.Literals<readonly ["stop", "length", "tool-calls", "content-filter", "error", "aborted", "unknown"]>;
                readonly responseId: Schema.optional<Schema.String>;
                readonly servedTier: Schema.optional<Schema.String>;
                readonly timing: Schema.optional<Schema.Struct<{
                    readonly startedAt: Schema.optional<Schema.Number>;
                    readonly attempts: Schema.optional<Schema.Int>;
                    readonly requestBytes: Schema.optional<Schema.Number>;
                    readonly preparedMs: Schema.optional<Schema.Number>;
                    readonly signedMs: Schema.optional<Schema.Number>;
                    readonly sentMs: Schema.optional<Schema.Number>;
                    readonly headersMs: Schema.optional<Schema.Number>;
                    readonly firstEventMs: Schema.optional<Schema.Number>;
                    readonly firstThinkingMs: Schema.optional<Schema.Number>;
                    readonly firstOutputMs: Schema.optional<Schema.Number>;
                    readonly lastOutputMs: Schema.optional<Schema.Number>;
                    readonly completedMs: Schema.optional<Schema.Number>;
                    readonly closedMs: Schema.optional<Schema.Number>;
                    readonly failedTries: Schema.optional<Schema.$Array<Schema.Struct<{
                        readonly sentMs: Schema.optional<Schema.Number>;
                        readonly failedMs: Schema.Number;
                        readonly code: Schema.String;
                        readonly httpStatus: Schema.optional<Schema.Number>;
                    }>>>;
                }>>;
                readonly sessionId: Schema.optional<Schema.String>;
                readonly itemIds: Schema.optional<Schema.$Array<Schema.String>>;
            }> as M["Type"]["type"]]+?: (value: M["Type"]) => any; } & { [K in Exclude<keyof Cases, "retry" | "settle" | "text-delta" | "text-end" | "text-start" | "thinking-delta" | "thinking-end" | "thinking-start" | "tool-call-delta" | "tool-call-end" | "tool-call-start" | "tool-result" | "usage">]: never; }, OrElse extends (value: Exclude<{
                readonly type: "text-start";
                readonly id: string;
            } | {
                readonly type: "text-delta";
                readonly id: string;
                readonly text: string;
            } | {
                readonly type: "text-end";
                readonly id: string;
            } | {
                readonly type: "thinking-delta";
                readonly id: string;
                readonly text: string;
            } | {
                readonly type: "thinking-end";
                readonly id: string;
            } | {
                readonly type: "tool-call-start";
                readonly id: string;
                readonly name: string;
            } | {
                readonly type: "tool-call-delta";
                readonly id: string;
                readonly arguments: string;
            } | {
                readonly type: "thinking-start";
                readonly id: string;
                readonly signature?: string | undefined;
            } | {
                readonly type: "tool-call-end";
                readonly id: string;
                readonly arguments?: string | undefined;
            } | {
                readonly type: "tool-result";
                readonly id: string;
                readonly output: string;
                readonly isError?: boolean | undefined;
            } | {
                readonly type: "usage";
                readonly inputTokens?: number | undefined;
                readonly outputTokens?: number | undefined;
                readonly reasoningTokens?: number | undefined;
                readonly cachedInputTokens?: number | undefined;
                readonly cacheWriteTokens?: number | undefined;
                readonly totalTokens?: number | undefined;
                readonly costUsd?: number | undefined;
            } | {
                readonly type: "retry";
                readonly attempt: number;
                readonly code: string;
                readonly delayMillis: number;
                readonly elapsedMs?: number | undefined;
                readonly httpStatus?: number | undefined;
            } | {
                readonly type: "settle";
                readonly stopReason: "aborted" | "content-filter" | "error" | "length" | "stop" | "tool-calls" | "unknown";
                readonly responseId?: string | undefined;
                readonly servedTier?: string | undefined;
                readonly timing?: {
                    readonly startedAt?: number | undefined;
                    readonly attempts?: number | undefined;
                    readonly requestBytes?: number | undefined;
                    readonly preparedMs?: number | undefined;
                    readonly signedMs?: number | undefined;
                    readonly sentMs?: number | undefined;
                    readonly headersMs?: number | undefined;
                    readonly firstEventMs?: number | undefined;
                    readonly firstThinkingMs?: number | undefined;
                    readonly firstOutputMs?: number | undefined;
                    readonly lastOutputMs?: number | undefined;
                    readonly completedMs?: number | undefined;
                    readonly closedMs?: number | undefined;
                    readonly failedTries?: readonly {
                        readonly sentMs?: number | undefined;
                        readonly failedMs: number;
                        readonly code: string;
                        readonly httpStatus?: number | undefined;
                    }[] | undefined;
                } | undefined;
                readonly sessionId?: string | undefined;
                readonly itemIds?: readonly string[] | undefined;
            }, { readonly [K in "type"]: keyof Cases; }>) => any>(cases: Cases, orElse: OrElse): (value: {
                readonly type: "text-start";
                readonly id: string;
            } | {
                readonly type: "text-delta";
                readonly id: string;
                readonly text: string;
            } | {
                readonly type: "text-end";
                readonly id: string;
            } | {
                readonly type: "thinking-delta";
                readonly id: string;
                readonly text: string;
            } | {
                readonly type: "thinking-end";
                readonly id: string;
            } | {
                readonly type: "tool-call-start";
                readonly id: string;
                readonly name: string;
            } | {
                readonly type: "tool-call-delta";
                readonly id: string;
                readonly arguments: string;
            } | {
                readonly type: "thinking-start";
                readonly id: string;
                readonly signature?: string | undefined;
            } | {
                readonly type: "tool-call-end";
                readonly id: string;
                readonly arguments?: string | undefined;
            } | {
                readonly type: "tool-result";
                readonly id: string;
                readonly output: string;
                readonly isError?: boolean | undefined;
            } | {
                readonly type: "usage";
                readonly inputTokens?: number | undefined;
                readonly outputTokens?: number | undefined;
                readonly reasoningTokens?: number | undefined;
                readonly cachedInputTokens?: number | undefined;
                readonly cacheWriteTokens?: number | undefined;
                readonly totalTokens?: number | undefined;
                readonly costUsd?: number | undefined;
            } | {
                readonly type: "retry";
                readonly attempt: number;
                readonly code: string;
                readonly delayMillis: number;
                readonly elapsedMs?: number | undefined;
                readonly httpStatus?: number | undefined;
            } | {
                readonly type: "settle";
                readonly stopReason: "aborted" | "content-filter" | "error" | "length" | "stop" | "tool-calls" | "unknown";
                readonly responseId?: string | undefined;
                readonly servedTier?: string | undefined;
                readonly timing?: {
                    readonly startedAt?: number | undefined;
                    readonly attempts?: number | undefined;
                    readonly requestBytes?: number | undefined;
                    readonly preparedMs?: number | undefined;
                    readonly signedMs?: number | undefined;
                    readonly sentMs?: number | undefined;
                    readonly headersMs?: number | undefined;
                    readonly firstEventMs?: number | undefined;
                    readonly firstThinkingMs?: number | undefined;
                    readonly firstOutputMs?: number | undefined;
                    readonly lastOutputMs?: number | undefined;
                    readonly completedMs?: number | undefined;
                    readonly closedMs?: number | undefined;
                    readonly failedTries?: readonly {
                        readonly sentMs?: number | undefined;
                        readonly failedMs: number;
                        readonly code: string;
                        readonly httpStatus?: number | undefined;
                    }[] | undefined;
                } | undefined;
                readonly sessionId?: string | undefined;
                readonly itemIds?: readonly string[] | undefined;
            }) => import("effect/Unify").Unify<{ [K in keyof Cases]-?: NonNullable<Cases[K]> extends (...args: Array<any>) => infer R ? R : never; }[keyof Cases] | ReturnType<OrElse>>;
        };
    } & {
        TextStart: (input: {
            readonly type: "text-start";
            readonly id: string;
        }, options?: Schema.MakeOptions) => {
            readonly type: "text-start";
            readonly id: string;
        };
        TextDelta: (input: {
            readonly type: "text-delta";
            readonly id: string;
            readonly text: string;
        }, options?: Schema.MakeOptions) => {
            readonly type: "text-delta";
            readonly id: string;
            readonly text: string;
        };
        TextEnd: (input: {
            readonly type: "text-end";
            readonly id: string;
        }, options?: Schema.MakeOptions) => {
            readonly type: "text-end";
            readonly id: string;
        };
        ThinkingStart: (input: {
            readonly type: "thinking-start";
            readonly id: string;
            readonly signature?: string | undefined;
        }, options?: Schema.MakeOptions) => {
            readonly type: "thinking-start";
            readonly id: string;
            readonly signature?: string | undefined;
        };
        ThinkingDelta: (input: {
            readonly type: "thinking-delta";
            readonly id: string;
            readonly text: string;
        }, options?: Schema.MakeOptions) => {
            readonly type: "thinking-delta";
            readonly id: string;
            readonly text: string;
        };
        ThinkingEnd: (input: {
            readonly type: "thinking-end";
            readonly id: string;
        }, options?: Schema.MakeOptions) => {
            readonly type: "thinking-end";
            readonly id: string;
        };
        ToolCallStart: (input: {
            readonly type: "tool-call-start";
            readonly id: string;
            readonly name: string;
        }, options?: Schema.MakeOptions) => {
            readonly type: "tool-call-start";
            readonly id: string;
            readonly name: string;
        };
        ToolCallDelta: (input: {
            readonly type: "tool-call-delta";
            readonly id: string;
            readonly arguments: string;
        }, options?: Schema.MakeOptions) => {
            readonly type: "tool-call-delta";
            readonly id: string;
            readonly arguments: string;
        };
        ToolCallEnd: (input: {
            readonly type: "tool-call-end";
            readonly id: string;
            readonly arguments?: string | undefined;
        }, options?: Schema.MakeOptions) => {
            readonly type: "tool-call-end";
            readonly id: string;
            readonly arguments?: string | undefined;
        };
        ToolResult: (input: {
            readonly type: "tool-result";
            readonly id: string;
            readonly output: string;
            readonly isError?: boolean | undefined;
        }, options?: Schema.MakeOptions) => {
            readonly type: "tool-result";
            readonly id: string;
            readonly output: string;
            readonly isError?: boolean | undefined;
        };
        Usage: (input: ModelEvent.Usage) => ModelEvent.UsageEvent;
        Retry: (input: {
            readonly type: "retry";
            readonly attempt: number;
            readonly code: string;
            readonly delayMillis?: number;
            readonly elapsedMs?: number | undefined;
            readonly httpStatus?: number | undefined;
        }, options?: Schema.MakeOptions) => {
            readonly type: "retry";
            readonly attempt: number;
            readonly code: string;
            readonly delayMillis: number;
            readonly elapsedMs?: number | undefined;
            readonly httpStatus?: number | undefined;
        };
        Settle: (input: {
            readonly type: "settle";
            readonly stopReason: "aborted" | "content-filter" | "error" | "length" | "stop" | "tool-calls" | "unknown";
            readonly responseId?: string | undefined;
            readonly servedTier?: string | undefined;
            readonly timing?: {
                readonly startedAt?: number | undefined;
                readonly attempts?: number | undefined;
                readonly requestBytes?: number | undefined;
                readonly preparedMs?: number | undefined;
                readonly signedMs?: number | undefined;
                readonly sentMs?: number | undefined;
                readonly headersMs?: number | undefined;
                readonly firstEventMs?: number | undefined;
                readonly firstThinkingMs?: number | undefined;
                readonly firstOutputMs?: number | undefined;
                readonly lastOutputMs?: number | undefined;
                readonly completedMs?: number | undefined;
                readonly closedMs?: number | undefined;
                readonly failedTries?: readonly {
                    readonly sentMs?: number | undefined;
                    readonly failedMs: number;
                    readonly code: string;
                    readonly httpStatus?: number | undefined;
                }[] | undefined;
            } | undefined;
            readonly sessionId?: string | undefined;
            readonly itemIds?: readonly string[] | undefined;
        }, options?: Schema.MakeOptions) => {
            readonly type: "settle";
            readonly stopReason: "aborted" | "content-filter" | "error" | "length" | "stop" | "tool-calls" | "unknown";
            readonly responseId?: string | undefined;
            readonly servedTier?: string | undefined;
            readonly timing?: {
                readonly startedAt?: number | undefined;
                readonly attempts?: number | undefined;
                readonly requestBytes?: number | undefined;
                readonly preparedMs?: number | undefined;
                readonly signedMs?: number | undefined;
                readonly sentMs?: number | undefined;
                readonly headersMs?: number | undefined;
                readonly firstEventMs?: number | undefined;
                readonly firstThinkingMs?: number | undefined;
                readonly firstOutputMs?: number | undefined;
                readonly lastOutputMs?: number | undefined;
                readonly completedMs?: number | undefined;
                readonly closedMs?: number | undefined;
                readonly failedTries?: readonly {
                    readonly sentMs?: number | undefined;
                    readonly failedMs: number;
                    readonly code: string;
                    readonly httpStatus?: number | undefined;
                }[] | undefined;
            } | undefined;
            readonly sessionId?: string | undefined;
            readonly itemIds?: readonly string[] | undefined;
        };
        settledMessage: typeof ModelEvent.settledMessage;
    };
}>, {}>;
/**
 * One provider-neutral model progress event.
 *
 * @category events
 * @since 0.1.0
 * @slop
 */
export declare class ModelDelta extends ModelDelta_base {
}
declare const ModelRetried_base: Schema.Class<ModelRetried, Schema.TaggedStruct<"model-retried", {
    readonly eventType: Schema.Literal<"flows.harness.model-retried.v1">;
    readonly attempt: Schema.Int;
    readonly code: Schema.String;
    /**
     * Milliseconds the boundary waited before this attempt.
     *
     * Every retry of one sealed step is journaled at the moment the step
     * settles, so the event timestamps cannot show the schedule. This carries
     * it. Zero is what an unscheduled retry, or a record written before the
     * field existed, reports.
     */
    readonly delayMillis: Schema.withDecodingDefaultKey<Schema.withConstructorDefault<Schema.Number>, never>;
    /**
     * Milliseconds the failed try ran before it failed, as the boundary that
     * retried timed it. Absent where that boundary timed nothing, and from
     * journals written before it was carried.
     */
    readonly elapsedMs: Schema.optional<Schema.Number>;
    /** The HTTP status that failed the try, when a response carried one. */
    readonly httpStatus: Schema.optional<Schema.Number>;
}>, {}>;
/**
 * A transport-only model retry taken before the sealed step settled.
 *
 * @category events
 * @since 0.1.0
 */
export declare class ModelRetried extends ModelRetried_base {
}
declare const ModelSettled_base: Schema.Class<ModelSettled, Schema.TaggedStruct<"model-settled", {
    readonly eventType: Schema.Literal<"flows.harness.model-settled.v1">;
    readonly message: typeof ModelRequest.AssistantMessage;
    readonly usage: Schema.Struct<{
        readonly inputTokens: Schema.optional<Schema.Number>;
        readonly outputTokens: Schema.optional<Schema.Number>;
        readonly reasoningTokens: Schema.optional<Schema.Number>;
        readonly cachedInputTokens: Schema.optional<Schema.Number>;
        readonly cacheWriteTokens: Schema.optional<Schema.Number>;
        readonly totalTokens: Schema.optional<Schema.Number>;
        readonly costUsd: Schema.optional<Schema.Number>;
    }> & {
        make: (input: ModelEvent.Usage) => ModelEvent.Usage;
    };
    /**
     * The call's USD cost: the provider's reported charge, or its usage priced
     * under the model's rate card. Absent for an unpriced model.
     */
    readonly costUsd: Schema.optional<Schema.Number>;
    /** Where {@link costUsd} came from. */
    readonly costSource: Schema.optional<Schema.Literals<readonly ["reported", "estimated"]>>;
    /** The vendor session that answered, for a wrapped CLI seat: `claude --resume <sessionId>`. */
    readonly sessionId: Schema.optional<Schema.String>;
    /**
     * Wall-clock milliseconds the sealed step took, measured on the injected
     * clock.
     *
     * Usage alone answers what a call cost, never how long it took, so a
     * benchmark could compare tokens per run but not seconds per call — and
     * speed was the larger half of the gap the first head-to-head measured.
     * Zero is what an event carries when nothing timed it.
     */
    readonly durationMillis: Schema.withDecodingDefaultKey<Schema.withConstructorDefault<Schema.Number>, never>;
    /**
     * The join keys of the `model-requested` this settles, and that record's
     * `reask`. Position is not a key: a frame that asks twice settles twice.
     * Absent from settlements journaled before they were carried.
     */
    readonly scope: Schema.optional<Schema.String>;
    readonly frame: Schema.optional<Schema.Int>;
    readonly attempt: Schema.optional<Schema.Int>;
    readonly purpose: Schema.optional<Schema.Literals<readonly ["frame", "compaction"]>>;
    readonly reask: Schema.optional<Schema.Literals<readonly ["no_cell", "output_truncated", "imports_forbidden", "compile_failed", "invalid_transition", "unsupported_language", "limit_exceeded", "stalled"]>>;
    /** When the stream reached each stage; absent before stages were timed. */
    readonly stages: Schema.optional<Schema.Struct<{
        /** The first stream event of any kind but a retry notice. */
        readonly firstEventMs: Schema.optional<Schema.Int>;
        /** The first thinking event. */
        readonly firstThinkingMs: Schema.optional<Schema.Int>;
        /** The first text delta or tool-call event. */
        readonly firstOutputMs: Schema.optional<Schema.Int>;
        /** The last text delta or tool-call event. */
        readonly lastOutputMs: Schema.optional<Schema.Int>;
    }>>;
    /** Transport tries the sealed step took, the one that settled included. */
    readonly tries: Schema.optional<Schema.Int>;
    /** Thinking and written token counts; absent when the provider reported no output count. */
    readonly output: Schema.optional<Schema.Struct<{
        /** Reasoning tokens; absent when the provider reported none. */
        readonly thinking: Schema.optional<Schema.Int>;
        /** Output tokens that were not reasoning. */
        readonly written: Schema.Int;
    }>>;
    /**
     * Where the call's time went on the wire, as the model package measured it
     * and reported on its settle event: `ModelEvent.Timing`, copied whole. Its
     * offsets and {@link stages}' count from the same call, so the gap between
     * a stage here and the same stage there is time the call spent inside this
     * process. Absent where the model timed nothing.
     */
    readonly timing: Schema.optional<Schema.Struct<{
        readonly startedAt: Schema.optional<Schema.Number>;
        readonly attempts: Schema.optional<Schema.Int>;
        readonly requestBytes: Schema.optional<Schema.Number>;
        readonly preparedMs: Schema.optional<Schema.Number>;
        readonly signedMs: Schema.optional<Schema.Number>;
        readonly sentMs: Schema.optional<Schema.Number>;
        readonly headersMs: Schema.optional<Schema.Number>;
        readonly firstEventMs: Schema.optional<Schema.Number>;
        readonly firstThinkingMs: Schema.optional<Schema.Number>;
        readonly firstOutputMs: Schema.optional<Schema.Number>;
        readonly lastOutputMs: Schema.optional<Schema.Number>;
        readonly completedMs: Schema.optional<Schema.Number>;
        readonly closedMs: Schema.optional<Schema.Number>;
        readonly failedTries: Schema.optional<Schema.$Array<Schema.Struct<{
            readonly sentMs: Schema.optional<Schema.Number>;
            readonly failedMs: Schema.Number;
            readonly code: Schema.String;
            readonly httpStatus: Schema.optional<Schema.Number>;
        }>>>;
    }>>;
    /** The service tier that served the call, when the provider reported one. */
    readonly servedTier: Schema.optional<Schema.String>;
}>, {}>;
/**
 * The complete recorded model settlement and usage.
 *
 * @category events
 * @since 0.1.0
 * @slop
 */
export declare class ModelSettled extends ModelSettled_base {
}
declare const ModelFailed_base: Schema.Class<ModelFailed, Schema.TaggedStruct<"model-failed", {
    readonly eventType: Schema.Literal<"flows.harness.model-failed.v1">;
    /** The run's session. */
    readonly scope: Schema.String;
    /** The controller's frame number for the turn the call belonged to. */
    readonly frame: Schema.Int;
    /** Which model call of that frame and purpose this was, counting from one. */
    readonly attempt: Schema.Int;
    /** What the call was for: the frame's own turn, or the compaction ahead of it. */
    readonly purpose: Schema.Literals<readonly ["frame", "compaction"]>;
    /** Why the frame was asking again, on its second call and later. */
    readonly reask: Schema.optional<Schema.Literals<readonly ["no_cell", "output_truncated", "imports_forbidden", "compile_failed", "invalid_transition", "unsupported_language", "limit_exceeded", "stalled"]>>;
    /** Why the call did not settle. */
    readonly code: Schema.String;
    /** The HTTP status that failed the call, when the failure carried one. */
    readonly httpStatus: Schema.optional<Schema.Number>;
    /** Wall-clock milliseconds from the sealed step being opened to its failure. */
    readonly durationMillis: Schema.Int;
    /** The stages the stream reached before it failed; empty when it reached none. */
    readonly stages: Schema.Struct<{
        /** The first stream event of any kind but a retry notice. */
        readonly firstEventMs: Schema.optional<Schema.Int>;
        /** The first thinking event. */
        readonly firstThinkingMs: Schema.optional<Schema.Int>;
        /** The first text delta or tool-call event. */
        readonly firstOutputMs: Schema.optional<Schema.Int>;
        /** The last text delta or tool-call event. */
        readonly lastOutputMs: Schema.optional<Schema.Int>;
    }>;
    /** Transport tries the sealed step took before it failed. */
    readonly tries: Schema.Int;
    /** The model package's wire record of the failed call, when its error carried one. */
    readonly timing: Schema.optional<Schema.Struct<{
        readonly startedAt: Schema.optional<Schema.Number>;
        readonly attempts: Schema.optional<Schema.Int>;
        readonly requestBytes: Schema.optional<Schema.Number>;
        readonly preparedMs: Schema.optional<Schema.Number>;
        readonly signedMs: Schema.optional<Schema.Number>;
        readonly sentMs: Schema.optional<Schema.Number>;
        readonly headersMs: Schema.optional<Schema.Number>;
        readonly firstEventMs: Schema.optional<Schema.Number>;
        readonly firstThinkingMs: Schema.optional<Schema.Number>;
        readonly firstOutputMs: Schema.optional<Schema.Number>;
        readonly lastOutputMs: Schema.optional<Schema.Number>;
        readonly completedMs: Schema.optional<Schema.Number>;
        readonly closedMs: Schema.optional<Schema.Number>;
        readonly failedTries: Schema.optional<Schema.$Array<Schema.Struct<{
            readonly sentMs: Schema.optional<Schema.Number>;
            readonly failedMs: Schema.Number;
            readonly code: Schema.String;
            readonly httpStatus: Schema.optional<Schema.Number>;
        }>>>;
    }>>;
}>, {}>;
/**
 * A model call that began and did not settle: it failed, or the run was
 * interrupted inside it.
 *
 * `model-requested` says a call was asked and `model-settled` says what it
 * answered, so a call that burned its whole budget and returned nothing left a
 * request and silence, which is the call a reader most needs to see. This is
 * its record, under the keys of the `model-requested` it ends. It is its own
 * event because neither neighbour fits: every reader of `model-settled` takes
 * it for an answer the model gave, and every reader of `model-retried` counts
 * it as a try that was made again.
 *
 * `code` is the failure's own code where it has one (a `ModelError` code, a
 * harness error code), its tag where it has none, and `interrupted` for a call
 * the run was interrupted in. `durationMillis`, `stages` and `tries` are what
 * `model-settled` would have carried, as far as the call got. `timing` is the
 * model package's wire record of the failed call, which it attaches to its
 * error outside the error's schema; a host whose engine hands on the decoded
 * error and not the instance leaves it absent.
 *
 * @category events
 * @since 1.0.0-rc.1
 */
export declare class ModelFailed extends ModelFailed_base {
}
declare const CellProduced_base: Schema.Class<CellProduced, Schema.TaggedStruct<"cell-produced", {
    readonly eventType: Schema.Literal<"flows.harness.cell-produced.v1">;
    readonly cell: typeof Cell.Source;
    /**
     * How many fenced cell blocks the reply was written in.
     *
     * Journaled because it is the only record of how the model laid its frame
     * out, and because the count above one is the shape whose whole program the
     * harness used to discard. See `Cell.extract`.
     */
    readonly blocks: Schema.withDecodingDefaultKey<Schema.withConstructorDefault<Schema.Int>, never>;
}>, {}>;
/**
 * The cell source recovered from one model settlement.
 *
 * The source itself is durable evidence: replay re-executes exactly this text,
 * and every call identity inside the frame folds in its digest.
 *
 * @category events
 * @since 0.1.0
 * @slop
 */
export declare class CellProduced extends CellProduced_base {
}
declare const CellRejectedInFrame_base: Schema.Class<CellRejectedInFrame, Schema.TaggedStruct<"cell-rejected-in-frame", {
    readonly eventType: Schema.Literal<"flows.harness.cell-rejected-in-frame.v1">;
    /** Which attempt of this frame was refused, counting from one. */
    readonly attempt: Schema.Int;
    /** Why the parse refused it. */
    readonly code: Schema.Literals<readonly ["no_cell", "output_truncated", "imports_forbidden", "compile_failed", "invalid_transition", "unsupported_language", "limit_exceeded", "stalled"]>;
    /** What the frame told the model, verbatim. */
    readonly message: Schema.String;
}>, {}>;
/**
 * One reply the boundary parse refused, answered inside the frame it arrived
 * in rather than by ending the frame.
 *
 * Journaled because it is spend: a re-prompt is a real model call, cached
 * prefix or not, and a wave counting cost per frame would otherwise see the
 * output of an answer it has no record of asking for. It is also the only
 * measure of whether validating at the boundary is worth what it costs — the
 * ratio of this event to `cell-settled` rejections says how often one re-ask
 * recovers a frame.
 *
 * @category events
 * @since 0.1.0
 * @slop
 */
export declare class CellRejectedInFrame extends CellRejectedInFrame_base {
}
declare const CellCallStarted_base: Schema.Class<CellCallStarted, Schema.TaggedStruct<"cell-call-started", {
    readonly eventType: Schema.Literal<"flows.harness.cell-call-started.v1">;
    readonly call: typeof Cell.Call;
    /** Whether this invocation was the run's declared verification; absent in older journals. */
    readonly declared: Schema.optional<Schema.Boolean>;
}>, {}>;
/**
 * One flow call opened from inside a running cell.
 *
 * @category events
 * @since 0.1.0
 * @slop
 */
export declare class CellCallStarted extends CellCallStarted_base {
}
declare const CellCallSettled_base: Schema.Class<CellCallSettled, Schema.TaggedStruct<"cell-call-settled", {
    readonly eventType: Schema.Literal<"flows.harness.cell-call-settled.v1">;
    readonly flowName: Schema.String;
    readonly identity: typeof Cell.CallIdentity;
    readonly result: typeof Cell.CallResult;
    /**
     * Wall-clock milliseconds from the call being issued to its settlement, on
     * the injected clock. Absent from journals written before calls were timed.
     */
    readonly durationMillis: Schema.optional<Schema.Int>;
    /**
     * What kind of failure the flow's handler met, in identifiers only: see
     * `Cell.FailureKind`. Absent for a call that succeeded, for a failure the
     * boundary raised itself, and for a settlement replayed from its record.
     */
    readonly reason: Schema.optional<Schema.Struct<{
        readonly tag: Schema.optional<Schema.String>;
        readonly code: Schema.optional<Schema.String>;
    }>>;
}>, {}>;
/**
 * One settled flow call made from inside a running cell.
 *
 * @category events
 * @since 0.1.0
 * @slop
 */
export declare class CellCallSettled extends CellCallSettled_base {
}
declare const CellPrinted_base: Schema.Class<CellPrinted, Schema.TaggedStruct<"cell-printed", {
    readonly eventType: Schema.Literal<"flows.harness.cell-printed.v1">;
    /** The digest of the cell whose prints these are. */
    readonly cell: Schema.String;
    /** The frame's whole print buffer, already bounded; empty when it printed nothing. */
    readonly text: Schema.String;
}>, {}>;
/**
 * What one REPL cell printed, as the next model turn will read it.
 *
 * The print buffer is the whole of the context channel in REPL mode, so it is
 * journaled rather than derived: a transcript projection rebuilds a resumed
 * run's window from the journal without re-running anything, exactly as it does
 * for the context a filing cell projected. Bounded before it is emitted, so the
 * journal carries what the model saw and nothing larger.
 *
 * @category events
 * @since 0.1.0
 */
export declare class CellPrinted extends CellPrinted_base {
}
declare const CellSettled_base: Schema.Class<CellSettled, Schema.TaggedStruct<"cell-settled", {
    readonly eventType: Schema.Literal<"flows.harness.cell-settled.v1">;
    readonly cell: Schema.String;
    readonly outcome: Schema.toTaggedUnion<"_tag", readonly [typeof Cell.Settled, typeof Cell.Raised, typeof Cell.Rejected]>;
    /** Absent in journals written before execution frontiers were recorded. */
    readonly boundary: Schema.optional<Schema.Struct<{
        readonly terminal: Schema.Literals<readonly ["timeout", "settled"]>;
        readonly dispatched: Schema.Int;
        readonly settled: Schema.Int;
    }>>;
    /**
     * What the cell amounted to, so a frame that moved nothing can be counted
     * without reading its source. `kind` is `rejected` for a reply the boundary
     * refused or a limit cut off, `threw` for a cell that raised,
     * `comment_only` for a settled cell whose source is nothing but comments,
     * `no_call` for one that ran code and issued no flow call, and `calls`
     * otherwise. `calls` counts every flow call the cell issued, refused ones
     * included, and `callMs` sums what they took, so concurrent calls can add
     * up to more than the cell did. Absent from journals written before it.
     */
    readonly work: Schema.optional<Schema.Struct<{
        readonly kind: Schema.Literals<readonly ["rejected", "threw", "comment_only", "no_call", "calls"]>;
        readonly calls: Schema.Int;
        readonly callMs: Schema.Int;
    }>>;
}>, {}>;
/**
 * The outcome of executing one cell, whether it settled, threw, or was
 * rejected before it ran.
 *
 * @category events
 * @since 0.1.0
 * @slop
 */
export declare class CellSettled extends CellSettled_base {
}
declare const TransitionApplied_base: Schema.Class<TransitionApplied, Schema.TaggedStruct<"transition-applied", {
    readonly eventType: Schema.Literal<"flows.harness.transition-applied.v1">;
    readonly transition: Schema.toTaggedUnion<"_tag", readonly [typeof Cell.Continue, typeof Cell.Complete, typeof Cell.Park]>;
}>, {}>;
/**
 * The durable transition the controller applied after a cell settled.
 *
 * @category events
 * @since 0.1.0
 * @slop
 */
export declare class TransitionApplied extends TransitionApplied_base {
}
declare const ReadOnlyDemandIssued_base: Schema.Class<ReadOnlyDemandIssued, Schema.TaggedStruct<"read-only-demand-issued", {
    readonly eventType: Schema.Literal<"flows.harness.read-only-demand-issued.v1">;
    /** Consecutive read-only frames the run had spent. */
    readonly streak: Schema.Int;
    /** The armed threshold that streak reached. */
    readonly cap: Schema.Int;
    /** The frame the demand was attached to, which is the one that must answer it. */
    readonly nextFrame: Schema.Int;
}>, {}>;
/**
 * The controller issuing a read-cap intervention to the next frame.
 *
 * Kept separately from {@link ReadOnlyDemanded}: this event records the user
 * message entering the model transcript, while that event records how a later
 * frame answered it. A crash between those boundaries must retain the demand.
 *
 * @category events
 * @since 1.0.0-rc.0
 */
export declare class ReadOnlyDemandIssued extends ReadOnlyDemandIssued_base {
}
declare const ReadOnlyDemanded_base: Schema.Class<ReadOnlyDemanded, Schema.TaggedStruct<"read-only-demanded", {
    readonly eventType: Schema.Literal<"flows.harness.read-only-demanded.v1">;
    readonly streak: Schema.Int;
    readonly cap: Schema.Int;
    readonly nextFrame: Schema.Int;
    readonly nextAction: Schema.Literals<readonly ["write", "justification", "read-only", "park"]>;
}>, {}>;
/**
 * The outcome of the frame immediately following a read-cap intervention.
 *
 * @category events
 * @since 0.1.0
 */
export declare class ReadOnlyDemanded extends ReadOnlyDemanded_base {
}
declare const RepeatDemanded_base: Schema.Class<RepeatDemanded, Schema.TaggedStruct<"repeat-demanded", {
    readonly eventType: Schema.Literal<"flows.harness.repeat-demanded.v1">;
    /** Consecutive repeat-observation frames the run had spent. */
    readonly frames: Schema.Int;
    /** The armed threshold that streak reached. */
    readonly cap: Schema.Int;
    /** The frame the demand was attached to, which is the one that must answer it. */
    readonly nextFrame: Schema.Int;
}>, {}>;
/**
 * The controller telling a run it has stopped learning anything.
 *
 * Written when a run reaches its repeat-observation threshold: consecutive
 * frames that issued calls, issued none the run had not already issued, and
 * changed nothing. Both this and {@link ReadOnlyDemandIssued} are written when
 * their demand is issued; {@link ReadOnlyDemanded} additionally records the
 * read-cap demand's later answer because that answer is a field on a
 * transition. A repeat demand is answered by the shape of the next frame's
 * calls, which the journal already writes one by one.
 *
 * @category events
 * @since 0.1.0
 */
export declare class RepeatDemanded extends RepeatDemanded_base {
}
declare const NarrowedDemanded_base: Schema.Class<NarrowedDemanded, Schema.TaggedStruct<"narrowed-demanded", {
    readonly eventType: Schema.Literal<"flows.harness.narrowed-demanded.v1">;
    /** The flow both checks named. */
    readonly flow: Schema.String;
    /** The broader check's input as the run wrote it, clipped. */
    readonly broader: Schema.String;
    /** The narrowing check's input as the run wrote it, clipped. */
    readonly narrower: Schema.String;
    /** Workspace digest the broader check was last run over. */
    readonly broaderDigest: Schema.String;
    /** Workspace digest the completing frame closed on. */
    readonly currentDigest: Schema.String;
    /** The frame the demand was attached to, which is the one that must answer it. */
    readonly nextFrame: Schema.Int;
}>, {}>;
/**
 * The controller refusing one completion whose evidence was narrowed.
 *
 * Written when a frame returns `complete` while the check it ran is a strict
 * narrowing of one the run had already run in full, over a tree that has since
 * changed and never re-run since. Written when the demand is *issued*, like the
 * repeat demand and unlike the read-cap one, because what answers it is the
 * shape of the next frame's calls and its output — both of which the journal
 * already writes.
 *
 * The event is the whole audit trail for the bounce. `broader` and `narrower`
 * quote the two inputs as the run wrote them, and the two digests say which
 * trees they were measured over, so a grader can decide after the fact whether
 * the demand was right without replaying anything.
 *
 * @category events
 * @since 0.1.0
 */
export declare class NarrowedDemanded extends NarrowedDemanded_base {
}
declare const UnmovedDemanded_base: Schema.Class<UnmovedDemanded, Schema.TaggedStruct<"unmoved-demanded", {
    readonly eventType: Schema.Literal<"flows.harness.unmoved-demanded.v1">;
    /** Workspace digest the run opened on. */
    readonly openedDigest: Schema.String;
    /** Workspace digest the completing frame closed on, equal to the first. */
    readonly currentDigest: Schema.String;
    /** The frame the demand was attached to, which is the one that must answer it. */
    readonly nextFrame: Schema.Int;
}>, {}>;
/**
 * The controller refusing one completion with no change behind it.
 *
 * Written when a frame returns `complete` while the tree it closed on is
 * byte-for-byte the tree the run opened on. Written when the demand is
 * *issued*, like the narrowing demand, because what answers it is the next
 * frame's own record — an edit that moves the digest, or a second completion
 * saying no change was needed — and the journal already writes both.
 *
 * The two digests are the whole audit trail: a grader can decide after the fact
 * whether the demand was right by comparing them to the run's
 * `mutation-observed` record, without replaying anything.
 *
 * @category events
 * @since 0.1.0
 */
export declare class UnmovedDemanded extends UnmovedDemanded_base {
}
declare const UnresolvedDemanded_base: Schema.Class<UnresolvedDemanded, Schema.TaggedStruct<"unresolved-demanded", {
    readonly eventType: Schema.Literal<"flows.harness.unresolved-demanded.v1">;
    /** The flow both checks named. */
    readonly flow: Schema.String;
    /** The failing check's input as the run wrote it, clipped. */
    readonly failed: Schema.String;
    /** The input of the reading the run took instead, clipped. */
    readonly instead: Schema.String;
    /** Workspace digest both checks were recorded over, and the frame closed on. */
    readonly currentDigest: Schema.String;
    /** The frame the demand was attached to, which is the one that must answer it. */
    readonly nextFrame: Schema.Int;
}>, {}>;
/**
 * The controller refusing one completion that stepped around a failing check.
 *
 * Written when a frame returns `complete` while a check recorded over the same
 * tree reported a failing exit status, was never re-run, and a later check went
 * back to the same subject with a different command.
 *
 * `failed` and `instead` quote the two inputs as the run wrote them, and
 * `currentDigest` is the tree both were measured over, so the record says which
 * reading the completion stands on and which one replaced it.
 *
 * @category events
 * @since 0.1.0
 */
export declare class UnresolvedDemanded extends UnresolvedDemanded_base {
}
declare const FailedCallDemanded_base: Schema.Class<FailedCallDemanded, Schema.TaggedStruct<"failed-call-demanded", {
    readonly eventType: Schema.Literal<"flows.harness.failed-call-demanded.v1">;
    /** The calls the completing frame settled as failures, oldest first. */
    readonly failures: Schema.$Array<Schema.Struct<{
        readonly flow: Schema.String;
        readonly message: Schema.String;
    }>>;
    /** The frame the demand was attached to, which is the one that must answer it. */
    readonly nextFrame: Schema.Int;
}>, {}>;
/**
 * The controller handing back a completion its own cell wrote before a call
 * in that cell failed.
 *
 * `failures` quotes each failed call's flow and message as the flow reported
 * them, so the record says which results the completion was written without.
 * See `FailedCall`.
 *
 * @category events
 * @since 1.0.0-rc.1
 */
export declare class FailedCallDemanded extends FailedCallDemanded_base {
}
declare const OutputDemanded_base: Schema.Class<OutputDemanded, Schema.TaggedStruct<"output-demanded", {
    readonly eventType: Schema.Literal<"flows.harness.output-demanded.v1">;
    /** The correction handed back with the completion. */
    readonly note: Schema.String;
    /** The frame the demand was attached to, which is the one that must answer it. */
    readonly nextFrame: Schema.Int;
}>, {}>;
/**
 * The controller handing back a completion whose output does not fit the
 * shape the host declared for it.
 *
 * `note` is the correction the run was shown, verbatim, so a transcript
 * rebuilt from the journal holds what the model read. The same session
 * answers it, with everything its earlier frames bound still in scope.
 *
 * @category events
 * @since 1.0.0-rc.1
 */
export declare class OutputDemanded extends OutputDemanded_base {
}
declare const UnobservedDemanded_base: Schema.Class<UnobservedDemanded, Schema.TaggedStruct<"unobserved-demanded", {
    readonly eventType: Schema.Literal<"flows.harness.unobserved-demanded.v1">;
    /** The calls the completion was written without reading, oldest first. */
    readonly calls: Schema.$Array<Schema.Struct<{
        readonly flow: Schema.String;
        readonly ordinal: Schema.Int;
        readonly ok: Schema.Boolean;
        readonly summary: Schema.String;
    }>>;
    /** The frame the demand was attached to, which is the one that must answer it. */
    readonly nextFrame: Schema.Int;
}>, {}>;
/**
 * The controller handing back a completion its own cell wrote before reading
 * the calls it made.
 *
 * `calls` names each call the completing frame settled, in ledger order, with
 * the head of the result the next frame was shown, so the record says which
 * results the completion was written without.
 *
 * @category events
 * @since 1.0.0-rc.1
 */
export declare class UnobservedDemanded extends UnobservedDemanded_base {
}
declare const NarrowOnlyDemanded_base: Schema.Class<NarrowOnlyDemanded, Schema.TaggedStruct<"narrow-only-demanded", {
    readonly eventType: Schema.Literal<"flows.harness.narrow-only-demanded.v1">;
    /** The flow the check named. */
    readonly flow: Schema.String;
    /** The check's input as the run wrote it, clipped. */
    readonly check: Schema.String;
    /** The subjects it names, sorted. */
    readonly targets: Schema.$Array<Schema.String>;
    /** Workspace digest the completing frame closed on; empty when unmeasured. */
    readonly currentDigest: Schema.String;
    /** The frame the demand was attached to, which is the one that must answer it. */
    readonly nextFrame: Schema.Int;
}>, {}>;
/**
 * The controller refusing one completion that holds a single reading.
 *
 * Written when a frame returns `complete` while the last check it ran names
 * subjects no other check of the run covers together, and the run never issued
 * that exact call before. The sibling of `narrowed-demanded`, from the other
 * side: that one fires when a broader check exists in the ledger and was not
 * re-run, this one when no broader check was ever taken.
 *
 * `check` quotes the input as the run wrote it and `targets` names the subjects
 * the demand is about, so a grader can decide after the fact whether the demand
 * was right without replaying anything.
 *
 * @category events
 * @since 0.1.0
 */
export declare class NarrowOnlyDemanded extends NarrowOnlyDemanded_base {
}
declare const ClaimDemanded_base: Schema.Class<ClaimDemanded, Schema.TaggedStruct<"claim-demanded", {
    readonly eventType: Schema.Literal<"flows.harness.claim-demanded.v1">;
    /** Probability the transport gave to "the task as stated is done"; journaled, decides nothing. */
    readonly complete: Schema.Number;
    /** Probability it gave to "the claim asserts what the evidence does not show"; journaled, decides nothing. */
    readonly overclaims: Schema.Number;
    /** Probability it gave to "the claim reports a command or a result the evidence does not record"; the one that decides. */
    readonly invented: Schema.Number;
    /** Wall-clock milliseconds the evaluation took. */
    readonly latencyMs: Schema.Int;
    /** Token usage reported by the evaluator, absent from older journal entries. */
    readonly usage: Schema.optional<Schema.Struct<{
        readonly inputTokens: Schema.Number;
        readonly outputTokens: Schema.Number;
        readonly modelId: Schema.optional<Schema.String>;
        readonly costUsd: Schema.optional<Schema.Number>;
    }>>;
    /**
     * What {@link usage} cost under the reading model's rate card. Absent for
     * an unmetered reading or an unpriced model, and from older journal entries.
     */
    readonly costUsd: Schema.optional<Schema.Number>;
    /** Where {@link costUsd} came from. */
    readonly costSource: Schema.optional<Schema.Literals<readonly ["reported", "estimated"]>>;
    /** Whether this reading handed the completion back. */
    readonly demanded: Schema.Boolean;
    /**
     * Whether this reading ended the run instead of handing the completion back.
     *
     * The third of the three ways a reading comes out, and the one that had no
     * field. `demanded` false meant both "the claim stands" and "the claim is
     * refused and the run is over", which a projection cannot tell apart, so the
     * refusal wrote no card and the sentence it refused was nowhere a person
     * could read. Absent from older journal entries, where it decodes false: a
     * journal written before this field carries its verdict in the run's
     * failure, which is where it always was.
     */
    readonly refused: Schema.withDecodingDefaultKey<Schema.withConstructorDefault<Schema.Boolean>, never>;
    /** Workspace digest the completing frame closed on; empty when unmeasured. */
    readonly currentDigest: Schema.String;
    /** The frame the demand was attached to, which is the one that must answer it. */
    readonly nextFrame: Schema.Int;
}>, {}>;
/**
 * What Jev read off one completion claim, whether or not it braked.
 *
 * The only demand event written on every evaluation rather than only on a
 * firing, and it is written that way on purpose: the other five demands are
 * derived from facts a grader can recompute from the journal, and this one is
 * a model's reading that exists nowhere else. Without the passing readings the
 * record would answer "how often did it fire" and could never answer "how
 * often did it agree", which is the only question that says whether arming it
 * was right. `demanded` is the field that separates them, and it says exactly one
 * thing: whether this reading handed the completion back for a frame. A
 * reading comes out three ways, not two. It passes, and cost the run nothing.
 * It demands, and cost the run a frame. Or it reads against a run with no
 * bounce left to spend, where `demanded` is false and the run ends on
 * `CompletionClaim.unproven`: the verdict is in the run's failure, and the two
 * probabilities here are what a grader re-applies a threshold to either way.
 *
 * `complete` and `overclaims` are the transport's probabilities for the
 * classifier's two questions, verbatim, so a grader can re-apply any
 * threshold to a whole wave without re-asking. `latencyMs` is what the
 * evaluation cost in wall clock on the hot path of a completion. No event is
 * written where the brake is disarmed (`claimCap` of zero), where the
 * transport failed, or where there was no task and no claim to ask about:
 * nothing was read, so there is nothing to record. A spent cap is no longer
 * one of those cases — the reading still happens, and it is the reading that
 * ends the run. See `CompletionClaim`.
 *
 * @category events
 * @since 1.0.0-rc.0
 */
export declare class ClaimDemanded extends ClaimDemanded_base {
}
/**
 * One classifier answer as `decision-settled` journals it, tagged by kind.
 *
 * `confidence` is the PROVIDER's number, `Evaluator.Response.confidence`, and
 * it is absent whenever the provider sent none. It is never the largest
 * probability wearing the name: `Classifier.confidence` reads 1 for an answer
 * that carried no distribution at all, so a record that filled the field from
 * it would report certainty exactly where the provider reported nothing. A
 * boolean has no such field because its probability is the whole answer.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export declare const DecisionAnswer: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"boolean">;
    /** The probability the transport gave to yes. */
    readonly p: Schema.Number;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"choice">;
    /** The option chosen. */
    readonly value: Schema.String;
    readonly probabilities: Schema.$Record<Schema.String, Schema.Number>;
    /** The provider's own number, unchecked: it is theirs to define, and a record must not fail a run. */
    readonly confidence: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"score">;
    /** The score as the transport gave it, interpolated over rung indexes. */
    readonly value: Schema.Number;
    /** The label of the nearest rung. */
    readonly label: Schema.String;
    readonly probabilities: Schema.$Record<Schema.String, Schema.Number>;
    /** The provider's own number, unchecked: it is theirs to define, and a record must not fail a run. */
    readonly confidence: Schema.optionalKey<Schema.Number>;
}>]>;
/**
 * The decoded form of {@link DecisionAnswer}.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export type DecisionAnswer = typeof DecisionAnswer.Type;
/**
 * The answers of one evaluation in the shape {@link DecisionSettled} carries.
 *
 * `confidence` is `Evaluator.Response.confidence`, passed through per question
 * and left out per question: see {@link DecisionAnswer}.
 *
 * @category conversions
 * @since 1.0.0-rc.0
 */
export declare const decisionAnswers: (answers: Readonly<Record<string, Classifier.Answer>>, confidence: Readonly<Record<string, number>> | undefined) => Readonly<Record<string, DecisionAnswer>>;
declare const DecisionSettled_base: Schema.Class<DecisionSettled, Schema.TaggedStruct<"decision-settled", {
    readonly eventType: Schema.Literal<"flows.harness.decision-settled.v1">;
    /** The run's session, which is the recorded scope of the step that decided. */
    readonly scope: Schema.String;
    /** The controller's frame number for the turn the decision was made in. */
    readonly frame: Schema.Int;
    /** The classifier's stable id. */
    readonly classifier: Schema.String;
    /** `Classifier.digest`: the canonical hash of the id and the questions. */
    readonly digest: Schema.String;
    /** The encoded state the questions were asked about, as the transport was sent it. */
    readonly state: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    /** The questions as they crossed the wire, keyed by question id. */
    readonly questions: Schema.$Record<Schema.String, Schema.Union<readonly [typeof Evaluator.BooleanQuestion, typeof Evaluator.ChoiceQuestion, typeof Evaluator.ScoreQuestion]>>;
    /** One answer per question id, tagged by kind. */
    readonly answers: Schema.$Record<Schema.String, Schema.Union<readonly [Schema.Struct<{
        readonly kind: Schema.Literal<"boolean">;
        /** The probability the transport gave to yes. */
        readonly p: Schema.Number;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"choice">;
        /** The option chosen. */
        readonly value: Schema.String;
        readonly probabilities: Schema.$Record<Schema.String, Schema.Number>;
        /** The provider's own number, unchecked: it is theirs to define, and a record must not fail a run. */
        readonly confidence: Schema.optionalKey<Schema.Number>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"score">;
        /** The score as the transport gave it, interpolated over rung indexes. */
        readonly value: Schema.Number;
        /** The label of the nearest rung. */
        readonly label: Schema.String;
        readonly probabilities: Schema.$Record<Schema.String, Schema.Number>;
        /** The provider's own number, unchecked: it is theirs to define, and a record must not fail a run. */
        readonly confidence: Schema.optionalKey<Schema.Number>;
    }>]>>;
    /** Wall-clock milliseconds the evaluation took. */
    readonly latencyMs: Schema.Int;
    /** Whether this decision changed what the run did next. */
    readonly acted: Schema.Boolean;
    /** Who answered. */
    readonly decidedBy: Schema.Literals<readonly ["jev", "seat", "human"]>;
    /** Token usage reported by the evaluator, absent when it supplied none. */
    readonly usage: Schema.optional<Schema.Struct<{
        readonly inputTokens: Schema.Number;
        readonly outputTokens: Schema.Number;
        readonly modelId: Schema.optional<Schema.String>;
        readonly costUsd: Schema.optional<Schema.Number>;
    }>>;
    /**
     * Where the reading's time went on the wire, as the transport timed it:
     * `Evaluator.Response.timing`, handed on whole. Absent where the transport
     * timed nothing, and from journals written before it was carried.
     */
    readonly timing: Schema.optional<Schema.Struct<{
        readonly startedAt: Schema.optional<Schema.Number>;
        readonly attempts: Schema.optional<Schema.Int>;
        readonly requestBytes: Schema.optional<Schema.Number>;
        readonly preparedMs: Schema.optional<Schema.Number>;
        readonly signedMs: Schema.optional<Schema.Number>;
        readonly sentMs: Schema.optional<Schema.Number>;
        readonly headersMs: Schema.optional<Schema.Number>;
        readonly firstEventMs: Schema.optional<Schema.Number>;
        readonly firstThinkingMs: Schema.optional<Schema.Number>;
        readonly firstOutputMs: Schema.optional<Schema.Number>;
        readonly lastOutputMs: Schema.optional<Schema.Number>;
        readonly completedMs: Schema.optional<Schema.Number>;
        readonly closedMs: Schema.optional<Schema.Number>;
        readonly failedTries: Schema.optional<Schema.$Array<Schema.Struct<{
            readonly sentMs: Schema.optional<Schema.Number>;
            readonly failedMs: Schema.Number;
            readonly code: Schema.String;
            readonly httpStatus: Schema.optional<Schema.Number>;
        }>>>;
    }>>;
}>, {}>;
/**
 * One decision a classifier made, with everything a reader needs to make it
 * again: the state it read, the questions it was asked, and what it answered.
 *
 * The generalisation of {@link ClaimDemanded}, which stays. That event is three
 * probabilities and a verdict, and it cannot say what the probabilities were
 * probabilities OF: the evidence the brake assembled exists nowhere else, so a
 * reading could be re-thresholded and never re-asked. This one carries the
 * evidence. It is written beside `claim-demanded` rather than instead of it,
 * because every projection that counts readings counts that event.
 *
 * `classifier` is the declaration's stable id, never its description, and
 * `digest` is `Classifier.digest`, so a reader can tell a decision made under
 * questions that have since been reworded from one it can reproduce.
 * `questions` are the wire shapes the transport was sent.
 *
 * `acted` says whether the decision changed what the run did next. For the
 * completion brake that is a completion handed back or a run ended; a reading
 * that let the claim stand is `false`, and it is journaled all the same,
 * because the passing decisions are what say whether asking was right.
 *
 * `decidedBy` names who answered: `jev` for the decision-only model behind
 * `Evaluator`, `seat` for a generation seat asked to judge through the
 * model-to-judge adapter (`usage.modelId` names its model), `human` for a
 * person. `human` is not written today.
 *
 * `scope` and `frame` are the join keys {@link ModelRequested} carries, for the
 * reason it carries them.
 *
 * An emitter must produce the reading inside a recorded boundary, as the
 * completion brake does, and emit what the record holds. The answers are a
 * model's and the latency is a clock's, so a replayed frame that asked again
 * would journal a second, different decision at the same coordinates.
 *
 * @category events
 * @since 1.0.0-rc.0
 */
export declare class DecisionSettled extends DecisionSettled_base {
}
declare const SupervisorSettled_base: Schema.Class<SupervisorSettled, Schema.TaggedStruct<"supervisor-settled", {
    readonly eventType: Schema.Literal<"flows.harness.supervisor-settled.v1">;
    /** The run's session. */
    readonly scope: Schema.String;
    /** The frame the snapshot was built from. */
    readonly frame: Schema.Int;
    /** Probability the run is repeating itself without converging. */
    readonly thrashing: Schema.Number;
    /** Probability the run is still working on the task as stated. */
    readonly onTarget: Schema.Number;
    /** Probability the run's evidence is suspect. */
    readonly suspect: Schema.Number;
    /** Probability visible earlier context is contradicted by later evidence. */
    readonly outdatedContext: Schema.optional<Schema.Number>;
    /** Probability visible earlier context is no longer useful for this task. */
    readonly irrelevantContext: Schema.optional<Schema.Number>;
    readonly frustrated: Schema.Literals<readonly ["none", "mild", "strong"]>;
    readonly anxious: Schema.Literals<readonly ["none", "mild", "strong"]>;
    readonly scared: Schema.Literals<readonly ["none", "mild", "strong"]>;
    readonly confused: Schema.Literals<readonly ["none", "mild", "strong"]>;
    readonly confident: Schema.Literals<readonly ["none", "mild", "strong"]>;
    /** The one word a person is shown. */
    readonly needsHelp: Schema.Literals<readonly ["none", "clarification", "permission", "stuck", "risky_action"]>;
    /** Whether the reading crossed a nudge threshold. */
    readonly crossed: Schema.Boolean;
    /** Whether a nudge was handed to the next boundary. */
    readonly nudged: Schema.Boolean;
    /**
     * Whether steering was armed for this reading. `discipline-armed` states it
     * once, at a run's first frame; a resumed run may be armed differently, and
     * this is where the journal says what the reading actually ran under.
     * Absent from readings journaled before it existed.
     */
    readonly steer: Schema.optional<Schema.Boolean>;
    /**
     * Whether the snapshot had more uncalled skills than `Supervisor.skillLimit`,
     * so some were not scored. Absent when every one was.
     */
    readonly skillsCapped: Schema.optional<Schema.Boolean>;
    /** Wall-clock milliseconds the evaluation took. */
    readonly latencyMs: Schema.Int;
    /** Token usage reported by the evaluator, absent when it supplied none. */
    readonly usage: Schema.optional<Schema.Struct<{
        readonly inputTokens: Schema.Number;
        readonly outputTokens: Schema.Number;
        readonly modelId: Schema.optional<Schema.String>;
        readonly costUsd: Schema.optional<Schema.Number>;
    }>>;
    /** Each armed monitor's probability in this reading, and whether it crossed. */
    readonly monitors: Schema.optional<Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly kind: Schema.Literals<readonly ["mood", "skill", "lint"]>;
        readonly p: Schema.Number;
        readonly crossed: Schema.Boolean;
    }>>>;
    /**
     * Every `Supervisor` trigger this reading fired, in declaration order;
     * empty when it fired none. Absent, like every field below, from readings
     * journaled before it was carried.
     */
    readonly triggers: Schema.optional<Schema.$Array<Schema.Literals<readonly ["thrashing", "off_target", "suspect", "outdated_context", "irrelevant_context"]>>>;
    /**
     * The context triggers this reading handed on, which compact the run at
     * its next frame if a boundary takes them: `steering-drained` says whether
     * one did. Absent when it fired none, or when {@link compactSuppressed}.
     */
    readonly compact: Schema.optional<Schema.$Array<Schema.Literals<readonly ["budget", "outdated_context", "irrelevant_context"]>>>;
    /**
     * Why a context trigger this reading fired scheduled nothing: `floor` when
     * the context was at or under `Compaction.judgedAbove` tokens, `unjudged`
     * when the host holds no real judge.
     */
    readonly compactSuppressed: Schema.optional<Schema.Literals<readonly ["floor", "unjudged"]>>;
    /** What {@link usage} cost under the reading model's rate card; absent when unmetered or unpriced. */
    readonly costUsd: Schema.optional<Schema.Number>;
    /** Where {@link costUsd} came from. */
    readonly costSource: Schema.optional<Schema.Literals<readonly ["reported", "estimated"]>>;
    /** Where the reading's time went on the wire, as the transport timed it; absent where it timed nothing. */
    readonly timing: Schema.optional<Schema.Struct<{
        readonly startedAt: Schema.optional<Schema.Number>;
        readonly attempts: Schema.optional<Schema.Int>;
        readonly requestBytes: Schema.optional<Schema.Number>;
        readonly preparedMs: Schema.optional<Schema.Number>;
        readonly signedMs: Schema.optional<Schema.Number>;
        readonly sentMs: Schema.optional<Schema.Number>;
        readonly headersMs: Schema.optional<Schema.Number>;
        readonly firstEventMs: Schema.optional<Schema.Number>;
        readonly firstThinkingMs: Schema.optional<Schema.Number>;
        readonly firstOutputMs: Schema.optional<Schema.Number>;
        readonly lastOutputMs: Schema.optional<Schema.Number>;
        readonly completedMs: Schema.optional<Schema.Number>;
        readonly closedMs: Schema.optional<Schema.Number>;
        readonly failedTries: Schema.optional<Schema.$Array<Schema.Struct<{
            readonly sentMs: Schema.optional<Schema.Number>;
            readonly failedMs: Schema.Number;
            readonly code: Schema.String;
            readonly httpStatus: Schema.optional<Schema.Number>;
        }>>>;
    }>>;
}>, {}>;
/**
 * What Jev read off one frame of a running run, whether or not it nudged.
 *
 * Written by the supervisor fiber for every snapshot it read, at some time
 * after the frame it is a reading of closed: the reading is taken off the
 * cell loop's hot path, so its position among the frame's other events is not
 * fixed and `scope` and `frame` are its coordinates. `frame` is the frame the
 * snapshot was built from, not the frame that will read any nudge.
 *
 * `thrashing`, `onTarget` and `suspect` are the transport's probabilities
 * verbatim, so a wave re-applies any threshold without re-asking. The five
 * levels and `needsHelp` are the transport's words: nothing here is a default
 * a failed reading fills in, because a failed reading writes
 * {@link SupervisorUnjudged} and never this. `crossed` says whether the
 * reading passed a nudge threshold; `nudged` whether a nudge was handed to
 * the next boundary, which needs the host to have armed steering. The
 * recalled rows are judged by Relevance and journaled beside this as
 * `relevance-settled`. `decision-settled` beside this carries the snapshot
 * and every answer.
 *
 * @category events
 * @since 1.0.0-rc.0
 */
export declare class SupervisorSettled extends SupervisorSettled_base {
}
declare const SupervisorUnjudged_base: Schema.Class<SupervisorUnjudged, Schema.TaggedStruct<"supervisor-unjudged", {
    readonly eventType: Schema.Literal<"flows.harness.supervisor-unjudged.v1">;
    /** The run's session. */
    readonly scope: Schema.String;
    /** The frame the snapshot was built from. */
    readonly frame: Schema.Int;
    /** `unconfigured`, `interrupted`, or the transport's own error code. */
    readonly reason: Schema.Literals<readonly ["interrupted", "unconfigured", "unreachable", "refused", "empty", "timeout", "invalid_answer", "invalid_question"]>;
    /** What went wrong, safe to journal: see `Evaluator.publicMessage`. */
    readonly detail: Schema.String;
    /** What each request of the failed reading paid; absent when none was metered. */
    readonly usage: Schema.optional<Schema.$Array<Schema.Struct<{
        readonly inputTokens: Schema.Number;
        readonly outputTokens: Schema.Number;
        readonly modelId: Schema.optional<Schema.String>;
        readonly costUsd: Schema.optional<Schema.Number>;
    }>>>;
}>, {}>;
/**
 * A supervisor snapshot nobody could judge, and why.
 *
 * Written instead of {@link SupervisorSettled}, never beside it: no
 * evaluator on the host, a refusal, a deadline, an answer that does not
 * decode, a run that ended with the reading in flight. `reason` is
 * `unconfigured`, `interrupted`, or the transport's own error code. A reading
 * that fails inserts nothing and reports no level, so a
 * wave counting calm runs counts only runs Jev read. An `interrupted` reading
 * was asked and may have cost a call, so a wave counting Jev's cost counts it.
 *
 * @category events
 * @since 1.0.0-rc.0
 */
export declare class SupervisorUnjudged extends SupervisorUnjudged_base {
}
declare const DecisionUnjudged_base: Schema.Class<DecisionUnjudged, Schema.TaggedStruct<"decision-unjudged", {
    readonly eventType: Schema.Literal<"flows.harness.decision-unjudged.v1">;
    /** The run's session. */
    readonly scope: Schema.String;
    /** The frame the reading was asked in. */
    readonly frame: Schema.Int;
    /** The classifier's stable id. */
    readonly classifier: Schema.String;
    /** `unconfigured`, `interrupted`, or the transport's own error code. */
    readonly reason: Schema.Literals<readonly ["interrupted", "unconfigured", "unreachable", "refused", "empty", "timeout", "invalid_answer", "invalid_question"]>;
    /** What went wrong, safe to journal: see `Evaluator.publicMessage`. */
    readonly detail: Schema.String;
    /** Items the failed reading covered. */
    readonly items: Schema.Int;
    /** What each request of the failed reading paid; absent when none was metered. */
    readonly usage: Schema.optional<Schema.$Array<Schema.Struct<{
        readonly inputTokens: Schema.Number;
        readonly outputTokens: Schema.Number;
        readonly modelId: Schema.optional<Schema.String>;
        readonly costUsd: Schema.optional<Schema.Number>;
    }>>>;
}>, {}>;
/**
 * A Jev reading that could not be judged, outside the supervisor.
 *
 * Written by a relevance, compaction or routing reading instead of its
 * settlement. The caller then keeps everything it would have filtered, so the
 * receipt is what says the filter did not run. `items` is how many items the
 * failed reading covered.
 *
 * @category events
 * @since 1.0.0-rc.0
 */
export declare class DecisionUnjudged extends DecisionUnjudged_base {
}
declare const RelevanceSettled_base: Schema.Class<RelevanceSettled, Schema.TaggedStruct<"relevance-settled", {
    readonly eventType: Schema.Literal<"flows.harness.relevance-settled.v1">;
    /** The run's session. */
    readonly scope: Schema.String;
    /** The frame the reading was asked in. */
    readonly frame: Schema.Int;
    /**
     * `run` for the gate at run start, `supervisor` for recalled memory,
     * `recall` for a recall the model called.
     */
    readonly source: Schema.Literals<readonly ["run", "supervisor", "recall"]>;
    /** The probability at or above which an item is withheld. */
    readonly withholdAt: Schema.Number;
    readonly kept: Schema.$Array<Schema.Struct<{
        readonly kind: Schema.Literals<readonly ["flow", "skill", "instruction", "memory"]>;
        readonly id: Schema.String;
        /** Digest of the item's text; the text itself is never journaled. */
        readonly digest: Schema.String;
        /** Probability the item is unnecessary for the task as stated. */
        readonly p: Schema.Number;
    }>>;
    readonly withheld: Schema.$Array<Schema.Struct<{
        readonly kind: Schema.Literals<readonly ["flow", "skill", "instruction", "memory"]>;
        readonly id: Schema.String;
        /** Digest of the item's text; the text itself is never journaled. */
        readonly digest: Schema.String;
        /** Probability the item is unnecessary for the task as stated. */
        readonly p: Schema.Number;
    }>>;
    /** Wall-clock milliseconds the evaluation took. */
    readonly latencyMs: Schema.Int;
    /** Token usage reported by the evaluator, absent when it supplied none. */
    readonly usage: Schema.optional<Schema.Struct<{
        readonly inputTokens: Schema.Number;
        readonly outputTokens: Schema.Number;
        readonly modelId: Schema.optional<Schema.String>;
        readonly costUsd: Schema.optional<Schema.Number>;
    }>>;
}>, {}>;
/**
 * Which human-provided items a relevance reading kept and which it withheld.
 *
 * An item is withheld only at or above `withholdAt`. Ids and digests, never
 * item text.
 *
 * @category events
 * @since 1.0.0-rc.0
 */
export declare class RelevanceSettled extends RelevanceSettled_base {
}
declare const RelevanceRestored_base: Schema.Class<RelevanceRestored, Schema.TaggedStruct<"relevance-restored", {
    readonly eventType: Schema.Literal<"flows.harness.relevance-restored.v1">;
    /** The run's session. */
    readonly scope: Schema.String;
    /** The frame whose call restored it. */
    readonly frame: Schema.Int;
    /** The flow restored. */
    readonly flow: Schema.String;
}>, {}>;
/**
 * A withheld flow restored because the run called it by name.
 *
 * @category events
 * @since 1.0.0-rc.0
 */
export declare class RelevanceRestored extends RelevanceRestored_base {
}
/**
 * A panel a routed run fans out to: each member seat, with the backups it
 * fails over to, answers the task, and `merger` merges their answers.
 *
 * @category schemas
 * @since 1.0.0-rc.0
 */
export declare const SeatPanel: Schema.Struct<{
    readonly seats: Schema.$Array<Schema.Struct<{
        readonly seat: Schema.String;
        readonly backups: Schema.$Array<Schema.String>;
    }>>;
    readonly merger: Schema.String;
}>;
declare const SeatRouted_base: Schema.Class<SeatRouted, Schema.TaggedStruct<"seat-routed", {
    readonly eventType: Schema.Literal<"flows.harness.seat-routed.v1">;
    /** The run's session. */
    readonly scope: Schema.String;
    /** What the flow declared, such as `auto`. */
    readonly declared: Schema.String;
    /** The seat chosen. */
    readonly seat: Schema.String;
    /** The chosen seat's model. */
    readonly modelId: Schema.String;
    /** The system-prompt variant chosen with it, when one was. */
    readonly variant: Schema.NullOr<Schema.String>;
    /** The seats offered. */
    readonly candidates: Schema.$Array<Schema.String>;
    readonly decidedBy: Schema.Literals<readonly ["jev", "only"]>;
    /** The provider's own number, absent when it sent none. */
    readonly confidence: Schema.optional<Schema.Number>;
    /** Wall-clock milliseconds the routing took. */
    readonly latencyMs: Schema.Int;
    /** The seats `seat` fails over to, in order; absent when there are none. */
    readonly backups: Schema.optionalKey<Schema.$Array<Schema.String>>;
    /** The panel the task was routed to, whose merger is `seat`; absent for one seat. */
    readonly panel: Schema.optionalKey<Schema.Struct<{
        readonly seats: Schema.$Array<Schema.Struct<{
            readonly seat: Schema.String;
            readonly backups: Schema.$Array<Schema.String>;
        }>>;
        readonly merger: Schema.String;
    }>>;
}>, {}>;
/**
 * The seat a run with no declared model was routed to, and who chose it.
 *
 * `decidedBy` is `jev` when Jev answered the routing questions. Rows written
 * before the routing graph may say `only` and carry the seat choice's
 * `confidence`.
 *
 * @category events
 * @since 1.0.0-rc.0
 */
export declare class SeatRouted extends SeatRouted_base {
}
declare const SupervisorMemoryFailed_base: Schema.Class<SupervisorMemoryFailed, Schema.TaggedStruct<"supervisor-memory-failed", {
    readonly eventType: Schema.Literal<"flows.harness.supervisor-memory-failed.v1">;
    /** The run's session. */
    readonly scope: Schema.String;
    /** The frame whose reading asked; for a `remember`, the run's last frame. */
    readonly frame: Schema.Int;
    /** `recall` for a read, `remember` for a write. */
    readonly operation: Schema.Literals<readonly ["recall", "remember"]>;
    /** The store's own account of the failure. */
    readonly detail: Schema.String;
}>, {}>;
/**
 * A memory read or write the store refused.
 *
 * A `recall` is written by the supervisor fiber beside the reading it belongs
 * to, never instead of it: a memory fault is not a supervisor fault, and the
 * reading still settles. A `remember` is written at run end by the transcript
 * miner, for a fact Jev accepted that the store did not keep, and the run
 * still ends as it would have. `operation` says which side failed; `detail`
 * is the store's own account. A wave counts these rather than reading a log, because a
 * concurrent writer that loses a lock looks exactly like a run that
 * remembered nothing.
 *
 * @category events
 * @since 1.0.0-rc.0
 */
export declare class SupervisorMemoryFailed extends SupervisorMemoryFailed_base {
}
declare const SufficiencyObserved_base: Schema.Class<SufficiencyObserved, Schema.TaggedStruct<"sufficiency-observed", {
    readonly eventType: Schema.Literal<"flows.harness.sufficiency-observed.v1">;
    /** The flow that ran the failing check. */
    readonly flow: Schema.String;
    /** The failing check's input as the run wrote it, clipped. */
    readonly failed: Schema.String;
    /** The input of the passing check that answered it, clipped. */
    readonly passed: Schema.String;
    /** Mutating frames the run had spent when the failure was recorded. */
    readonly epoch: Schema.Int;
    /** The frame the observation was attached to. */
    readonly nextFrame: Schema.Int;
}>, {}>;
/**
 * The controller telling a run that its own evidence is complete.
 *
 * The one control that is not a brake, and the only one written for a frame
 * that has done nothing wrong: the run watched a check fail before it changed
 * anything and watched the same check, or a broader one, pass after. Written
 * when the observation is *issued*, at most once per run, because what answers
 * it is the next frame's transition and the journal already writes that.
 *
 * `failed` and `passed` quote the two inputs as the run wrote them, and `epoch`
 * is the run's count of mutating frames when the failure was recorded, so the
 * ordering the observation asserts is checkable after the fact. Nothing is
 * refused and no cap is spent, so there is no cap field to record.
 *
 * @category events
 * @since 0.1.0
 */
export declare class SufficiencyObserved extends SufficiencyObserved_base {
}
declare const VacuousVerificationObserved_base: Schema.Class<VacuousVerificationObserved, Schema.TaggedStruct<"vacuous-verification-observed", {
    readonly eventType: Schema.Literal<"flows.harness.vacuous-verification-observed.v1">;
    /** The flow the stored check named. */
    readonly flow: Schema.String;
    /** The stored check's input as the run wrote it, clipped. */
    readonly check: Schema.String;
    /** The controller's identity for that call: the digest of its flow and input. */
    readonly callDigest: Schema.String;
    /** The frame the observation was attached to. */
    readonly nextFrame: Schema.Int;
}>, {}>;
/**
 * The controller telling a run that its stored proof was already green.
 *
 * **Nothing emits this.** `VacuousVerification` is unwired from `CellTurn`;
 * the event stays declared so the r93 journals that carry it keep decoding and
 * so a controlled re-measure needs no schema change. See `VacuousVerification`
 * for the evidence that turned the arm off.
 *
 * The second control in this package that is not a brake, and the narrower of
 * the two: a cell stored `state.verification` naming a call this run had
 * already watched pass over the tree it was handed, before any frame changed a
 * byte. Written when the observation is issued, at most once per distinct
 * verification input, and delivered on the `invalidProbe` channel because it is
 * the same class of fact — a result that reads identically on a broken tree and
 * on a fixed one.
 *
 * `check` quotes the stored input as the run wrote it, and `callDigest` is the
 * controller's own identity for that call, so a reader can reconcile the
 * observation against the run's own `cell-call-settled` rows without replaying
 * anything. Nothing is refused and no cap is spent, so there is no cap field.
 *
 * It is named for what it is -- the digest of `{ flow, input }`, nothing signs
 * it -- rather than `signature`, the controller's own word for it everywhere
 * else. The journal redacts by field name, and `signature` names a credential
 * often enough in this repository (an HMAC over share claims, a grant
 * envelope, a webhook header) that the rule stays. A field this row exists to
 * be reconciled by cannot be written as `[REDACTED]`, so the field carries the
 * honest word and the rule keeps its reach.
 *
 * @category events
 * @since 0.1.0
 */
export declare class VacuousVerificationObserved extends VacuousVerificationObserved_base {
}
declare const MutationObserved_base: Schema.Class<MutationObserved, Schema.TaggedStruct<"mutation-observed", {
    readonly eventType: Schema.Literal<"flows.harness.mutation-observed.v1">;
    /** What the frame had to decide with: a full measurement, a partial one, or paperwork. */
    readonly basis: Schema.Literals<readonly ["observed", "partial", "declared"]>;
    /** Whether this frame changed anything: the tree said so, or a call declared it. */
    readonly mutated: Schema.Boolean;
    /** Content address of the workspace as the frame left it; empty when unobserved. */
    readonly digest: Schema.String;
    /** Paths the closing measurement covered; zero when unobserved. */
    readonly paths: Schema.Int;
    /**
     * Calls this frame made that DECLARED a write, whether or not they landed.
     *
     * Journaled beside the observed answer rather than instead of it, because
     * the gap between the two numbers is the accounting defect itself: a frame
     * with `declaredWrites: 0` and `mutated: true` is a shell mutation nothing
     * else in the run can see, and a frame with `declaredWrites: 1` and
     * `mutated: false` under `observed` is a failed call whose declaration the
     * measurement contradicted.
     */
    readonly declaredWrites: Schema.Int;
}>, {}>;
/**
 * What one frame did to the workspace, and how the controller knows.
 *
 * Emitted once per frame that ran a cell. It is the frame's own answer to the
 * question every later audit asks — "did this frame change anything" — written
 * before any control acts on it, so a run that never trips the cap still leaves
 * the evidence behind.
 *
 * `basis` is the field that keeps the record honest. `observed` means the frame
 * had two measurements around it that each covered the whole workspace, so the
 * tree itself could answer. `partial` means a measurement was taken and stopped
 * at a bound before it covered the tree, so it is set aside: a prefix chosen by
 * sort order cannot say the files being edited outside it held still, and its
 * own movement is as likely to be a tool's churn as work. `declared` means the
 * host measured nothing at all.
 * Under the last two, `mutated` is only what the frame's calls claimed about
 * themselves — which is exactly the signal that missed a shell redirect over a
 * tracked source file.
 *
 * `mutated` is the union of the two signals, with one exception. A declaration
 * by a call that *succeeded* stands even where the measurement cannot see the
 * path it touched, because the alternative is failing a run that has been
 * editing all along on the strength of a walk that never looked at its files.
 * A declaration by a call that *failed* is a claim about what it would have
 * written, and where `basis` is `observed` and the digest did not move, the
 * tree has answered that claim: nothing was written, and the frame is not
 * counted as a write. So `declaredWrites: 1` beside `mutated: false` under
 * `observed` is a declaration the measurement vetoed, and both numbers stay in
 * the record.
 *
 * @category events
 * @since 0.1.0
 */
export declare class MutationObserved extends MutationObserved_base {
}
declare const CheckpointMinted_base: Schema.Class<CheckpointMinted, Schema.TaggedStruct<"checkpoint-minted", {
    readonly eventType: Schema.Literal<"flows.harness.checkpoint-minted.v1">;
    /** The handle the cell holds, and what a later call names in its `at`. */
    readonly id: Schema.String;
    /** What the host recorded, in the host's own vocabulary. */
    readonly ref: Schema.String;
    /** The cell that minted it, and where in that cell. */
    readonly cell: Schema.String;
    readonly ordinal: Schema.Int;
}>, {}>;
/**
 * One tree this run pinned, and the store's own name for it.
 *
 * Journaled at the mint rather than only at its use, because the two are
 * frames apart by design: a run pins the tree it is about to change and reads
 * against it later, and a journal that recorded only the reading could not say
 * which tree it was a reading of. `ref` is the host's vocabulary and the
 * controller never interprets it; a grader reconciles it against the store by
 * hand. See `EngineLike` `Snapshot`.
 *
 * @category events
 * @since 0.1.0
 */
export declare class CheckpointMinted extends CheckpointMinted_base {
}
declare const Suspended_base: Schema.Class<Suspended, Schema.TaggedStruct<"suspended", {
    readonly eventType: Schema.Literal<"flows.harness.suspended.v1">;
    readonly reason: typeof EngineLike.SuspendReason;
}>, {}>;
/**
 * The durable reason a cell execution parked.
 *
 * @category events
 * @since 0.1.0
 * @slop
 */
export declare class Suspended extends Suspended_base {
}
declare const CompactionSettled_base: Schema.Class<CompactionSettled, Schema.TaggedStruct<"compaction-settled", {
    readonly eventType: Schema.Literal<"flows.harness.compaction-settled.v1">;
    readonly replacedPrefixDigest: Schema.String;
    readonly retainedMessageCount: Schema.optional<Schema.Int>;
    /** Absent when nothing replaced was squashed. */
    readonly summary: Schema.optional<Schema.Union<readonly [typeof ModelRequest.UserMessage, typeof ModelRequest.AssistantMessage, typeof ModelRequest.ToolMessage]> & {
        readonly tag: "role";
        readonly discriminants: readonly ["user", "assistant", "tool"];
        readonly cases: {
            assistant: typeof ModelRequest.AssistantMessage;
            tool: typeof ModelRequest.ToolMessage;
            user: typeof ModelRequest.UserMessage;
        };
        readonly isAnyOf: <const Keys>(keys: readonly Keys[]) => (value: ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage) => value is Extract<ModelRequest.AssistantMessage, {
            readonly role: Keys;
        }> | Extract<ModelRequest.ToolMessage, {
            readonly role: Keys;
        }> | Extract<ModelRequest.UserMessage, {
            readonly role: Keys;
        }>;
        readonly guards: {
            assistant: (u: unknown) => u is ModelRequest.AssistantMessage;
            tool: (u: unknown) => u is ModelRequest.ToolMessage;
            user: (u: unknown) => u is ModelRequest.UserMessage;
        };
        readonly match: {
            <Cases extends { [M in typeof ModelRequest.UserMessage | typeof ModelRequest.AssistantMessage | typeof ModelRequest.ToolMessage as M["Type"]["role"]]: (value: M["Type"]) => any; }>(value: ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage, cases: Cases): Cases[keyof Cases] extends (value: any) => infer R ? import("effect/Unify").Unify<R> : never;
            <Cases extends { [M in typeof ModelRequest.UserMessage | typeof ModelRequest.AssistantMessage | typeof ModelRequest.ToolMessage as M["Type"]["role"]]: (value: M["Type"]) => any; }>(cases: Cases): (value: ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage) => Cases[keyof Cases] extends (value: any) => infer R ? import("effect/Unify").Unify<R> : never;
        };
        readonly matchOrElse: {
            <Cases extends { [M in typeof ModelRequest.UserMessage | typeof ModelRequest.AssistantMessage | typeof ModelRequest.ToolMessage as M["Type"]["role"]]+?: (value: M["Type"]) => any; } & { [K in Exclude<keyof Cases, "assistant" | "tool" | "user">]: never; }, OrElse extends (value: Exclude<ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage, { readonly [K in "role"]: keyof Cases; }>) => any>(value: ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage, cases: Cases, orElse: OrElse): import("effect/Unify").Unify<{ [K in keyof Cases]-?: NonNullable<Cases[K]> extends (...args: Array<any>) => infer R ? R : never; }[keyof Cases] | ReturnType<OrElse>>;
            <Cases extends { [M in typeof ModelRequest.UserMessage | typeof ModelRequest.AssistantMessage | typeof ModelRequest.ToolMessage as M["Type"]["role"]]+?: (value: M["Type"]) => any; } & { [K in Exclude<keyof Cases, "assistant" | "tool" | "user">]: never; }, OrElse extends (value: Exclude<ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage, { readonly [K in "role"]: keyof Cases; }>) => any>(cases: Cases, orElse: OrElse): (value: ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage) => import("effect/Unify").Unify<{ [K in keyof Cases]-?: NonNullable<Cases[K]> extends (...args: Array<any>) => infer R ? R : never; }[keyof Cases] | ReturnType<OrElse>>;
        };
    } & {
        make: (message: ModelRequest.Message) => ModelRequest.Message;
        user: (content: string | ModelRequest.TextPart | ReadonlyArray<ModelRequest.TextPart>) => ModelRequest.UserMessage;
        assistant: (content: string | ModelRequest.AssistantContentPart | ReadonlyArray<ModelRequest.AssistantContentPart>, options?: {
            readonly stopReason?: ModelRequest.StopReason | undefined;
            readonly responseId?: string | undefined;
            readonly itemIds?: ReadonlyArray<string> | undefined;
        }) => ModelRequest.AssistantMessage;
        tool: (content: ModelRequest.ToolResultPart | ReadonlyArray<ModelRequest.ToolResultPart>) => ModelRequest.ToolMessage;
    }>;
    /** Replaced messages carried over verbatim, after the summary. */
    readonly kept: Schema.optional<Schema.$Array<Schema.Union<readonly [typeof ModelRequest.UserMessage, typeof ModelRequest.AssistantMessage, typeof ModelRequest.ToolMessage]> & {
        readonly tag: "role";
        readonly discriminants: readonly ["user", "assistant", "tool"];
        readonly cases: {
            assistant: typeof ModelRequest.AssistantMessage;
            tool: typeof ModelRequest.ToolMessage;
            user: typeof ModelRequest.UserMessage;
        };
        readonly isAnyOf: <const Keys>(keys: readonly Keys[]) => (value: ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage) => value is Extract<ModelRequest.AssistantMessage, {
            readonly role: Keys;
        }> | Extract<ModelRequest.ToolMessage, {
            readonly role: Keys;
        }> | Extract<ModelRequest.UserMessage, {
            readonly role: Keys;
        }>;
        readonly guards: {
            assistant: (u: unknown) => u is ModelRequest.AssistantMessage;
            tool: (u: unknown) => u is ModelRequest.ToolMessage;
            user: (u: unknown) => u is ModelRequest.UserMessage;
        };
        readonly match: {
            <Cases extends { [M in typeof ModelRequest.UserMessage | typeof ModelRequest.AssistantMessage | typeof ModelRequest.ToolMessage as M["Type"]["role"]]: (value: M["Type"]) => any; }>(value: ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage, cases: Cases): Cases[keyof Cases] extends (value: any) => infer R ? import("effect/Unify").Unify<R> : never;
            <Cases extends { [M in typeof ModelRequest.UserMessage | typeof ModelRequest.AssistantMessage | typeof ModelRequest.ToolMessage as M["Type"]["role"]]: (value: M["Type"]) => any; }>(cases: Cases): (value: ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage) => Cases[keyof Cases] extends (value: any) => infer R ? import("effect/Unify").Unify<R> : never;
        };
        readonly matchOrElse: {
            <Cases extends { [M in typeof ModelRequest.UserMessage | typeof ModelRequest.AssistantMessage | typeof ModelRequest.ToolMessage as M["Type"]["role"]]+?: (value: M["Type"]) => any; } & { [K in Exclude<keyof Cases, "assistant" | "tool" | "user">]: never; }, OrElse extends (value: Exclude<ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage, { readonly [K in "role"]: keyof Cases; }>) => any>(value: ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage, cases: Cases, orElse: OrElse): import("effect/Unify").Unify<{ [K in keyof Cases]-?: NonNullable<Cases[K]> extends (...args: Array<any>) => infer R ? R : never; }[keyof Cases] | ReturnType<OrElse>>;
            <Cases extends { [M in typeof ModelRequest.UserMessage | typeof ModelRequest.AssistantMessage | typeof ModelRequest.ToolMessage as M["Type"]["role"]]+?: (value: M["Type"]) => any; } & { [K in Exclude<keyof Cases, "assistant" | "tool" | "user">]: never; }, OrElse extends (value: Exclude<ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage, { readonly [K in "role"]: keyof Cases; }>) => any>(cases: Cases, orElse: OrElse): (value: ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage) => import("effect/Unify").Unify<{ [K in keyof Cases]-?: NonNullable<Cases[K]> extends (...args: Array<any>) => infer R ? R : never; }[keyof Cases] | ReturnType<OrElse>>;
        };
    } & {
        make: (message: ModelRequest.Message) => ModelRequest.Message;
        user: (content: string | ModelRequest.TextPart | ReadonlyArray<ModelRequest.TextPart>) => ModelRequest.UserMessage;
        assistant: (content: string | ModelRequest.AssistantContentPart | ReadonlyArray<ModelRequest.AssistantContentPart>, options?: {
            readonly stopReason?: ModelRequest.StopReason | undefined;
            readonly responseId?: string | undefined;
            readonly itemIds?: ReadonlyArray<string> | undefined;
        }) => ModelRequest.AssistantMessage;
        tool: (content: ModelRequest.ToolResultPart | ReadonlyArray<ModelRequest.ToolResultPart>) => ModelRequest.ToolMessage;
    }>>;
    /** What a reading marked each replaced segment, by segment digest. */
    readonly marks: Schema.optional<Schema.$Array<Schema.Struct<{
        readonly digest: Schema.String;
        readonly mark: Schema.Literals<readonly ["keep", "squash", "remove"]>;
        /** The invariant that overrode a `remove`, when one did. */
        readonly pinned: Schema.optional<Schema.Literals<readonly ["summary", "person", "steering", "mutated", "failing", "pair", "budget"]>>;
    }>>>;
    /** Estimated tokens the removed messages held. */
    readonly removedTokens: Schema.optional<Schema.Int>;
    /**
     * True when a judged run could not mark: its facts do not describe every
     * transcript segment, as in state written before marks, so every replaced
     * message was squashed.
     */
    readonly unaligned: Schema.optional<Schema.Boolean>;
    /** Why the compaction ran, budget first. Absent in older journals, which compacted on the budget alone. */
    readonly causes: Schema.optional<Schema.$Array<Schema.Literals<readonly ["budget", "outdated_context", "irrelevant_context"]>>>;
    /**
     * The run's session and the frame the compaction ran ahead of: the join
     * keys of its `model-requested`, because it is written before that frame's
     * `turn-opened` and position would file it under the frame before. Absent,
     * like every field below, from journals written before it was carried.
     */
    readonly scope: Schema.optional<Schema.String>;
    readonly frame: Schema.optional<Schema.Int>;
    /** Wall-clock milliseconds the compaction took: its marks reading, its summary call and the rewrite. */
    readonly durationMillis: Schema.optional<Schema.Int>;
    /** The context's estimated tokens before the compaction and after it. */
    readonly context: Schema.optional<Schema.Struct<{
        readonly before: Schema.Int;
        readonly after: Schema.Int;
    }>>;
    /** What the marks reading taken here spent; absent when none was taken. */
    readonly marksCall: Schema.optional<Schema.Struct<{
        /** Requests the reading settled, one `decision-settled` row each; zero when it could not be judged. */
        readonly requests: Schema.Int;
        /** Summed over the requests that were metered; absent when none was. */
        readonly usage: Schema.optional<Schema.Struct<{
            readonly inputTokens: Schema.Number;
            readonly outputTokens: Schema.Number;
            readonly modelId: Schema.optional<Schema.String>;
            readonly costUsd: Schema.optional<Schema.Number>;
        }>>;
        readonly costUsd: Schema.optional<Schema.Number>;
        readonly costSource: Schema.optional<Schema.Literals<readonly ["reported", "estimated"]>>;
        /** Wall-clock milliseconds the reading's requests took, summed. */
        readonly latencyMs: Schema.Int;
    }>>;
    /** What the summary call spent; absent when nothing was squashed. */
    readonly summaryCall: Schema.optional<Schema.Struct<{
        readonly usage: Schema.Struct<{
            readonly inputTokens: Schema.optional<Schema.Number>;
            readonly outputTokens: Schema.optional<Schema.Number>;
            readonly reasoningTokens: Schema.optional<Schema.Number>;
            readonly cachedInputTokens: Schema.optional<Schema.Number>;
            readonly cacheWriteTokens: Schema.optional<Schema.Number>;
            readonly totalTokens: Schema.optional<Schema.Number>;
            readonly costUsd: Schema.optional<Schema.Number>;
        }> & {
            make: (input: ModelEvent.Usage) => ModelEvent.Usage;
        };
        readonly costUsd: Schema.optional<Schema.Number>;
        readonly costSource: Schema.optional<Schema.Literals<readonly ["reported", "estimated"]>>;
        /** Wall-clock milliseconds the sealed step took. */
        readonly durationMillis: Schema.Int;
        readonly stages: Schema.optional<Schema.Struct<{
            /** The first stream event of any kind but a retry notice. */
            readonly firstEventMs: Schema.optional<Schema.Int>;
            /** The first thinking event. */
            readonly firstThinkingMs: Schema.optional<Schema.Int>;
            /** The first text delta or tool-call event. */
            readonly firstOutputMs: Schema.optional<Schema.Int>;
            /** The last text delta or tool-call event. */
            readonly lastOutputMs: Schema.optional<Schema.Int>;
        }>>;
        readonly tries: Schema.optional<Schema.Int>;
        readonly output: Schema.optional<Schema.Struct<{
            /** Reasoning tokens; absent when the provider reported none. */
            readonly thinking: Schema.optional<Schema.Int>;
            /** Output tokens that were not reasoning. */
            readonly written: Schema.Int;
        }>>;
        readonly timing: Schema.optional<Schema.Struct<{
            readonly startedAt: Schema.optional<Schema.Number>;
            readonly attempts: Schema.optional<Schema.Int>;
            readonly requestBytes: Schema.optional<Schema.Number>;
            readonly preparedMs: Schema.optional<Schema.Number>;
            readonly signedMs: Schema.optional<Schema.Number>;
            readonly sentMs: Schema.optional<Schema.Number>;
            readonly headersMs: Schema.optional<Schema.Number>;
            readonly firstEventMs: Schema.optional<Schema.Number>;
            readonly firstThinkingMs: Schema.optional<Schema.Number>;
            readonly firstOutputMs: Schema.optional<Schema.Number>;
            readonly lastOutputMs: Schema.optional<Schema.Number>;
            readonly completedMs: Schema.optional<Schema.Number>;
            readonly closedMs: Schema.optional<Schema.Number>;
            readonly failedTries: Schema.optional<Schema.$Array<Schema.Struct<{
                readonly sentMs: Schema.optional<Schema.Number>;
                readonly failedMs: Schema.Number;
                readonly code: Schema.String;
                readonly httpStatus: Schema.optional<Schema.Number>;
            }>>>;
        }>>;
        readonly servedTier: Schema.optional<Schema.String>;
    }>>;
}>, {}>;
/**
 * A sealed compaction summary and the prefix it replaces.
 *
 * @category events
 * @since 0.1.0
 * @slop
 */
export declare class CompactionSettled extends CompactionSettled_base {
}
declare const SteeringDrained_base: Schema.Class<SteeringDrained, Schema.TaggedStruct<"steering-drained", {
    readonly eventType: Schema.Literal<"flows.harness.steering-drained.v1">;
    /** What the person sent, in admission order. */
    readonly messages: Schema.$Array<Schema.Union<readonly [typeof ModelRequest.UserMessage, typeof ModelRequest.AssistantMessage, typeof ModelRequest.ToolMessage]> & {
        readonly tag: "role";
        readonly discriminants: readonly ["user", "assistant", "tool"];
        readonly cases: {
            assistant: typeof ModelRequest.AssistantMessage;
            tool: typeof ModelRequest.ToolMessage;
            user: typeof ModelRequest.UserMessage;
        };
        readonly isAnyOf: <const Keys>(keys: readonly Keys[]) => (value: ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage) => value is Extract<ModelRequest.AssistantMessage, {
            readonly role: Keys;
        }> | Extract<ModelRequest.ToolMessage, {
            readonly role: Keys;
        }> | Extract<ModelRequest.UserMessage, {
            readonly role: Keys;
        }>;
        readonly guards: {
            assistant: (u: unknown) => u is ModelRequest.AssistantMessage;
            tool: (u: unknown) => u is ModelRequest.ToolMessage;
            user: (u: unknown) => u is ModelRequest.UserMessage;
        };
        readonly match: {
            <Cases extends { [M in typeof ModelRequest.UserMessage | typeof ModelRequest.AssistantMessage | typeof ModelRequest.ToolMessage as M["Type"]["role"]]: (value: M["Type"]) => any; }>(value: ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage, cases: Cases): Cases[keyof Cases] extends (value: any) => infer R ? import("effect/Unify").Unify<R> : never;
            <Cases extends { [M in typeof ModelRequest.UserMessage | typeof ModelRequest.AssistantMessage | typeof ModelRequest.ToolMessage as M["Type"]["role"]]: (value: M["Type"]) => any; }>(cases: Cases): (value: ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage) => Cases[keyof Cases] extends (value: any) => infer R ? import("effect/Unify").Unify<R> : never;
        };
        readonly matchOrElse: {
            <Cases extends { [M in typeof ModelRequest.UserMessage | typeof ModelRequest.AssistantMessage | typeof ModelRequest.ToolMessage as M["Type"]["role"]]+?: (value: M["Type"]) => any; } & { [K in Exclude<keyof Cases, "assistant" | "tool" | "user">]: never; }, OrElse extends (value: Exclude<ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage, { readonly [K in "role"]: keyof Cases; }>) => any>(value: ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage, cases: Cases, orElse: OrElse): import("effect/Unify").Unify<{ [K in keyof Cases]-?: NonNullable<Cases[K]> extends (...args: Array<any>) => infer R ? R : never; }[keyof Cases] | ReturnType<OrElse>>;
            <Cases extends { [M in typeof ModelRequest.UserMessage | typeof ModelRequest.AssistantMessage | typeof ModelRequest.ToolMessage as M["Type"]["role"]]+?: (value: M["Type"]) => any; } & { [K in Exclude<keyof Cases, "assistant" | "tool" | "user">]: never; }, OrElse extends (value: Exclude<ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage, { readonly [K in "role"]: keyof Cases; }>) => any>(cases: Cases, orElse: OrElse): (value: ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage) => import("effect/Unify").Unify<{ [K in keyof Cases]-?: NonNullable<Cases[K]> extends (...args: Array<any>) => infer R ? R : never; }[keyof Cases] | ReturnType<OrElse>>;
        };
    } & {
        make: (message: ModelRequest.Message) => ModelRequest.Message;
        user: (content: string | ModelRequest.TextPart | ReadonlyArray<ModelRequest.TextPart>) => ModelRequest.UserMessage;
        assistant: (content: string | ModelRequest.AssistantContentPart | ReadonlyArray<ModelRequest.AssistantContentPart>, options?: {
            readonly stopReason?: ModelRequest.StopReason | undefined;
            readonly responseId?: string | undefined;
            readonly itemIds?: ReadonlyArray<string> | undefined;
        }) => ModelRequest.AssistantMessage;
        tool: (content: ModelRequest.ToolResultPart | ReadonlyArray<ModelRequest.ToolResultPart>) => ModelRequest.ToolMessage;
    }>;
    /**
     * What the run's supervisor delivered at the same boundary: a nudge or a
     * recalled row. The model reads these above the person's messages; they
     * never join the task the completion brake or the supervisor reads.
     */
    readonly supervisor: Schema.optional<Schema.$Array<Schema.Union<readonly [typeof ModelRequest.UserMessage, typeof ModelRequest.AssistantMessage, typeof ModelRequest.ToolMessage]> & {
        readonly tag: "role";
        readonly discriminants: readonly ["user", "assistant", "tool"];
        readonly cases: {
            assistant: typeof ModelRequest.AssistantMessage;
            tool: typeof ModelRequest.ToolMessage;
            user: typeof ModelRequest.UserMessage;
        };
        readonly isAnyOf: <const Keys>(keys: readonly Keys[]) => (value: ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage) => value is Extract<ModelRequest.AssistantMessage, {
            readonly role: Keys;
        }> | Extract<ModelRequest.ToolMessage, {
            readonly role: Keys;
        }> | Extract<ModelRequest.UserMessage, {
            readonly role: Keys;
        }>;
        readonly guards: {
            assistant: (u: unknown) => u is ModelRequest.AssistantMessage;
            tool: (u: unknown) => u is ModelRequest.ToolMessage;
            user: (u: unknown) => u is ModelRequest.UserMessage;
        };
        readonly match: {
            <Cases extends { [M in typeof ModelRequest.UserMessage | typeof ModelRequest.AssistantMessage | typeof ModelRequest.ToolMessage as M["Type"]["role"]]: (value: M["Type"]) => any; }>(value: ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage, cases: Cases): Cases[keyof Cases] extends (value: any) => infer R ? import("effect/Unify").Unify<R> : never;
            <Cases extends { [M in typeof ModelRequest.UserMessage | typeof ModelRequest.AssistantMessage | typeof ModelRequest.ToolMessage as M["Type"]["role"]]: (value: M["Type"]) => any; }>(cases: Cases): (value: ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage) => Cases[keyof Cases] extends (value: any) => infer R ? import("effect/Unify").Unify<R> : never;
        };
        readonly matchOrElse: {
            <Cases extends { [M in typeof ModelRequest.UserMessage | typeof ModelRequest.AssistantMessage | typeof ModelRequest.ToolMessage as M["Type"]["role"]]+?: (value: M["Type"]) => any; } & { [K in Exclude<keyof Cases, "assistant" | "tool" | "user">]: never; }, OrElse extends (value: Exclude<ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage, { readonly [K in "role"]: keyof Cases; }>) => any>(value: ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage, cases: Cases, orElse: OrElse): import("effect/Unify").Unify<{ [K in keyof Cases]-?: NonNullable<Cases[K]> extends (...args: Array<any>) => infer R ? R : never; }[keyof Cases] | ReturnType<OrElse>>;
            <Cases extends { [M in typeof ModelRequest.UserMessage | typeof ModelRequest.AssistantMessage | typeof ModelRequest.ToolMessage as M["Type"]["role"]]+?: (value: M["Type"]) => any; } & { [K in Exclude<keyof Cases, "assistant" | "tool" | "user">]: never; }, OrElse extends (value: Exclude<ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage, { readonly [K in "role"]: keyof Cases; }>) => any>(cases: Cases, orElse: OrElse): (value: ModelRequest.AssistantMessage | ModelRequest.ToolMessage | ModelRequest.UserMessage) => import("effect/Unify").Unify<{ [K in keyof Cases]-?: NonNullable<Cases[K]> extends (...args: Array<any>) => infer R ? R : never; }[keyof Cases] | ReturnType<OrElse>>;
        };
    } & {
        make: (message: ModelRequest.Message) => ModelRequest.Message;
        user: (content: string | ModelRequest.TextPart | ReadonlyArray<ModelRequest.TextPart>) => ModelRequest.UserMessage;
        assistant: (content: string | ModelRequest.AssistantContentPart | ReadonlyArray<ModelRequest.AssistantContentPart>, options?: {
            readonly stopReason?: ModelRequest.StopReason | undefined;
            readonly responseId?: string | undefined;
            readonly itemIds?: ReadonlyArray<string> | undefined;
        }) => ModelRequest.AssistantMessage;
        tool: (content: ModelRequest.ToolResultPart | ReadonlyArray<ModelRequest.ToolResultPart>) => ModelRequest.ToolMessage;
    }>>;
    /** The monitor whose delivery `supervisor` carries, when one's does. */
    readonly monitor: Schema.optional<Schema.String>;
    /** Crossed monitors not delivered at this boundary, and why. */
    readonly suppressed: Schema.optional<Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly reason: Schema.Literals<readonly ["streak", "cooldown", "limit", "slot"]>;
    }>>>;
    /** Keys of the memory rows delivered at this boundary. */
    readonly memory: Schema.optional<Schema.$Array<Schema.String>>;
    /**
     * The context triggers this boundary took from a supervisor reading, which
     * compact the run at its next frame. Absent when it took none.
     */
    readonly compact: Schema.optional<Schema.$Array<Schema.Literals<readonly ["budget", "outdated_context", "irrelevant_context"]>>>;
}>, {}>;
/**
 * Steering messages drained at a turn boundary.
 *
 * @category events
 * @since 0.1.0
 * @slop
 */
export declare class SteeringDrained extends SteeringDrained_base {
}
declare const TurnClosed_base: Schema.Class<TurnClosed, Schema.TaggedStruct<"turn-closed", {
    readonly eventType: Schema.Literal<"flows.harness.turn-closed.v1">;
    readonly stopReason: Schema.Literals<readonly ["stop", "length", "tool-calls", "content-filter", "error", "aborted", "unknown"]>;
    readonly outcome: Schema.Literals<readonly ["continue", "resolved", "aborted", "suspended"]>;
    /** The controller's frame this closes. Absent, like {@link time}, from journals written before it was carried. */
    readonly frame: Schema.optional<Schema.Int>;
    /**
     * Where the frame's wall time went, in whole milliseconds on the injected
     * clock, from the moment the controller took the frame up to this event.
     * The five parts add up to `wallMs`.
     *
     * `judgeMs` is what the loop itself waited on Jev: the run-start relevance
     * reading and the completion check. A supervisor reading runs beside the
     * loop and costs the frame nothing; its own latency is on
     * `supervisor-settled`. `compactionMs` is the whole compaction ahead of the
     * turn, its marks reading and summary call included, and `modelMs` is the
     * frame's own model calls, re-asks included.
     */
    readonly time: Schema.optional<Schema.Struct<{
        readonly wallMs: Schema.Int;
        readonly modelMs: Schema.Int;
        readonly cellMs: Schema.Int;
        readonly judgeMs: Schema.Int;
        readonly compactionMs: Schema.Int;
        /** Everything else: workspace measurements, the steering drain, recorded boundaries. */
        readonly otherMs: Schema.Int;
    }>>;
}>, {}>;
/**
 * The terminal decision made at a turn boundary.
 *
 * @category events
 * @since 0.1.0
 * @slop
 */
export declare class TurnClosed extends TurnClosed_base {
}
declare const PermissionRequired_base: Schema.Class<PermissionRequired, Schema.TaggedStruct<"permission-required", {
    readonly eventType: Schema.Literal<"flows.harness.permission-required.v1">;
    readonly request: typeof Permission.PermissionRequired;
}>, {}>;
/**
 * A permission request reported for engine-owned suspension and resolution.
 *
 * @category events
 * @since 0.1.0
 * @slop
 */
export declare class PermissionRequired extends PermissionRequired_base {
}
declare const Aborted_base: Schema.Class<Aborted, Schema.TaggedStruct<"aborted", {
    readonly eventType: Schema.Literal<"flows.harness.aborted.v1">;
    readonly reason: Schema.String;
}>, {}>;
/**
 * A normalized harness abort.
 *
 * @category events
 * @since 0.1.0
 * @slop
 */
export declare class Aborted extends Aborted_base {
}
declare const Resolved_base: Schema.Class<Resolved, Schema.TaggedStruct<"resolved", {
    readonly eventType: Schema.Literal<"flows.harness.resolved.v1">;
    readonly message: typeof ModelRequest.AssistantMessage;
}>, {}>;
/**
 * The final assistant message produced by the harness.
 *
 * @category events
 * @since 0.1.0
 * @slop
 */
export declare class Resolved extends Resolved_base {
}
/**
 * All normalized events emitted by a harness adapter.
 *
 * @category events
 * @since 0.1.0
 * @slop
 */
declare const agentEventUnion: Schema.Union<readonly [typeof DisciplineArmed, typeof TurnOpened, typeof ModelDelta, typeof ModelRequested, typeof ModelSelected, typeof SeatFailedOver, typeof ModelParked, typeof ModelUnparked, typeof ModelRetried, typeof ModelSettled, typeof ModelFailed, typeof CellProduced, typeof CellRejectedInFrame, typeof CellCallStarted, typeof CellCallSettled, typeof CellPrinted, typeof CellSettled, typeof TransitionApplied, typeof MutationObserved, typeof CheckpointMinted, typeof ReadOnlyDemandIssued, typeof ReadOnlyDemanded, typeof RepeatDemanded, typeof NarrowedDemanded, typeof NarrowOnlyDemanded, typeof UnmovedDemanded, typeof UnresolvedDemanded, typeof FailedCallDemanded, typeof UnobservedDemanded, typeof OutputDemanded, typeof ClaimDemanded, typeof DecisionSettled, typeof SupervisorSettled, typeof SupervisorUnjudged, typeof SupervisorMemoryFailed, typeof DecisionUnjudged, typeof RelevanceSettled, typeof RelevanceRestored, typeof SeatRouted, typeof SufficiencyObserved, typeof VacuousVerificationObserved, typeof Suspended, typeof CompactionSettled, typeof SteeringDrained, typeof TurnClosed, typeof PermissionRequired, typeof Aborted, typeof Resolved]>;
/** All normalized harness events, indexed by their persisted tag.
 * @category events
 * @since 0.1.0
 */
export declare const AgentEvent: Schema.toTaggedUnion<"_tag", typeof agentEventUnion.members>;
/**
 * All normalized events emitted by a harness adapter.
 *
 * @category events
 * @since 0.1.0
 * @slop
 */
export type AgentEvent = typeof AgentEvent.Type;
/**
 * The journal event type of every member of {@link AgentEvent}, by tag.
 *
 * One table, because the literal used to be written three times: on the class,
 * in `CellTurn`'s emitter, and again in `Transcript`'s decoder. A projection
 * that reads a literal the emitter no longer writes silently returns an empty
 * transcript, and nothing failed when the two drifted. `CellTurn` and
 * `Transcript` both read this, and `Contracts.test.ts` pins it against the
 * union, so an event added without a row here fails a test rather than a run.
 *
 * @category events
 * @since 0.1.0
 * @slop
 */
export declare const eventType: {
    readonly aborted: "flows.harness.aborted.v1";
    readonly cellCallSettled: "flows.harness.cell-call-settled.v1";
    readonly cellCallStarted: "flows.harness.cell-call-started.v1";
    readonly cellPrinted: "flows.harness.cell-printed.v1";
    readonly cellProduced: "flows.harness.cell-produced.v1";
    readonly cellRejectedInFrame: "flows.harness.cell-rejected-in-frame.v1";
    readonly cellSettled: "flows.harness.cell-settled.v1";
    readonly checkpointMinted: "flows.harness.checkpoint-minted.v1";
    readonly claimDemanded: "flows.harness.claim-demanded.v1";
    readonly compactionSettled: "flows.harness.compaction-settled.v1";
    readonly decisionSettled: "flows.harness.decision-settled.v1";
    readonly decisionUnjudged: "flows.harness.decision-unjudged.v1";
    readonly disciplineArmed: "flows.harness.discipline-armed.v1";
    readonly modelDelta: "flows.harness.model-delta.v1";
    readonly modelRequested: "flows.harness.model-requested.v1";
    readonly modelSelected: "flows.harness.model-selected.v1";
    readonly seatFailedOver: "flows.harness.seat-failed-over.v1";
    readonly modelParked: "flows.harness.model-parked.v1";
    readonly modelUnparked: "flows.harness.model-unparked.v1";
    readonly modelRetried: "flows.harness.model-retried.v1";
    readonly modelFailed: "flows.harness.model-failed.v1";
    readonly modelSettled: "flows.harness.model-settled.v1";
    readonly mutationObserved: "flows.harness.mutation-observed.v1";
    readonly narrowOnlyDemanded: "flows.harness.narrow-only-demanded.v1";
    readonly narrowedDemanded: "flows.harness.narrowed-demanded.v1";
    readonly permissionRequired: "flows.harness.permission-required.v1";
    readonly readOnlyDemandIssued: "flows.harness.read-only-demand-issued.v1";
    readonly readOnlyDemanded: "flows.harness.read-only-demanded.v1";
    readonly relevanceRestored: "flows.harness.relevance-restored.v1";
    readonly relevanceSettled: "flows.harness.relevance-settled.v1";
    readonly repeatDemanded: "flows.harness.repeat-demanded.v1";
    readonly resolved: "flows.harness.resolved.v1";
    readonly seatRouted: "flows.harness.seat-routed.v1";
    readonly steeringDrained: "flows.harness.steering-drained.v1";
    readonly sufficiencyObserved: "flows.harness.sufficiency-observed.v1";
    readonly supervisorSettled: "flows.harness.supervisor-settled.v1";
    readonly supervisorUnjudged: "flows.harness.supervisor-unjudged.v1";
    readonly supervisorMemoryFailed: "flows.harness.supervisor-memory-failed.v1";
    readonly suspended: "flows.harness.suspended.v1";
    readonly transitionApplied: "flows.harness.transition-applied.v1";
    readonly turnClosed: "flows.harness.turn-closed.v1";
    readonly turnOpened: "flows.harness.turn-opened.v1";
    readonly unmovedDemanded: "flows.harness.unmoved-demanded.v1";
    readonly unresolvedDemanded: "flows.harness.unresolved-demanded.v1";
    readonly failedCallDemanded: "flows.harness.failed-call-demanded.v1";
    readonly unobservedDemanded: "flows.harness.unobserved-demanded.v1";
    readonly outputDemanded: "flows.harness.output-demanded.v1";
    readonly vacuousVerificationObserved: "flows.harness.vacuous-verification-observed.v1";
};
export {};
