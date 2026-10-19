/**
 * Receives OTLP/HTTP JSON exports and re-emits every record as a structured
 * Effect log line.
 *
 * `Otlp.layerFetch` is the sending half: a browser posts its logs, spans and
 * metric snapshots as OTLP JSON. {@link serve} is the receiving half, an
 * `effect/http` handler a server mounts below its own route, for example a
 * Cloudflare Worker at `/api/telemetry`. Each log record, span and metric data
 * point becomes one `Effect.log` line on the server's own loggers, so the
 * host's log store holds browser and server telemetry side by side, joined by
 * trace id and by whatever attributes the browser annotated.
 *
 * The module uses only `effect`: no `node:` built-in, no OpenTelemetry SDK.
 *
 * @since 1.0.0-rc.16
 */

import * as Redaction from "@smthrs/journal/Redaction"
import * as Effect from "effect/Effect"
import * as HttpServerRequest from "effect/http/HttpServerRequest"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import type * as LogLevel from "effect/LogLevel"
import * as Metric from "effect/Metric"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as FlowsMetric from "./Metric.ts"

/**
 * The largest request body {@link serve} reads when
 * {@link Options.maxBodyBytes} is omitted: 256 KiB.
 *
 * @category limits
 * @since 1.0.0-rc.16
 */
export const defaultMaxBodyBytes = 256 * 1024

/**
 * The most records one request relays when {@link Options.maxRecords} is
 * omitted. It matches the exporter's 1,000-record batch.
 *
 * @category limits
 * @since 1.0.0-rc.16
 */
export const defaultMaxRecords = 1000

/**
 * The attribute filter used when {@link Options.allowAttribute} is omitted:
 * it drops every key `Redaction.isSensitiveKey` names a credential.
 *
 * @category filters
 * @since 1.0.0-rc.16
 */
export const defaultAllowAttribute = (key: string): boolean => !Redaction.isSensitiveKey(key)

/**
 * Limits and filters for {@link serve}.
 *
 * @category models
 * @since 1.0.0-rc.16
 */
export interface Options {
  /** Body bytes read before answering 413, counted as the body streams. Defaults to {@link defaultMaxBodyBytes}. */
  readonly maxBodyBytes?: number | undefined
  /** Records relayed per request; the rest are dropped and counted. Defaults to {@link defaultMaxRecords}. */
  readonly maxRecords?: number | undefined
  /** Keeps an attribute when it returns `true`; nested keys arrive dotted. Defaults to {@link defaultAllowAttribute}. */
  readonly allowAttribute?: ((key: string) => boolean) | undefined
}

/**
 * The OTLP signal a request carries, named by its path's last segment.
 *
 * @category models
 * @since 1.0.0-rc.16
 */
export type Signal = "logs" | "traces" | "metrics"

// OTLP/JSON `AnyValue`. int64 values may arrive as JSON numbers or strings.
interface AnyValue {
  readonly stringValue?: string
  readonly boolValue?: boolean
  readonly intValue?: number
  readonly doubleValue?: number
  readonly bytesValue?: string
  readonly arrayValue?: { readonly values: ReadonlyArray<AnyValue> }
  readonly kvlistValue?: { readonly values: ReadonlyArray<KeyValue> }
}
interface KeyValue {
  readonly key: string
  readonly value: AnyValue
}
interface AnyValueEncoded {
  readonly stringValue?: string
  readonly boolValue?: boolean
  readonly intValue?: number | string
  readonly doubleValue?: number
  readonly bytesValue?: string
  readonly arrayValue?: { readonly values?: ReadonlyArray<AnyValueEncoded> }
  readonly kvlistValue?: { readonly values?: ReadonlyArray<KeyValueEncoded> }
}
interface KeyValueEncoded {
  readonly key: string
  readonly value?: AnyValueEncoded
}

const list = <S extends Schema.Top>(item: S) =>
  Schema.Array(item).pipe(Schema.withDecodingDefaultKey(Effect.succeed([])))
const Int64 = Schema.Union([Schema.Number, Schema.NumberFromString])

const AnyValue: Schema.Codec<AnyValue, AnyValueEncoded> = Schema.Struct({
  stringValue: Schema.optionalKey(Schema.String),
  boolValue: Schema.optionalKey(Schema.Boolean),
  intValue: Schema.optionalKey(Int64),
  doubleValue: Schema.optionalKey(Schema.Number),
  bytesValue: Schema.optionalKey(Schema.String),
  arrayValue: Schema.optionalKey(Schema.Struct({ values: list(Schema.suspend(() => AnyValue)) })),
  kvlistValue: Schema.optionalKey(Schema.Struct({ values: list(Schema.suspend(() => KeyValue)) }))
})
const KeyValue: Schema.Codec<KeyValue, KeyValueEncoded> = Schema.Struct({
  key: Schema.String,
  value: Schema.suspend(() => AnyValue).pipe(Schema.withDecodingDefaultKey(Effect.succeed({})))
})

