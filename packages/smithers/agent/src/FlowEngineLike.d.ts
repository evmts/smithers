/**
 * The production `EngineLike` binding: the harness engine port executed on the
 * durable flow engine from `@smthrs/engine`.
 *
 * `@smthrs/harness` declares the port (`sealStep` / `splice` / `suspend`) and
 * ships only `layer(implementation)` and `layerNoop`. This module supplies the
 * missing implementation, so a production consumer can run the harness on the
 * durable engine without reaching into `@smthrs/testing`.
 *
 * The binding is deliberately *not* `@smthrs/testing`'s `FlowEngineLike`:
 * that module adapts the engine to `EngineSubject`
 * (`run` / `result` / `interrupt` / `resume` / `journal`), the conformance
 * contract used by the testing library. The two ports share a backing engine
 * and nothing else, and `packages/testing/test/EngineSubject.test.ts` asserts
 * they stay distinct.
 *
 * How the port maps onto the engine:
 *
 * - `sealStep` resolves the route, runs `Route.prepare`, and digests the
 *   credential-free `PreparedRequest` — canonical body bytes included —
 *   together with the harness's declared key material into a `StepKey`
 *   (`docs/pages/concepts/step-keys.md`). That key is the *sealed* activity's
 *   idempotency key, so a provider wire change produces a new key and a
 *   replayed turn re-emits the recorded model events without calling the
 *   provider again. Credentials are signed on by the route after the digest
 *   and never enter it.
 * - `splice` refuses every child in an elaborated batch with a typed engine
 *   failure. The elaborated-subgraph path was superseded by the cell loop, so
 *   the port remains available to the harness but does not run that old path.
 *   An empty batch still produces an empty stream.
 * - `record` journals one nondeterministic controller read — the steering
 *   drain, and the workspace measurements below — as its own run-scoped
 *   boundary, so a resumed run replays the recorded value instead of reading
 *   the world a second time.
 * - `observe` measures the workspace through `WorkspaceObservation.Observer`
 *   when the composition provides one, and reports it unobserved when it does
 *   not. This is what lets the controller decide "did this frame change
 *   anything" from the tree rather than from what the frame's calls declared —
 *   a shell command declares nothing and writes wherever it likes.
 * - Every key folds in the resolved composition identity `Options.layers` — the
 *   host's layer stack and its resolved plugin list. A boundary resolved under a
 *   different composition is a different boundary.
 * - `suspend` is a real durable suspension (`Flow.suspend`), not a failure.
 *   The execution parks and can be resumed by the engine.
 *
 * Reference consulted: `reference/effect` `unstable/workflow` (Action /
 * Workflow / DurableDeferred) by way of the vendored fork in
 * `@smthrs/engine`, and `reference/temporal`'s activity-identity rules for
 * why a non-sealed invocation must carry a distinguishing key.
 *
 * @since 0.1.0
 */
import type * as KeyMaterial from "@smthrs/core/KeyMaterial";
import { FlowRuntime } from "@smthrs/flow";
import type { FileBoundary } from "@smthrs/flow/FileBoundary";
import * as Cell from "@smthrs/harness/Cell";
import * as EngineLike from "@smthrs/harness/EngineLike";
import * as HarnessError from "@smthrs/harness/HarnessError";
import * as Evaluator from "@smthrs/model/Evaluator";
import type * as Model from "@smthrs/model/Model";
import * as ModelError from "@smthrs/model/ModelError";
import * as ModelEvent from "@smthrs/model/ModelEvent";
import * as ModelRequest from "@smthrs/model/ModelRequest";
import * as Route from "@smthrs/model/Route";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Budget from "./Budget.ts";
import * as QuotaPolicy from "./QuotaPolicy.ts";
import type * as WorkspaceSandbox from "./WorkspaceSandbox.ts";
export { defaultModelIdleMs, defaultModelOverruns } from "./internal/FlowEngineLike.ts";
/**
 * Route resolution for one sealed model request.
 *
 * The port needs `Route.prepare` and nothing else, so a consumer can supply a
 * configured route, a router, or a recorded resolver in tests.
 *
 * @category models
 * @since 0.1.0
 */
