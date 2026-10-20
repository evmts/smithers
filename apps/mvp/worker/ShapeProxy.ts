import { ELECTRIC_PROTOCOL_QUERY_PARAMS } from "@electric-sql/client"
import { Clock, Config, Effect, Exit, Metric, Option, Stream } from "effect"
import { HttpClient, HttpClientRequest, HttpServerRequest, HttpServerResponse } from "effect/http"
import * as ChatMetrics from "./ChatMetrics.ts"

// GET /api/shapes/messages: the browser's Electric shape requests, passed to Electric with the shape fixed here.
// Electric's proxy guide: https://electric-sql.com/docs/guides/auth

/** The compose Electric (`docker-compose.yml`): what `ELECTRIC_URL` defaults to. */
export const LOCAL_ELECTRIC_URL = "http://localhost:30001"

/** The only table a browser can read. */
export const TABLE = "messages"

/**
 * Electric's headers that aren't passed on: `fetch` has already decoded the body, so its encoding and length no
 * longer hold, and ChatApi is same-origin, so Electric's CORS headers would only open it to other sites.
 */
const dropped = (name: string) =>
  name === "content-encoding" || name === "content-length" || name.startsWith("access-control-")

/**
 * Reads `ELECTRIC_URL`, `ELECTRIC_SECRET` and `ELECTRIC_SOURCE_ID` and returns the handler. It forwards only the
 * Electric client's own protocol parameters (`ELECTRIC_PROTOCOL_QUERY_PARAMS`), sets `table` itself, adds `secret`
 * and Electric Cloud's `source_id` when they are set, then streams Electric's status, body and headers back.
 * Electric unreachable is 502. Each request records one log line, when its body ends.
 */
export const make = Effect.gen(function* () {
  const electricUrl = yield* Config.String("ELECTRIC_URL").pipe(Config.withDefault(LOCAL_ELECTRIC_URL))
  const secret = yield* Config.option(Config.Redacted("ELECTRIC_SECRET"))
  const sourceId = yield* Config.option(Config.String("ELECTRIC_SOURCE_ID"))
  const shapeUrl = new URL("/v1/shape", electricUrl).toString()

  return Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const startedAt = yield* Clock.currentTimeMillis
    const incoming = new URL(request.url, "http://localhost").searchParams
    const live = incoming.get("live") === "true"
    if (request.method !== "GET") {
      yield* answered(405, live)
      yield* record({ status: 405, live, startedAt, bytes: 0, outcome: "complete" })
      return HttpServerResponse.empty({ status: 405, headers: { allow: "GET" } })
    }
    let upstream = HttpClientRequest.get(shapeUrl)
    for (const [key, value] of incoming) {
      if (ELECTRIC_PROTOCOL_QUERY_PARAMS.includes(key)) {
        upstream = HttpClientRequest.appendUrlParam(upstream, key, value)
      }
    }
    upstream = HttpClientRequest.setUrlParam(upstream, "table", TABLE)
    if (Option.isSome(secret)) upstream = HttpClientRequest.setUrlParam(upstream, "secret", secret.value)
    if (Option.isSome(sourceId)) upstream = HttpClientRequest.setUrlParam(upstream, "source_id", sourceId.value)

    const client = yield* HttpClient.HttpClient
    const response = yield* client.execute(upstream).pipe(
      Effect.option,
      // The browser went away before Electric answered, as it does with a live request it no longer needs.
      Effect.onInterrupt(() =>
        Effect.andThen(answered(499, live), record({ status: 499, live, startedAt, bytes: 0, outcome: "aborted" }))
      ),
    )
    if (Option.isNone(response)) {
      yield* answered(502, live)
      yield* record({ status: 502, live, startedAt, bytes: 0, outcome: "complete" })
      return HttpServerResponse.empty({ status: 502 })
    }
    const { status, headers, stream } = response.value
    yield* answered(status, live)
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
          outcome: Exit.isSuccess(exit) ? "complete" : Exit.hasInterrupts(exit) ? "aborted" : "failed",
        }).pipe(Effect.provideContext(context))
      ),
    )
    return HttpServerResponse.stream(body, {
      status,
      headers: Object.fromEntries(Object.entries(headers).filter(([name]) => !dropped(name))),
    })
  }).pipe(Effect.withSpan("chat.shape", { kind: "server" }))
})

/**
 * How a shape request ended: its response sent in full; `aborted` by the browser, before Electric answered (status
 * 499) or mid-body; or `failed` reading Electric's body.
 */
type Outcome = "complete" | "aborted" | "failed"

/** The `chat.shape` span's attributes, set while it is open. */
const answered = (status: number, live: boolean) =>
  Effect.annotateCurrentSpan({ "http.response.status_code": status, "smithers.chat.shape.live": live })

/**
 * Records a shape request once it has ended: its metric and one log line: Error for 5xx or a failed body, Warn for
 * another 4xx, Info otherwise, an aborted request included.
 */
const record = (request: {
  readonly status: number
  readonly live: boolean
  readonly startedAt: number
  readonly bytes: number
  readonly outcome: Outcome
}) =>
  Effect.gen(function* () {
    const { status, live, bytes, outcome } = request
    const durationMs = (yield* Clock.currentTimeMillis) - request.startedAt
    yield* Metric.update(Metric.withAttributes(ChatMetrics.shapes, { status: String(status), live: String(live) }), 1)
    const level = status >= 500 || outcome === "failed"
      ? "Error"
      : status >= 400 && outcome !== "aborted"
      ? "Warn"
      : "Info"
    yield* Effect.logWithLevel(level)("chat.shape").pipe(
      Effect.annotateLogs({ status, live, durationMs, bytes, outcome }),
    )
  })
