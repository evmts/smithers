/**
 * The cell contract.
 *
 * A Smithers frame is `model -> generated cell -> realm evaluation ->
 * individually durable flow calls -> next transition`. This module owns the
 * serializable half of that sentence: the cell source the model emits, the
 * transition the cell settled, the typed outcomes a cell may settle with, and
 * the identity carried by every flow call made inside one.
 *
 * Nothing here executes anything. Execution is `Sandbox`; durability is
 * `EngineLike.call`; the loop is `CellTurn`.
 *
 * A cell does not *return* its transition. The realm is a REPL that outlives
 * the cell, so a cell states its intent by calling `ctx.done` or `ctx.park` and
 * `Sandbox.replTransition` builds the value; there is no returned object to
 * decode.
 *
 * Governing design: `../docs/concepts.md#durable-cell-loop`,
 * `../docs/concepts.md#repl-realm` and
 * `../docs/concepts.md#agent-cell-context`.
 *
 * @since 0.1.0
 */
import * as Descriptor from "@smthrs/registry/Descriptor";
import { Context, Effect, Result, Schema } from "effect";
import { HarnessError } from "./HarnessError.ts";
/**
 * The source language a cell is written in.
 *
 * Both shipped bindings run a `typescript` cell by erasing its type-only
 * syntax — never by emitting new runtime behaviour, so a construct that needs
 * JavaScript emit is a `compile_failed` rejection rather than a silent
 * transform. A binding that cannot compile at all rejects with
 * `unsupported_language`; neither shipped binding needs to.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare const Language: Schema.Literals<readonly ["javascript", "typescript"]>;
/**
 * The source language a cell is written in.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type Language = typeof Language.Type;
declare const Source_base: Schema.Class<Source, Schema.Struct<{
    readonly language: Schema.Literals<readonly ["javascript", "typescript"]>;
    readonly text: Schema.String;
    readonly digest: Schema.String;
}>, {}>;
/**
 * One unit of agent-authored source and its stable content digest.
 *
 * The digest is part of every call identity produced inside the cell, so
 * editing one character of the source re-keys every boundary within it.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare class Source extends Source_base {
}
/**
 * Computes the stable digest of cell source.
 *
 * @category constructors
 * @since 0.1.0
 * @slop
 */
export declare const digestOf: (language: Language, text: string) => string;
/**
 * Constructs cell source with its computed digest.
 *
 * @category constructors
 * @since 0.1.0
 * @slop
 */
export declare const source: (text: string, language?: Language) => Source;
declare const Continue_base: Schema.Class<Continue, Schema.TaggedStruct<"continue", {
    /**
     * Why this frame changed nothing, when the controller demanded that it
     * either mutate or say why not.
     *
     * The field exists because prose in the prompt did not stop a run from
     * reading for its whole budget: a benchmark instance spent 100 frames and
     * 132 calls without one edit attempt and then claimed the fix was
     * implemented. A justification is the typed way out of the read-only cap —
     * it is recorded, it buys a bounded grace, and it does not reset the
     * counter that eventually stops the run. A cell writes one by calling
     * `ctx.justify`.
     */
    readonly justification: Schema.optional<Schema.String>;
}>, {}>;
/**
 * The cell's turn ended without settling the run.
 *
 * A REPL cell that calls neither `ctx.done` nor `ctx.park` gets another frame,
 * and this is what that frame is journaled as. The only thing it carries is a
 * justification; all other bookkeeping belongs to the realm.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare class Continue extends Continue_base {
}
declare const Complete_base: Schema.Class<Complete, Schema.TaggedStruct<"complete", {
    readonly output: Schema.String;
    readonly value: Schema.optional<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
}>, {}>;
/**
 * The cell declares the task finished and supplies its final output.
 *
 * A completion carries no self-reported proof. The run's evidence is the calls
 * it actually made — every one journaled as `cell-call-settled` with its real
 * input and result — and a field in which the model restates which of them
 * proved the work would be a claim about a check rather than the check.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare class Complete extends Complete_base {
}
declare const Park_base: Schema.Class<Park, Schema.TaggedStruct<"park", {
    readonly reason: Schema.Literals<readonly ["waiting-input", "waiting-event", "waiting-quota"]>;
    readonly message: Schema.String;
}>, {}>;
/**
 * The cell asks the controller to park the run durably.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare class Park extends Park_base {
}
/**
 * The serializable decision one cell returns.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare const Transition: Schema.toTaggedUnion<"_tag", readonly [typeof Continue, typeof Complete, typeof Park]>;
/**
 * The serializable decision one cell returns.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type Transition = typeof Transition.Type;
/**
 * Renders a projected value as the text one context entry carries.
 *
 * A string is itself. Everything else is canonical JSON, which is the whole of
 * the "render structs as JSON, always" rule: a structured value reaches the
 * next model turn as the value it is.
 *
 * @category conversions
 * @since 0.1.0
 * @slop
 */
