/**
 * Local structural plan nodes used at the harness-to-engine boundary.
 *
 * These values project the canonical registry metadata defined by
 * `@smthrs/registry`'s `Descriptor` and consumed at the splice boundary
 * described in `../docs/concepts.md#child-plans-and-the-splice-boundary`. Source order is retained
 * only for result correlation; graph dependencies are the sole sequencing
 * signal.
 *
 * @since 0.1.0
 */
import * as ModelRequest from "@smthrs/model/ModelRequest";
import { Schema } from "effect";
declare const Child_base: Schema.Class<Child, Schema.Struct<{
    readonly flowName: Schema.String;
    readonly callId: Schema.String;
    readonly args: Schema.Unknown;
    readonly capabilities: Schema.$Array<Schema.String>;
    readonly effects: Schema.Struct<{
        readonly reads: Schema.$Array<Schema.String>;
        readonly writes: Schema.$Array<Schema.String>;
        readonly mode: Schema.Literals<readonly ["hermetic", "expected"]>;
        readonly onConflict: Schema.Literals<readonly ["serialize", "lane", "fail"]>;
        readonly tier: Schema.Literals<readonly ["sealed", "compensable", "irreversible"]>;
    }>;
    readonly placement: Schema.Option<Schema.Literals<readonly ["client", "local", "sandbox", "remote"]>>;
}>, {}>;
/**
 * One flow invocation elaborated from a model tool call.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare class Child extends Child_base {
}
declare const Batch_base: Schema.Class<Batch, Schema.Struct<{
    readonly children: Schema.$Array<typeof Child>;
}>, {}>;
/**
 * The children passed through to the engine.
 *
 * The harness preserves model-call order for correlation but never schedules
 * or serializes a child itself.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare class Batch extends Batch_base {
}
declare const ChildResult_base: Schema.Class<ChildResult, Schema.Struct<{
    readonly callId: Schema.String;
    readonly outcome: Schema.Literals<readonly ["success", "error", "aborted"]>;
    readonly result: Schema.Struct<{
        readonly type: Schema.Literal<"tool-result">;
        readonly toolCallId: Schema.String;
        readonly content: Schema.String;
        readonly addedToolNames: Schema.$Array<Schema.String>;
    }> & {
        make: (input: {
            readonly toolCallId: string;
            readonly content: string;
            readonly addedToolNames?: ReadonlyArray<string> | undefined;
        }) => ModelRequest.ToolResultPart;
    };
}>, {}>;
/**
 * A settled child outcome suitable for transcript projection.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare class ChildResult extends ChildResult_base {
}
declare const ChildProgress_base: Schema.Class<ChildProgress, Schema.TaggedStruct<"progress", {
    readonly callId: Schema.String;
    readonly message: Schema.String;
}>, {}>;
/**
 * One harness-owned progress update emitted while a child call is executing.
 *
 * Progress is intentionally separate from {@link ChildResult}: it is
 * transient execution telemetry, while a result is the durable transcript
 * settlement for the call.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare class ChildProgress extends ChildProgress_base {
}
declare const ChildSettled_base: Schema.Class<ChildSettled, Schema.TaggedStruct<"settled", {
    readonly result: typeof ChildResult;
}>, {}>;
/**
 * One settled child result in the streaming splice protocol.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare class ChildSettled extends ChildSettled_base {
}
/**
 * Streaming output of one engine splice.
 *
 * Engines may publish any number of progress updates before exactly one
 * settlement for each call. The harness publishes progress immediately and
 * restores final settlements to model-call order.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare const SpliceEvent: Schema.toTaggedUnion<"_tag", readonly [typeof ChildProgress, typeof ChildSettled]>;
/**
 * Streaming output of one engine splice.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type SpliceEvent = typeof SpliceEvent.Type;
export {};