const Attributes = list(KeyValue)
const Resource = Schema.Struct({ attributes: Attributes }).pipe(Schema.withDecodingDefaultKey(Effect.succeed({})))
const Id = Schema.optionalKey(Schema.String)

const LogRecord = Schema.Struct({
  severityNumber: Schema.optionalKey(Schema.Int),
  severityText: Schema.optionalKey(Schema.String),
  body: Schema.optionalKey(AnyValue),
  attributes: Attributes,
  traceId: Id,
  spanId: Id
})
const Span = Schema.Struct({
  name: Schema.String,
  traceId: Id,
  spanId: Id,
  parentSpanId: Id,
  startTimeUnixNano: Int64.pipe(Schema.withDecodingDefaultKey(Effect.succeed(0))),
  endTimeUnixNano: Int64.pipe(Schema.withDecodingDefaultKey(Effect.succeed(0))),
  attributes: Attributes,
  status: Schema.optionalKey(
    Schema.Struct({ code: Schema.optionalKey(Schema.Int), message: Schema.optionalKey(Schema.String) })
  )
})
const DataPoint = Schema.Struct({
  attributes: Attributes,
  asInt: Schema.optionalKey(Int64),
  asDouble: Schema.optionalKey(Schema.Number),
  count: Schema.optionalKey(Int64),
  sum: Schema.optionalKey(Schema.Number)
})
const Points = Schema.Struct({ dataPoints: list(DataPoint) }).pipe(Schema.withDecodingDefaultKey(Effect.succeed({})))
const metricTypes = ["sum", "gauge", "histogram", "exponentialHistogram", "summary"] as const
const MetricRecord = Schema.Struct({
  name: Schema.String,
  unit: Schema.optionalKey(Schema.String),
  sum: Points,
  gauge: Points,
  histogram: Points,
  exponentialHistogram: Points,
  summary: Points
})

const LogsRequest = Schema.Struct({
  resourceLogs: list(Schema.Struct({
    resource: Resource,
    scopeLogs: list(Schema.Struct({ logRecords: list(LogRecord) }))
  }))
})
const TracesRequest = Schema.Struct({
  resourceSpans: list(Schema.Struct({
    resource: Resource,
    scopeSpans: list(Schema.Struct({ spans: list(Span) }))
  }))
})
const MetricsRequest = Schema.Struct({
  resourceMetrics: list(Schema.Struct({
    resource: Resource,
    scopeMetrics: list(Schema.Struct({ metrics: list(MetricRecord) }))
  }))
})

type Allow = (key: string) => boolean

interface Line {
  readonly level: LogLevel.Severity
  readonly message: unknown
  readonly annotations: Record<string, unknown>
}

const plain = (value: AnyValue): unknown =>
  value.arrayValue !== undefined
    ? value.arrayValue.values.map(plain)
    : value.kvlistValue !== undefined
    ? Object.fromEntries(value.kvlistValue.values.map((entry) => [entry.key, plain(entry.value)]))
    : value.stringValue ?? value.boolValue ?? value.intValue ?? value.doubleValue ?? value.bytesValue

const flatten = (
  attributes: ReadonlyArray<KeyValue>,
  allow: (key: string) => boolean,
  out: Record<string, unknown> = {},
  prefix = ""
): Record<string, unknown> => {
  for (const { key, value } of attributes) {
    const name = prefix + key
    if (!allow(name)) continue
    if (value.kvlistValue === undefined) out[name] = plain(value)
    else flatten(value.kvlistValue.values, allow, out, `${name}.`)
  }
  return out
}

/** A record's own fields, redacted, under the relay's fields; absent values are omitted. */
const annotate = (
  attributes: Record<string, unknown>,
  fields: Record<string, unknown>
): Record<string, unknown> => {
  const out = Redaction.redact(attributes, { onTooDeep: "name" }) as Record<string, unknown>
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== "") out[key] = value
  }
  return out
}

const serviceName = (resource: { readonly attributes: ReadonlyArray<KeyValue> }): unknown =>
  plain(resource.attributes.find((attribute) => attribute.key === "service.name")?.value ?? {})

const levels: ReadonlyArray<LogLevel.Severity> = ["Trace", "Debug", "Info", "Warn", "Error", "Fatal"]
const levelText = /^(trace|debug|info|warn|error|fatal)/i

