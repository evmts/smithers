/**
 * A resolved model route: an endpoint, a protocol, a framing, and the
 * credentials to authorize with. Preparing a route yields a credential-free
 * request that can enter a sealed step's key material, with the secret
 * applied only as the request leaves.
 *
 * @since 0.1.0
 */
import { Effect, Layer, Result } from "effect";
import * as AnthropicMessages from "./AnthropicMessages.ts";
import * as Auth from "./Auth.ts";
import * as Endpoint from "./Endpoint.ts";
import * as Framing from "./Framing.ts";
import * as Model from "./Model.ts";
import { ModelError } from "./ModelError.ts";
import { type ModelRequest } from "./ModelRequest.ts";
import * as OpenAIChatCompletions from "./OpenAIChatCompletions.ts";
import * as OpenAIResponses from "./OpenAIResponses.ts";
import type * as Protocol from "./Protocol.ts";
import * as RequestExecutor from "./RequestExecutor.ts";
/**
 * The credential-free representation used to construct a sealed model step.
 * This view, including the canonical body bytes, is what the engine digests
 * into the sealed-step key when it services `EngineLike.sealStep`
 * (`packages/smithers/agent/harness/src/EngineLike.ts`).
 * Credentials are signed onto a copy afterwards and never enter this value.
 *
 * @since 0.1.0
 * @category models
 * @slop
 */
export interface PreparedRequest {
    readonly routeId: string;
    readonly protocolId: string;
    readonly method: "POST";
    readonly url: string;
    readonly publicHeaders: Readonly<Record<string, string>>;
    readonly body: Uint8Array;
    readonly bodyText: string;
}
/**
 * The deployment-specific pieces which compose a protocol into a model route.
 *
 * @since 0.1.0
 * @category models
 * @slop
 */
export interface Config<Body, Frame, Event, State> {
    readonly id: string;
    /** OpenTelemetry provider name; independent of route identity and wire protocol. */
    readonly providerName: string;
    readonly protocol: Protocol.Protocol<Body, Frame, Event, State>;
    readonly endpoint: Endpoint.Endpoint;
    readonly auth: Auth.Auth;
    readonly framing: Framing.Framing<Frame>;
    readonly headers?: Readonly<Record<string, string>>;
}
/**
 * A configured, but not yet authenticated, protocol route.
 *
 * @since 0.1.0
 * @category models
 * @slop
 */
export type Route<Body, Frame, Event, State> = Config<Body, Frame, Event, State>;
/**
 * Compiles a request exactly once into its credential-free sealed-step view.
 *
 * @since 0.1.0
 * @category constructors
 * @slop
 */
export declare const prepare: <Body, Frame, Event, State>(route: Route<Body, Frame, Event, State>, request: ModelRequest) => Effect.Effect<PreparedRequest, ModelError>;
/**
 * Composes Protocol × Endpoint × Auth × Framing into a route value.
 *
 * @since 0.1.0
 * @category constructors
 * @slop
 */
export declare const make: <Body, Frame, Event, State>(config: Config<Body, Frame, Event, State>) => Route<Body, Frame, Event, State>;
/**
 * Builds a `Model` implementation from a composed route.
 *
 * @since 0.1.0
 * @category constructors
 * @slop
 */
export declare const toModel: <Body, Frame, Event, State>(config: Config<Body, Frame, Event, State>) => Effect.Effect<Model.Model, never, RequestExecutor.RequestExecutor>;
/**
 * Provides a configured route as the `Model` service.
 *
 * @since 0.1.0
 * @category layers
 * @slop
 */
export declare const layer: <Body, Frame, Event, State>(config: Config<Body, Frame, Event, State>) => Layer.Layer<Model.Model, never, RequestExecutor.RequestExecutor>;
/**
 * Creates Anthropic's Messages deployment configuration.
 *
 * @since 0.1.0
 * @category constructors
 * @slop
 */
export declare const anthropic: (input: {
    readonly apiKey?: Auth.Redacted<string> | undefined;
    /** The origin, `Endpoint.providerOrigins` by default; see `Endpoint.providerOrigin`. */
    readonly baseUrl?: string | undefined;
}) => Result.Result<Route<AnthropicMessages.Body, string, Parameters<typeof AnthropicMessages.protocol.stream.step>[1], ReturnType<typeof AnthropicMessages.protocol.stream.initial>>, ModelError>;
/**
 * Creates OpenAI's Responses deployment configuration.
 *
 * @since 0.1.0
 * @category constructors
 * @slop
 */
export declare const openai: (input: {
    readonly apiKey: Auth.Redacted<string>;
    /** The origin, `Endpoint.providerOrigins` by default; see `Endpoint.providerOrigin`. */
    readonly baseUrl?: string | undefined;
}) => Result.Result<Route<OpenAIResponses.Body, string, Parameters<typeof OpenAIResponses.protocol.stream.step>[1], ReturnType<typeof OpenAIResponses.protocol.stream.initial>>, ModelError>;
/**
 * Creates a route for a provider that serves the OpenAI **Responses** API
 * without OpenAI's native deferred-tool extensions.
 *
 * `baseUrl` is the provider origin and this constructor appends
 * `/v1/responses` itself, so one origin can only ever produce one URL:
 * `https://openrouter.ai/api` becomes
 * `https://openrouter.ai/api/v1/responses`. A trailing slash is accepted.
 *
 * Responses and Chat Completions are different wire shapes. `api.openai.com`
 * and OpenRouter's `/v1/responses` serve Responses; Ollama, Gemini's
 * compatibility layer, Cerebras and most other self-hosted or third-party
 * "OpenAI-compatible" servers serve Chat Completions and need
 * {@link openaiChatCompatible} instead.
 *
 * @since 0.1.0
 * @category constructors
 */
export declare const openaiResponsesCompatible: (input: {
    readonly id: string;
    readonly providerName: string;
    readonly baseUrl: string;
    readonly apiKey: Auth.Redacted<string>;
    readonly headers?: Readonly<Record<string, string>>;
}) => Result.Result<Route<OpenAIResponses.Body, string, Parameters<typeof OpenAIResponses.protocol.stream.step>[1], ReturnType<typeof OpenAIResponses.protocol.stream.initial>>, ModelError>;
/**
 * Creates a route for a provider that serves the OpenAI **Chat Completions**
 * API: Ollama, Gemini's OpenAI-compatibility layer, Cerebras, and most other
 * self-hosted or third-party "OpenAI-compatible" servers.
 *
 * `baseUrl` is the provider origin and `path` defaults to
 * `/v1/chat/completions`. Providers with a different compatible endpoint,
 * such as Gemini, pass their exact path explicitly.
 *
 * `apiKey` may be a non-empty placeholder for a server that does not check it
 * (Ollama ignores its `Authorization` header entirely); {@link Auth.bearer}
 * only rejects an empty credential. `structuredOutput` behaves exactly as it
 * does on this route.
 *
 * @since 0.1.0
 * @category constructors
 */
export declare const openaiChatCompatible: (input: {
    readonly id: string;
    readonly providerName: string;
    readonly baseUrl: string;
    readonly path?: string | undefined;
    readonly apiKey: Auth.Redacted<string>;
    readonly structuredOutput?: OpenAIChatCompletions.StructuredOutput | undefined;
}) => Result.Result<Route<OpenAIChatCompletions.Body, string, Parameters<typeof OpenAIChatCompletions.protocol.stream.step>[1], ReturnType<typeof OpenAIChatCompletions.protocol.stream.initial>>, ModelError>;
