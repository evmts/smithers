/**
 * Routes a run to seats by the maintainer's routing graph: Jev classifies the
 * task, and a pure table picks the seats.
 *
 * A declared seat always wins: {@link route} asks nothing unless the flow
 * declared {@link Seat.auto}. An `auto` run asks Jev once, at its start, the
 * graph's edge questions (phase, size, clarity, binary success) and the
 * system-prompt variant in one call. {@link plan} maps the answers to a seat
 * or a panel, {@link backupsOf} gives each seat's failover order, and
 * {@link fit} keeps the seats the host's {@link Catalog} has available. A
 * judge that cannot answer, or a pick whose seats are all unavailable, fails
 * the run as {@link Seat.SeatUnrouted}: no default seat is ever picked instead.
 *
 * {@link durable} records the decision as a sealed step, so a replayed run is
 * served the route it first started on.
 *
 * @since 1.0.0-rc.0
 */
import { Action } from "@smthrs/flow";
import * as AgentEvent from "@smthrs/harness/AgentEvent";
import * as Classifier from "@smthrs/model/Classifier";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Seat from "./Seat.ts";
/**
 * One system-prompt variant: what kind of task it fits and the system text a
 * run picked for it is given.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export interface Variant {
    readonly id: string;
    readonly description: string;
    readonly system: ReadonlyArray<string>;
}
/**
 * What the host offers: the graph {@link seats} its `SeatResolver` can run
 * here, and the variants.
 *
 * @category services
 * @since 1.0.0-rc.0
 */
export interface Service {
    readonly candidates: Effect.Effect<ReadonlyArray<string>, Seat.SeatUnresolved>;
    readonly variants: ReadonlyArray<Variant>;
}
declare const Catalog_base: Context.ServiceClass<Catalog, "@smthrs/agent/SeatRouter/Catalog", Service>;
/**
 * The {@link Service} tag.
 *
 * @category services
 * @since 1.0.0-rc.0
 */
export declare class Catalog extends Catalog_base {
}
/**
 * Provides {@link Catalog} from an implementation.
 *
 * @category layers
 * @since 1.0.0-rc.0
 */
export declare const layer: (implementation: Service) => Layer.Layer<Catalog>;
/**
 * The variants a host offers unless it declares its own.
 *
 * @category constants
 * @since 1.0.0-rc.0
 */
export declare const defaultVariants: ReadonlyArray<Variant>;
/**
 * What Jev reads to pick: the task, and the flow it runs as.
 *
 * @category schemas
 * @since 1.0.0-rc.0
 */
export declare const State: Schema.Struct<{
    /** The task; {@link route} sends it as `Judgement.task` carries it. */
    readonly task: Schema.String;
    readonly flow: Schema.String;
    readonly description: Schema.String;
    readonly capabilities: Schema.$Array<Schema.String>;
}>;
/**
 * The decoded form of {@link State}.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export type State = typeof State.Type;
/**
 * The seats the routing graph names, by their `Providers.seatAliases` names.
 *
 * @category constants
 * @since 1.0.0-rc.0
 */
export declare const seats: readonly ["luna", "sol", "opus", "fable", "sonnet", "kimi"];
/**
 * One graph seat.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export type GraphSeat = typeof seats[number];
/**
 * The phases of work the graph routes separately.
 *
 * @category constants
 * @since 1.0.0-rc.0
 */
export declare const phases: readonly ["plan", "implement", "review", "ui", "tool", "other"];
/**
 * One phase of work.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export type Phase = typeof phases[number];
/**
 * Jev's answers to the graph's edge questions, with a pinned phase in place
 * of its answer.
 *
 * @category schemas
 * @since 1.0.0-rc.0
 */
export declare const Answers: Schema.Struct<{
    readonly phase: Schema.Literals<readonly ["plan", "implement", "review", "ui", "tool", "other"]>;
    readonly size: Schema.Literals<readonly ["trivial", "simple", "middle", "important"]>;
    readonly clarity: Schema.Literals<readonly ["clear", "unknowns"]>;
    /** Whether success is a binary yes or no. */
    readonly binary: Schema.Boolean;
}>;
/**
 * The decoded form of {@link Answers}.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export type Answers = typeof Answers.Type;
/**
 * What the graph picks for one set of answers: a seat, or a panel whose
 * members answer in parallel and whose merger, `seat`, merges them.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export interface Planned {
    readonly seat: GraphSeat;
    readonly panel?: {
        readonly seats: ReadonlyArray<GraphSeat>;
        readonly merger: GraphSeat;
    };
}
/**
 * The routing graph: the seat or panel one set of answers runs on. Writing
 * code never runs on Luna; Luna takes only trivial, clear tool work whose
 * success is binary. Work the graph does not list runs on Opus.
 *
 * @category constructors
 * @since 1.0.0-rc.0
 */
