/**
 * A server-side proxy for Electric shape requests, as an `effect/http`
 * handler.
 *
 * A browser that syncs with Electric should reach it through your own server,
 * so Electric's URL and secret stay there and the server, not the browser,
 * decides what a request may read. `make` returns a handler for one shape.
 * Mount it on a route such as `GET /api/shapes/items`. It:
 *
 * - forwards only the Electric client's protocol parameters, so a browser
 *   can follow the shape but not change it;
 * - sets the table, and optionally a `where` and its `params`, from the host;
 * - drops every other parameter, subset requests' (`subset__*`) included, so
 *   a browser reads the whole shape or nothing;
 * - adds Electric's `secret` and Electric Cloud's `source_id`;
 * - records one span, one log line and one count per request with plain
 *   Effect, so the host's own logger, tracer and metric exporters pick them up.
 *
 * @since 0.1.0
 */

import * as Clock from "effect/Clock"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpServerRequest from "effect/http/HttpServerRequest"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import * as Metric from "effect/Metric"
import * as Option from "effect/Option"
import type * as Redacted from "effect/Redacted"
import * as Stream from "effect/Stream"

/**
 * Where Electric is, and the credentials the proxy adds to every request.
 * `url` is Electric's origin; the proxy calls its `/v1/shape`.
 *
 * @category models
 * @since 0.1.0
 */
export interface Connection {
  readonly url: string
  /** Electric's secret, sent as `secret`. */
  readonly secret?: Redacted.Redacted<string> | undefined
  /** Electric Cloud's source id, sent as `source_id`. */
  readonly sourceId?: string | undefined
}

/**
 * The shape every request reads, chosen by the host. `where` and `params`
 * narrow it for every request, for example to one account's rows.
 *
 * @category models
 * @since 0.1.0
 */
export interface Shape {
  readonly table: string
  readonly where?: string | undefined
  /** The values of `where`'s `$1`, `$2`, ... placeholders, keyed `"1"`, `"2"`, ... */
  readonly params?: Readonly<Record<string, string>> | undefined
}

/**
 * Everything `make` needs: Electric's connection, the shape, and optionally
 * the name of its span and log line (default `electric.shape`) and the
 * counter it updates (default `electric_shape_requests`).
 *
 * @category models
 * @since 0.1.0
 */
export interface Options extends Connection {
  readonly shape: Shape
  readonly name?: string | undefined
  readonly metric?: Metric.Counter<number> | undefined
}

// How a request ended: its response sent in full; `aborted` by the browser, before Electric answered (status 499) or
// mid-body; or `failed` reading Electric's body.
type Outcome = "complete" | "aborted" | "failed"

// The Electric client's protocol parameters: the only browser parameters the proxy forwards. Every other one is
// dropped, a subset request's `subset__*` included.
const protocolParameters: ReadonlyArray<string> = [
  "offset",
  "handle",
  "live",
  "live_sse",
  "experimental_live_sse",
  "cursor",
  "expired_handle",
  "log",
  "cache-buster"
]

/**
 * The counter `make` updates when `Options.metric` is omitted:
 * `electric_shape_requests`, by `status` and `live`.
 *
 * @category observability
 * @since 0.1.0
 */
export const defaultMetric: Metric.Counter<number> = Metric.counter("electric_shape_requests", {
  description: "Electric shape requests the proxy answered, by status and live",
  incremental: true
})

/**
 * Reads Electric's connection from `ELECTRIC_URL`, `ELECTRIC_SECRET` (as a
 * redacted value) and `ELECTRIC_SOURCE_ID`. `url` is the default for
 * `ELECTRIC_URL`; without one, `ELECTRIC_URL` is required.
 *
 * @category configuration
 * @since 0.1.0
 */
export const config = (options: { readonly url?: string } = {}): Config.Config<Connection> =>
  Config.all({
    url: options.url === undefined
      ? Config.String("ELECTRIC_URL")
      : Config.String("ELECTRIC_URL").pipe(Config.withDefault(options.url)),
    secret: Config.option(Config.Redacted("ELECTRIC_SECRET")),
    sourceId: Config.option(Config.String("ELECTRIC_SOURCE_ID"))
  }).pipe(Config.map(({ url, secret, sourceId }) => ({
    url,
    secret: Option.getOrUndefined(secret),
    sourceId: Option.getOrUndefined(sourceId)
  })))

/**
 * Electric's headers that aren't passed on: `fetch` has already decoded the
 * body, so its encoding and length no longer hold, and the proxy is the
 * browser's own origin, so Electric's CORS headers would only open it to
 * other sites.
 */
const dropped = (name: string) =>
  name === "content-encoding" || name === "content-length" || name.startsWith("access-control-")

