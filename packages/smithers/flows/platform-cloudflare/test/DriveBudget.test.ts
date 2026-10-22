/**
 * An alarm's drive budget: Cloudflare kills an alarm invocation at 15 minutes
 * of wall time, so {@link ExecutionObject.alarm} drives with a budget
 * (`EXECUTION_DRIVE_BUDGET_SECONDS`, 600 by default). A drive that spends it
 * yields at a step boundary and the alarm re-arms at once; every drive's
 * duration is recorded by outcome, so drives nearing the limit show.
 */
import { describe, expect, it } from "@effect/vitest"
import { Logger as StructuredLogger } from "@smthrs/observability"
import * as Cause from "effect/Cause"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Logger from "effect/Logger"
import * as Metric from "effect/Metric"
import * as SqlClient from "effect/sql/SqlClient"
import { randomUUID } from "node:crypto"
import { CloudflareRuntime, ExecutionObject } from "../src/index.ts"
import { Answer, registration, runtime } from "./fixtures/AnswerFlow.ts"
import * as MemoryStorage from "./fixtures/MemoryStorage.ts"
import * as Objects from "./fixtures/Objects.ts"
import * as Postgres from "./fixtures/Postgres.ts"

const budgetFrom = (settings: Record<string, string>) =>
  ExecutionObject.driveBudget.parse(ConfigProvider.fromUnknown(settings))

describe("ExecutionObject.driveBudget", () => {
  it.effect("is 600 seconds unless EXECUTION_DRIVE_BUDGET_SECONDS says otherwise", () =>
    Effect.gen(function*() {
      expect(ExecutionObject.defaultDriveBudgetMs).toBe(600_000)
      expect(yield* budgetFrom({})).toBe(600_000)
      expect(yield* budgetFrom({ EXECUTION_DRIVE_BUDGET_SECONDS: "120" })).toBe(120_000)
      expect(yield* budgetFrom({ EXECUTION_DRIVE_BUDGET_SECONDS: "1" })).toBe(1_000)
      expect(yield* budgetFrom({ EXECUTION_DRIVE_BUDGET_SECONDS: "899" })).toBe(899_000)
      // An empty setting is an unset one.
      expect(yield* budgetFrom({ EXECUTION_DRIVE_BUDGET_SECONDS: "" })).toBe(600_000)
    }))

  it.effect("refuses a budget that is not whole seconds under Cloudflare's 900-second alarm limit", () =>
    Effect.gen(function*() {
      for (const value of ["0", "-5", "900", "3600", "1.5", "ten"]) {
        const exit = yield* Effect.exit(budgetFrom({ EXECUTION_DRIVE_BUDGET_SECONDS: value }))
        expect(exit._tag === "Failure" && Cause.squash(exit.cause), value).toMatchObject({ _tag: "ConfigError" })
      }
    }))
})

type StructuredLog = ReturnType<typeof StructuredLogger.formatStructured.log>

/** The alarm log lines and metrics an effect produces, in a registry of its own. */
const telemetry = () => {
  const logs: Array<StructuredLog> = []
  const registry: Metric.MetricRegistry = new Map()
  const logger = Logger.make((options) => {
    logs.push(StructuredLogger.formatStructured.log(options))
  })
  return {
    observed: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(
        Effect.provideService(Logger.CurrentLoggers, new Set([logger])),
        Effect.provideService(Metric.MetricRegistry, registry)
      ),
    count: (metric: Metric.Metric<number, Metric.CounterState<number>>, attributes: Record<string, string>) =>
      Effect.runSync(
        Metric.value(Metric.withAttributes(metric, attributes)).pipe(
          Effect.provideService(Metric.MetricRegistry, registry)
        )
      ).count,
    drives: (outcome: string) =>
      Effect.runSync(
        Metric.value(Metric.withAttributes(ExecutionObject.driveDuration, { outcome })).pipe(
          Effect.provideService(Metric.MetricRegistry, registry)
        )
      ).count,
    alarmLines: () => logs.filter((log) => log.message === "cloudflare.execution.alarm")
  }
}