export declare const plan: (answers: Answers) => Planned;
/**
 * The seats `seat` fails over to, in order, when its provider fails.
 *
 * @category constructors
 * @since 1.0.0-rc.0
 */
export declare const backupsOf: (seat: GraphSeat, phase: Phase) => ReadonlyArray<GraphSeat>;
/**
 * The JSON form of one {@link Route}.
 *
 * @category schemas
 * @since 1.0.0-rc.0
 */
export declare const RouteSchema: Schema.Struct<{
    readonly seat: Schema.String;
    /** The seats `seat` fails over to, in order. */
    readonly backups: Schema.$Array<Schema.String>;
    /** The panel the task fans out to; `seat` is its merger. */
    readonly panel: Schema.optionalKey<Schema.Struct<{
        readonly seats: Schema.$Array<Schema.Struct<{
            readonly seat: Schema.String;
            readonly backups: Schema.$Array<Schema.String>;
        }>>;
        readonly merger: Schema.String;
    }>>;
}>;
/**
 * The seats a run starts on, over the seats a host has available.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export type Route = typeof RouteSchema.Type;
/**
 * Keeps the available seats of a {@link Planned} pick: each seat becomes the
 * first available of itself and its {@link backupsOf}, the rest available
 * are its backups, and panel members that land on one seat are one member
 * with the union of their backups, in order, less the seats on the panel. A
 * panel left with one member is that member's seat and backups alone. `undefined` when the pick's
 * seat has nothing available.
 *
 * @category constructors
 * @since 1.0.0-rc.0
 */
export declare const fit: (planned: Planned, phase: Phase, available: ReadonlyArray<string>) => Route | undefined;
/**
 * The instructions and criteria of the graph's edge questions.
 *
 * @category constants
 * @since 1.0.0-rc.0
 */
export declare const edgeQuestions: {
    phase: Omit<import("@smthrs/model/Evaluator").ChoiceQuestion, "criteria"> & {
        readonly criteria: {
            readonly plan: "Produce a plan or design for work, not the work itself.";
            readonly implement: "Write or change code.";
            readonly review: "Judge existing work, such as a diff or a plan, without changing it.";
            readonly ui: "Build or change a user interface or its visual design.";
            readonly tool: "Drive tools to a result, such as running commands or calling services, with little writing.";
            readonly other: "Anything else, such as answering a question or researching.";
        };
    };
    size: Omit<import("@smthrs/model/Evaluator").ChoiceQuestion, "criteria"> & {
        readonly criteria: {
            readonly trivial: "One obvious step, such as a lookup or a one-line change.";
            readonly simple: "A small, self-contained task.";
            readonly middle: "Several steps or files, with ordinary risk.";
            readonly important: "Complex, architectural, or high-stakes work where a mistake is costly.";
        };
    };
    clarity: Omit<import("@smthrs/model/Evaluator").ChoiceQuestion, "criteria"> & {
        readonly criteria: {
            readonly clear: "The task says or implies how to do it.";
            readonly unknowns: "It has unknown unknowns, open design decisions, or real risk.";
        };
    };
    binary: import("@smthrs/model/Evaluator").BooleanQuestion;
};
/**
 * The instructions of the `system` question.
 *
 * @category constants
 * @since 1.0.0-rc.0
 */
export declare const systemInstructions = "Which kind of work does this task ask for?";
type RouteClassifier = Classifier.Classifier<"seat/route", typeof State, Classifier.Questions>;
/**
 * The `seat/route` classifier: the {@link edgeQuestions}, without `phase`
 * when the caller pinned it, and `system`, a choice over the variants asked
 * only when there are at least two. The same variants and pin return the
 * same classifier.
 *
 * @category constructors
 * @since 1.0.0-rc.0
 */
export declare const classifierFor: (variants: ReadonlyArray<Variant>, pinned: boolean) => RouteClassifier;
/**
 * The JSON form of one {@link Decision}.
 *
 * @category schemas
 * @since 1.0.0-rc.0
 */