/**
 * Maps an OTLP severity to an Effect log level. `severityNumber` decides when
 * it is set: 1-4 Trace, 5-8 Debug, 9-12 Info, 13-16 Warn, 17-20 Error, 21-24
 * Fatal. Otherwise `severityText` decides by its leading word, and a record
 * with neither logs at Info.
 *
 * @category severity
 * @since 1.0.0-rc.16
 */
export const severityLevel = (
  severityNumber: number | undefined,
  severityText: string | undefined
): LogLevel.Severity => {
  if (severityNumber !== undefined && severityNumber > 0) return levels[Math.min(Math.ceil(severityNumber / 4), 6) - 1]!
  const word = levelText.exec(severityText ?? "")?.[1]?.toLowerCase()
  return levels.find((level) => level.toLowerCase() === word) ?? "Info"
}

const message = (value: unknown): unknown => Redaction.redact(value, { onTooDeep: "name" })

const logLines = (request: typeof LogsRequest.Type, allow: Allow): Array<Line> =>
  request.resourceLogs.flatMap(({ resource, scopeLogs }) =>
    scopeLogs.flatMap((scope) =>
      scope.logRecords.map((record) => ({
        level: severityLevel(record.severityNumber, record.severityText),
        message: message(record.body === undefined ? "" : plain(record.body)),
        annotations: annotate(flatten(record.attributes, allow), {
          "otlp.signal": "logs",
          "service.name": serviceName(resource),
          "otlp.severity": record.severityText ?? record.severityNumber,
          trace_id: record.traceId,
          span_id: record.spanId
        })
      }))
    )
  )

const spanLines = (request: typeof TracesRequest.Type, allow: Allow): Array<Line> =>
  request.resourceSpans.flatMap(({ resource, scopeSpans }) =>
    scopeSpans.flatMap((scope) =>
      scope.spans.map((span) => ({
        level: span.status?.code === 2 ? "Error" : "Info",
        message: message(span.name),
        annotations: annotate(flatten(span.attributes, allow), {
          "otlp.signal": "traces",
          "service.name": serviceName(resource),
          trace_id: span.traceId,
          span_id: span.spanId,
          "otlp.parent_span_id": span.parentSpanId,
          "otlp.duration_ms": (span.endTimeUnixNano - span.startTimeUnixNano) / 1e6,
          "otlp.status_message": span.status?.message
        })
      }))
    )
  )

const metricLines = (request: typeof MetricsRequest.Type, allow: Allow): Array<Line> =>
  request.resourceMetrics.flatMap(({ resource, scopeMetrics }) =>
    scopeMetrics.flatMap((scope) =>
      scope.metrics.flatMap((metric) =>
        metricTypes.flatMap((type) =>
          metric[type].dataPoints.map((point) => ({
            level: "Info" as const,
            message: message(metric.name),
            annotations: annotate(flatten(point.attributes, allow), {
              "otlp.signal": "metrics",
              "service.name": serviceName(resource),
              "otlp.metric_type": type,
              "otlp.unit": metric.unit,
              "otlp.value": point.asDouble ?? point.asInt,
              "otlp.count": point.count,
              "otlp.sum": point.sum
            })
          }))
        )
      )
    )
  )

const relayOf = <A>(
  decode: (input: unknown) => Effect.Effect<A, Schema.SchemaError>,
  toLines: (request: A, allow: Allow) => Array<Line>,
  rejected: string
) => ({
  lines: (text: string, allow: Allow): Effect.Effect<Array<Line>, number> =>
    decode(text).pipe(Effect.mapError(() => 400), Effect.map((request) => toLines(request, allow))),
  rejected
})

const relays = {
  logs: relayOf(Schema.decodeUnknownEffect(Schema.fromJsonString(LogsRequest)), logLines, "rejectedLogRecords"),
  traces: relayOf(Schema.decodeUnknownEffect(Schema.fromJsonString(TracesRequest)), spanLines, "rejectedSpans"),
  metrics: relayOf(Schema.decodeUnknownEffect(Schema.fromJsonString(MetricsRequest)), metricLines, "rejectedDataPoints")
}

/**
 * The deepest `{` and `[` nesting a body may reach. OTLP JSON from an exporter
 * nests about a dozen levels; the bound keeps a hostile body from exhausting
 * the stack in the recursive value decoder.
 *
 * @category limits
 * @since 1.0.0-rc.16
 */
export const maxNesting = 64

