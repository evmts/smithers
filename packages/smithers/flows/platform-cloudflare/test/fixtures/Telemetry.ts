/**
 * Every span, structured log line and metric an effect produces, captured in
 * memory, and a check that none of them carries a sentinel.
 */
import { expect } from "@effect/vitest"
import { Logger as StructuredLogger } from "@smthrs/observability"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Logger from "effect/Logger"
import * as Metric from "effect/Metric"
import * as Tracer from "effect/Tracer"

type StructuredLog = ReturnType<typeof StructuredLogger.formatStructured.log>

const json = (value: unknown) => JSON.stringify(value, (_, inner) => typeof inner === "bigint" ? String(inner) : inner)

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
  const metric = <S>(metric: Metric.Metric<number, S>, attributes: Record<string, string>): S =>
    Effect.runSync(
      Metric.value(Metric.withAttributes(metric, attributes)).pipe(
        Effect.provideService(Metric.MetricRegistry, registry)
      )
    )
  return {
    spans,
    logs,
    observed: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(
        Effect.provideService(Tracer.Tracer, tracer),
        Effect.provideService(Logger.CurrentLoggers, new Set([logger])),
        Effect.provideService(Metric.MetricRegistry, registry)
      ),
    count: (counter: Metric.Metric<number, Metric.CounterState<number>>, attributes: Record<string, string>) =>
      metric(counter, attributes).count,
    named: (name: string) => spans.filter((span) => span.name === name),
    lines: (message: string) => logs.filter((log) => log.message === message),
    /** Every metric's attributes, as JSON. */
    metricAttributes: () =>
      json(
        Effect.runSync(Metric.snapshot.pipe(Effect.provideService(Metric.MetricRegistry, registry))).map((entry) =>
          entry.attributes
        )
      ),
    /** No line, span attribute, event, failed span's cause or metric attribute holds `sentinel`. */
    expectNoContent: (sentinel: string) => {
      expect(json(logs)).not.toContain(sentinel)
      for (const span of spans) {
        expect(json([...span.attributes])).not.toContain(sentinel)
        expect(json(span.events)).not.toContain(sentinel)
        if (span.status._tag === "Ended" && Exit.isFailure(span.status.exit)) {
          expect(json(span.status.exit.cause)).not.toContain(sentinel)
        }
      }
      const snapshot = Effect.runSync(Metric.snapshot.pipe(Effect.provideService(Metric.MetricRegistry, registry)))
      expect(json(snapshot.map((entry) => entry.attributes))).not.toContain(sentinel)
    }
  }
}