export declare const renderText: (value: Schema.Json) => string;
/**
 * Stable reasons a cell failed to produce a transition.
 *
 * Every one of these is a durable observation the model may correct on a later
 * frame; none of them is a harness crash.
 *
 * `imports_forbidden` names module syntax the cell itself uses, which
 * `Sandbox.compile` finds by parsing. A quoted mention of an import is data:
 * cells routinely carry a `bash` command whose heredoc imports a Python module,
 * and those cells run.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare const RejectionCode: Schema.Literals<readonly ["no_cell", "output_truncated", "imports_forbidden", "compile_failed", "invalid_transition", "unsupported_language", "limit_exceeded", "stalled"]>;
/**
 * Stable reasons a cell failed to produce a transition.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type RejectionCode = typeof RejectionCode.Type;
declare const Settled_base: Schema.Class<Settled, Schema.TaggedStruct<"settled", {
    readonly transition: Schema.toTaggedUnion<"_tag", readonly [typeof Continue, typeof Complete, typeof Park]>;
}>, {}>;
/**
 * The cell ran and returned a well-formed transition.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare class Settled extends Settled_base {
}
declare const Raised_base: Schema.Class<Raised, Schema.TaggedStruct<"raised", {
    readonly name: Schema.String;
    readonly message: Schema.String;
}>, {}>;
/**
 * The cell ran and threw. The thrown value is projected into stable text so it
 * survives the journal and the next frame's context.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare class Raised extends Raised_base {
}
declare const Rejected_base: Schema.Class<Rejected, Schema.TaggedStruct<"rejected", {
    readonly code: Schema.Literals<readonly ["no_cell", "output_truncated", "imports_forbidden", "compile_failed", "invalid_transition", "unsupported_language", "limit_exceeded", "stalled"]>;
    readonly message: Schema.String;
    /** The spent resource when `code` is `limit_exceeded`. */
    readonly reason: Schema.optional<Schema.Literals<readonly ["heap"]>>;
}>, {}>;
/**
 * The cell never ran, or ran and returned something that is not a transition.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare class Rejected extends Rejected_base {
}
/**
 * Everything one cell evaluation may settle with.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare const Outcome: Schema.toTaggedUnion<"_tag", readonly [typeof Settled, typeof Raised, typeof Rejected]>;
/**
 * Everything one cell evaluation may settle with.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type Outcome = typeof Outcome.Type;
declare const FlowProjection_base: Schema.Class<FlowProjection, Schema.Struct<{
    readonly name: Schema.String;
    readonly description: Schema.String;
    readonly capabilities: Schema.$Array<Schema.String>;
    readonly tier: Schema.Literals<readonly ["sealed", "compensable", "irreversible"]>;
    readonly placement: Schema.Option<Schema.Literals<readonly ["client", "local", "sandbox", "remote"]>>;
    /**
     * The call's input schema, as a JSON Schema document, when the descriptor
     * carries one by value.
     *
     * Without it a cell can only guess an input shape from prose, and every
     * guess costs a whole frame: a rejected call is one model turn, so learning
     * `bash` takes `{ command, mode, reads, writes }` cost four turns of pure
     * trial and error before any work began.
     */
    readonly input: Schema.withDecodingDefaultKey<Schema.withConstructorDefault<Schema.Option<Schema.Codec<Schema.Json, Schema.Json, never, never>>>, never>;
}>, {}>;
/**
 * The read-only projection of one callable flow handed to a cell.
 *
 * This is exactly what `ctx.flows` exposes: enough for the model to choose a
 * call and for the cell to reason about it, and nothing that carries authority.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare class FlowProjection extends FlowProjection_base {
}
/**
 * Projects a discovered descriptor into the cell-visible catalog entry.
 *
 * @category conversions
 * @since 0.1.0
 * @slop
 */