export declare const DecisionSchema: Schema.Struct<{
    readonly seat: Schema.String;
    /** The seats `seat` fails over to, in order. */
    readonly backups: Schema.$Array<Schema.String>;
    /** The panel the task fans out to; `seat` is its merger. */
    readonly panel: Schema.optionalKey<Schema.Struct<{
        readonly seats: Schema.$Array<Schema.Struct<{
            readonly seat: Schema.String;
            readonly backups: Schema.$Array<Schema.String>;
        }>>;
        readonly merger: Schema.String;
    }>>;
    readonly variant: Schema.NullOr<Schema.String>;
    readonly decidedBy: Schema.Literals<readonly ["jev", "declared"]>;
    /** The graph's inputs; `null` for a declared seat. */
    readonly answers: Schema.NullOr<Schema.Struct<{
        readonly phase: Schema.Literals<readonly ["plan", "implement", "review", "ui", "tool", "other"]>;
        readonly size: Schema.Literals<readonly ["trivial", "simple", "middle", "important"]>;
        readonly clarity: Schema.Literals<readonly ["clear", "unknowns"]>;
        /** Whether success is a binary yes or no. */
        readonly binary: Schema.Boolean;
    }>>;
    readonly latencyMs: Schema.Int;
    /** The seats available; empty for a declared seat. */
    readonly candidates: Schema.$Array<Schema.String>;
    /** What Jev was asked and answered; `null` when it was not asked. */
    readonly asked: Schema.NullOr<Schema.Struct<{
        readonly classifier: Schema.String;
        readonly digest: Schema.String;
        readonly questions: Schema.$Record<Schema.String, Schema.Union<readonly [typeof import("@smthrs/model/Evaluator").BooleanQuestion, typeof import("@smthrs/model/Evaluator").ChoiceQuestion, typeof import("@smthrs/model/Evaluator").ScoreQuestion]>>;
        readonly state: Schema.Codec<Schema.Json, Schema.Json, never, never>;
        readonly answers: Schema.$Record<Schema.String, Schema.Union<readonly [Schema.Struct<{
            readonly kind: Schema.Literal<"boolean">;
            readonly p: Schema.Number;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"choice">;
            readonly value: Schema.String;
            readonly probabilities: Schema.$Record<Schema.String, Schema.Number>;
            readonly confidence: Schema.optionalKey<Schema.Number>;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"score">;
            readonly value: Schema.Number;
            readonly label: Schema.String;
            readonly probabilities: Schema.$Record<Schema.String, Schema.Number>;
            readonly confidence: Schema.optionalKey<Schema.Number>;
        }>]>>;
        readonly usage: Schema.optional<Schema.Struct<{
            readonly inputTokens: Schema.Number;
            readonly outputTokens: Schema.Number;
            readonly modelId: Schema.optional<Schema.String>;
            readonly costUsd: Schema.optional<Schema.Number>;
        }>>;
    }>>;
}>;
/**
 * The route a run starts on, the variant it is given, and who decided.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export type Decision = typeof DecisionSchema.Type;
/**
 * What {@link route} decides for.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export interface Input {
    /** The seat the flow declared; only {@link Seat.auto} asks Jev. */
    readonly declared: string;
    readonly state: State;
    /** The phase of work, when the caller knows it; Jev is then not asked it. */
    readonly phase?: Phase | undefined;
    /**
     * `false` when the caller does not fan out: a panel pick routes to its
     * merger alone, so no panel is recorded that will not run.
     */
    readonly panel?: boolean | undefined;
}
/**
 * Routes the run and picks its variant.
 *
 * A declared seat is kept and nothing is asked. Otherwise Jev answers the
 * edge questions and, in the same call, the variant among two or more; the
 * route is {@link fit} of {@link plan} over the catalog's seats, without the
 * panel when {@link Input.panel} is `false`.
 *
 * @category constructors
 * @since 1.0.0-rc.0
 */
export declare const route: (input: Input) => Effect.Effect<Decision, Seat.SeatUnrouted, Catalog>;
/**
 * {@link route} as a sealed step of the running flow: a replay is served the
 * recorded decision and asks Jev nothing. The key names the execution and
 * the purpose only, so editing a description does not re-route a run in
 * flight.
 *
 * @category constructors
 * @since 1.0.0-rc.0
 */
export declare const durable: (input: Input, key: {
    readonly executionId: string;
    readonly purpose: string;
}) => Action.Action<typeof DecisionSchema, typeof Seat.SeatUnrouted, Catalog>;
/**
 * The rows that journal a decision: `seat-routed`, with the route's backups
 * and panel, and the `decision-settled` row of Jev's reading; none for a
 * declared seat.
 *
 * @category conversions
 * @since 1.0.0-rc.0
 */
export declare const events: (decision: Decision, at: {
    readonly scope: string;
    readonly modelId: string;
}) => ReadonlyArray<AgentEvent.AgentEvent>;
/**
 * The task a panel's merger is given: the task, each member's answer as
 * `seat: answer`, and the members that failed without one.
 *
 * @category conversions
 * @since 1.0.0-rc.0
 */
export declare const mergePrompt: (task: string, answers: ReadonlyArray<readonly [seat: string, answer: string]>, failed: ReadonlyArray<string>) => string;
/**
 * The system text of the variant `id` names: none for `null`, and
 * `undefined` for an id no variant has.
 *
 * @category conversions
 * @since 1.0.0-rc.0
 */
export declare const variantText: (variants: ReadonlyArray<Variant>, id: string | null) => ReadonlyArray<string> | undefined;
export {};
