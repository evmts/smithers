/**
 * Executes provider requests with bounded retries, quota classification, and
 * credential-safe diagnostics.
 *
 * One call makes at most three attempts by default (the first plus
 * `MAX_RETRIES`, or the `maxRetries` its executor was built with), with a
 * 500 ms exponential base, a 10 s cap on that computed delay, and a 60 s total
 * retry budget. `Retry-After` replaces the computed delay without jitter and
 * is slept in full, so no retry reaches the provider before it said it would
 * accept one. A provider wait beyond the total budget is surfaced to the
 * caller intact instead of being slept inside the executor.
 *
 * @since 0.1.0
 */
import type * as Permission from "@smthrs/capability/Permission";
import * as KernelHttpClient from "@smthrs/kernel/HttpClient";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import type * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import type * as Scope from "effect/Scope";
import { ModelError } from "./ModelError.ts";
/**
 * Captures the signed request and current header policy for response-stream
 * failures, including protocol errors delivered over HTTP 200.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const errorSanitizer: (request: HttpClientRequest.HttpClientRequest) => Effect.Effect<(error: ModelError) => ModelError>;
/**
 * Protocol-specific classification for a failed HTTP response.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type ErrorClassifier = (status: number, body: string) => ModelError;
/**
 * Per-request execution policy supplied by the composed route.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface ExecuteOptions {
    readonly modelId: string;
    readonly classifyError?: ErrorClassifier | undefined;
    /**
     * Told of each HTTP try as it is handed to the client, and again if it
     * fails. A retry inside `execute` is otherwise invisible to the caller: one
     * slow call and two tries with a wait between them return the same response.
     * Observation only; it cannot change what is sent or what is retried.
     */
    readonly onTry?: ((event: TryEvent) => void) | undefined;
}
/**
 * One HTTP try of a call as the executor saw it. Instants are epoch
 * milliseconds on the executor's `Clock`.
 *
 * `sent` is the moment the request is handed to the HTTP client, after any
 * retry wait and any client rebuild: the client reports nothing between that
 * and the response's status line. `failed` carries the try's own `sentAt`, the
 * failure's `code` (a `ModelError` code or a kernel permission code) and the
 * HTTP status when a response carried one. The try whose response `execute`
 * returns reports `sent` alone, and so does a try that was interrupted.
 *
 * @category models
 * @since 1.0.0
 */
export type TryEvent = {
    readonly type: "sent";
    readonly at: number;
} | {
    readonly type: "failed";
    readonly sentAt: number;
    readonly at: number;
    readonly code: string;
    readonly httpStatus?: number | undefined;
};
/**
 * Failures from provider execution. Kernel permission failures retain their
 * original classes and suspension metadata across the model boundary.
 *
 * @category errors
 * @since 0.1.0
 * @slop
 */
export type RequestError = ModelError | Permission.PermissionRequired | Permission.PermissionDenied | Permission.GrantStoreError;
/**
 * How many consecutive transport failures replace the client.
 *
 * A retry ladder assumes waiting repairs the failure, and for a rate limit or a
 * 5xx it does. For a *transport* failure it sometimes does not: an HTTP/2
 * session the peer has destroyed stays destroyed, and every attempt that reuses
 * the connection pool holding it fails the same way however long the ladder
 * waits between them. r92 of the SWE-bench full benchmark is the measurement —
 * ten `transport` retries across two instances, roughly half a minute of
 * jittered backoff each, and both runs died anyway against a socket that never
 * came back.
 *
 * Three is where waiting has stopped being the explanation. It is exactly what
 * one `execute` spends when every attempt fails on the transport — the first
 * attempt plus `MAX_RETRIES` — so no attempt inside a request ever runs on a
 * client the request itself discarded, and the replacement lands on the first
 * rung of the *outer* ladder, the sealed model step's, which is where a socket
 * that is genuinely dead first shows itself. A single request cannot both
 * throw away a connection pool and go on using the replacement, and a request
 * that fails on anything other than the transport leaves the pool alone.
 *
 * The counter is about the transport, which every request in the process
 * shares, so it is shared too. Any success resets it: a client that answers is
 * a client that works.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const rebuildAfter = 3;
/**
 * The client an executor runs on, and the host's way of replacing it.
 *
 * Two fields rather than a factory called twice, because the first client is
 * usually a resource somebody else already built — the layer's own — and only
 * the replacement has to be made on demand. A host with nothing to rebuild says
 * so with {@link fixed}, and its executor behaves exactly as it did before this
 * existed.
 *
 * What a rebuild *means* is the host's business and deliberately not this
 * module's: on Node it is a fresh Undici `Agent`, which is a fresh connection
 * pool; in a browser there is no pool to replace and `fixed` is the honest
 * answer.
 *
 * @category models
 * @since 0.1.0
 */