export declare const project: (descriptor: Descriptor.FlowDescriptor) => FlowProjection;
/**
 * Why one flow call failed, as a closed set a cell may branch on.
 *
 * Every member is a refusal or a budget the harness itself owns, plus one for
 * everything a flow reports about its own work. Add a member; never repurpose
 * one — a cell reads these, and so does a grader counting failure classes in a
 * journal.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare const CallFailureCode: Schema.Literals<readonly ["unknown_flow", "capability_refused", "truncated_write", "declaration_changed", "invalid_input", "unimplemented", "timeout", "run_completed", "checkpoint_unavailable", "checkpoint_exhausted", "checkpoint_readonly", "checkpoint_unsupported", "flow_failed", "flow_withheld"]>;
/**
 * Why one flow call failed.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type CallFailureCode = typeof CallFailureCode.Type;
/**
 * The code a failure carries when nothing classified it.
 *
 * @category constants
 * @since 0.1.0
 * @slop
 */
export declare const defaultCallFailureCode: CallFailureCode;
/**
 * What kind of failure a flow's handler met, in identifiers only.
 *
 * A handler's failure is opaque to the cell unless its binding declares a
 * public message, and "Flow bash failed." is then all a run's record says. The
 * failure's `_tag` and its own `code` are names its author chose, not data it
 * carried, so they may be journaled where its message may not: they tell a
 * command that could not be started from one that ran and failed.
 *
 * @category models
 * @since 1.0.0-rc.1
 */
export interface FailureKind {
    readonly tag?: string | undefined;
    readonly code?: string | undefined;
}
/**
 * The durable schema of {@link FailureKind}.
 *
 * @category schemas
 * @since 1.0.0-rc.1
 */
export declare const FailureKind: Schema.Struct<{
    readonly tag: Schema.optional<Schema.String>;
    readonly code: Schema.optional<Schema.String>;
}>;
/**
 * The {@link FailureKind} of one handler failure, read without trusting it:
 * a failure with throwing accessors, or with a tag or code that is not an
 * identifier, says nothing.
 *
 * @category conversions
 * @since 1.0.0-rc.1
 */
export declare const failureKind: (failure: unknown) => FailureKind;
/**
 * Where a flow binding reports the {@link FailureKind} of a handler failure.
 * The controller provides it around each flow call and journals what arrives
 * on that call's settlement; outside a call it does nothing. It tells the
 * cell nothing: the call result is unchanged.
 *
 * @category services
 * @since 1.0.0-rc.1
 */
export declare const Failures: Context.Reference<(kind: FailureKind) => Effect.Effect<void>>;
/**
 * The one action that recovers each failure class, stated to the cell.
 *
 * A code says what happened; the hint says what to do next, in the same frame.
 * They are here rather than at each raising site so the same class always reads
 * the same way whichever boundary refused.
 *
 * @category constants
 * @since 0.1.0
 * @slop
 */
export declare const callFailureHint: Readonly<Record<CallFailureCode, string>>;
/**
 * Which version of the live tree a sealed call reads; see `Call.epoch`.
 *
 * @category models
 * @since 1.0.0-rc.1
 */
export declare const TreeEpoch: Schema.Struct<{
    /** Earlier frames of this run that changed the workspace. */
    readonly frames: Schema.Int;
    /** Calls of this frame that may write, issued before this one. */
    readonly calls: Schema.Int;
    /** Digest of those calls, chained in issue order: which writes, not only how many. */
    readonly writes: Schema.optional<Schema.String>;
    /** Digest of the whole-tree measurement the frame opened on. */
    readonly tree: Schema.optional<Schema.String>;
    /** The run, when no whole-tree measurement exists: the reading is reused only inside it. */
    readonly session: Schema.optional<Schema.String>;
    /** The frame, beside `session`: an unmeasured tree may change during a model wait. */
    readonly frame: Schema.optional<Schema.Int>;
}>;
/**
 * Which version of the live tree a sealed call reads; see `Call.epoch`.
 *
 * @category models
 * @since 1.0.0-rc.1
 */
export type TreeEpoch = typeof TreeEpoch.Type;
/**
 * The tree a frame's sealed readings stand on: a measured digest, or the run and frame.
 *
 * @category models
 * @since 1.0.0-rc.1
 */
