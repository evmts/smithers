// The browser's OTLP/HTTP JSON exports, as TestChatApi captured them on the network, read back into records a test
// asserts on: each log line with its attributes, each span with its trace and attributes, each metric data point.

type AnyValue = {
  readonly stringValue?: string
  readonly boolValue?: boolean
  readonly intValue?: number | string
  readonly doubleValue?: number
  readonly arrayValue?: { readonly values?: ReadonlyArray<AnyValue> }
}
type KeyValue = { readonly key: string; readonly value: AnyValue }

const value = (any: AnyValue): unknown =>
  any.stringValue ??
  any.boolValue ??
  (any.intValue === undefined ? undefined : Number(any.intValue)) ??
  any.doubleValue ??
  any.arrayValue?.values?.map(value)

const attributes = (list: ReadonlyArray<KeyValue> = []) =>
  Object.fromEntries(list.filter(({ key }) => key !== "effect.fiberId").map(({ key, value: any }) => [key, value(any)]))

export interface Log {
  readonly message: unknown
  readonly severity: string
  readonly attributes: Record<string, unknown>
  readonly traceId?: string
}

export interface Span {
  readonly name: string
  readonly traceId: string
  readonly spanId: string
  readonly parentSpanId?: string
  readonly attributes: Record<string, unknown>
  /** The spans this one links to, such as the ask an outbox send belongs to. */
  readonly links: ReadonlyArray<{ readonly traceId: string; readonly spanId: string }>
}

export interface Point {
  readonly metric: string
  readonly attributes: Record<string, unknown>
  /** A counter's value. */
  readonly value?: number
  /** How many values a histogram recorded. */
  readonly count?: number
}

type Point_ = { readonly attributes?: ReadonlyArray<KeyValue>; readonly asDouble?: number; readonly asInt?: number | string; readonly count?: number | string }
type Metric_ = {
  readonly name: string
  readonly sum?: { readonly dataPoints: ReadonlyArray<Point_> }
  readonly gauge?: { readonly dataPoints: ReadonlyArray<Point_> }
  readonly histogram?: { readonly dataPoints: ReadonlyArray<Point_> }
}

/** Every record in `exports`, the bodies the browser posted to `/api/telemetry/v1/*`. */
export const read = (exports: ReadonlyArray<{ readonly path: string; readonly body: string }>) => {
  const bodies = (signal: string) =>
    exports.filter(({ path }) => path.endsWith(`/v1/${signal}`)).map(({ body }) => JSON.parse(body))
  const logs: Array<Log> = bodies("logs").flatMap((body) =>
    body.resourceLogs.flatMap((resource: { scopeLogs: ReadonlyArray<{ logRecords: ReadonlyArray<any> }> }) =>
      resource.scopeLogs.flatMap((scope) =>
        scope.logRecords.map((record) => ({
          message: value(record.body),
          severity: record.severityText,
          attributes: attributes(record.attributes),
          ...(record.traceId === undefined ? {} : { traceId: record.traceId }),
        })),
      ),
    ),
  )
  const spans: Array<Span> = bodies("traces").flatMap((body) =>
    body.resourceSpans.flatMap((resource: { scopeSpans: ReadonlyArray<{ spans: ReadonlyArray<any> }> }) =>
      resource.scopeSpans.flatMap((scope) =>
        scope.spans.map((span) => ({
          name: span.name,
          traceId: span.traceId,
          spanId: span.spanId,
          ...(span.parentSpanId === undefined ? {} : { parentSpanId: span.parentSpanId }),
          attributes: attributes(span.attributes),
          links: (span.links ?? []).map((link: { traceId: string; spanId: string }) => ({
            traceId: link.traceId,
            spanId: link.spanId,
          })),
        })),
      ),
    ),
  )
  const points: Array<Point> = bodies("metrics").flatMap((body) =>
    body.resourceMetrics.flatMap((resource: { scopeMetrics: ReadonlyArray<{ metrics: ReadonlyArray<Metric_> }> }) =>
      resource.scopeMetrics.flatMap((scope) =>
        scope.metrics.flatMap((metric) =>
          (metric.sum ?? metric.gauge ?? metric.histogram)!.dataPoints.map((point) => ({
            metric: metric.name,
            attributes: attributes(point.attributes),
            ...(point.count === undefined
              ? { value: Number(point.asDouble ?? point.asInt) }
              : { count: Number(point.count) }),
          })),
        ),
      ),
    ),
  )
  return {
    logs,
    spans,
    points,
    /** The log lines with this message. */
    log: (message: string) => logs.filter((log) => log.message === message),
    /** The spans with this name. */
    span: (name: string) => spans.filter((span) => span.name === name),
    /** The latest data point of `metric` with exactly these attributes: metrics export cumulatively. */
    point: (metric: string, attributes: Record<string, unknown> = {}) =>
      points
        .filter((point) => point.metric === metric && JSON.stringify(point.attributes) === JSON.stringify(attributes))
        .at(-1),
  }
}
