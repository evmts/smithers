import { describe, expect, it } from "@effect/vitest"
import { Logger as StructuredLogger } from "@smthrs/observability"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Logger from "effect/Logger"
import * as Metric from "effect/Metric"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import * as Tracer from "effect/Tracer"
import { randomUUID } from "node:crypto"
import { ExecutionObject } from "../src/index.ts"
import { Answer, runtime } from "./fixtures/AnswerFlow.ts"
import * as MemoryStorage from "./fixtures/MemoryStorage.ts"
import * as NestedFlows from "./fixtures/NestedFlows.ts"
import * as Objects from "./fixtures/Objects.ts"
import * as Postgres from "./fixtures/Postgres.ts"

const sentinel = "SENTINEL-4c1f9e"

/** A failure whose message quotes content, as a provider error that echoes a prompt does. */
class Leaky extends Schema.TaggedError<Leaky>()("Leaky", { detail: Schema.String }) {
  override get message() {
    return `echoed ${this.detail}`
  }
}

type StructuredLog = ReturnType<typeof StructuredLogger.formatStructured.log>

/** Every span, structured log line and metric an effect produces. */
const telemetry = () => {
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

const json = (value: unknown) => JSON.stringify(value, (_, inner) => typeof inner === "bigint" ? String(inner) : inner)

describe.skipIf(!Postgres.direct.available)(`ExecutionObject telemetry over ${Postgres.direct.label}`, () => {
  it.live("start and alarm log inside their spans, count their outcomes, and carry no content", () => {
    const t = telemetry()
    const schema = Postgres.freshSchema()
    const executionId = `answer-${randomUUID()}`
    const memory = MemoryStorage.make()
    const healthy = {
      flows: [Answer],
      runtime: runtime({ hostId: executionId, database: Postgres.database(schema), record: Effect.succeed }),
      router: Objects.unrouted
    }
    return t.observed(Effect.gen(function*() {
      const value = yield* ExecutionObject.intent(Answer, { executionId, payload: { question: sentinel, pauseMs: 0 } })
      const other = yield* ExecutionObject.intent(Answer, {
        executionId,
        payload: { question: `${sentinel}-other`, pauseMs: 0 }
      })
      yield* ExecutionObject.start(memory.storage, value, Effect.void)
      expect(yield* Effect.flip(ExecutionObject.start(memory.storage, value, new Leaky({ detail: sentinel }))))
        .toEqual(new Leaky({ detail: sentinel }))
      expect(yield* Effect.flip(ExecutionObject.start(memory.storage, value, Effect.fail(sentinel)))).toBe(sentinel)
      yield* ExecutionObject.start(memory.storage, value, Effect.void)
      yield* Effect.flip(ExecutionObject.start(memory.storage, other, Effect.void))

      const unbuildable = Layer.unwrap(Effect.fail(new Leaky({ detail: sentinel }))) as Layer.Layer<
        ExecutionObject.Services,
        Leaky
      >
      yield* ExecutionObject.alarm(memory.storage, {
        flows: [Answer],
        runtime: () => unbuildable,
        router: Objects.unrouted
      })
      expect(yield* ExecutionObject.alarm(memory.storage, healthy)).toMatchObject({ _tag: "Settled" })
      // The window passes: the final alarm forgets the execution, and says which.
      yield* ExecutionObject.alarm(memory.storage, { ...healthy, settledRetentionMs: 0 })
      return yield* Effect.promise(() => Postgres.entries(schema))
    })).pipe(
      Effect.ensuring(Effect.promise(() => Postgres.dropSchema(schema))),
      Effect.map((written) => {
        // Counted by outcome.
        expect(t.count(ExecutionObject.starts, { outcome: "accepted" })).toBe(1)
        expect(t.count(ExecutionObject.starts, { outcome: "failed" })).toBe(2)
        expect(t.count(ExecutionObject.starts, { outcome: "duplicate" })).toBe(1)
        expect(t.count(ExecutionObject.starts, { outcome: "conflict" })).toBe(1)
        expect(t.count(ExecutionObject.alarms, { outcome: "retrying" })).toBe(1)
        expect(t.count(ExecutionObject.alarms, { outcome: "settled" })).toBe(1)
        expect(t.count(ExecutionObject.alarms, { outcome: "forgotten" })).toBe(1)

        // Each line is logged inside the span of the same name, which ends with
        // the outcome even when the caller's effect failed.
        const starts = t.named("cloudflare.execution.start")
        expect(starts.map((span) => span.attributes.get("smithers.execution.start"))).toEqual([
          "accepted",
          "failed",
          "failed",
          "duplicate",
          "conflict"
        ])
        // A conflict is this function's own failure and carries ids only; a
        // failed caller effect is the caller's, and its span still succeeds.
        expect(starts.map((span) => span.status)).toEqual([
          ...Array.from(
            { length: 4 },
            () => expect.objectContaining({ _tag: "Ended", exit: expect.objectContaining({ _tag: "Success" }) })
          ),
          expect.objectContaining({ _tag: "Ended", exit: expect.objectContaining({ _tag: "Failure" }) })
        ])
        for (const span of starts) expect(span.attributes.get("smithers.execution.id")).toBe(executionId)
        // Every start line names its execution and flow, the conflict included.
        expect(t.lines("cloudflare.execution.start").map((line) => line.annotations)).toEqual(
          starts.map((span, index) =>
            expect.objectContaining({
              trace_id: span.traceId,
              span_id: span.spanId,
              outcome: span.attributes.get("smithers.execution.start"),
              "smithers.execution.id": executionId,
              "smithers.flow": Answer._tag,
              ...(index === 1 ? { "error.type": "Leaky" } : index === 2 ? { "error.type": "unknown" } : {})
            })
          )
        )
        const alarms = t.named("cloudflare.execution.alarm")
        expect(alarms.map((span) => span.attributes.get("smithers.execution.alarm"))).toEqual([
          "retrying",
          "settled",
          "forgotten"
        ])
        expect(alarms[2]!.attributes.get("smithers.execution.id")).toBe(executionId)
        // Every alarm line names its execution and flow, the forgotten one included.
        const ids = { "smithers.execution.id": executionId, "smithers.flow": Answer._tag }
        for (const line of t.lines("cloudflare.execution.start")) expect(line.annotations).toMatchObject(ids)
        expect(t.lines("cloudflare.execution.request")[0]?.annotations).toMatchObject({
          ...ids,
          requestedAtMs: expect.any(Number)
        })
        expect(t.lines("cloudflare.execution.alarm")[0]?.annotations).toMatchObject({
          retryAtMs: expect.any(Number),
          delayMs: 1000
        })
        expect(t.lines("flow.run.created")[0]?.annotations).toMatchObject({
          ...ids,
          createdAtMs: expect.any(Number)
        })
        expect(t.lines("flow.run.claimed")[0]?.annotations).toMatchObject({
          "smithers.execution.id": executionId,
          claimedAtMs: expect.any(Number)
        })
        // How long building the runtime took, so a slow start says whether the runtime or the drive held it.
        expect(t.lines("cloudflare.execution.ready")[0]?.annotations).toMatchObject({
          ...ids,
          readyAtMs: expect.any(Number),
          "smithers.execution.build_ms": expect.any(Number)
        })
        const idle = {
          durationMs: expect.any(Number),
          events: 0,
          transactions: 0,
          schemaWide: 0,
          lockWaitMs: 0,
          maxLockWaitMs: 0
        }
        const drove = {
          durationMs: expect.any(Number),
          events: written,
          transactions: expect.any(Number),
          schemaWide: expect.any(Number),
          lockWaitMs: expect.any(Number),
          maxLockWaitMs: expect.any(Number)
        }
        expect(t.lines("cloudflare.execution.alarm").map((line) => line.annotations)).toEqual([
          expect.objectContaining({
            trace_id: alarms[0]!.traceId,
            span_id: alarms[0]!.spanId,
            outcome: "retrying",
            "error.type": "Leaky",
            "smithers.execution.attempt": 1,
            ...ids,
            ...idle
          }),
          expect.objectContaining({
            trace_id: alarms[1]!.traceId,
            span_id: alarms[1]!.spanId,
            outcome: "settled",
            ...ids,
            ...drove
          }),
          expect.objectContaining({
            trace_id: alarms[2]!.traceId,
            span_id: alarms[2]!.spanId,
            outcome: "forgotten",
            ...ids,
            ...idle
          })
        ])
        const settled = t.lines("cloudflare.execution.alarm")[1]!.annotations as Record<string, number>
        // Where the alarm's time went: building the runtime, driving, and routing what the drive left.
        for (const part of ["build_ms", "drive_ms", "route_ms"]) {
          expect(settled[`smithers.execution.${part}`]).toBeGreaterThanOrEqual(0)
        }
        expect(t.lines("cloudflare.execution.alarm")[0]!.annotations).not.toHaveProperty("smithers.execution.route_ms")
        expect(written).toBeGreaterThan(0)
        expect(settled.transactions).toBeGreaterThan(0)
        expect(settled.durationMs).toBeGreaterThan(0)
        // The span carries the same cost.
        expect(alarms.map((span) => span.attributes.get("events"))).toEqual([0, written, 0])

        // No content anywhere: not in a line, an attribute, an event, a failed
        // span's cause or a metric's attributes, the engine's own included.
        expect(json(t.logs)).not.toContain(sentinel)
        for (const span of t.spans) {
          expect(json([...span.attributes])).not.toContain(sentinel)
          expect(json(span.events)).not.toContain(sentinel)
          // An exporter turns a failed span's cause into exception events; a
          // success value is never exported.
          if (span.status._tag === "Ended" && Exit.isFailure(span.status.exit)) {
            expect(json(span.status.exit.cause)).not.toContain(sentinel)
          }
        }
        expect(json(t.snapshot().map((metric) => metric.attributes))).not.toContain(sentinel)
      })
    )
  })

  it.live("a failed cancellation records its cause without exporting storage content", () => {
    const t = telemetry()
    const memory = MemoryStorage.make()
    const host = ExecutionObject.make({
      ...memory.storage,
      put: (key, value) =>
        key === ExecutionObject.cancelledKey
          ? Effect.die(new Leaky({ detail: sentinel })) :
          memory.storage.put(key, value)
    }, { flows: [], runtime: () => Layer.empty as never, router: Objects.unrouted })
    return t.observed(Effect.exit(host.cancel())).pipe(Effect.map((exit) => {
      expect(Exit.isFailure(exit)).toBe(true)
      expect(t.lines("cloudflare.execution.cancel")[0]?.annotations).toMatchObject({
        outcome: "failed",
        "error.type": "Leaky"
      })
      for (const span of t.spans) {
        if (span.status._tag === "Ended" && Exit.isFailure(span.status.exit)) {
          expect(json(span.status.exit.cause)).not.toContain(sentinel)
        }
      }
      expect(json(t.logs)).not.toContain(sentinel)
    }))
  })

  it.live("routing counts what it started and woke, and a wake logs inside its span", () => {
    const t = telemetry()
    const schema = Postgres.freshSchema()
    const parentId = `parent-${randomUUID()}`
    const objects = Objects.make({
      flows: NestedFlows.flows,
      runtime: NestedFlows.runtime({ record: Effect.succeed, database: Postgres.database(schema) })
    })
    return t.observed(Effect.gen(function*() {
      const intent = yield* ExecutionObject.intent(NestedFlows.Parent, {
        executionId: parentId,
        payload: { label: sentinel }
      })
      yield* ExecutionObject.start(objects.object(parentId).storage, intent, Effect.void)
      yield* objects.run()
      // An object that holds no execution stays idle.
      expect(yield* ExecutionObject.wake(objects.object("nobody").storage)).toBe(false)
    })).pipe(
      Effect.ensuring(Effect.promise(() => Postgres.dropSchema(schema))),
      Effect.andThen(Effect.sync(() => {
        expect(t.count(ExecutionObject.routed, { route: "start" })).toBe(1)
        expect(t.count(ExecutionObject.routed, { route: "wake" })).toBe(1)
        expect(t.count(ExecutionObject.wakes, { outcome: "armed" })).toBe(1)
        expect(t.count(ExecutionObject.wakes, { outcome: "idle" })).toBe(1)

        // The parent's first alarm started the child; the child's woke the parent.
        const alarms = t.named("cloudflare.execution.alarm")
        expect(alarms.map((span) => [
          span.attributes.get("smithers.execution.alarm"),
          span.attributes.get("smithers.execution.started"),
          span.attributes.get("smithers.execution.woken")
        ])).toEqual([["parked", 1, 0], ["settled", 0, 1], ["settled", 0, 0]])
        const wakes = t.named("cloudflare.execution.wake")
        expect(wakes.map((span) => span.attributes.get("smithers.execution.wake"))).toEqual(["armed", "idle"])
        expect(t.lines("cloudflare.execution.wake").map((line) => line.annotations)).toEqual(
          wakes.map((span) =>
            expect.objectContaining({
              trace_id: span.traceId,
              span_id: span.spanId,
              outcome: span.attributes.get("smithers.execution.wake")
            })
          )
        )
        expect(json(t.logs)).not.toContain(sentinel)
        for (const span of t.spans) expect(json([...span.attributes])).not.toContain(sentinel)
      }))
    )
  })

  /**
   * One alarm of an `Answer` execution whose question is the sentinel, over
   * `schema` after `prepare` ran on it, at `databaseUrl`. Answers the
   * alarm's outcome and the annotations of its log line.
   */
  const failedAlarm = (
    prepare: (sql: SqlClient.SqlClient, schema: string) => Effect.Effect<unknown, unknown>,
    databaseUrl = Postgres.url
  ) => {
    const t = telemetry()
    const schema = Postgres.freshSchema()
    const executionId = `answer-${randomUUID()}`
    const memory = MemoryStorage.make()
    return t.observed(Effect.gen(function*() {
      yield* Effect.promise(() => Postgres.admin(Effect.flatMap(SqlClient.SqlClient, (sql) => prepare(sql, schema))))
      const value = yield* ExecutionObject.intent(Answer, { executionId, payload: { question: sentinel, pauseMs: 0 } })
      yield* ExecutionObject.start(memory.storage, value, Effect.void)
      return yield* ExecutionObject.alarm(memory.storage, {
        flows: [Answer],
        runtime: runtime({
          hostId: executionId,
          database: Postgres.database(schema, databaseUrl),
          record: Effect.succeed
        }),
        router: Objects.unrouted
      })
    })).pipe(
      Effect.ensuring(Effect.promise(() => Postgres.dropSchema(schema))),
      Effect.map((outcome) => {
        const lines = t.lines("cloudflare.execution.alarm")
        expect(lines).toHaveLength(1)
        expect(json(t.logs)).not.toContain(sentinel)
        for (const span of t.spans) expect(json([...span.attributes])).not.toContain(sentinel)
        return { outcome, annotations: lines[0]!.annotations as Record<string, unknown> }
      })
    )
  }

  it.live("a failed migration's alarm logs the migration, its statement and the database's code and message", () =>
    Effect.gen(function*() {
      // A table in the way of the journal's first migration.
      const { annotations, outcome } = yield* failedAlarm((sql, schema) =>
        Effect.andThen(
          sql`CREATE SCHEMA ${sql(schema)}`,
          sql`CREATE TABLE ${sql(schema)}.flows_journal_events (id INTEGER)`
        )
      )
      const detail = {
        "db.error": "SqlSyntaxError",
        "db.response.status_code": "42P07",
        "error.message": "Migration \"1_journal_initial\" failed",
        "db.migration": "1_journal_initial",
        "db.migration.kind": "Failed",
        "db.error.message": "relation \"flows_journal_events\" already exists",
        "db.query.text": expect.stringMatching(/^CREATE TABLE flows_journal_events \(/)
      }
      expect(outcome).toEqual({
        _tag: "Retrying",
        attempt: 1,
        retryAtMs: expect.any(Number),
        failure: "MigrationError",
        detail
      })
      expect(annotations).toMatchObject({
        outcome: "retrying",
        "error.type": "MigrationError",
        "smithers.flow": Answer._tag,
        "smithers.execution.id": expect.stringMatching(/^answer-/),
        ...detail
      })
    }))

  it.live("a migration the ledger contradicts logs the migration error's own text, and no database detail", () =>
    Effect.gen(function*() {
      const { annotations, outcome } = yield* failedAlarm((sql, schema) =>
        Effect.gen(function*() {
          yield* sql`CREATE SCHEMA ${sql(schema)}`
          yield* sql`CREATE TABLE ${sql(schema)}.flows_migrations (
            migration_id INTEGER PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), name TEXT NOT NULL
          )`
          yield* sql`INSERT INTO ${sql(schema)}.flows_migrations (migration_id, name) VALUES (1, 'journal_renamed')`
        })
      )
      const detail = {
        "error.message": "Migration 1 was recorded as journal_renamed, but this package declares journal_initial",
        "db.migration.kind": "BadState"
      }
      expect(outcome).toMatchObject({ _tag: "Retrying", failure: "MigrationError", detail })
      expect(Object.keys((outcome as { detail: object }).detail).sort()).toEqual(Object.keys(detail).sort())
      expect(annotations).toMatchObject(detail)
    }))

  it.live("an unreachable database's alarm logs the SQL error's kind and the driver's text for it, and nothing else", () =>
    Effect.gen(function*() {
      const closed = new URL(Postgres.url)
      closed.port = "1"
      const { annotations, outcome } = yield* failedAlarm(() => Effect.void, closed.toString())
      const detail = { "db.error": "ConnectionError", "db.error.message": "PgConnection: Failed to connect" }
      expect(outcome).toMatchObject({ _tag: "Retrying", failure: "SqlError", detail })
      expect(Object.keys((outcome as { detail: object }).detail).sort()).toEqual(Object.keys(detail).sort())
      expect(annotations).toMatchObject({ "error.type": "SqlError", ...detail })
    }))
})