export type LiveTree = {
    readonly tree: string;
} | {
    readonly session: string;
    readonly frame: number;
};
declare const CallIdentity_base: Schema.Class<CallIdentity, Schema.Struct<{
    /** The durable session/lineage the frame belongs to. */
    readonly session: Schema.String;
    /** The controller frame that produced the cell. */
    readonly frame: Schema.Int;
    /** The digest of the cell source being executed. */
    readonly cell: Schema.String;
    /** The zero-based execution ordinal of this call within the cell. */
    readonly ordinal: Schema.Int;
    /** The digest of the resolved flow declaration being invoked. */
    readonly declaration: Schema.String;
    /** The resolved layer set in effect at the boundary. */
    readonly layers: Schema.$Array<Schema.String>;
}>, {}>;
/**
 * The complete identity of one flow call made inside one cell.
 *
 * Identity is what makes a mid-cell crash replayable. Re-executing the cell
 * source reaches the same lexical call in the same order with the same
 * declaration, so the boundary keys identically and replays; anything that
 * differs — a new frame, an edited cell, a different resolved layer set — keys
 * differently and executes.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare class CallIdentity extends CallIdentity_base {
}
/**
 * Computes the declaration digest folded into a call identity.
 *
 * Re-exported from `@smthrs/registry`, which owns `FlowDescriptor` and
 * therefore owns what one declaration hashes to. It is the same number
 * `@smthrs/chain` keys its catalog entries with, so a declaration has one
 * identity across the boundary rather than one per package.
 *
 * @category constructors
 * @since 0.1.0
 * @slop
 */
export declare const declarationDigest: (descriptor: Descriptor.FlowDescriptor) => string;
declare const Call_base: Schema.Class<Call, Schema.Struct<{
    readonly flowName: Schema.String;
    readonly input: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly capabilities: Schema.$Array<Schema.String>;
    readonly effects: Schema.Struct<{
        readonly reads: Schema.$Array<Schema.String>;
        readonly writes: Schema.$Array<Schema.String>;
        readonly mode: Schema.Literals<readonly ["hermetic", "expected"]>;
        readonly onConflict: Schema.Literals<readonly ["serialize", "lane", "fail"]>;
        readonly tier: Schema.Literals<readonly ["sealed", "compensable", "irreversible"]>;
    }>;
    readonly placement: Schema.Option<Schema.Literals<readonly ["client", "local", "sandbox", "remote"]>>;
    readonly identity: typeof CallIdentity;
    /**
     * The checkpoint this call runs against, when the cell named one.
     *
     * Absent is the ordinary case and means the live workspace. Present names a
     * tree the run already pinned, and the host materializes that tree somewhere
     * of its own choosing and runs the call there. It is journaled on the call
     * because it is the difference between a reading of the tree as it is and a
     * reading of the tree as it was, and a grader that cannot tell those apart
     * cannot grade a fails-before proof at all.
     */
    readonly at: Schema.optional<Schema.String>;
    /**
     * Which version of the live tree a sealed reading is taken against.
     *
     * A sealed call is content-addressed on what it asked, and "the same path
     * against the tree as it stands" is the same question only until something
     * has written to the tree. Without this, the second of two identical reads
     * around a write replays the first's answer and a run reports the pre-edit
     * text after its own edit. `frames` is the run's frame clock — the count of
     * earlier frames that changed the workspace, measured where the host can
     * measure — and `calls` is how many calls of this frame that may write
     * were issued before this one, with `writes` chaining what they asked, so
     * two runs that wrote differently read different questions. All are derived
     * from the journaled call
     * sequence, so a replayed frame derives the same epoch and replays.
     *
     * The counters restart with every run, so they cannot tell a later run's
     * read from an earlier run's across an edit made between them. `tree` is
     * the digest of a journaled measurement taken after the model wait, which
     * can; without a whole measurement, `session` and `frame` keep the reading
     * to the frame that took it.
     *
     * Absent on every call that is not a sealed reading of the live tree: a
     * checkpoint is immutable, and a non-sealed call already keys on its ordinal.
     */
    readonly epoch: Schema.optional<Schema.Struct<{
        /** Earlier frames of this run that changed the workspace. */
        readonly frames: Schema.Int;
        /** Calls of this frame that may write, issued before this one. */
        readonly calls: Schema.Int;
        /** Digest of those calls, chained in issue order: which writes, not only how many. */
        readonly writes: Schema.optional<Schema.String>;
        /** Digest of the whole-tree measurement the frame opened on. */
        readonly tree: Schema.optional<Schema.String>;
        /** The run, when no whole-tree measurement exists: the reading is reused only inside it. */
        readonly session: Schema.optional<Schema.String>;
        /** The frame, beside `session`: an unmeasured tree may change during a model wait. */
        readonly frame: Schema.optional<Schema.Int>;
    }>>;
    /**
     * What the resolved declaration says a call to this flow does.
     *
     * Carried on the call rather than looked up later, because the reader of a
     * run is not the host that resolved it: a card reading a journal months
     * afterwards holds the record and nothing else, and a flow name is not a
     * meaning. Absent is unknown, and unknown stays unknown.
     */
    readonly activity: Schema.optional<Schema.Literals<readonly ["reads", "writes", "checks", "tests", "other"]>>;
    /**
     * How the resolved declaration says one recorded call to this flow reads.
     *
     * Display authority only. Neither this field nor `activity` enters a key:
     * {@link callMaterial} and the durable call key name the fields they hash,
     * and both digests in `@smthrs/registry` exclude these two, so enriching a
     * declaration with them can neither replay nor re-approve anything.
     */
    readonly presentation: Schema.optional<Schema.Struct<{
        readonly verb: Schema.Struct<{
            readonly pending: Schema.String;
            readonly success: Schema.String;
            readonly failure: Schema.String;
        }>;
        readonly subject: Schema.Literals<readonly ["path", "command", "patch", "selection", "pattern", "none"]>;
        readonly result: Schema.Literals<readonly ["text", "read", "write", "edit", "patch", "tests", "command", "matches", "paths", "entries", "none"]>;
    }>>;
}>, {}>;
/**
 * One flow call requested from inside a cell.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare class Call extends Call_base {
}
/**
 * Builds the call one resolved declaration and one cell invocation make.
 *
 * A constructor rather than an object literal at the boundary: what a call
 * carries about its declaration is a contract two producers project into a
 * journal (`AgentSession.trace` and the native `CallFact`), and a reader can
 * only be as complete as this. A field copied from a descriptor onto a call
 * belongs here, where the copy is stated once.
 *
 * @category constructors
 * @since 1.0.0-rc.0
 */