/**
 * The handler for one shape. Requires the `HttpServerRequest` it answers and
 * the `HttpClient` it calls Electric with.
 *
 * - `GET` only; another method is 405.
 * - The browser's parameters outside the Electric client's protocol are
 *   dropped, never forwarded: the shape's own (`table`, `where`, `params`,
 *   `columns`, `replica`), the credentials, and a subset request's
 *   `subset__*`.
 * - Electric unreachable is 502. Otherwise Electric's status, headers and body
 *   stream back.
 *
 * Each request records one span, `name`, and once its body has ended one log
 * line, `name`, and one count on `metric`. None of them carries the secret, a
 * where clause or a parameter value.
 *
 * @category handlers
 * @since 0.1.0
 */
export const make = (
  options: Options
): Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  never,
  HttpServerRequest.HttpServerRequest | HttpClient.HttpClient
> => {
  const name = options.name ?? "electric.shape"
  const metric = options.metric ?? defaultMetric
  const shapeUrl = new URL("/v1/shape", options.url).toString()

  /** Records a request once it has ended: its count and one log line. */
  const record = (request: {
    readonly status: number
    readonly live: boolean
    readonly startedAt: number
    readonly bytes: number
    readonly outcome: Outcome
  }) =>
    Effect.gen(function*() {
      const { status, live, bytes, outcome } = request
      const durationMs = (yield* Clock.currentTimeMillis) - request.startedAt
      yield* Metric.update(Metric.withAttributes(metric, { status: String(status), live: String(live) }), 1)
      const level = status >= 500 || outcome === "failed"
        ? "Error"
        : status >= 400 && outcome !== "aborted"
        ? "Warn"
        : "Info"
      yield* Effect.logWithLevel(level)(name).pipe(
        Effect.annotateLogs({ status, live, durationMs, bytes, outcome })
      )
    })

  return Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const startedAt = yield* Clock.currentTimeMillis
    const incoming = new URL(request.url, "http://localhost").searchParams
    const live = incoming.get("live") === "true"
    const answered = (status: number) =>
      Effect.annotateCurrentSpan({ "http.response.status_code": status, "electric.shape.live": live })
    const ended = (status: number, outcome: Outcome = "complete") =>
      Effect.andThen(answered(status), record({ status, live, startedAt, bytes: 0, outcome }))

    if (request.method !== "GET") {
      yield* ended(405)
      return HttpServerResponse.empty({ status: 405, headers: { allow: "GET" } })
    }

    let upstream = HttpClientRequest.get(shapeUrl)
    const forwarded = new Set<string>()
    for (const [key, value] of incoming) {
      if (!protocolParameters.includes(key) || forwarded.has(key)) continue
      forwarded.add(key)
      upstream = HttpClientRequest.appendUrlParam(upstream, key, value)
    }
    const host: Array<readonly [string, string | Redacted.Redacted<string>]> = [
      ["table", options.shape.table],
      ...(options.shape.where === undefined ? [] : [["where", options.shape.where] as const]),
      ...Object.entries(options.shape.params ?? {}).map(([key, value]) => [`params[${key}]`, value] as const),
      // Redacted, so the client span's `url.full` shows `secret=REDACTED`; the request carries the value.
      ...(options.secret === undefined ? [] : [["secret", options.secret] as const]),
      ...(options.sourceId === undefined ? [] : [["source_id", options.sourceId] as const])
    ]
    for (const [key, value] of host) upstream = HttpClientRequest.appendUrlParam(upstream, key, value)

    const client = yield* HttpClient.HttpClient
    const response = yield* client.execute(upstream).pipe(
      Effect.option,
      // The browser went away before Electric answered, as it does with a live request it no longer needs.
      Effect.onInterrupt(() => ended(499, "aborted"))
    )
    if (Option.isNone(response)) {
      yield* ended(502)
      return HttpServerResponse.empty({ status: 502 })
    }
    const { status, headers, stream } = response.value
    yield* answered(status)
    // The body streams after this handler and its span end, outside its services, so the record runs with them.
    const context = yield* Effect.context<never>()
    let bytes = 0
    const body = stream.pipe(
      Stream.tap((chunk) => Effect.sync(() => (bytes += chunk.byteLength))),
      Stream.onExit((exit) =>
        record({
          status,
          live,
          startedAt,
          bytes,
          outcome: Exit.isSuccess(exit) ? "complete" : Exit.hasInterrupts(exit) ? "aborted" : "failed"
        }).pipe(Effect.provideContext(context))
      )
    )
    return HttpServerResponse.stream(body, {
      status,
      headers: Object.fromEntries(Object.entries(headers).filter(([key]) => !dropped(key)))
    })
  }).pipe(Effect.withSpan(name, { kind: "server" }))
}
