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

const sql = (statement: string) =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, (client) => Effect.orDie(client.unsafe(statement))))

/** How long ago, on Postgres' clock, an answer last changed, in milliseconds. */
const msSinceChanged = (answerId: string) =>
  sql(`SELECT (extract(epoch FROM now() - updated_at) * 1000)::float8 AS ms FROM messages WHERE id = '${answerId}'`)
    .then((rows) => (rows as unknown as ReadonlyArray<{ readonly ms: number }>)[0]!.ms)

/** How long after `earlier` last changed `later` did, in milliseconds. */
const msBetween = (earlier: string, later: string) =>
  sql(`SELECT (extract(epoch FROM l.updated_at - e.updated_at) * 1000)::float8 AS ms
    FROM messages e, messages l WHERE e.id = '${earlier}' AND l.id = '${later}'`)
    .then((rows) => (rows as unknown as ReadonlyArray<{ readonly ms: number }>)[0]!.ms)

/** Settles an answer `done`, as its device's run does. */
const settle = (answerId: string) =>
  sql(`UPDATE messages SET status = 'done', text = 'Answered.', updated_at = now() WHERE id = '${answerId}'`)

/** The answers' statuses, in order. */
const statuses = async (answerIds: ReadonlyArray<string>) => {
  const rows = (await sql(`SELECT id, status FROM messages WHERE id IN (${answerIds.map((id) => `'${id}'`).join(", ")})`)) as
    unknown as ReadonlyArray<{ readonly id: string; readonly status: string }>
  return answerIds.map((id) => rows.find((row) => row.id === id)!.status)
}

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

  test("an abandoned answer's run fails too, and its launcher's notification says so (decision 0009)", async () => {
    const agent = await openAgent(runtime, answering("Never sent."))
    const answerId = await agent.ask("Asked, then the tab was closed")
    const report = await agent.fetch(`http://chat.test/api/runs/${answerId}`, {
      method: "POST",
      body: JSON.stringify({ status: "working" }),
    })
    expect(report.status).toBe(200)

    expect((await run(answerId)).exit).toEqual(Exit.succeed({ outcome: "abandoned" }))
    const runRows = (await sql(`SELECT status, waiting FROM runs WHERE id = '${answerId}'`)) as unknown as ReadonlyArray<
      Record<string, unknown>
    >
    expect(runRows).toEqual([{ status: "failed", waiting: null }])
    const notices = (await sql(
      `SELECT state, version FROM notifications WHERE subject = 'run:${answerId}'`,
    )) as unknown as ReadonlyArray<Record<string, unknown>>
    expect(notices).toEqual([{ state: "failed", version: 2 }])
  })

  test.each(["run", "answer", "both"] as const)("settles a stale Working notice when the %s record is gone", async (missing) => {
    const agent = await openAgent(runtime, answering("Never sent."))
    const answerId = await agent.ask("Use the sandbox tools on this branch")
    expect((await agent.fetch(`http://chat.test/api/runs/${answerId}`, {
      method: "POST", body: JSON.stringify({ status: "working" }),
    })).status).toBe(200)
    if (missing !== "answer") await sql(`DELETE FROM runs WHERE id = '${answerId}'`)
    if (missing !== "run") await sql(`DELETE FROM messages WHERE id = '${answerId}'`)
    expect(await runtime.runPromise(Expire.abandon(answerId, Duration.zero)))
      .toEqual({ outcome: missing === "run" ? "abandoned" : "missing" })
    expect(await sql(`SELECT state, version FROM notifications WHERE subject = 'run:${answerId}'`))
      .toEqual([{ state: "failed", version: 2 }])
  })

  test("waits on a durable timer until the answer is the expiry old, counted from when it was asked", async () => {
    const agent = await openAgent(runtime, answering("Never sent."))
    const answerId = await agent.ask("Asked")

    const ran = await run(answerId, "1 seconds")

    expect(ran.exit).toEqual(Exit.succeed({ outcome: "abandoned" }))
    expect(await settledAfter(answerId)).toBeGreaterThanOrEqual(1_000)
  })

  // Answers come in turn, so the tail of a burst can wait longer than the expiry while every answer before it settles
  // in time. Its expiry counts from when the queue before it last moved, never from the ask (client-fix review).
  test("a burst's last answer expires only once the queue before it stopped moving, not after it was asked", async () => {
    const agent = await openAgent(runtime, answering("Never sent."))
    const answers: Array<string> = []
    for (let i = 1; i <= 25; i++) answers.push(await agent.ask(`Question ${i}`))
    const last = answers.at(-1)!
    // Its device is gone. Every answer before it settles 250 ms after the one before it, 6 s in all, while the
    // expiry is 1.5 s.
    const expiring = run(last, "1500 millis")
    let previous = last
    for (const answerId of answers.slice(0, -1)) {
      await expect.poll(() => msSinceChanged(previous), { interval: 20, timeout: 10_000 }).toBeGreaterThanOrEqual(250)
      await settle(answerId)
      previous = answerId
    }
    const ran = await expiring

    expect(ran.exit).toEqual(Exit.succeed({ outcome: "abandoned" }))
    expect(ran.status).toBe("completed")
    expect(await answerRow(runtime, last)).toMatchObject({ status: "failed", failure: "abandoned" })
    // It waited the whole expiry after the answer before it settled, and every answer before it settled as it did.
    expect(await msBetween(answers.at(-2)!, last)).toBeGreaterThanOrEqual(1_500)
    expect(await statuses(answers.slice(0, -1))).toEqual(answers.slice(0, -1).map(() => "done"))
  }, 60_000)

  test("counts from the queue's last movement: an earlier answer's settle or write, or the answer's own write", async () => {
    const agent = await openAgent(runtime, answering("Never sent."))
    const [first, second, third] = [await agent.ask("One"), await agent.ask("Two"), await agent.ask("Three")]
    const live = await services("25 minutes")
    const expiresIn = (answerId: string) => Effect.runPromise(Expire.observedExpiresIn(answerId, live))
    const abandon = (answerId: string) => Effect.runPromise(Expire.observedAbandon(answerId, live))
    // All three were asked an hour ago and nothing has moved since: the third is due at once.
    await sql(`UPDATE messages SET created_at = now() - interval '1 hour', updated_at = now() - interval '1 hour'`)
    expect(await expiresIn(third)).toBe(0)
    // The first settled a minute ago: the third's turn began then, so it has 24 minutes left and isn't abandoned.
    await sql(`UPDATE messages SET status = 'done', text = 'x', updated_at = now() - interval '1 minute'
      WHERE id = '${first}'`)
    expect(await expiresIn(third)).toBeGreaterThan(23.9 * 60_000)
    expect(await expiresIn(third)).toBeLessThanOrEqual(24 * 60_000)
    expect(await abandon(third)).toEqual({ outcome: "waiting" })
    // The second, still streaming, was written 2 minutes ago, before that settle: the settle still counts.
    await sql(`UPDATE messages SET updated_at = now() - interval '2 minutes' WHERE id = '${second}'`)
    expect(await expiresIn(third)).toBeGreaterThan(23.9 * 60_000)
    // Then it writes again, now: the queue moved now.
    await sql(`UPDATE messages SET updated_at = now() WHERE id = '${second}'`)
    expect(await expiresIn(third)).toBeGreaterThan(24.9 * 60_000)
    // The third's own write moves it too, as its device does while it waits its turn.
    await sql(`UPDATE messages SET updated_at = now() - interval '1 hour' WHERE id IN ('${first}', '${second}')`)
    await sql(`UPDATE messages SET updated_at = now() WHERE id = '${third}'`)
    expect(await expiresIn(third)).toBeGreaterThan(24.9 * 60_000)
    expect(await abandon(third)).toEqual({ outcome: "waiting" })
    expect(await answerRow(runtime, third)).toMatchObject({ status: "streaming" })
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

    const due = await observed(Expire.observedExpiresIn(answerId, live))
    const abandoned = await observed(Expire.observedAbandon(answerId, live))
    const again = await observed(Expire.observedAbandon(answerId, live))
    const failed = await observed(Expire.observedAbandon(answerId, down))
    const failedDue = await observed(Expire.observedExpiresIn(answerId, down))

    expect(due).toEqual(Exit.succeed(0))
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
