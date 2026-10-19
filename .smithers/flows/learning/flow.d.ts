import { Action, Flow, FlowRuntime } from "@smthrs/flow";
import * as Evaluator from "@smthrs/model/Evaluator";
import { Context, Effect, Layer, Schema } from "effect";
export declare const Failure: Schema.Struct<{
    readonly signature: Schema.NonEmptyString;
    readonly text: Schema.NonEmptyString;
}>;
export declare const Outcome: Schema.Struct<{
    readonly todo: Schema.Int;
    readonly failures: Schema.$Array<Schema.Struct<{
        readonly signature: Schema.NonEmptyString;
        readonly text: Schema.NonEmptyString;
    }>>;
}>;
export declare const Snapshot: Schema.Struct<{
    readonly repository: Schema.NonEmptyString;
    readonly todo: Schema.Int;
    readonly run: Schema.NonEmptyString;
    readonly state: Schema.Literal<"merged">;
    readonly change: Schema.NonEmptyString;
    readonly commit: Schema.NonEmptyString;
    readonly attempts: Schema.$Array<Schema.NonEmptyString>;
    readonly journal: Schema.$Array<Schema.Struct<{
        readonly seq: Schema.Int;
        readonly eventType: Schema.String;
        readonly payload: Schema.Unknown;
    }>>;
    readonly outcomes: Schema.$Array<Schema.Struct<{
        readonly todo: Schema.Int;
        readonly failures: Schema.$Array<Schema.Struct<{
            readonly signature: Schema.NonEmptyString;
            readonly text: Schema.NonEmptyString;
        }>>;
    }>>;
}>;
export type Snapshot = typeof Snapshot.Type;
export declare const Output: Schema.Struct<{
    readonly repository: Schema.NonEmptyString;
    readonly todo: Schema.Int;
    readonly run: Schema.NonEmptyString;
    readonly pages: Schema.$Array<Schema.Struct<{
        readonly title: Schema.NonEmptyString;
        readonly body: Schema.NonEmptyString;
    }>>;
    readonly proposals: Schema.$Array<Schema.Struct<{
        readonly signature: Schema.NonEmptyString;
        readonly title: Schema.NonEmptyString;
        readonly evidence: Schema.$Array<Schema.NonEmptyString>;
        readonly todos: Schema.$Array<Schema.Int>;
        readonly prompt: Schema.NonEmptyString;
        readonly diff: Schema.optional<Schema.String>;
    }>>;
}>;
export type Output = typeof Output.Type;
declare const LearningFailed_base: Schema.Class<LearningFailed, Schema.TaggedStruct<"learning/Failed", {
    readonly code: Schema.Literals<readonly ["unavailable", "invalid_input", "judge_failed"]>;
    readonly message: Schema.NonEmptyString;
}>, import("effect/Cause").YieldableError>;
export declare class LearningFailed extends LearningFailed_base {
}
declare const Binding_base: Context.ServiceClass<Binding, "learning/Binding", {
    readonly read: (todo: number, run: string) => Effect.Effect<Snapshot, LearningFailed>;
}>;
/** Run-credential reads are supplied only inside the isolated machine. No local fallback. */
export declare class Binding extends Binding_base {
}
/** Count distinct merged TODOs, not attempts, from the bounded outcome window. */
export declare const evidence: (outcomes: Snapshot["outcomes"]) => {
    signature: string;
    todos: number[];
    count: string;
}[];
export declare const learn: (snapshot: Snapshot) => Effect.Effect<{
    repository: string;
    todo: number;
    run: string;
    pages: {
        title: string;
        body: string;
    }[];
    proposals: {
        signature: string;
        title: string;
        evidence: string[];
        todos: number[];
        prompt: string;
        diff?: string;
    }[];
}, LearningFailed, Evaluator.Evaluator>;
export declare const Run: Action.Declared<"learning/run", Schema.Struct<{
    todo: Schema.Int;
}>, Schema.Struct<{
    readonly repository: Schema.NonEmptyString;
    readonly todo: Schema.Int;
    readonly run: Schema.NonEmptyString;
    readonly pages: Schema.$Array<Schema.Struct<{
        readonly title: Schema.NonEmptyString;
        readonly body: Schema.NonEmptyString;
    }>>;
    readonly proposals: Schema.$Array<Schema.Struct<{
        readonly signature: Schema.NonEmptyString;
        readonly title: Schema.NonEmptyString;
        readonly evidence: Schema.$Array<Schema.NonEmptyString>;
        readonly todos: Schema.$Array<Schema.Int>;
        readonly prompt: Schema.NonEmptyString;
        readonly diff: Schema.optional<Schema.String>;
    }>>;
}>, typeof LearningFailed, Action.Requirement<"learning/run">>;
declare const _default: Flow.Flow<"learning", Schema.Struct<{
    todo: Schema.Int;
}>, Schema.Struct<{
    readonly repository: Schema.NonEmptyString;
    readonly todo: Schema.Int;
    readonly run: Schema.NonEmptyString;
    readonly pages: Schema.$Array<Schema.Struct<{
        readonly title: Schema.NonEmptyString;
        readonly body: Schema.NonEmptyString;
    }>>;
    readonly proposals: Schema.$Array<Schema.Struct<{
        readonly signature: Schema.NonEmptyString;
        readonly title: Schema.NonEmptyString;
        readonly evidence: Schema.$Array<Schema.NonEmptyString>;
        readonly todos: Schema.$Array<Schema.Int>;
        readonly prompt: Schema.NonEmptyString;
        readonly diff: Schema.optional<Schema.String>;
    }>>;
}>, typeof LearningFailed, Action.Requirement<"learning/run">>;
export default _default;
export declare const layer: Layer.Layer<Action.Requirement<"learning/run">, never, Binding | Evaluator.Evaluator | FlowRuntime.FlowRuntime>;
/** Packaged guest-only host wiring; operator configuration never comes from payloads. */
export declare const machineBinding: (options: {
    readonly origin?: string | undefined;
    readonly host: string;
    readonly credential?: string | undefined;
    readonly resolveRun?: ((execution: string) => Effect.Effect<string, LearningFailed>) | undefined;
}) => Layer.Layer<Binding, never, never>;
