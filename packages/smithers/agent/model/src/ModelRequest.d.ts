/**
 * The serializable, credential-free declaration of one model call.
 *
 * Field declaration order is load-bearing: it is the stable serialization order
 * a sealed model step keys on.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
/**
 * A plain JSON object. Unlike `Schema.Record`, decoding starts from
 * `Schema.Json`, so class instances such as `Date` and `Map` cannot be
 * accepted as empty records.
 *
 * @category schemas
 * @since 0.1.0
 * @slop
 */
export declare const JsonObject: Schema.refine<Schema.JsonObject, Schema.Codec<Schema.Json, Schema.Json, never, never>>;
/**
 * The decoded form of {@link JsonObject}.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type JsonObject = typeof JsonObject.Type;
/**
 * Why a model stream stopped. `aborted` is this layer's own value for an
 * interrupted stream, which no provider reports.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare const StopReason: Schema.Literals<readonly ["stop", "length", "tool-calls", "content-filter", "error", "aborted", "unknown"]>;
/**
 * The decoded form of {@link StopReason}.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type StopReason = typeof StopReason.Type;
/**
 * One text segment of the system prompt. The prompt is a list rather than a
 * string so a cache breakpoint can fall between segments.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare const SystemPart: Schema.Struct<{
    readonly type: Schema.Literal<"text">;
    readonly text: Schema.String;
}> & {
    make: (input: {
        readonly text: string;
    }) => SystemPart;
};
/**
 * The decoded form of {@link SystemPart}.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type SystemPart = typeof SystemPart.Type;
/**
 * Plain text inside a message.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare const TextPart: Schema.Struct<{
    readonly type: Schema.Literal<"text">;
    readonly text: Schema.String;
}> & {
    make: (input: {
        readonly text: string;
    }) => TextPart;
};
/**
 * The decoded form of {@link TextPart}.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type TextPart = typeof TextPart.Type;
/**
 * A reasoning block. `signature` is the provider's attestation and must be
 * echoed back unchanged for the block to be accepted on a later request.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare const ThinkingPart: Schema.Struct<{
    readonly type: Schema.Literal<"thinking">;
    readonly text: Schema.String;
    readonly signature: Schema.optional<Schema.String>;
}> & {
    make: (input: {
        readonly text: string;
        readonly signature?: string | undefined;
    }) => ThinkingPart;
};
/**
 * The decoded form of {@link ThinkingPart}.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type ThinkingPart = typeof ThinkingPart.Type;
/**
 * A tool the model asked to run. `arguments` stays JSON text rather than a
 * decoded object so it survives a round trip byte for byte.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare const ToolCallPart: Schema.Struct<{
    readonly type: Schema.Literal<"tool-call">;
    readonly id: Schema.String;
    readonly name: Schema.String;
    readonly arguments: Schema.String;
}> & {
    make: (input: {
        readonly id: string;
        readonly name: string;
        readonly arguments: string;
    }) => ToolCallPart;
};
/**
 * The decoded form of {@link ToolCallPart}.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type ToolCallPart = typeof ToolCallPart.Type;
/**
 * What a tool returned, addressed back to its call by `toolCallId`.
 * `addedToolNames` names the tools the result made available.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare const ToolResultPart: Schema.Struct<{
    readonly type: Schema.Literal<"tool-result">;
    readonly toolCallId: Schema.String;
    readonly content: Schema.String;
    readonly addedToolNames: Schema.$Array<Schema.String>;
}> & {
    make: (input: {
        readonly toolCallId: string;
        readonly content: string;
        readonly addedToolNames?: ReadonlyArray<string> | undefined;
    }) => ToolResultPart;
};
/**
 * The decoded form of {@link ToolResultPart}.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type ToolResultPart = typeof ToolResultPart.Type;
/**
 * Any part a message can carry, tagged by `type`.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare const ContentPart: Schema.toTaggedUnion<"type", readonly [Schema.Struct<{
    readonly type: Schema.Literal<"text">;
    readonly text: Schema.String;
}> & {
    make: (input: {
        readonly text: string;
    }) => TextPart;
}, Schema.Struct<{
    readonly type: Schema.Literal<"thinking">;
    readonly text: Schema.String;
    readonly signature: Schema.optional<Schema.String>;
}> & {
    make: (input: {
        readonly text: string;
        readonly signature?: string | undefined;
    }) => ThinkingPart;
}, Schema.Struct<{
    readonly type: Schema.Literal<"tool-call">;
    readonly id: Schema.String;
    readonly name: Schema.String;
    readonly arguments: Schema.String;
}> & {
    make: (input: {
        readonly id: string;
        readonly name: string;
        readonly arguments: string;
    }) => ToolCallPart;
}, Schema.Struct<{
    readonly type: Schema.Literal<"tool-result">;
    readonly toolCallId: Schema.String;
    readonly content: Schema.String;
    readonly addedToolNames: Schema.$Array<Schema.String>;
}> & {
    make: (input: {
        readonly toolCallId: string;
        readonly content: string;
        readonly addedToolNames?: ReadonlyArray<string> | undefined;
    }) => ToolResultPart;
}]>;
/**
 * The decoded form of {@link ContentPart}.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type ContentPart = typeof ContentPart.Type;
/**
 * The parts an assistant message can carry: everything in
 * {@link ContentPart} except a tool result, which belongs to a tool message.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare const AssistantContentPart: Schema.toTaggedUnion<"type", readonly [Schema.Struct<{
    readonly type: Schema.Literal<"text">;
    readonly text: Schema.String;
}> & {
    make: (input: {
        readonly text: string;
    }) => TextPart;
}, Schema.Struct<{
    readonly type: Schema.Literal<"thinking">;
    readonly text: Schema.String;
    readonly signature: Schema.optional<Schema.String>;
}> & {
    make: (input: {
        readonly text: string;
        readonly signature?: string | undefined;
    }) => ThinkingPart;
}, Schema.Struct<{
    readonly type: Schema.Literal<"tool-call">;
    readonly id: Schema.String;
    readonly name: Schema.String;
    readonly arguments: Schema.String;
}> & {
    make: (input: {
        readonly id: string;
        readonly name: string;
        readonly arguments: string;
    }) => ToolCallPart;
}]>;
/**
 * The decoded form of {@link AssistantContentPart}.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type AssistantContentPart = typeof AssistantContentPart.Type;
declare const UserMessage_base: Schema.Class<UserMessage, Schema.Struct<{
    readonly role: Schema.Literal<"user">;
    readonly content: Schema.$Array<Schema.Struct<{
        readonly type: Schema.Literal<"text">;
        readonly text: Schema.String;
    }> & {
        make: (input: {
            readonly text: string;
        }) => TextPart;
    }>;
}>, {}>;
/**
 * A turn from the user. Text only: attachments and tool output enter the
 * transcript through their own message roles.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare class UserMessage extends UserMessage_base {
}
declare const AssistantMessage_base: Schema.Class<AssistantMessage, Schema.Struct<{
    readonly role: Schema.Literal<"assistant">;
    readonly content: Schema.$Array<Schema.toTaggedUnion<"type", readonly [Schema.Struct<{
        readonly type: Schema.Literal<"text">;
        readonly text: Schema.String;
    }> & {
        make: (input: {
            readonly text: string;
        }) => TextPart;
    }, Schema.Struct<{
        readonly type: Schema.Literal<"thinking">;
        readonly text: Schema.String;
        readonly signature: Schema.optional<Schema.String>;
    }> & {
        make: (input: {
            readonly text: string;
            readonly signature?: string | undefined;
        }) => ThinkingPart;
    }, Schema.Struct<{
        readonly type: Schema.Literal<"tool-call">;
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly arguments: Schema.String;
    }> & {
        make: (input: {
            readonly id: string;
            readonly name: string;
            readonly arguments: string;
        }) => ToolCallPart;
    }]>>;
    readonly stopReason: Schema.Literals<readonly ["stop", "length", "tool-calls", "content-filter", "error", "aborted", "unknown"]>;
    readonly responseId: Schema.optional<Schema.String>;
    /**
     * Stored OpenAI reasoning item ids that must be replayed as item references
     * rather than as the reasoning text they stand for.
     */
    readonly itemIds: Schema.optional<Schema.$Array<Schema.String>>;
}>, {}>;
/**
 * One settled model turn, including why it stopped and the provider item
 * ids a continuation has to replay.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare class AssistantMessage extends AssistantMessage_base {
}
declare const ToolMessage_base: Schema.Class<ToolMessage, Schema.Struct<{
    readonly role: Schema.Literal<"tool">;
    readonly content: Schema.$Array<Schema.Struct<{
        readonly type: Schema.Literal<"tool-result">;
        readonly toolCallId: Schema.String;
        readonly content: Schema.String;
        readonly addedToolNames: Schema.$Array<Schema.String>;
    }> & {
        make: (input: {
            readonly toolCallId: string;
            readonly content: string;
            readonly addedToolNames?: ReadonlyArray<string> | undefined;
        }) => ToolResultPart;
    }>;
}>, {}>;
/**
 * The results of the tool calls the previous assistant message asked for.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare class ToolMessage extends ToolMessage_base {
}
/**
 * Any transcript message, tagged by `role`, with the per-role constructors
 * attached.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare const Message: Schema.Union<readonly [typeof UserMessage, typeof AssistantMessage, typeof ToolMessage]> & {
    readonly tag: "role";
    readonly discriminants: readonly ["user", "assistant", "tool"];
    readonly cases: {
        assistant: typeof AssistantMessage;
        tool: typeof ToolMessage;
        user: typeof UserMessage;
    };
    readonly isAnyOf: <const Keys>(keys: readonly Keys[]) => (value: AssistantMessage | ToolMessage | UserMessage) => value is Extract<AssistantMessage, {
        readonly role: Keys;
    }> | Extract<ToolMessage, {
        readonly role: Keys;
    }> | Extract<UserMessage, {
        readonly role: Keys;
    }>;
    readonly guards: {
        assistant: (u: unknown) => u is AssistantMessage;
        tool: (u: unknown) => u is ToolMessage;
        user: (u: unknown) => u is UserMessage;
    };
    readonly match: {
        <Cases extends { [M in typeof UserMessage | typeof AssistantMessage | typeof ToolMessage as M["Type"]["role"]]: (value: M["Type"]) => any; }>(value: AssistantMessage | ToolMessage | UserMessage, cases: Cases): Cases[keyof Cases] extends (value: any) => infer R ? import("effect/Unify").Unify<R> : never;
        <Cases extends { [M in typeof UserMessage | typeof AssistantMessage | typeof ToolMessage as M["Type"]["role"]]: (value: M["Type"]) => any; }>(cases: Cases): (value: AssistantMessage | ToolMessage | UserMessage) => Cases[keyof Cases] extends (value: any) => infer R ? import("effect/Unify").Unify<R> : never;
    };
    readonly matchOrElse: {
        <Cases extends { [M in typeof UserMessage | typeof AssistantMessage | typeof ToolMessage as M["Type"]["role"]]+?: (value: M["Type"]) => any; } & { [K in Exclude<keyof Cases, "assistant" | "tool" | "user">]: never; }, OrElse extends (value: Exclude<AssistantMessage | ToolMessage | UserMessage, { readonly [K in "role"]: keyof Cases; }>) => any>(value: AssistantMessage | ToolMessage | UserMessage, cases: Cases, orElse: OrElse): import("effect/Unify").Unify<{ [K in keyof Cases]-?: NonNullable<Cases[K]> extends (...args: Array<any>) => infer R ? R : never; }[keyof Cases] | ReturnType<OrElse>>;
        <Cases extends { [M in typeof UserMessage | typeof AssistantMessage | typeof ToolMessage as M["Type"]["role"]]+?: (value: M["Type"]) => any; } & { [K in Exclude<keyof Cases, "assistant" | "tool" | "user">]: never; }, OrElse extends (value: Exclude<AssistantMessage | ToolMessage | UserMessage, { readonly [K in "role"]: keyof Cases; }>) => any>(cases: Cases, orElse: OrElse): (value: AssistantMessage | ToolMessage | UserMessage) => import("effect/Unify").Unify<{ [K in keyof Cases]-?: NonNullable<Cases[K]> extends (...args: Array<any>) => infer R ? R : never; }[keyof Cases] | ReturnType<OrElse>>;
    };
} & {
    make: (message: Message) => Message;
    user: (content: string | TextPart | ReadonlyArray<TextPart>) => UserMessage;
    assistant: (content: string | AssistantContentPart | ReadonlyArray<AssistantContentPart>, options?: {
        readonly stopReason?: StopReason | undefined;
        readonly responseId?: string | undefined;
        readonly itemIds?: ReadonlyArray<string> | undefined;
    }) => AssistantMessage;
    tool: (content: ToolResultPart | ReadonlyArray<ToolResultPart>) => ToolMessage;
};
/**
 * The decoded form of {@link Message}.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type Message = typeof Message.Type;
declare const ToolDefinition_base: Schema.Class<ToolDefinition, Schema.Struct<{
    readonly name: Schema.String;
    readonly description: Schema.String;
    readonly parameters: Schema.refine<Schema.JsonObject, Schema.Codec<Schema.Json, Schema.Json, never, never>>;
    /**
     * A lazy tool is wire metadata only: it may never add prompt text,
     * snippets, or guidelines, because changing the prompt prefix would change
     * the sealed-step key of every request that declares it.
     */
    readonly deferred: Schema.optional<Schema.Boolean>;
    readonly loader: Schema.optional<Schema.Boolean>;
}>, {}>;
/**
 * A provider-neutral tool declaration. `parameters` is a JSON Schema object.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare class ToolDefinition extends ToolDefinition_base {
    /** @category constructors @since 0.1.0 */
    static make(input: ToolDefinition | ConstructorParameters<typeof ToolDefinition>[0]): ToolDefinition;
}
/**
 * How much reasoning to spend on a request, in the provider-neutral
 * vocabulary the adapters map onto their own. `max` is the top of the
 * OpenAI Responses scale (the Codex CLI's `model_reasoning_effort = "max"`);
 * the OpenAI lowerings pass it through unchanged.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare const ReasoningEffort: Schema.Literals<readonly ["none", "minimal", "low", "medium", "high", "xhigh", "max"]>;
/**
 * The decoded form of {@link ReasoningEffort}.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type ReasoningEffort = typeof ReasoningEffort.Type;
declare const GenerationParams_base: Schema.Class<GenerationParams, Schema.Struct<{
    readonly maxTokens: Schema.optional<Schema.Finite>;
    readonly temperature: Schema.optional<Schema.Finite>;
    readonly topP: Schema.optional<Schema.Finite>;
    readonly topK: Schema.optional<Schema.Finite>;
    readonly stopSequences: Schema.optional<Schema.$Array<Schema.String>>;
    readonly thinkingBudget: Schema.optional<Schema.Finite>;
    readonly reasoningEffort: Schema.optional<Schema.Literals<readonly ["none", "minimal", "low", "medium", "high", "xhigh", "max"]>>;
}>, {}>;
/**
 * The sampling and budget knobs of one request. Every field is optional; an
 * omitted field leaves the provider default in place, except that the Anthropic
 * Messages lowering sends the model's output ceiling from
 * `ModelCatalog.maxOutputTokensFor`, or `max_tokens: 4096` for a model the
 * catalog has not met, for an omitted `maxTokens`, because that API requires a
 * budget.
 *
 * Dropping a knob is a separate rule from defaulting one. A protocol with no
 * wire field for a stated knob leaves it out of the body, so `topK`,
 * `stopSequences`, and `thinkingBudget` are absent from both OpenAI bodies.
 * Anthropic lowers `reasoningEffort` to `output_config.effort`, clamped to the
 * levels the model accepts, and drops it for a model with no effort control.
 * The stated knobs that fail instead of being dropped are `maxTokens` on the
 * ChatGPT-subscription route, which `Route.prepare` rejects as
 * `invalid_request`, and an Anthropic `thinkingBudget` not below a stated
 * `maxTokens`.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare class GenerationParams extends GenerationParams_base {
    /** @category constructors @since 0.1.0 */
    static make(input?: GenerationParams | ConstructorParameters<typeof GenerationParams>[0]): GenerationParams;
}
/**
 * How the provider may use the declared tools.
 *
 * Only `none` is modelled, because it is the one value the harness declares: a
 * cell-first frame and a legacy landing frame both forbid tool use. It is a
 * declared property of the request — part of the sealed step's key material and
 * readable by any adapter — rather than a wire field. The built-in protocol
 * encoders express the same thing by omitting `tools` altogether, which is what
 * both provider APIs require; neither accepts a tool choice without tools.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare const ToolChoice: Schema.Literal<"none">;
/**
 * How the provider may use the declared tools.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type ToolChoice = typeof ToolChoice.Type;
/**
 * A tool the provider runs itself, inside the model call. `web_search` lets
 * the model search the public web and cite what it found, restricted to
 * `allowedDomains` (each with its subdomains) when set. Unlike a
 * {@link ToolDefinition} no call reaches the caller: the provider runs the
 * search and the model answers with it. A protocol whose provider serves no
 * such tool omits it; OpenAI Responses (API key and ChatGPT plan) serves it.
 *
 * @category models
 * @since 1.0.0
 */
