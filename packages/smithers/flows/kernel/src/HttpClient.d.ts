/**
 * Permission-aware outgoing HTTP requests.
 *
 * There is no kernel `HttpClient` interface and no kernel `HttpClient` tag.
 * Effect owns both, and its tag fixes the error channel to `HttpClientError`,
 * so this module is only the middleware: a `Layer` over Effect's own tag that
 * reads the raw client out of context and returns a guarded one in its place.
 * Permission failures are projected into `HttpClientError` by
 * {@link toHttpClientError}, which keeps the structured kernel failure on the
 * transport reason's `cause` so {@link fromHttpClientError} can hand it back.
 *
 * **Redirects.** A redirect is a second network destination, so it needs a
 * second grant check. Two halves guarantee that:
 *
 *  1. The client below this layer must **not** follow redirects on its own.
 *     That is a precondition on the host: Undici without a redirect
 *     interceptor, or Effect's fetch layer with `redirect: "manual"`. This
 *     layer also forces `RequestInit { redirect: "manual" }` over the ambient
 *     value for every request it executes, so a plain `FetchHttpClient.layer`,
 *     which follows redirects by default, cannot walk to another origin below
 *     the guard either. A custom client that ignores `RequestInit` must meet
 *     the precondition itself.
 *  2. This layer composes Effect's own `HttpClient.followRedirects` *above*
 *     the guard. That combinator re-enters `postprocess` for every hop, and
 *     `postprocess` is the guarded one, so hop *n* is checked exactly like hop
 *     zero and an authorized origin cannot lend its grant to another.
 *     A caller that sets `FetchHttpClient.RequestInit.redirect` to `manual`
 *     receives one guarded hop and owns any further redirect requests itself.
 *
 * Governing design:
 * `docs/specs/Concepts/Permission Kernel.md`,
 * `docs/specs/Concepts/Effect Taxonomy.md`, and
 * `docs/specs/Concepts/Host Adapters.md`.
 *
 * @since 1.0.0-rc.0
 */
import { type PermissionError, type PermissionErrorPayload } from "@smthrs/capability/Permission";
import { Context, Effect, Layer, Option } from "effect";
import * as EffectHttpClient from "effect/http/HttpClient";
import * as HttpClientError from "effect/http/HttpClientError";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import { GrantStore } from "./GrantStore.ts";
/**
 * Effect's own outgoing HTTP client tag, unchanged. Re-exported so the kernel
 * namespace stays one-stop; it is the *same* tag, never a second one.
 *
 * @category services
 * @since 1.0.0-rc.0
 */
export { HttpClient } from "effect/http/HttpClient";
/**
 * Constructs a client from a low-level request runner, keeping Effect's own
 * URL construction, tracing, header redaction, and interruption behavior.
 *
 * @category constructors
 * @since 1.0.0-rc.0
 */
export { make } from "effect/http/HttpClient";
/**
 * The model identity an outgoing request is made on behalf of, if any.
 *
 * A model call is not a general `net:*` effect: the same host answers many
 * models, and a grant for one must not be a grant for the rest. Effect's tag
 * has no room for an extra method, so the intent rides on a `Context`
 * reference instead — set it with {@link withModelCall} and the decorator asks
 * for `model:call` rather than `net:get`/`net:post`.
 *
 * @category references
 * @since 1.0.0-rc.0
 */
export declare const ModelCall: Context.Reference<string | undefined>;
/**
 * Runs `effect` with every outgoing request in it checked as a `model:call` on
 * `modelId` instead of as plain network access.
 *
 * @category references
 * @since 1.0.0-rc.0
 */
export declare const withModelCall: (modelId: string) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
/**
 * Projects a permission failure into the error channel Effect's `HttpClient`
 * tag fixes.
 *
 * Nothing is lost: the reason is always a `TransportError` — the request did
 * not leave the host because the capability kernel refused, suspended, or
 * could not decide it — `description` carries the human rendering from
 * `Permission.formatError`, and `cause` carries the structured failure itself,
 * so {@link fromHttpClientError} hands the attended surface back the original
 * `capability`, `tier`, `requestId`, and `reason`.
 *
 * @category constructors
 * @since 1.0.0-rc.0
 */
export declare const toHttpClientError: (options: {
    readonly request: HttpClientRequest.HttpClientRequest;
    readonly error: PermissionError;
}) => HttpClientError.HttpClientError;
/**
 * Recovers the structured permission failure a {@link toHttpClientError}
 * projection carries, so an attended surface can still reply to the request
 * and an unattended report can still name the capability.
 *
 * Recovery validates data fields and the transport reason tag, not origin or
 * class operations. Establish producer or request identity separately across
 * a trust boundary.
 *
 * @category refinements
 * @since 1.0.0-rc.0
 */
export declare const fromHttpClientError: (error: HttpClientError.HttpClientError) => Option.Option<PermissionErrorPayload>;
/**
 * Constructs an unavailable HTTP client stub.
 *
 * Every request reports the missing host as a `TransportError` naming the
 * request, so an unconfigured capability answers rather than vanishing.
 *
 * @category constructors
 * @since 1.0.0-rc.0
 */
export declare const makeNoop: () => EffectHttpClient.HttpClient;
/**
 * Provides an unavailable HTTP client stub.
 *
 * @category layers
 * @since 1.0.0-rc.0
 */
export declare const layerNoop: () => Layer.Layer<EffectHttpClient.HttpClient>;
/**
 * Authorizes a request before a caller performs network preflight work such as
 * DNS. The guarded transport consumes the same admission once, so a one-shot
 * grant is not spent twice. Admissions match both store identity and the exact
 * capability; redirects and retries require their own authorization.
 *
 * @category authorization
 * @since 1.0.0
 */
export declare const authorizePreflight: <A, E, R>(request: HttpClientRequest.HttpClientRequest, effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | HttpClientError.HttpClientError, R | GrantStore>;
/**
 * Decorates the HTTP client in place with a `net:get`/`net:post`/`model:call`
 * capability check, then follows redirects *through* that check.
 *
 * The layer provides the tag it also requires: compose it over a host client
 * layer with `Layer.provide` and a consumer that never heard of the kernel is
 * guarded too. Because every hop re-enters the guarded `postprocess`, an
 * authorized first URL that redirects to an unauthorized one is denied at the
 * second hop instead of being fetched.
 *
 * @category layers
 * @since 1.0.0-rc.0
 */
export declare const layer: Layer.Layer<EffectHttpClient.HttpClient, never, EffectHttpClient.HttpClient | GrantStore>;
/**
 * Address snapshot authorized for one web request. Host transports must reject
 * a different origin and use only these addresses for every connection attempt.
 * Ordinary model traffic leaves this reference unset.
 * @category references
 * @since 1.0.0
 */
export declare const Destination: Context.Reference<{
    readonly origin: string;
    readonly addresses: ReadonlyArray<string>;
} | undefined>;
/**
 * Marks a trusted transport that enforces Destination on every connection.
 * The assertion belongs to this client instance, not ambient context. A
 * replacement client must establish its own transport guarantee.
 * @category constructors
 * @since 1.0.0
 */
export declare const withDestinationPinning: <A extends EffectHttpClient.HttpClient>(client: A) => A;
/**
 * Whether this exact client implements the Destination transport contract.
 * @category predicates
 * @since 1.0.0
 */
export declare const supportsDestinationPinning: (client: EffectHttpClient.HttpClient) => boolean;
