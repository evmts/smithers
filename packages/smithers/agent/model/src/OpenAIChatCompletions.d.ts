/**
 * OpenAI Chat Completions request lowering and SSE event handling.
 *
 * This is the older, widely-cloned OpenAI wire shape — distinct from
 * {@link OpenAIResponses}, which targets api.openai.com's newer Responses
 * API. Every self-hosted or third-party "OpenAI-compatible" endpoint that
 * does not implement Responses (Ollama, Gemini's compatibility layer, and
 * most others) speaks this one instead, so it is the protocol a generic
 * `openaiCompatible` route needs.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import { JsonObject } from "./ModelRequest.ts";
import * as Protocol from "./Protocol.ts";
import * as ToolStream from "./ToolStream.ts";
/**
 * The `response_format` field that turns on native structured output.
 *
 * Chat Completions deployments that implement it validate the answer against
 * the supplied JSON Schema themselves, so the caller receives a document it can
 * decode rather than prose it has to scan. Compatible providers may also
 * accept tools together with the output schema.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const ResponseFormat: Schema.Struct<{
    readonly type: Schema.Literal<"json_schema">;
    readonly json_schema: Schema.Struct<{
        readonly name: Schema.String;
        readonly strict: Schema.Boolean;
        readonly schema: Schema.refine<Schema.JsonObject, Schema.Codec<Schema.Json, Schema.Json, never, never>>;
    }>;
}>;
/**
 * The decoded form of {@link ResponseFormat}.
 *
 * @category models
 * @since 0.1.0
 */
export type ResponseFormat = typeof ResponseFormat.Type;
/**
 * The native-structured-output toggle a route is configured with.
 *
 * Presence is the toggle: a route built without one lowers requests exactly as
 * before and leaves the schema to the prompt (`@smthrs/harness`
 * `StructuredOutput.instructions`), and a route built with one asks the
 * provider to enforce the schema instead.
 *
 * Tools remain available with the schema. `toolChoice: "none"` omits tools.
 *
 * @category models
 * @since 0.1.0
 */
export interface StructuredOutput {
    /** The schema's name, echoed back by the provider on a refusal. */
    readonly name: string;
    /** The JSON Schema document the answer must satisfy. */
    readonly schema: JsonObject;
    /** Whether the provider must reject an answer that misses the schema. Defaults to `true`. */
    readonly strict?: boolean | undefined;
}
/**
 * JSON schema for a Chat Completions request body.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Body: Schema.Struct<{
    readonly model: Schema.String;
    readonly messages: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
        readonly role: Schema.Literal<"system">;
        readonly content: Schema.String;
    }>, Schema.Struct<{
        readonly role: Schema.Literal<"user">;
        readonly content: Schema.String;
    }>, Schema.Struct<{
        readonly role: Schema.Literal<"assistant">;
        readonly content: Schema.NullOr<Schema.String>;
        readonly tool_calls: Schema.optional<Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly type: Schema.Literal<"function">;
            readonly function: Schema.Struct<{
                readonly name: Schema.String;
                readonly arguments: Schema.String;
            }>;
        }>>>;
    }>, Schema.Struct<{
        readonly role: Schema.Literal<"tool">;
        readonly tool_call_id: Schema.String;
        readonly content: Schema.String;
    }>]>>;
    readonly tools: Schema.optional<Schema.$Array<Schema.Struct<{
        readonly type: Schema.Literal<"function">;
        readonly function: Schema.Struct<{
            readonly name: Schema.String;
            readonly description: Schema.String;
            readonly parameters: Schema.refine<Schema.JsonObject, Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        }>;
    }>>>;
    readonly response_format: Schema.optional<Schema.Struct<{
        readonly type: Schema.Literal<"json_schema">;
        readonly json_schema: Schema.Struct<{
            readonly name: Schema.String;
            readonly strict: Schema.Boolean;
            readonly schema: Schema.refine<Schema.JsonObject, Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        }>;
    }>>;
    readonly reasoning_effort: Schema.optional<Schema.Literals<readonly ["none", "minimal", "low", "medium", "high", "xhigh", "max"]>>;
    readonly max_tokens: Schema.optional<Schema.Finite>;
    readonly temperature: Schema.optional<Schema.Finite>;
    readonly top_p: Schema.optional<Schema.Finite>;
    readonly stream: Schema.Literal<true>;
    readonly stream_options: Schema.optional<Schema.Struct<{
        readonly include_usage: Schema.Literal<true>;
    }>>;
}>;
/**
 * The decoded form of the Chat Completions request body.
 *
 * @category models
 * @since 0.1.0
 */
