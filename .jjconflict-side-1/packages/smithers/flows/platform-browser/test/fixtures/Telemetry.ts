/** Every span, structured log line and metric an effect produces. */
import { Logger as StructuredLogger } from "@smthrs/observability"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Logger from "effect/Logger"
import * as Metric from "effect/Metric"
import * as Tracer from "effect/Tracer"

type StructuredLog = ReturnType<typeof StructuredLogger.formatStructured.log>

export const make = () => {
  const spans: Array<Tracer.NativeSpan> = []
  const logs: Array<StructuredLog> = []
  const registry: Metric.MetricRegistry = new Map()
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    }
  })
  const logger = Logger.make((options) => {
    logs.push(StructuredLogger.formatStructured.log(options))
  })
  return {
    spans,
    logs,
    /** The same recorders as a layer, as a host's exporter is given (`BrowserRuntime.run`'s `telemetry`). */
    layer: Layer.mergeAll(
      Layer.succeed(Tracer.Tracer, tracer),
      Logger.layer([logger]),
      Layer.succeed(Metric.MetricRegistry, registry)
    ),
    observed: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(
        Effect.provideService(Tracer.Tracer, tracer),
        Effect.provideService(Logger.CurrentLoggers, new Set([logger])),
        Effect.provideService(Metric.MetricRegistry, registry)
      ),
    count: (metric: Metric.Metric<number, Metric.CounterState<number>>, attributes: Record<string, string>) =>
      Effect.runSync(
        Metric.value(Metric.withAttributes(metric, attributes)).pipe(
          Effect.provideService(Metric.MetricRegistry, registry)
        )
      ).count,
    snapshot: () => Effect.runSync(Metric.snapshot.pipe(Effect.provideService(Metric.MetricRegistry, registry))),
    named: (name: string) => spans.filter((span) => span.name === name),
    lines: (message: string) => logs.filter((log) => log.message === message)
  }
}

/** Everything recorded, as one string, so a case can search it for content. */
export const dump = (telemetry: ReturnType<typeof make>): string =>
  JSON.stringify(
    {
      spans: telemetry.spans.map((span) => ({ name: span.name, attributes: [...span.attributes] })),
      logs: telemetry.logs,
      metrics: telemetry.snapshot()
    },
    (_, value) => typeof value === "bigint" ? String(value) : value
  )
