/**
 * Anthropic Messages request lowering and streaming event parsing.
 *
 * @since 0.1.0
 */
import { Chunk, Schema } from "effect";
import { type Usage } from "./ModelEvent.ts";
import { type StopReason } from "./ModelRequest.ts";
import { type Protocol } from "./Protocol.ts";
import * as ToolStream from "./ToolStream.ts";
/**
 * Schema for the deterministic `POST /v1/messages` body.
 *
 * @category schemas
 * @since 0.1.0
 * @slop
 */
export declare const Body: Schema.Struct<{
    readonly model: Schema.String;
    readonly max_tokens: Schema.Finite;
    readonly system: Schema.optional<Schema.$Array<Schema.Struct<{
        readonly type: Schema.Literal<"text">;
        readonly text: Schema.String;
        readonly cache_control: Schema.optional<Schema.Struct<{
            readonly type: Schema.Literal<"ephemeral">;
        }>>;
    }>>>;
    readonly messages: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
        readonly role: Schema.Literal<"user">;
        readonly content: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
            readonly type: Schema.Literal<"text">;
            readonly text: Schema.String;
            readonly cache_control: Schema.optional<Schema.Struct<{
                readonly type: Schema.Literal<"ephemeral">;
            }>>;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"tool_result">;
            readonly tool_use_id: Schema.String;
            readonly content: Schema.Union<readonly [Schema.String, Schema.$Array<Schema.Union<readonly [Schema.Struct<{
                readonly type: Schema.Literal<"tool_reference">;
                readonly tool_name: Schema.String;
            }>, Schema.Struct<{
                readonly type: Schema.Literal<"text">;
                readonly text: Schema.String;
                readonly cache_control: Schema.optional<Schema.Struct<{
                    readonly type: Schema.Literal<"ephemeral">;
                }>>;
            }>]>>]>;
            readonly cache_control: Schema.optional<Schema.Struct<{
                readonly type: Schema.Literal<"ephemeral">;
            }>>;
        }>]>>;
    }>, Schema.Struct<{
        readonly role: Schema.Literal<"assistant">;
        readonly content: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
            readonly type: Schema.Literal<"text">;
            readonly text: Schema.String;
            readonly cache_control: Schema.optional<Schema.Struct<{
                readonly type: Schema.Literal<"ephemeral">;
            }>>;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"thinking">;
            readonly thinking: Schema.String;
            readonly signature: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"redacted_thinking">;
            readonly data: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"tool_use">;
            readonly id: Schema.String;
            readonly name: Schema.String;
            readonly input: Schema.refine<Schema.JsonObject, Schema.Codec<Schema.Json, Schema.Json, never, never>>;
            readonly cache_control: Schema.optional<Schema.Struct<{
                readonly type: Schema.Literal<"ephemeral">;
            }>>;
        }>]>>;
    }>]>>;
    readonly tools: Schema.optional<Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly description: Schema.String;
        readonly input_schema: Schema.refine<Schema.JsonObject, Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        readonly defer_loading: Schema.optional<Schema.Boolean>;
        readonly cache_control: Schema.optional<Schema.Struct<{
            readonly type: Schema.Literal<"ephemeral">;
        }>>;
    }>>>;
    readonly stream: Schema.Literal<true>;
    readonly temperature: Schema.optional<Schema.Finite>;
    readonly top_p: Schema.optional<Schema.Finite>;
    readonly top_k: Schema.optional<Schema.Finite>;
    readonly stop_sequences: Schema.optional<Schema.$Array<Schema.String>>;
    readonly thinking: Schema.optional<Schema.Union<readonly [Schema.Struct<{
        readonly type: Schema.Literal<"enabled">;
        readonly budget_tokens: Schema.Finite;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"adaptive">;
    }>]>>;
    readonly output_config: Schema.optional<Schema.Struct<{
        readonly effort: Schema.Literals<readonly ["low", "medium", "high", "xhigh", "max"]>;
    }>>;
}>;
/**
 * The deterministic `POST /v1/messages` body.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type Body = typeof Body.Type;
declare const AnthropicEvent: Schema.Struct<{
    readonly type: Schema.String;
    readonly index: Schema.optional<Schema.Number>;
    readonly message: Schema.optional<Schema.Struct<{
        readonly id: Schema.optional<Schema.String>;
        readonly usage: Schema.optional<Schema.Struct<{
            readonly input_tokens: Schema.optional<Schema.Number>;
            readonly output_tokens: Schema.optional<Schema.Number>;
            readonly cache_creation_input_tokens: Schema.optional<Schema.NullOr<Schema.Number>>;
            readonly cache_read_input_tokens: Schema.optional<Schema.NullOr<Schema.Number>>;
            /** The tier that served the request: `standard`, `priority` or `batch`. */
            readonly service_tier: Schema.optional<Schema.NullOr<Schema.String>>;
        }>>;
    }>>;
    readonly content_block: Schema.optional<Schema.Struct<{
        readonly type: Schema.String;
        readonly id: Schema.optional<Schema.String>;
        readonly name: Schema.optional<Schema.String>;
        readonly text: Schema.optional<Schema.String>;
        readonly thinking: Schema.optional<Schema.String>;
        readonly signature: Schema.optional<Schema.String>;
        readonly data: Schema.optional<Schema.String>;
        readonly input: Schema.optional<Schema.Unknown>;
    }>>;
    readonly delta: Schema.optional<Schema.Struct<{
        readonly type: Schema.optional<Schema.String>;
        readonly text: Schema.optional<Schema.String>;
        readonly thinking: Schema.optional<Schema.String>;
        readonly partial_json: Schema.optional<Schema.String>;
        readonly signature: Schema.optional<Schema.String>;
        readonly stop_reason: Schema.optional<Schema.NullOr<Schema.String>>;
        readonly stop_sequence: Schema.optional<Schema.NullOr<Schema.String>>;
    }>>;
    readonly usage: Schema.optional<Schema.Struct<{
        readonly input_tokens: Schema.optional<Schema.Number>;
        readonly output_tokens: Schema.optional<Schema.Number>;
        readonly cache_creation_input_tokens: Schema.optional<Schema.NullOr<Schema.Number>>;
        readonly cache_read_input_tokens: Schema.optional<Schema.NullOr<Schema.Number>>;
        /** The tier that served the request: `standard`, `priority` or `batch`. */
        readonly service_tier: Schema.optional<Schema.NullOr<Schema.String>>;
    }>>;
    readonly error: Schema.optional<Schema.Struct<{
        readonly type: Schema.optional<Schema.String>;
        readonly message: Schema.optional<Schema.String>;
    }>>;
}>;
type AnthropicEvent = typeof AnthropicEvent.Type;
type Block = {
    readonly type: "text";
    readonly index: number;
    readonly id: string;
} | {
    readonly type: "thinking";
    readonly index: number;
    readonly id: string;
    readonly signature: string | undefined;
    readonly started: boolean;
    readonly fragments: Chunk.Chunk<string>;
} | {
    readonly type: "tool_use";
    readonly index: number;
    readonly id: string;
    readonly name: string;
};
interface State {
    readonly blocks: ReadonlyArray<Block>;
    readonly tools: ToolStream.State;
    readonly usage: Usage | undefined;
    readonly usageEmitted: boolean;
    readonly stopReason: StopReason | undefined;
    readonly settled: boolean;
    readonly responseId: string | undefined;
    readonly servedTier: string | undefined;
}
/**
 * Anthropic's Messages API body lowering and SSE state machine.
 *
 * @category protocols
 * @since 0.1.0
 * @slop
 */
export declare const protocol: Protocol<Body, string, AnthropicEvent, State>;
export {};
