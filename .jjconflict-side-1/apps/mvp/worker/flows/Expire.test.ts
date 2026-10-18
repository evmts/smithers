// `chat/Expire` (worker/flows/Expire.ts, docs/features/agent.md#settling) on the Node host (worker/test/flowHost.ts)
// and as its steps alone, over this file's schema of the compose Postgres (`pnpm db:up`). Answers are asked through
// ChatApi's real handler, and the device that asked is the browser's agent on the Node host (src/test/agent.ts), with a
// scripted model.
import { Logger as StructuredLogger } from "@smthrs/observability"
import { Cause, ConfigProvider, Deferred, Duration, Effect, Exit, Logger, Metric, Redacted, Stream } from "effect"
import { SqlClient } from "effect/sql"
import { afterEach, describe, expect, test } from "vitest"
import * as Database from "../../db/Database.ts"
import * as TestDatabase from "../../db/TestDatabase.ts"
import { AnswerSettled } from "../../src/features/agent/answers.ts"
import { answerRow, cell, type Engine, openAgent } from "../../src/test/agent.ts"
import { runFlow } from "../test/flowHost.ts"
import { stop, testFile, usage } from "../test/harness.ts"
import * as Expire from "./Expire.ts"

const runtime = testFile("expire")

const engines: Array<Engine> = []
afterEach(async () => {
  for (const engine of engines.splice(0)) await engine.kill()
})

/** The flow's services over this file's schema, with answers expiring `after` they were asked. */
const services = async (after: Duration.Input = Duration.zero): Promise<Expire.Services<unknown>> => ({
  database: (await runtime.runPromise(Effect.service(TestDatabase.Scratch))).database,
  expiry: Duration.fromInputUnsafe(after),
})

const run = async (answerId: string, after?: Duration.Input) =>
  runFlow(Expire.Expire, { answerId }, Expire.registration(await services(after)), {
    executionId: Expire.executionId(answerId),
  })

/** A model that answers every call with one cell that ends the run. */
const answering = (text: string) => () =>
  Stream.make({ type: "text-delta" as const, id: "t", text: cell(`ctx.done(${JSON.stringify(text)})`) }, usage, stop)

/** How long after it was asked an answer last changed, in milliseconds. */
const settledAfter = (answerId: string) =>
  runtime.runPromise(
    Effect.flatMap(SqlClient.SqlClient, (sql) =>
      sql<{ readonly ms: number }>`
        SELECT (extract(epoch FROM updated_at - created_at) * 1000)::float8 AS ms
        FROM messages WHERE id = ${answerId}`),
  ).then(([row]) => row!.ms)

const SENTINEL = "SENTINEL-answer-text"