export interface Transport {
    /** The client every request goes through until a rebuild replaces it. */
    readonly client: KernelHttpClient.HttpClient;
    /**
     * Builds a replacement, called after {@link rebuildAfter} consecutive
     * transport failures and before the attempt that follows them.
     */
    readonly rebuild: Effect.Effect<KernelHttpClient.HttpClient>;
}
/**
 * A transport with nothing behind it to replace: every rebuild answers the same
 * client.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const fixed: (client: KernelHttpClient.HttpClient) => Transport;
/**
 * What an executor is built with, fixed for every request it makes.
 *
 * @category models
 * @since 0.1.0
 */
export interface MakeOptions {
    /**
     * Retries after the first attempt. Defaults to 2; 0 makes `execute` a single
     * attempt, which is what a probe of a route wants. Negative counts are 0 and
     * a count that is not a finite number is the default.
     */
    readonly maxRetries?: number | undefined;
    /**
     * Milliseconds an attempt may wait for its response to start: the status
     * line and headers, not the body. Defaults to {@link defaultResponseStartMs};
     * 0 disarms it.
     */
    readonly responseStartMs?: number | undefined;
}
/**
 * How long an attempt may wait for the provider to start answering.
 *
 * A reasoning model streams nothing while it thinks, so no bound on the gap
 * between body chunks is safe: a direct probe of the ChatGPT backend on
 * 2026-09-22 went 5.3 s between chunks on one short proof, and a longer one
 * goes minutes. The response itself starts at once: the same probes had
 * headers at 0.9 s and 3.3 s, followed by `response.created` within 30 ms.
 * A request the backend accepted and never answered held a TUI turn silent
 * for the whole 300 s model-call budget (`CellTurn.defaultModelCallMs`)
 * before the retry that then answered immediately. Sixty seconds is about
 * eighteen times the slowest start measured, and a stall fails as `transport`,
 * so it is retried and counts toward replacing the connection pool.
 *
 * Undici bounds the same wait itself (`headersTimeout`, 300 s by default);
 * Bun's fetch, which a Bun host uses because Undici's pool does not run
 * there, bounds nothing.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const defaultResponseStartMs = 60000;
/**
 * Scoped provider request executor.
 *
 * The caller's scope owns the successful response body and aborts its transport
 * when that scope closes.
 *
 * @category services
 * @since 0.1.0
 * @slop
 */
export interface RequestExecutor {
    readonly execute: (request: HttpClientRequest.HttpClientRequest, options: ExecuteOptions) => Effect.Effect<HttpClientResponse.HttpClientResponse, RequestError, Scope.Scope>;
}
/**
 * Service tag for the provider request executor.
 *
 * @category services
 * @since 0.1.0
 * @slop
 */
export declare const RequestExecutor: Context.Service<RequestExecutor, RequestExecutor>;
/**
 * Builds a request executor over a transport it may replace.
 *
 * The replacement is the rung the retry ladder did not have. Everything above
 * it — this module's own bounded retry, and the sealed model step's jittered
 * ladder in `@smthrs/agent` — repairs a failure by waiting, and a destroyed
 * session is the failure waiting does not repair. After
 * {@link rebuildAfter} consecutive transport failures the next attempt is made
 * on a client the host built fresh, and the counter starts again.
 *
 * The counter lives in this closure rather than in a request, because what it
 * counts is a property of the client and not of any one call: the run that
 * motivated it made ten attempts across two ladders and one dead socket.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const makeWith: (transport: Transport, options?: MakeOptions) => Effect.Effect<RequestExecutor>;
/**
 * Builds a request executor around the permission-aware kernel HTTP client.
 *
 * The client in context is the only one there is, so a rebuild answers with it
 * unchanged. A host that can build a second one — a Node process, whose
 * connection pool is a value it owns — passes {@link makeWith} a transport that
 * says so.
 *
 * @category constructors
 * @since 0.1.0
 * @slop
 */
export declare const make: Effect.Effect<RequestExecutor, never, KernelHttpClient.HttpClient>;
/**
 * Provides the request executor, requiring the kernel HTTP client.
 *
 * @category layers
 * @since 0.1.0
 * @slop
 */
export declare const layer: Layer.Layer<RequestExecutor, never, KernelHttpClient.HttpClient>;