export declare const callOf: (descriptor: Descriptor.FlowDescriptor, options: {
    readonly input: Schema.Json;
    readonly identity: CallIdentity;
    /** The checkpoint the cell named, when it named one. */
    readonly at?: string | undefined;
    /** The live tree's version, for a sealed reading taken after a write. */
    readonly epoch?: TreeEpoch | undefined;
}) => Call;
/**
 * The display projection one recorded call carries for whoever reads it back.
 *
 * `undefined` when the declaration claimed neither field, so the record stays
 * byte-identical to the one an undeclared flow produces and a reader's
 * compatibility table still applies to it. The name travels with the fields so
 * a reader can refuse metadata that belongs to a different flow.
 *
 * @category projections
 * @since 1.0.0-rc.0
 */
export declare const displayDescriptor: (call: Call) => Schema.Json | undefined;
/**
 * The id naming the tree a run opened on, pinned for free and always present.
 *
 * The dominant use of a checkpoint is a fails-before proof, and the frame that
 * wants one is almost never the frame that could have foreseen it: by the time
 * a run knows which command reproduces the bug it has usually already edited.
 * So this id exists without anybody minting it. A host resolves it to whatever
 * it recorded as the run's opening tree — for the SWE-bench rig, the
 * `refs/flows/capture-base` commit its own setup wrote — and a host with no
 * such record answers `checkpoint_unavailable` like any other.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const baseCheckpoint = "base";
/**
 * Builds the handle a cell holds for one checkpoint.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const checkpoint: (id: string) => Schema.Json;
/**
 * Reads the checkpoint id out of whatever a cell passed as `at`.
 *
 * `undefined` means "that was not a checkpoint", which the boundary answers as
 * an ordinary `invalid_input` failure rather than by guessing. It is
 * deliberately strict: a handle is the only thing that names a tree, and a
 * string that happens to look like an id would let a cell address a snapshot
 * the run never took.
 *
 * @category conversions
 * @since 0.1.0
 */