describe("chat/Expire", () => {
  test("settles an answer still streaming once it is old enough: failed, abandoned, keeping its text", async () => {
    const agent = await openAgent(runtime, answering("Never sent."))
    const answerId = await agent.ask("Asked, then the phone was shut")
    await agent.fetch(`http://chat.test/api/answers/${answerId}`, {
      method: "POST",
      body: JSON.stringify({ status: "streaming", parts: [], text: SENTINEL }),
    })

    const ran = await run(answerId)

    expect(ran.exit).toEqual(Exit.succeed({ outcome: "abandoned" }))
    expect(ran.status).toBe("completed")
    expect(await answerRow(runtime, answerId)).toMatchObject({ status: "failed", failure: "abandoned", text: SENTINEL })
  })

  test("waits on a durable timer until the answer is the expiry old, counted from when it was asked", async () => {
    const agent = await openAgent(runtime, answering("Never sent."))
    const answerId = await agent.ask("Asked")

    const ran = await run(answerId, "1 seconds")

    expect(ran.exit).toEqual(Exit.succeed({ outcome: "abandoned" }))
    expect(await settledAfter(answerId)).toBeGreaterThanOrEqual(1_000)
  })

  test("leaves an answer that settled as it is", async () => {
    const agent = await openAgent(runtime, answering("Done in time."))
    const engine = await agent.engine()
    engines.push(engine)
    const answerId = await agent.ask("Quick one")
    expect(await agent.answer(engine, answerId)).toEqual(Exit.succeed({ status: "done" }))

    const ran = await run(answerId)

    expect(ran.exit).toEqual(Exit.succeed({ outcome: "settled" }))
    expect(await answerRow(runtime, answerId)).toMatchObject({ status: "done", text: "Done in time.", failure: null })
  })

  test("finds no answer under an id Postgres doesn't hold, at once", async () => {
    const ran = await run(crypto.randomUUID(), "1 hours")
    expect(ran.exit).toEqual(Exit.succeed({ outcome: "missing" }))
  })

  test("a device that comes back after it fired finds its answer settled: the run fails AnswerSettled", async () => {
    const reached = Effect.runSync(Deferred.make<void>())
    let calls = 0
    const agent = await openAgent(runtime, () => {
      calls++
      // The first call never ends: the phone is shut mid-answer. The resumed run's call answers.
      return calls === 1
        ? Stream.fromEffect(Deferred.succeed(reached, undefined)).pipe(Stream.flatMap(() => Stream.never))
        : answering("Too late.")()
    })
    const first = await agent.engine()
    const answerId = await agent.ask("Asked, then the phone was shut mid-answer")
    const running = agent.start(first, answerId)
    await Effect.runPromise(Deferred.await(reached))
    await first.crash()

    const expired = await run(answerId)
    const second = await agent.engine(first.schema)
    engines.push(second)
    const exit = await agent.resume(second, answerId)
    await running.stop()
    await first.kill()

    expect(expired.exit).toEqual(Exit.succeed({ outcome: "abandoned" }))
    expect(Exit.isFailure(exit) ? Cause.squash(exit.cause) : exit).toEqual(new AnswerSettled())
    expect(await answerRow(runtime, answerId)).toMatchObject({ status: "failed", failure: "abandoned", text: "" })
  })

  test("each step logs and counts its outcome, never the text; Postgres failing is the reason database", async () => {
    const agent = await openAgent(runtime, answering("Never sent."))
    const answerId = await agent.ask(SENTINEL)
    const lines: Array<ReturnType<typeof StructuredLogger.formatStructured.log>> = []
    const registry: Metric.MetricRegistry = new Map()
    const observed = <A, E>(effect: Effect.Effect<A, E>) =>
      Effect.runPromiseExit(
        effect.pipe(
          Effect.provideService(
            Logger.CurrentLoggers,
            new Set([Logger.make((options) => void lines.push(StructuredLogger.formatStructured.log(options)))]),
          ),
          Effect.provideService(Metric.MetricRegistry, registry),
        ),
      )
    const live = await services()
    const down: Expire.Services<unknown> = {
      database: Database.layer(Effect.succeed(Redacted.make("postgresql://smithers:smithers@127.0.0.1:1/smithers"))),
      expiry: Duration.zero,
    }

    const due = await observed(Expire.observedExpiresAt(answerId, live))
    const abandoned = await observed(Expire.observedAbandon(answerId, live))
    const again = await observed(Expire.observedAbandon(answerId, live))
    const failed = await observed(Expire.observedAbandon(answerId, down))
    const failedDue = await observed(Expire.observedExpiresAt(answerId, down))

    expect(Exit.isSuccess(due) && due.value).toBeGreaterThan(0)
    expect(abandoned).toEqual(Exit.succeed({ outcome: "abandoned" }))
    expect(again).toEqual(Exit.succeed({ outcome: "settled" }))
    for (const exit of [failed, failedDue] as ReadonlyArray<Exit.Exit<unknown, Expire.ExpiryFailed>>) {
      expect(Exit.isFailure(exit) ? Cause.squash(exit.cause) : exit).toEqual(
        new Expire.ExpiryFailed({ reason: "database" }),
      )
    }
    const records = lines.filter((line) => line.message === "chat.answer.expire")
    expect(records.map((line) => [line.level, line.annotations.outcome])).toEqual([
      ["INFO", "abandoned"],
      ["INFO", "settled"],
      ["WARN", "failed"],
      ["WARN", "failed"],
    ])
    expect(records[2]!.annotations).toMatchObject({ answerId, errorCode: expect.stringMatching(/^sql:/) })
    expect(JSON.stringify(lines)).not.toContain(SENTINEL)
    const count = (outcome: string) =>
      Effect.runSync(
        Metric.value(Metric.withAttributes(Expire.expiries, { outcome })).pipe(
          Effect.provideService(Metric.MetricRegistry, registry),
        ),
      ).count
    expect([count("abandoned"), count("settled"), count("failed")]).toEqual([1, 1, 2])
  })
})

describe("ANSWER_EXPIRY", () => {
  const read = (config: Record<string, string>) =>
    Effect.runPromiseExit(
      Expire.expiry.pipe(Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown(config))),
    )

  test("is 25 minutes unless set: the turn wait and the settle's window, 10 minutes each, and 5 more", async () => {
    expect(Duration.toMinutes(Expire.DEFAULT_EXPIRY)).toBe(25)
    expect(await read({})).toEqual(Exit.succeed(Expire.DEFAULT_EXPIRY))
    expect(Exit.map(await read({ ANSWER_EXPIRY: "2 hours" }), Duration.toMinutes)).toEqual(Exit.succeed(120))
    expect(Exit.isFailure(await read({ ANSWER_EXPIRY: "soon" }))).toBe(true)
  })
})