export interface RouteResolver {
    readonly prepare: (request: ModelRequest.ModelRequest) => Effect.Effect<Route.PreparedRequest, ModelError.ModelError>;
}
/**
 * Adapts one configured model route to {@link RouteResolver}.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const routeResolver: <Body, Frame, Event, State>(route: Route.Route<Body, Frame, Event, State>) => RouteResolver;
/**
 * Executes one flow call issued from inside a running cell.
 *
 * The runner owns lookup, decoding, attenuation, and placement; this module
 * owns only durability.
 *
 * @category models
 * @since 0.1.0
 */
export interface CallRunner {
    /**
     * Decides whether the call may proceed, before the durable boundary opens.
     *
     * Authority is not a side effect, and the distinction matters for replay: an
     * activity's outcome is journaled, so a permission requirement raised from
     * inside one would be replayed forever and no later grant could unblock it.
     * Checked here, a park records nothing, and the resumed attempt asks again
     * against the grant store as it now stands.
     */
    readonly authorize?: (call: Cell.Call) => Effect.Effect<void, HarnessError.HarnessError>;
    readonly run: (call: Cell.Call) => Effect.Effect<Cell.CallResult, HarnessError.HarnessError>;
}
declare const CallReadings_base: Context.ServiceClass<CallReadings, "@smthrs/agent/FlowEngineLike/CallReadings", {
    /** Fails, taking no reading, once the run's budget is spent. */
    readonly admit: Effect.Effect<void, Evaluator.EvaluatorError>;
    /** Notes what one reading paid, taken or failed. */
    readonly paid: (usage: Evaluator.Usage) => Effect.Effect<void>;
}>;
/**
 * The evaluator readings a cell call's flow takes, charged to the run.
 *
 * A flow the cell calls may ask the host's judge itself: `jev`, memory
 * relevance, test failure attribution. Its call is recorded as a result that
 * carries no usage, so the port that runs the call provides this service
 * around it, and a judge wrapped by {@link metered} asks it to admit each
 * reading and to note what each paid. The port charges those readings when
 * the call's execution ends, under keys of that execution's own, as it does a
 * model call that cannot seal: a replayed call is served its record and pays
 * nothing again (#3010).
 *
 * @category services
 * @since 1.0.0-rc.1
 */
export declare class CallReadings extends CallReadings_base {
}
/**
 * Wraps the judge a cell-call flow is handed so each of its readings inside a
 * run's call is admitted and charged through {@link CallReadings}. Outside a
 * call it is the judge unchanged.
 *
 * @category constructors
 * @since 1.0.0-rc.1
 */
export declare const metered: <R>(services: Context.Context<R | Evaluator.Evaluator>) => Context.Context<R | Evaluator.Evaluator>;
/**
 * A cell-call runner that may touch the workspace it runs inside.
 *
 * The only difference from {@link CallRunner} is the `Workspace` requirement,
 * which is what a flow uses to read and write transactionally. A plain
 * `CallRunner` satisfies this too — it simply never asks for the service — so
 * {@link sandboxed} accepts either.
 *
 * @category models
 * @since 0.1.0
 */
