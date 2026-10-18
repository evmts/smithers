/**
 * Restores approved control authority at native handler boundaries, including resume.
 * @since 1.0.0
 */
import * as AgentAction from "@smthrs/agent/AgentAction";
import * as Budget from "@smthrs/agent/Budget";
import * as QuotaPolicy from "@smthrs/agent/QuotaPolicy";
import { ControlRuntime } from "@smthrs/control/ControlRuntime";
import * as DurableEngineState from "@smthrs/engine-store/DurableEngineState";
import { FlowRuntime } from "@smthrs/flow";
import { HarnessError } from "@smthrs/harness/HarnessError";
import * as Steering from "@smthrs/harness/Steering";
import { Journal } from "@smthrs/journal";
import { NotificationQueue } from "@smthrs/notifications";
import type * as Executable from "@smthrs/registry/Executable";
import * as Registry from "@smthrs/registry/Registry";
import { RunStore } from "@smthrs/run-store";
import { Effect, Exit, Option, Schema } from "effect";
/**
 * Composes existing host authority services without another run ledger.
 * @since 1.0.0
 * @private
 */
export declare const make: (catalog: Effect.Effect<Executable.Catalog>, actionHost: AgentAction.Host, budgetHost: {
    /** The owning control run's journal, where budget requests and decisions live. */
    readonly controlJournal: Journal.Service;
    /** Whether a refused `park` budget may ask an operator, as the session's `asks` says. */
    readonly parks: boolean;
    readonly reenterModules?: ReadonlyArray<string> | undefined;
    readonly beforeSteeringDrain?: ((runId: string, flowId: string) => Effect.Effect<void, HarnessError>) | undefined;
    readonly weights?: Budget.Weights | undefined;
}) => Effect.Effect<{
    runtime: {
        readonly durability?: "durable" | undefined;
        readonly register: <Name extends string, Payload extends import("@smthrs/flow/Flow").AnyStructSchema, Success extends Schema.Top, Error extends Schema.Top, R>(flow: import("@smthrs/flow/Flow").Flow<Name, Payload, Success, Error, any>, execute: (payload: Payload["Type"], executionId: string) => Effect.Effect<Success["Type"], Error["Type"], R>, options?: {
            readonly ifAbsent?: boolean | undefined;
        }) => Effect.Effect<void, never, import("effect/Scope").Scope | Exclude<R, FlowRuntime.FlowRuntime | FlowRuntime.FlowInstance | import("@smthrs/flow/Flow").Execution<Name> | import("effect/Scope").Scope> | Payload["DecodingServices"] | Payload["EncodingServices"] | Success["DecodingServices"] | Success["EncodingServices"] | Error["DecodingServices"] | Error["EncodingServices"]>;
        readonly execute: <Name extends string, Payload extends import("@smthrs/flow/Flow").AnyStructSchema, Success extends Schema.Top, Error extends Schema.Top, const Discard extends boolean = false>(flow: import("@smthrs/flow/Flow").Flow<Name, Payload, Success, Error, any>, options: {
            readonly executionId: string;
            readonly payload: Payload["Type"];
            readonly discard?: Discard | undefined;
            readonly suspendedRetryPolicy?: import("@smthrs/flow/RetryPolicy").RetryPolicy | undefined;
        }) => Effect.Effect<Discard extends true ? string : Success["Type"], Error["Type"] | FlowRuntime.FlowCycleDetected, Payload["EncodingServices"] | Success["DecodingServices"] | Error["DecodingServices"]>;
        readonly poll: <Name extends string, Payload extends import("@smthrs/flow/Flow").AnyStructSchema, Success extends Schema.Top, Error extends Schema.Top>(flow: import("@smthrs/flow/Flow").Flow<Name, Payload, Success, Error, any>, executionId: string) => Effect.Effect<Option.Option<import("@smthrs/flow/Flow").Result<Success["Type"], Error["Type"]>>, FlowRuntime.FlowExecutionNotFound, Success["DecodingServices"] | Error["DecodingServices"]>;
        readonly interrupt: (flow: import("@smthrs/flow/Flow").Any, executionId: string) => Effect.Effect<void, FlowRuntime.CancelRequestFailed>;
        readonly interruptUnsafe: (flow: import("@smthrs/flow/Flow").Any, executionId: string) => Effect.Effect<void, FlowRuntime.CancelRequestFailed>;
        readonly resume: (flow: import("@smthrs/flow/Flow").Any, executionId: string, options?: FlowRuntime.ResumeOptions | undefined) => Effect.Effect<void>;
        readonly actionExecute: <Success extends Schema.Constraint, Error extends Schema.Constraint, R>(action: import("@smthrs/flow/Action").Action<Success, Error, R>, attempt: number) => Effect.Effect<import("@smthrs/flow/Flow").Result<Success["Type"], Error["Type"]>, never, Success["DecodingServices"] | Error["DecodingServices"] | R | import("effect/Crypto").Crypto | FlowRuntime.FlowInstance>;
        readonly deferredResult: <Success extends Schema.Constraint, Error extends Schema.Constraint>(deferred: import("@smthrs/flow/DurableDeferred").DurableDeferred<Success, Error>) => Effect.Effect<Option.Option<Exit.Exit<Success["Type"], Error["Type"]>>, never, FlowRuntime.FlowInstance>;
        readonly deferredDone: <Success extends Schema.Constraint, Error extends Schema.Constraint>(deferred: import("@smthrs/flow/DurableDeferred").DurableDeferred<Success, Error>, options: {
            readonly flowName: string;
            readonly executionId: string;
            readonly deferredName: string;
            readonly exit: Exit.Exit<Success["Type"], Error["Type"]>;
        }) => Effect.Effect<void, never, Success["EncodingServices"] | Error["EncodingServices"]>;
        readonly deferredDoneIfWaiting: <Success extends Schema.Constraint, Error extends Schema.Constraint>(deferred: import("@smthrs/flow/DurableDeferred").DurableDeferred<Success, Error>, options: {
            readonly flowName: string;
            readonly executionId: string;
            readonly deferredName: string;
            readonly reason: string;
            readonly token: string;
            readonly exit: Exit.Exit<Success["Type"], Error["Type"]>;
        }) => Effect.Effect<FlowRuntime.DeferredDoneIfWaitingOutcome, never, Success["EncodingServices"] | Error["EncodingServices"]>;
        readonly recordNode?: ((record: FlowRuntime.NodeRecord) => Effect.Effect<void, import("@smthrs/flow/Interpreter").InterpreterError, FlowRuntime.FlowInstance>) | undefined;
        readonly nodeRecordBytes?: ((record: FlowRuntime.NodeRecord) => Effect.Effect<number, never, FlowRuntime.FlowInstance>) | undefined;
        readonly scheduleClock: (flow: import("@smthrs/flow/Flow").Any, options: {
            readonly executionId: string;
            readonly clock: import("@smthrs/flow/DurableClock").DurableClock;
        }) => Effect.Effect<void>;
    };
    steering: Steering.Source;
}, never, ControlRuntime | DurableEngineState.DurableEngineState | FlowRuntime.FlowRuntime | Journal.Journal | NotificationQueue.NotificationQueue | QuotaPolicy.QuotaClassifier | Registry.Registry | RunStore.RunStore | import("effect/Scope").Scope>;
