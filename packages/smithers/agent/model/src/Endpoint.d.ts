/**
 * The credential-free HTTP target of a model route, and its validation.
 * An endpoint is public data: it is part of a sealed step's key material, so
 * nothing secret may appear in it.
 *
 * @since 0.1.0
 */
import * as Result from "effect/Result";
import { ModelError } from "./ModelError.ts";
/**
 * The public, credential-free HTTP target of a model route.
 *
 * @since 0.1.0
 * @category models
 * @slop
 */
export interface Endpoint {
    readonly method: "POST";
    readonly url: string;
    readonly query: ReadonlyArray<readonly [string, string]>;
}
/**
 * Input used to construct a deterministic route endpoint.
 *
 * @since 0.1.0
 * @category models
 * @slop
 */
export interface MakeOptions {
    readonly url: string;
    readonly path?: string;
    readonly query?: ReadonlyArray<readonly [string, string]> | Readonly<Record<string, string>>;
}
/**
 * Constructs a validated POST endpoint. Query pairs are sorted so both the
 * wire target and the sealed request view remain deterministic.
 *
 * Embedded URL credentials and credential-looking query parameters are
 * rejected because endpoint values are public route identity.
 *
 * @since 0.1.0
 * @category constructors
 * @slop
 */
export declare const make: (input: MakeOptions) => Result.Result<Endpoint, ModelError>;
/**
 * Renders an endpoint to the exact deterministic HTTP URL.
 *
 * @since 0.1.0
 * @category formatting
 * @slop
 */
export declare const render: (endpoint: Endpoint) => string;
/**
 * The origin of every provider a Smithers Cloud model proxy can front.
 * OpenRouter's origin carries its `/api` prefix, so the proxy segment replaces
 * `https://openrouter.ai/api` whole.
 *
 * @since 1.0.0-rc.1
 * @category constants
 */
export declare const providerOrigins: {
    readonly anthropic: "https://api.anthropic.com";
    readonly openai: "https://api.openai.com";
    readonly cerebras: "https://api.cerebras.ai";
    readonly openrouter: "https://openrouter.ai/api";
    readonly vercel: "https://ai-gateway.vercel.sh";
    /** The ChatGPT-subscription backend (`OpenAIChatGPT.defaultBaseUrl`). */
    readonly chatgpt: "https://chatgpt.com/backend-api";
};
/**
 * A provider {@link providerOrigins} names.
 *
 * @since 1.0.0-rc.1
 * @category models
 */
export type ProxiedProvider = keyof typeof providerOrigins;
/**
 * The variable naming a metered model proxy, such as Smithers Cloud's
 * `{base}/api/model`.
 *
 * @since 1.0.0-rc.1
 * @category constants
 */
export declare const modelProxyVariable = "SMITHERS_MODEL_PROXY_URL";
/**
 * The variable limiting {@link modelProxyVariable} to the comma-separated
 * providers it serves, such as `anthropic,vercel`. Unset, the proxy serves
 * every provider; set, a provider it omits keeps its own origin, so a key the
 * guest holds for that provider never reaches the proxy.
 *
 * @since 1.0.0-rc.1
 * @category constants
 */
export declare const modelProxyProvidersVariable = "SMITHERS_MODEL_PROXY_PROVIDERS";
/**
 * The metered proxy's origin for `provider`, or `undefined` when no proxy is
 * set or {@link modelProxyProvidersVariable} leaves `provider` out.
 *
 * @since 1.0.0-rc.1
 * @category getters
 */
export declare const proxyOrigin: (provider: string, environment: Readonly<Record<string, string | undefined>>) => string | undefined;
/**
 * The origin a request to `provider` goes to: the metered proxy's
 * ({@link proxyOrigin}) when it serves `provider`, otherwise the provider's
 * own origin.
 *
 * @since 1.0.0-rc.1
 * @category getters
 */
export declare const providerOrigin: (provider: ProxiedProvider, environment: Readonly<Record<string, string | undefined>>) => string;