for (const target of Postgres.targets) {
  describe.skipIf(!target.available)(`an alarm's drive budget over ${target.label}`, () => {
    it.live("a drive that spends its budget yields at a step boundary, the alarm re-arms at once, and every step runs once", () => {
      const t = telemetry()
      const schema = Postgres.freshSchema()
      const memory = MemoryStorage.make()
      const steps: Array<string> = []
      const executionId = `answer-${randomUUID()}`
      // A zero budget: each drive starts its first step and holds the next.
      const alarm = () =>
        ExecutionObject.alarm(memory.storage, {
          flows: [Answer],
          runtime: runtime({
            hostId: `object-${executionId}`,
            database: Postgres.database(schema, target.url),
            record: (label) => Effect.sync(() => steps.push(label)).pipe(Effect.as(label))
          }),
          router: Objects.unrouted,
          driveBudgetMs: 0
        })
      const status = Effect.promise(() =>
        Postgres.admin(Effect.gen(function*() {
          const sql = yield* SqlClient.SqlClient
          const rows = yield* sql<{ readonly status: string }>`
            SELECT status FROM ${sql(schema)}.flows_runs WHERE run_id = ${executionId}`
          return rows[0]?.status
        }))
      )
      return t.observed(Effect.gen(function*() {
        const value = yield* ExecutionObject.intent(Answer, { executionId, payload: { question: "hi", pauseMs: 0 } })
        yield* ExecutionObject.start(memory.storage, value, Effect.void)

        // Ask, then the pause, each in a drive of its own; the alarm is armed
        // for now after each, and the count of failed alarms stays clear.
        for (const ran of [["ask:hi"], ["ask:hi"]]) {
          const before = Date.now()
          expect(yield* alarm()).toEqual({ _tag: "Yielded" })
          expect(steps).toEqual(ran)
          expect(memory.alarm()).toBeGreaterThanOrEqual(before)
          expect(memory.alarm()).toBeLessThanOrEqual(Date.now())
          expect(memory.values.has(ExecutionObject.failuresKey)).toBe(false)
          expect(yield* status).toBe("suspended")
        }
        expect(yield* alarm()).toMatchObject({ _tag: "Settled" })
        expect(steps).toEqual(["ask:hi", "answer"])
        expect(yield* status).toBe("completed")
      })).pipe(
        Effect.ensuring(Effect.promise(() => Postgres.dropSchema(schema))),
        Effect.andThen(Effect.sync(() => {
          expect(t.count(ExecutionObject.alarms, { outcome: "yielded" })).toBe(2)
          expect(t.count(ExecutionObject.alarms, { outcome: "settled" })).toBe(1)
          expect(t.drives("yielded")).toBe(2)
          expect(t.drives("settled")).toBe(1)
          // Every alarm that drove says for how long, beside its outcome.
          expect(t.alarmLines().map((line) => line.annotations)).toEqual([
            expect.objectContaining({ outcome: "yielded", "smithers.execution.drive_ms": expect.any(Number) }),
            expect.objectContaining({ outcome: "yielded", "smithers.execution.drive_ms": expect.any(Number) }),
            expect.objectContaining({ outcome: "settled", "smithers.execution.drive_ms": expect.any(Number) })
          ])
        }))
      )
    })

    it.live("a drive that fails or leaves work undone is timed too, and an alarm that drives nothing reports no time", () => {
      const t = telemetry()
      const schema = Postgres.freshSchema()
      const memory = MemoryStorage.make()
      const executionId = `answer-${randomUUID()}`
      const hostId = `object-${executionId}`
      const database = Postgres.database(schema, target.url)
      const alarmWith = (runtime: (intent: ExecutionObject.Intent) => Layer.Layer<ExecutionObject.Services, unknown>) =>
        ExecutionObject.alarm(memory.storage, { flows: [Answer], runtime, router: Objects.unrouted })
      return t.observed(Effect.gen(function*() {
        const value = yield* ExecutionObject.intent(Answer, { executionId, payload: { question: "hi", pauseMs: 0 } })
        yield* ExecutionObject.start(memory.storage, value, Effect.void)
        // A runtime that registers no flow fails the drive that would admit the run.
        expect(
          yield* alarmWith((intent) =>
            CloudflareRuntime.layer({ hostId, executionId: intent.executionId }, Layer.empty).pipe(
              Layer.provide(database)
            )
          )
        ).toMatchObject({ _tag: "Retrying", failure: "@smthrs/engine/FlowNotRegistered" })
        // A runtime configured for another execution leaves this one undriven.
        expect(
          yield* alarmWith((intent) =>
            CloudflareRuntime.layer({ hostId, executionId: `not-${intent.executionId}` }, registration(Effect.succeed))
              .pipe(Layer.provide(database))
          )
        ).toMatchObject({ _tag: "Retrying", failure: "@smthrs/platform-cloudflare/Undriven" })
        // A runtime that cannot be built drives nothing.
        expect(yield* alarmWith(() => Layer.unwrap(Effect.die("unbuildable")))).toMatchObject({ _tag: "Retrying" })
      })).pipe(
        Effect.ensuring(Effect.promise(() => Postgres.dropSchema(schema))),
        Effect.andThen(Effect.sync(() => {
          expect(t.drives("unfinished")).toBe(1)
          expect(t.drives("failed")).toBe(1)
          const [unregistered, undriven, unbuilt] = t.alarmLines().map((line) => line.annotations)
          expect(undriven).toMatchObject({ outcome: "retrying", "smithers.execution.drive_ms": expect.any(Number) })
          expect(unregistered).toMatchObject({ outcome: "retrying", "smithers.execution.drive_ms": expect.any(Number) })
          expect(unbuilt).toMatchObject({ outcome: "retrying" })
          expect(unbuilt).not.toHaveProperty("smithers.execution.drive_ms")
        }))
      )
    })
  })
}