export declare const checkpointOf: (value: Schema.Json) => string | undefined;
declare const CallResult_base: Schema.Class<CallResult, Schema.Struct<{
    readonly outcome: Schema.Literals<readonly ["success", "failure"]>;
    readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly message: Schema.optional<Schema.String>;
    /**
     * Why a failed call failed, from the closed set the cell may branch on.
     *
     * Prose is what a boundary says; a code is what a program reads. Without one
     * the only way for a cell to tell "that flow does not exist" from "that
     * command timed out" was to match the message, so cells did not tell them
     * apart at all. Absent means {@link defaultCallFailureCode}, which is what a
     * flow's own failure gets: the flow said why in `message` and the harness
     * does not classify it.
     */
    readonly code: Schema.optional<Schema.Literals<readonly ["unknown_flow", "capability_refused", "truncated_write", "declaration_changed", "invalid_input", "unimplemented", "timeout", "run_completed", "checkpoint_unavailable", "checkpoint_exhausted", "checkpoint_readonly", "checkpoint_unsupported", "flow_failed", "flow_withheld"]>>;
}>, {}>;
/**
 * The settled outcome of one flow call.
 *
 * A `failure` resolves in the cell as a `{ ok: false, error }` envelope that
 * it may inspect and recover from; it does not throw and is never a harness
 * failure. Anything the cell cannot see, such as a permission park or an abort,
 * travels in the effect's error channel instead.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare class CallResult extends CallResult_base {
    constructor(props: CallResultVariant, options?: Schema.MakeOptions);
}
/**
 * A successful call cannot carry a failure code. The wire field names remain
 * the same as current CallResult records.
 *
 * @category schemas
 * @since 1.0.0-rc.0
 */
export declare const CallSuccess: Schema.Struct<{
    readonly outcome: Schema.Literal<"success">;
    readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly message: Schema.optional<Schema.String>;
    readonly code: Schema.optionalKey<Schema.Never>;
}>;
/**
 * A failed call, with the existing absent-code meaning of flow_failed.
 *
 * @category schemas
 * @since 1.0.0-rc.0
 */
export declare const CallFailure: Schema.Struct<{
    readonly outcome: Schema.Literal<"failure">;
    readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly message: Schema.optional<Schema.String>;
    readonly code: Schema.optional<Schema.Literals<readonly ["unknown_flow", "capability_refused", "truncated_write", "declaration_changed", "invalid_input", "unimplemented", "timeout", "run_completed", "checkpoint_unavailable", "checkpoint_exhausted", "checkpoint_readonly", "checkpoint_unsupported", "flow_failed", "flow_withheld"]>>;
}>;
/**
 * Discriminated result at a decoded persistence or host boundary.
 *
 * @category schemas
 * @since 1.0.0-rc.0
 */
export declare const CallResultVariant: Schema.Union<readonly [Schema.Struct<{
    readonly outcome: Schema.Literal<"success">;
    readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly message: Schema.optional<Schema.String>;
    readonly code: Schema.optionalKey<Schema.Never>;
}>, Schema.Struct<{
    readonly outcome: Schema.Literal<"failure">;
    readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly message: Schema.optional<Schema.String>;
    readonly code: Schema.optional<Schema.Literals<readonly ["unknown_flow", "capability_refused", "truncated_write", "declaration_changed", "invalid_input", "unimplemented", "timeout", "run_completed", "checkpoint_unavailable", "checkpoint_exhausted", "checkpoint_readonly", "checkpoint_unsupported", "flow_failed", "flow_withheld"]>>;
}>]>;
/**
 * Discriminated result at a decoded persistence or host boundary.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export type CallResultVariant = typeof CallResultVariant.Type;
/**
 * Decode a host or persisted result before the cell can observe it.
 *
 * @category decoders
 * @since 1.0.0-rc.0
 */
export declare const decodeCallResult: (value: unknown) => Effect.Effect<{
    readonly outcome: "success";
    readonly value: Schema.Json;
    readonly message?: string | undefined;
    readonly code?: never;
} | {
    readonly outcome: "failure";
    readonly value: Schema.Json;
    readonly message?: string | undefined;
    readonly code?: "capability_refused" | "checkpoint_exhausted" | "checkpoint_readonly" | "checkpoint_unavailable" | "checkpoint_unsupported" | "declaration_changed" | "flow_failed" | "flow_withheld" | "invalid_input" | "run_completed" | "timeout" | "truncated_write" | "unimplemented" | "unknown_flow" | undefined;
}, HarnessError, never>;
/**
 * Refuse contradictory or incomplete recorded evaluation outcomes.
 *
 * @category decoders
 * @since 1.0.0-rc.0
 */