export declare const ServerTool: Schema.Struct<{
    readonly type: Schema.Literal<"web_search">;
    readonly allowedDomains: Schema.optionalKey<Schema.$Array<Schema.NonEmptyString>>;
}>;
/**
 * A provider-run tool.
 *
 * @category models
 * @since 1.0.0
 */
export type ServerTool = typeof ServerTool.Type;
declare const ModelRequest_base: Schema.Class<ModelRequest, Schema.Struct<{
    readonly modelId: Schema.String;
    readonly system: Schema.$Array<Schema.Struct<{
        readonly type: Schema.Literal<"text">;
        readonly text: Schema.String;
    }> & {
        make: (input: {
            readonly text: string;
        }) => SystemPart;
    }>;
    readonly messages: Schema.$Array<Schema.Union<readonly [typeof UserMessage, typeof AssistantMessage, typeof ToolMessage]> & {
        readonly tag: "role";
        readonly discriminants: readonly ["user", "assistant", "tool"];
        readonly cases: {
            assistant: typeof AssistantMessage;
            tool: typeof ToolMessage;
            user: typeof UserMessage;
        };
        readonly isAnyOf: <const Keys>(keys: readonly Keys[]) => (value: AssistantMessage | ToolMessage | UserMessage) => value is Extract<AssistantMessage, {
            readonly role: Keys;
        }> | Extract<ToolMessage, {
            readonly role: Keys;
        }> | Extract<UserMessage, {
            readonly role: Keys;
        }>;
        readonly guards: {
            assistant: (u: unknown) => u is AssistantMessage;
            tool: (u: unknown) => u is ToolMessage;
            user: (u: unknown) => u is UserMessage;
        };
        readonly match: {
            <Cases extends { [M in typeof UserMessage | typeof AssistantMessage | typeof ToolMessage as M["Type"]["role"]]: (value: M["Type"]) => any; }>(value: AssistantMessage | ToolMessage | UserMessage, cases: Cases): Cases[keyof Cases] extends (value: any) => infer R ? import("effect/Unify").Unify<R> : never;
            <Cases extends { [M in typeof UserMessage | typeof AssistantMessage | typeof ToolMessage as M["Type"]["role"]]: (value: M["Type"]) => any; }>(cases: Cases): (value: AssistantMessage | ToolMessage | UserMessage) => Cases[keyof Cases] extends (value: any) => infer R ? import("effect/Unify").Unify<R> : never;
        };
        readonly matchOrElse: {
            <Cases extends { [M in typeof UserMessage | typeof AssistantMessage | typeof ToolMessage as M["Type"]["role"]]+?: (value: M["Type"]) => any; } & { [K in Exclude<keyof Cases, "assistant" | "tool" | "user">]: never; }, OrElse extends (value: Exclude<AssistantMessage | ToolMessage | UserMessage, { readonly [K in "role"]: keyof Cases; }>) => any>(value: AssistantMessage | ToolMessage | UserMessage, cases: Cases, orElse: OrElse): import("effect/Unify").Unify<{ [K in keyof Cases]-?: NonNullable<Cases[K]> extends (...args: Array<any>) => infer R ? R : never; }[keyof Cases] | ReturnType<OrElse>>;
            <Cases extends { [M in typeof UserMessage | typeof AssistantMessage | typeof ToolMessage as M["Type"]["role"]]+?: (value: M["Type"]) => any; } & { [K in Exclude<keyof Cases, "assistant" | "tool" | "user">]: never; }, OrElse extends (value: Exclude<AssistantMessage | ToolMessage | UserMessage, { readonly [K in "role"]: keyof Cases; }>) => any>(cases: Cases, orElse: OrElse): (value: AssistantMessage | ToolMessage | UserMessage) => import("effect/Unify").Unify<{ [K in keyof Cases]-?: NonNullable<Cases[K]> extends (...args: Array<any>) => infer R ? R : never; }[keyof Cases] | ReturnType<OrElse>>;
        };
    } & {
        make: (message: Message) => Message;
        user: (content: string | TextPart | ReadonlyArray<TextPart>) => UserMessage;
        assistant: (content: string | AssistantContentPart | ReadonlyArray<AssistantContentPart>, options?: {
            readonly stopReason?: StopReason | undefined;
            readonly responseId?: string | undefined;
            readonly itemIds?: ReadonlyArray<string> | undefined;
        }) => AssistantMessage;
        tool: (content: ToolResultPart | ReadonlyArray<ToolResultPart>) => ToolMessage;
    }>;
    readonly tools: Schema.$Array<typeof ToolDefinition>;
    readonly params: typeof GenerationParams;
    readonly toolChoice: Schema.optional<Schema.Literal<"none">>;
    /**
     * The conversation this request continues, for providers that route by it.
     *
     * A prefix cache is per machine, so a provider that spreads one
     * conversation's requests across machines re-reads the whole prefix at full
     * price on most of them. OpenAI Responses sends this as `prompt_cache_key`,
     * and the ChatGPT-plan backend also as the `session-id` header its cache
     * affinity is derived from. It must be stable for every request that
     * shares a prefix, and it never reaches the model. Protocols without such a
     * field ignore it.
     */
    readonly cacheKey: Schema.optional<Schema.String>;
    /**
     * How many leading messages the next request in this conversation repeats
     * unchanged; unset means all of them.
     *
     * Anthropic Messages caches only at explicit breakpoints and reads a prior
     * entry only where a previous request wrote one, so it puts its moving
     * message breakpoint on the last of these messages. A caller that appends a
     * volatile block after its transcript sets this to the transcript length so
     * the breakpoint never lands on bytes the next request will not repeat.
     * Protocols that cache automatically ignore it, and it never reaches the
     * model.
     */
    readonly cacheBoundary: Schema.optional<Schema.Int>;
    /**
     * Provider-run tools the model may use in this call. They are not declared
     * tools, so `toolChoice: "none"` does not remove them: a cell-first frame
     * still forbids function calls while its model may search. Unset or empty
     * leaves the request as it was.
     */
    readonly serverTools: Schema.optional<Schema.$Array<Schema.Struct<{
        readonly type: Schema.Literal<"web_search">;
        readonly allowedDomains: Schema.optionalKey<Schema.$Array<Schema.NonEmptyString>>;
    }>>>;
}>, {}>;
/**
 * The declaration order below is load-bearing: it is the stable step-key
 * serialization order for a sealed model step.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare class ModelRequest extends ModelRequest_base {
    /** @category constructors @since 0.1.0 */
    static make(input: ModelRequest | ConstructorParameters<typeof ModelRequest>[0]): ModelRequest;
}
export {};
