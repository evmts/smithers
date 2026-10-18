/**
 * Names the native engine dispatch each model call runs under on requests to
 * the install's metered model proxy (`SMITHERS_MODEL_PROXY_URL`), so the
 * install prices every monitor step from the proxy's own rows (T-FLW-07).
 *
 * The header is applied as a request leaves: it never enters a prepared
 * request or a sealed-step key, so a replay is served the same step. Requests
 * to any other origin, and calls outside an engine dispatch, are unchanged.
 *
 * @since 1.0.0
 */
import type * as RequestExecutor from "@smthrs/model/RequestExecutor";
import { Effect } from "effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
/**
 * The proxy reads this header only from a flow host credential.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const header = "X-Smithers-Native-Step";
/**
 * `<execution id>:<step key digest>` of the dispatch running now, when there
 * is one. The digest is the engine's own `stepKeyDigest` for the invocation.
 *
 * @category getters
 * @since 1.0.0
 */
export declare const currentDispatch: Effect.Effect<string | undefined>;
/**
 * `request`, naming the current dispatch when it goes to `proxy`.
 *
 * @category combinators
 * @since 1.0.0
 */
export declare const attributeRequest: (request: HttpClientRequest.HttpClientRequest, proxy: string | undefined) => Effect.Effect<HttpClientRequest.HttpClientRequest>;
/**
 * `executor`, naming the current dispatch on every request to `proxy`.
 *
 * @category combinators
 * @since 1.0.0
 */
export declare const attributeExecutor: (executor: RequestExecutor.RequestExecutor, proxy: string | undefined) => RequestExecutor.RequestExecutor;
/**
 * `client`, naming the current dispatch on every request to `proxy`.
 *
 * @category combinators
 * @since 1.0.0
 */
export declare const attributeClient: <E, R>(client: HttpClient.HttpClient.With<E, R>, proxy: string | undefined) => HttpClient.HttpClient.With<E, R>;
