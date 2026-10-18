/**
 * OpenAI Responses request lowering and SSE event handling.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import * as Protocol from "./Protocol.ts";
import * as ToolStream from "./ToolStream.ts";
/**
 * JSON schema for an OpenAI Responses request body.
 *
 * @category schemas
 * @since 0.1.0
 * @slop
 */
export declare const Body: Schema.Struct<{
    readonly model: Schema.String;
    readonly instructions: Schema.optional<Schema.String>;
    readonly input: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
        readonly role: Schema.Literal<"user">;
        readonly content: Schema.$Array<Schema.Struct<{
            readonly type: Schema.Literal<"input_text">;
            readonly text: Schema.String;
        }>>;
    }>, Schema.Struct<{
        readonly role: Schema.Literal<"assistant">;
        readonly content: Schema.$Array<Schema.Struct<{
            readonly type: Schema.Literal<"output_text">;
            readonly text: Schema.String;
        }>>;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"item_reference">;
        readonly id: Schema.String;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"reasoning">;
        readonly id: Schema.optional<Schema.String>;
        readonly summary: Schema.optional<Schema.$Array<Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
        readonly encrypted_content: Schema.optional<Schema.String>;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"function_call">;
        readonly call_id: Schema.String;
        readonly name: Schema.String;
        readonly arguments: Schema.String;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"function_call_output">;
        readonly call_id: Schema.String;
        readonly output: Schema.String;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"tool_search_call">;
        readonly call_id: Schema.String;
        readonly execution: Schema.Literal<"client">;
        readonly status: Schema.Literal<"completed">;
        readonly arguments: Schema.Struct<{
            readonly query: Schema.String;
            readonly limit: Schema.Finite;
        }>;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"tool_search_output">;
        readonly call_id: Schema.String;
        readonly execution: Schema.Literal<"client">;
        readonly status: Schema.Literal<"completed">;
        readonly tools: Schema.$Array<Schema.Struct<{
            readonly type: Schema.Literal<"function">;
            readonly name: Schema.String;
            readonly description: Schema.String;
            readonly parameters: Schema.refine<Schema.JsonObject, Schema.Codec<Schema.Json, Schema.Json, never, never>>;
            readonly defer_loading: Schema.optional<Schema.Boolean>;
        }>>;
    }>]>>;
    readonly tools: Schema.optional<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
        readonly type: Schema.Literal<"function">;
        readonly name: Schema.String;
        readonly description: Schema.String;
        readonly parameters: Schema.refine<Schema.JsonObject, Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        readonly defer_loading: Schema.optional<Schema.Boolean>;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"web_search">;
        readonly filters: Schema.optional<Schema.Struct<{
            readonly allowed_domains: Schema.$Array<Schema.String>;
        }>>;
    }>]>>>;
    readonly reasoning: Schema.optional<Schema.Struct<{
        readonly effort: Schema.Literals<readonly ["none", "minimal", "low", "medium", "high", "xhigh", "max"]>;
        readonly summary: Schema.optional<Schema.Literals<readonly ["auto", "concise", "detailed"]>>;
    }>>;
    readonly max_output_tokens: Schema.optional<Schema.Finite>;
    readonly temperature: Schema.optional<Schema.Finite>;
    readonly top_p: Schema.optional<Schema.Finite>;
    readonly stream: Schema.Literal<true>;
    readonly prompt_cache_key: Schema.optional<Schema.String>;
}>;
/**
 * The decoded form of the Responses request body.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type Body = typeof Body.Type;
/**
 * JSON schema for a ChatGPT-plan Responses request body. The subscription
 * backend narrows the API-key surface (each delta confirmed against the live
 * backend, 2026-08-25). `store` must be `false`, because nothing is persisted
 * server-side. `max_output_tokens` is rejected outright, so a request that
 * sets `params.maxTokens` fails locally as `invalid_request` naming that
 * member rather than being sent unbounded. `include:
 * ["reasoning.encrypted_content"]` is how reasoning survives the
 * statelessness: the returned items carry their own encrypted state and are
 * replayed verbatim on the next request.
 *
 * @category schemas
 * @since 0.1.0
 * @slop
 */