const nestedTooDeep = (text: string): boolean => {
  let depth = 0
  let quoted = false
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    if (quoted) {
      if (code === 92) index++ // a backslash escapes the next code unit
      else if (code === 34) quoted = false
    } else if (code === 34) quoted = true
    else if (code === 123 || code === 91) {
      if (++depth > maxNesting) return true
    } else if (code === 125 || code === 93) depth--
  }
  return false
}

const route = /\/v1\/(logs|traces|metrics)$/

/** Reads the body as text, failing with 413 as soon as it passes `limit` bytes. */
const readText = (stream: Stream.Stream<Uint8Array, unknown>, limit: number): Effect.Effect<string, number> =>
  Effect.suspend(() => {
    const decoder = new TextDecoder()
    let bytes = 0
    let text = ""
    return stream.pipe(
      Stream.mapError(() => 400),
      Stream.runForEach((chunk) => {
        bytes += chunk.byteLength
        if (bytes > limit) return Effect.fail(413)
        text += decoder.decode(chunk, { stream: true })
        return Effect.void
      }),
      Effect.map(() => text + decoder.decode())
    )
  })

const answer = (status: number): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.empty({ status, headers: status === 405 ? { allow: "POST" } : {} })

/**
 * An `effect/http` handler that relays OTLP/HTTP JSON exports into the
 * server's own loggers.
 *
 * It answers POST `<base>/v1/logs`, `<base>/v1/traces` and `<base>/v1/metrics`
 * for any base path, so it mounts below whatever route the host chooses. Each
 * log record, span and metric data point becomes one `Effect.log` line whose
 * message is the record's body, span name or metric name, at the level its
 * severity maps to ({@link severityLevel}; an errored span logs at `Error`,
 * everything else at `Info`).
 *
 * Every line carries `otlp.signal` and the resource's `service.name`, the
 * record's attributes flattened with dotted keys, and as they apply
 * `otlp.severity`, `trace_id`, `span_id`, `otlp.parent_span_id`,
 * `otlp.duration_ms`, `otlp.status_message`, `otlp.metric_type`, `otlp.unit`,
 * `otlp.value`, `otlp.count` and `otlp.sum`. Attribute keys pass
 * {@link Options.allowAttribute}; messages and attribute values pass
 * `Redaction.redact`.
 *
 * It answers 200 with `{}`, or with an OTLP `partialSuccess` naming the
 * records over {@link Options.maxRecords}; 413 past
 * {@link Options.maxBodyBytes}; 400 for a body that is not OTLP JSON or nests
 * deeper than {@link maxNesting}; 405 for
 * another method; 404 for another path. It never fails and never echoes a
 * parse error. `flows_observability_otlp_relayed` and
 * `flows_observability_otlp_relay_dropped` count records by `signal`.
 *
 * **Example**
 *
 * ```ts
 * import * as OtlpRelay from "@smthrs/observability/OtlpRelay"
 *
 * const telemetry = OtlpRelay.serve({ maxRecords: 500 })
 * // In a fetch handler: if the path starts with /api/telemetry/, return telemetry.
 * ```
 *
 * @category handlers
 * @since 1.0.0-rc.16
 */
export const serve = (
  options: Options = {}
): Effect.Effect<HttpServerResponse.HttpServerResponse, never, HttpServerRequest.HttpServerRequest> => {
  const maxBodyBytes = options.maxBodyBytes ?? defaultMaxBodyBytes
  const maxRecords = options.maxRecords ?? defaultMaxRecords
  const allow = options.allowAttribute ?? defaultAllowAttribute
  return Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const signal = route.exec(request.url.split("?")[0]!)?.[1] as Signal | undefined
    if (signal === undefined) return yield* Effect.fail(404)
    if (request.method !== "POST") return yield* Effect.fail(405)
    const text = yield* readText(request.stream, maxBodyBytes)
    if (nestedTooDeep(text)) return yield* Effect.fail(400)
    const relay = relays[signal]
    const lines = yield* relay.lines(text, allow)
    const kept = lines.slice(0, maxRecords)
    const dropped = lines.length - kept.length
    yield* Effect.forEach(
      kept,
      (line) => Effect.logWithLevel(line.level)(line.message).pipe(Effect.annotateLogs(line.annotations)),
      { discard: true }
    )
    yield* Metric.update(Metric.withAttributes(FlowsMetric.relayedRecords, { signal }), kept.length)
    yield* Metric.update(Metric.withAttributes(FlowsMetric.relayDroppedRecords, { signal }), dropped)
    return HttpServerResponse.jsonUnsafe(
      dropped === 0 ? {} : {
        partialSuccess: { [relay.rejected]: dropped, errorMessage: `relayed the first ${maxRecords} records` }
      }
    )
  }).pipe(Effect.catch((status) => Effect.succeed(answer(status))))
}