export interface WorkspaceCallRunner {
    readonly authorize?: (call: Cell.Call) => Effect.Effect<void, HarnessError.HarnessError>;
    readonly run: (call: Cell.Call) => Effect.Effect<Cell.CallResult, HarnessError.HarnessError, WorkspaceSandbox.Workspace>;
}
/**
 * Rewrites one declared effect path into the workspace-relative form the
 * engine's file boundary speaks.
 *
 * The two sides use different vocabularies for the same idea. A flow
 * declaration is written against `@smthrs/core`'s `Effects.covers`, whose
 * only wildcard form is an absolute prefix glob — which is why every
 * filesystem flow in `@smthrs/std` declares `/**` for "any path". The
 * engine's `StepBoundary` resolves boundary paths against the pinned
 * workspace root, and `AtomicFileSystem` refuses `/**` outright as "path is
 * outside the pinned root". Handing the declaration across untranslated made
 * every `read`, `write`, `edit`, `glob`, `grep`, and `ls` call from a cell
 * fail before its handler ran.
 *
 * The translation is exact rather than lenient: a flow cannot reach outside
 * the workspace at all — the kernel filesystem pins it — so the declaration's
 * "anywhere" and the boundary's "everything under the root" name the same
 * set, and a leading `/` is the only difference between how the two write it.
 *
 * @category conversions
 * @since 0.1.0
 */
export declare const workspaceRelative: (path: string) => string;
/**
 * Converts the agent-side declaration into the file boundary understood by
 * the production engine and its workspace sandbox.
 *
 * The agent declaration knows paths but has not measured them; the engine's
 * `StepBoundary` performs that measurement before dispatch. The placeholder
 * digest is therefore identity-bearing metadata only for direct conformance
 * harnesses; production never uses it as evidence.
 *
 * @category conversions
 * @since 0.1.0
 */
export declare const callBoundary: (call: Cell.Call) => FileBoundary;
/**
 * The key material one cell call declares about itself.
 *
 * This is the workspace sandbox's separate content key over the declared call
 * material. The durable activity {@link callKey} uses `StepKey.content`
 * instead: it nests effects under the body and includes the resolved scope
 * layers, including the composition digest this function never receives. The
 * two keys therefore describe related boundaries but are intentionally not
 * equal. A sealed call is content-addressed; anything else folds in the cell
 * identity that keeps two invocations of one declaration distinct.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const callMaterial: (call: Cell.Call, layers?: ReadonlyArray<string>) => KeyMaterial.KeyMaterial;
/**
 * Runs every cell call inside an outer workspace transaction.
 *
 * This is the seam between the cell path and the scheduler the vault's
 * `Concepts/Reconciliation.md` describes: the call's *declared* effects and its
 * key material go in, the sandbox executes the runner against an isolated copy
 * of the workspace, and what comes back is a functional result — the files the
 * call would change, the provenance of what it actually read and wrote, and a
 * cache outcome keyed by `@smthrs/plan`'s compiler.
 *
 * Two properties are the point:
 *
 * - **A declaration is checked, not trusted.** A call that reads or writes
 *   outside what the cell chose comes back `Invalidated`, and this adapter
 *   turns that into a call failure the cell can catch rather than a silent
 *   host mutation. The speculative changes are discarded with it.
 * - **Materialization is explicit.** The sandbox admits a result before any
 *   host state moves, so a conflicting concurrent write is a typed refusal
 *   instead of a lost update.
 *
 * The adapter is a `CallRunner` decorator rather than an option on
 * {@link make}, so a host chooses the transaction boundary by composition and
 * a host that has no workspace to isolate composes nothing.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const sandboxed: (sandbox: WorkspaceSandbox.Service, runner: WorkspaceCallRunner, options?: {
    readonly layers?: ReadonlyArray<string> | undefined;
}) => Effect.Effect<CallRunner, never, Crypto.Crypto>;
/**
 * The collaborators a durable harness engine needs.
 *
 * `calls` is the cell loop's flow-call seam. A host that equips cells with
 * callable flows supplies it; without one, a cell call is refused with a typed
 * engine failure.
 *
 * @category models
 * @since 0.1.0
 */