export type Body = typeof Body.Type;
declare const ChunkUsage: Schema.Struct<{
    readonly prompt_tokens: Schema.optional<Schema.Number>;
    readonly completion_tokens: Schema.optional<Schema.Number>;
    readonly total_tokens: Schema.optional<Schema.Number>;
    readonly prompt_tokens_details: Schema.optional<Schema.NullOr<Schema.Struct<{
        readonly cached_tokens: Schema.optional<Schema.Number>;
    }>>>;
    /** OpenRouter's charge for the call, in USD. */
    readonly cost: Schema.optional<Schema.Number>;
}>;
declare const ChatCompletionChunk: Schema.Struct<{
    readonly id: Schema.optional<Schema.String>;
    /** The tier that served the request, on a chunk that carries it. */
    readonly service_tier: Schema.optional<Schema.NullOr<Schema.String>>;
    readonly choices: Schema.optional<Schema.$Array<Schema.Struct<{
        readonly index: Schema.optional<Schema.Number>;
        readonly delta: Schema.optional<Schema.Struct<{
            readonly role: Schema.optional<Schema.String>;
            readonly content: Schema.optional<Schema.NullOr<Schema.String>>;
            readonly tool_calls: Schema.optional<Schema.$Array<Schema.Struct<{
                readonly index: Schema.optional<Schema.Number>;
                readonly id: Schema.optional<Schema.String>;
                readonly function: Schema.optional<Schema.Struct<{
                    readonly name: Schema.optional<Schema.String>;
                    readonly arguments: Schema.optional<Schema.String>;
                }>>;
            }>>>;
        }>>;
        readonly finish_reason: Schema.optional<Schema.NullOr<Schema.String>>;
    }>>>;
    readonly usage: Schema.optional<Schema.NullOr<Schema.Struct<{
        readonly prompt_tokens: Schema.optional<Schema.Number>;
        readonly completion_tokens: Schema.optional<Schema.Number>;
        readonly total_tokens: Schema.optional<Schema.Number>;
        readonly prompt_tokens_details: Schema.optional<Schema.NullOr<Schema.Struct<{
            readonly cached_tokens: Schema.optional<Schema.Number>;
        }>>>;
        /** OpenRouter's charge for the call, in USD. */
        readonly cost: Schema.optional<Schema.Number>;
    }>>>;
    readonly error: Schema.optional<Schema.refine<Schema.JsonObject, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
}>;
type ChatCompletionChunk = typeof ChatCompletionChunk.Type;
/**
 * What the adapter must carry between chunks of one Chat Completions stream:
 * whether the (single, id-less) text part has opened, and the in-flight tool
 * calls keyed by their stream position, since a delta only ever repeats the
 * provider tool call's array `index` — the `id` and `function.name` arrive
 * once, on the first delta for that index.
 *
 * @category models
 * @since 0.1.0
 */
export interface State {
    readonly tools: ToolStream.State;
    readonly callIdByIndex: Readonly<Record<number, string>>;
    readonly textOpen: boolean;
    readonly settled: boolean;
    readonly usage?: typeof ChunkUsage.Type;
    readonly responseId?: string;
    readonly servedTier?: string;
}
/**
 * Builds the OpenAI Chat Completions protocol, optionally with native
 * structured output turned on.
 *
 * The option is presence-based: without it the lowering is byte-for-byte what
 * it has always been, so existing sealed step keys are unchanged.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const protocolWith: (options?: {
    readonly structuredOutput?: StructuredOutput | undefined;
}) => Protocol.Protocol<Body, string, ChatCompletionChunk, State>;
/**
 * The OpenAI Chat Completions protocol with native structured output off — the
 * wire shape Ollama, Gemini's OpenAI-compatible endpoint, and most other
 * self-hosted or third-party "OpenAI-compatible" servers actually implement.
 *
 * @category models
 * @since 0.1.0
 */
export declare const protocol: Protocol.Protocol<Body, string, ChatCompletionChunk, State>;
export {};