export declare const decodeOutcome: (value: unknown) => Effect.Effect<Raised | Rejected | Settled, HarnessError, never>;
/**
 * Refuse contradictory or incomplete recorded transitions.
 *
 * @category decoders
 * @since 1.0.0-rc.0
 */
export declare const decodeTransition: (value: unknown) => Effect.Effect<Complete | Continue | Park, HarnessError, never>;
/**
 * The failure envelope a cell observes when a flow call does not succeed.
 *
 * A failed call **resolves** with this value; it does not throw. That is the
 * whole of change 8: an unrecoverable rejection turned every failed call into a
 * lost frame, because the recovery branch the model had already written sat
 * behind the throw and never ran, and every sibling call the cell had already
 * paid for went with it. `psf__requests-2317` lost two settled greps and a
 * probe to one call against a directory that did not exist; `django-14351`
 * spent ~$0.46 on the same class across five frames.
 *
 * The shape is fixed and small — `{ ok: false, error: { code, message, hint } }`
 * — because a cell branches on `.ok` and reads `.error.code`. A successful call
 * still resolves with the flow's own value, unwrapped, so the ordinary
 * `result.stdout` shape a cell is trained on is unchanged.
 *
 * @category conversions
 * @since 0.1.0
 * @slop
 */
export declare const callFailure: (result: CallResult) => Schema.Json;
/**
 * One reply's cell program, and how many fenced blocks it was written in.
 *
 * `blocks` is journaled rather than derived later because it is the only
 * record of how the model chose to lay its frame out, and a reply written as
 * several blocks is exactly the reply the old extraction discarded.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface Extracted {
    readonly source: Source;
    /** How many fenced cell blocks the reply carried, repeats included. */
    readonly blocks: number;
}
/**
 * Extracts the cell program one model settlement emitted.
 *
 * Every fenced block tagged as a cell is kept, in reply order, and the blocks
 * are joined with newlines into one global async script in the persistent
 * realm. Top-level `await` is supported; top-level `return` is invalid. Blocks
 * execute in order. The first `ctx.done` or `ctx.park` that records an intent
 * seals the frame; later `ctx.done` and `ctx.park` calls do nothing. Ordinary
 * JavaScript in later blocks continues running, but later `ctx.call` and
 * `ctx.checkpoint` calls resolve with a `run_completed` failure envelope
 * without dispatching host work.
 *
 * Keeping only the *last* block is what this replaces, and the cost of that
 * rule was measured: on one graded instance the model wrote a near-par program
 * as seven blocks in a single reply — recon, probe, edit-plus-diagnostics,
 * suite, rehydrate, guarded replay, completion — and the harness executed block
 * seven, the imagined completion, against a tree where blocks one through six
 * had never run. Empty patch, run over in two frames. Multi-block replies were
 * 2 of 91 replies in that wave: rare, and instance-deciding when they land.
 *
 * A byte-identical repeat of a block is dropped rather than concatenated. Both
 * multi-block replies in that wave are in the journals, and the second one is a
 * model that emitted the same block twice: joining the duplicate would declare
 * its names twice and turn a frame that runs today into a `compile_failed`. A
 * repeat is the model restating one program, never a second step — a second
 * step that genuinely re-runs the same code would still have to differ
 * somewhere, if only in what it does with the result.
 *
 * Distinct blocks are joined as they were written, so a value bound in one is
 * bound for the ones after it. One program therefore means one set of
 * declarations, and two blocks that both declare the same name are a
 * `SyntaxError` the compiler reports — a durable observation the next frame can
 * fix, unlike silently running one block of seven, which is not observable at
 * all. The contract states the rule so a model that batches writes blocks that
 * compose, and `CellTurn` names the block count when such a program fails to
 * compile.
 *
 * The program is `typescript` when any block declared a typed fence, because
 * both bindings run TypeScript by erasing type-only syntax and erasure is
 * harmless to a plain-JavaScript block.
 *
 * Extraction reads text and never judges syntax. Whether the source uses module
 * syntax is a question about JavaScript, and it is answered by parsing the cell
 * in `Sandbox.compile`, which is also where an `imports_forbidden` rejection is
 * raised.
 *
 * @category conversions
 * @since 0.1.0
 * @slop
 */
export declare const extract: (text: string) => Result.Result<Extracted, Rejected>;
export {};