export interface Options {
    readonly model: Model.Model;
    /** Bounded model-boundary retry policy; injectable so tests and hosts control time. */
    readonly modelRetryPolicy?: Schedule.Schedule<unknown, Model.ModelFailure> | undefined;
    readonly route: RouteResolver;
    readonly calls?: CallRunner | undefined;
    /**
     * The resolved composition identity every durable key folds in.
     *
     * This is the layer set the host actually built — model, permission, and host
     * layers, plus the resolved plugin list in resolution order. It belongs in the
     * key because it changes what a boundary *means*: the same declaration
     * resolved under a different plugin list is a different call, and serving it a
     * recorded result from the other composition is a stale-cache bug, not a
     * replay.
     */
    readonly layers?: ReadonlyArray<string> | undefined;
    /**
     * The composition's COMPLETE effective authority, if the host knows it.
     *
     * A sealed boundary is cross-run cacheable, so the key has to distinguish
     * two compositions that grant different authority — the same sealed
     * `fs/read` resolved under `fs:read:/workspace/**` and under
     * `fs:read:/workspace/a/**` is not the same boundary, even when the call
     * declares identical capabilities, because the envelope is what attenuates
     * it (issue #75).
     *
     * The host must supply this only when the record really is complete. An
     * omitted value is the honest "my authority is unknown", and the engine
     * answers it by pinning every sealed key to the current execution — no
     * cross-run reuse, but never a stale result from a differently-authorized
     * composition. Declaring an empty record is a positive claim that the
     * composition grants nothing, and it is a lie if the host holds an
     * envelope; {@link module:Agent} declares the envelope it actually
     * built.
     */
    readonly capabilities?: Readonly<Record<string, ReadonlyArray<string>>> | undefined;
}
/**
 * The durable outcome of one sealed model step.
 *
 * The array branch is the format written before model-boundary retries were
 * introduced. Keeping it decodable matters because a parked run may resume
 * against a newer agent package and replay that already-settled activity.
 * New records always use the object branch so a terminal typed model failure
 * can be replayed after its retry events.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const RecordedModelStep: Schema.Union<readonly [Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
}>, Schema.Struct<{
    readonly events: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
    }>;
    readonly error: Schema.optional<typeof ModelError.ModelError>;
    /**
     * Which structured-output correction this call belonged to, when the
     * caller was running a correction ladder.
     *
     * The ordinal is durable twice over, and only one of the two is readable.
     * Each correction is its own session — `${executionId}/${tag}#${n}` — so
     * the ladder's rungs already have distinct sealed step keys and a replay
     * reproduces all of them; but a session is KEY MATERIAL, hashed into a
     * digest, and nothing downstream can read an ordinal back out of it. An
     * operator or a projection reading a run's steps could see three sealed
     * model calls and not which was the ask and which were its corrections.
     * The field is that answer, on the record itself.
     *
     * Optional because it is absent from two honest cases: a model call made
     * outside a correction ladder, and a record written before this field
     * existed, which a parked run may still resume onto.
     */
    readonly correction: Schema.optional<Schema.Int>;
}>]>;
/**
 * The correction ordinal the model calls made under it belong to.
 *
 * {@link module:AgentAction} sets it around each rung of its structured-output
 * correction ladder, and this port stamps it onto the rung's sealed record. It
 * is deliberately NOT key material: the session already distinguishes the
 * rungs, and folding the ordinal into the key as well would change nothing
 * about which calls are distinct while making every recorded step un-replayable
 * by a caller that numbers its ladder differently.
 *
 * Absent by default, which is the honest reading of a model call made outside
 * any ladder.
 *
 * @category context
 * @since 0.1.0
 */
export declare const Correction: Context.Reference<number | undefined>;
/**
 * The first delay the production transport policy waits, in milliseconds.
 *
 * @category policies
 * @since 0.1.0
 */
export declare const defaultModelRetryBaseMillis = 1000;
/**
 * The factor each successive production transport delay multiplies by.
 *
 * @category policies
 * @since 0.1.0
 */
export declare const defaultModelRetryFactor = 2;
/**
 * How many times the production transport policy retries one sealed step.
 *
 * @category policies
 * @since 0.1.0
 */