export declare const ChatGPTBody: Schema.Struct<{
    readonly model: Schema.String;
    readonly instructions: Schema.optional<Schema.String>;
    readonly input: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
        readonly role: Schema.Literal<"user">;
        readonly content: Schema.$Array<Schema.Struct<{
            readonly type: Schema.Literal<"input_text">;
            readonly text: Schema.String;
        }>>;
    }>, Schema.Struct<{
        readonly role: Schema.Literal<"assistant">;
        readonly content: Schema.$Array<Schema.Struct<{
            readonly type: Schema.Literal<"output_text">;
            readonly text: Schema.String;
        }>>;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"item_reference">;
        readonly id: Schema.String;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"reasoning">;
        readonly id: Schema.optional<Schema.String>;
        readonly summary: Schema.optional<Schema.$Array<Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
        readonly encrypted_content: Schema.optional<Schema.String>;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"function_call">;
        readonly call_id: Schema.String;
        readonly name: Schema.String;
        readonly arguments: Schema.String;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"function_call_output">;
        readonly call_id: Schema.String;
        readonly output: Schema.String;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"tool_search_call">;
        readonly call_id: Schema.String;
        readonly execution: Schema.Literal<"client">;
        readonly status: Schema.Literal<"completed">;
        readonly arguments: Schema.Struct<{
            readonly query: Schema.String;
            readonly limit: Schema.Finite;
        }>;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"tool_search_output">;
        readonly call_id: Schema.String;
        readonly execution: Schema.Literal<"client">;
        readonly status: Schema.Literal<"completed">;
        readonly tools: Schema.$Array<Schema.Struct<{
            readonly type: Schema.Literal<"function">;
            readonly name: Schema.String;
            readonly description: Schema.String;
            readonly parameters: Schema.refine<Schema.JsonObject, Schema.Codec<Schema.Json, Schema.Json, never, never>>;
            readonly defer_loading: Schema.optional<Schema.Boolean>;
        }>>;
    }>]>>;
    readonly tools: Schema.optional<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
        readonly type: Schema.Literal<"function">;
        readonly name: Schema.String;
        readonly description: Schema.String;
        readonly parameters: Schema.refine<Schema.JsonObject, Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        readonly defer_loading: Schema.optional<Schema.Boolean>;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"web_search">;
        readonly filters: Schema.optional<Schema.Struct<{
            readonly allowed_domains: Schema.$Array<Schema.String>;
        }>>;
    }>]>>>;
    readonly reasoning: Schema.optional<Schema.Struct<{
        readonly effort: Schema.Literals<readonly ["none", "minimal", "low", "medium", "high", "xhigh", "max"]>;
        readonly summary: Schema.optional<Schema.Literals<readonly ["auto", "concise", "detailed"]>>;
    }>>;
    readonly temperature: Schema.optional<Schema.Finite>;
    readonly top_p: Schema.optional<Schema.Finite>;
    readonly stream: Schema.Literal<true>;
    readonly prompt_cache_key: Schema.optional<Schema.String>;
    readonly store: Schema.Literal<false>;
    readonly include: Schema.$Array<Schema.Literal<"reasoning.encrypted_content">>;
}>;
/**
 * The decoded form of the ChatGPT-plan Responses request body.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type ChatGPTBody = typeof ChatGPTBody.Type;
declare const OpenAIEvent: Schema.Struct<{
    readonly type: Schema.String;
    readonly code: Schema.optional<Schema.String>;
    readonly message: Schema.optional<Schema.String>;
    readonly param: Schema.optional<Schema.NullOr<Schema.String>>;
    readonly item_id: Schema.optional<Schema.String>;
    readonly delta: Schema.optional<Schema.String>;
    readonly arguments: Schema.optional<Schema.String>;
    readonly item: Schema.optional<Schema.refine<Schema.JsonObject, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
    readonly response: Schema.optional<Schema.refine<Schema.JsonObject, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
    readonly error: Schema.optional<Schema.refine<Schema.JsonObject, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
}>;
type OpenAIEvent = typeof OpenAIEvent.Type;
/**
 * What the adapter must carry between events of one Responses stream: the
 * partially assembled tool calls, the ids already opened, and the response
 * identity a continuation replays.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface State {
    readonly tools: ToolStream.State;
    readonly toolNames: Readonly<Record<string, string>>;
    readonly textIds: ReadonlySet<string>;
    readonly thinkingIds: ReadonlySet<string>;
    readonly completedToolIds: ReadonlySet<string>;
    readonly itemIds: ReadonlyArray<string>;
    readonly responseId: string | undefined;
    readonly settled: boolean;
}
/**
 * The OpenAI Responses protocol.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare const protocol: Protocol.Protocol<Body, string, OpenAIEvent, State>;
/**
 * The OpenAI Responses protocol as ChatGPT-plan backends serve it: the same
 * SSE event stream and usage counters, with the request narrowed to the
 * subscription surface ({@link ChatGPTBody}) and reasoning continuation
 * carried in `encrypted_content` instead of stored item references. Deferred
 * tools are native only for the ids probed live on this backend (the GPT-6
 * family, 2026-09-24); every other model receives the portable lowering.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare const chatgptProtocol: Protocol.Protocol<ChatGPTBody, string, OpenAIEvent, State>;
export {};