export declare const defaultModelRetryTimes = 5;
/**
 * The wall clock the production transport ladder may span, in milliseconds.
 *
 * The count alone is not a bound. Five rungs of jittered doubling from one
 * second sum to at most 37.2 s of *sleeping*, but a ladder also spends whatever
 * each failing attempt spends, and a dying HTTP/2 session does not fail
 * quickly: r92 of the SWE-bench full benchmark burned ten `transport` retries
 * and $0.85 across two instances against a socket that stayed dead for about
 * half a minute, and each of those attempts re-sent a whole prompt and streamed
 * a partial body before dying. A ladder whose only bound is a count charges for
 * that as many times as the count allows.
 *
 * 45,000 ms is the declared ladder's own jittered ceiling plus one rung's worth
 * of headroom for the attempts between the sleeps, so a ladder that fails as
 * fast as this policy assumes still runs all five rungs and nothing here
 * changes for it. What changes is the ladder whose attempts are slow: it stops
 * when the wall clock says the incident has outlasted the window this policy
 * was written to cover, rather than when the fifth rung happens to arrive. Past
 * that point waiting is not what is wrong, which is exactly what
 * `@smthrs/model` `RequestExecutor` `makeWith` and its `Transport` are for: a
 * client the host can replace, rather than a longer wait on the one that died.
 *
 * The elapsed time is the schedule's own, taken on the injected clock, so a
 * test that supplies one sees the window it declared and never a wall-clock
 * wait.
 *
 * @category policies
 * @since 1.0.0-rc.0
 */
export declare const defaultModelRetryWindowMillis = 45000;
/**
 * The production transport retry budget: five retries over a jittered
 * exponential backoff spanning roughly thirty seconds, inside a 45-second
 * wall-clock window.
 *
 * The shape is load-bearing, not decorative. A transport-class failure is
 * almost never local: a destroyed HTTP/2 session, a 5xx, an overloaded
 * provider. All three persist for seconds to tens of seconds, so a retry that
 * fires inside that window is a wasted attempt, and a budget that empties
 * inside it turns one provider incident into a dead run. Wave 4 of the
 * SWE-bench harness lost `pytest-dev__pytest-6197` exactly that way: both of
 * its `transport` retries were spent, and the run ended `failed`, while the
 * provider was still refusing.
 *
 * Doubling from one second across five retries spans about 31 s, which is
 * long enough for a connection pool to re-establish and for a short rate-limit
 * window to pass. Jitter is what keeps a fleet of runs that all hit the same
 * incident from re-converging on the provider in lockstep; {@link
 * Schedule.jittered} scales each delay by a random factor in `[0.8, 1.2]`
 * drawn from the injected `Random` service, and the sleep itself is taken on
 * the injected clock, so a test that supplies both sees the schedule it
 * declared and never a wall-clock wait.
 *
 * {@link defaultModelRetryWindowMillis} bounds the same ladder by elapsed time,
 * because five rungs is a bound on how many attempts are made and not on what
 * they cost. Whichever limit arrives first ends the ladder.
 *
 * @category policies
 * @since 0.1.0
 */
export declare const defaultModelRetryPolicy: Schedule.Schedule<unknown, Model.ModelFailure>;
/**
 * Constructs the durable harness engine port.
 *
 * `FlowInstance` is per-execution, so this must be built inside a running flow
 * body — the harness layer stack is provided from the flow the harness is the
 * body of. The captured services are supplied back to every activity, which is
 * what keeps the port's streams requirement-free the way `EngineLike` declares
 * them.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const make: (options: Options) => Effect.Effect<EngineLike.EngineLike, never, Crypto.Crypto | FlowRuntime.FlowRuntime | FlowRuntime.FlowInstance | Budget.Budget | QuotaPolicy.QuotaClassifier>;
/**
 * Provides the durable harness engine port.
 *
 * @category layers
 * @since 0.1.0
 */
export declare const layer: (options: Options) => Layer.Layer<EngineLike.EngineLike, never, FlowRuntime.FlowRuntime | FlowRuntime.FlowInstance | Crypto.Crypto | Budget.Budget | QuotaPolicy.QuotaClassifier>;
