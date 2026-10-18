// The statements ChatApi runs on `messages` (worker/Messages.ts), against the compose Postgres in this file's own schema.
import { Deferred, Effect, Fiber } from "effect"
import { SqlClient, SqlError } from "effect/sql"
import { describe, expect, test } from "vitest"
import * as TestDatabase from "../db/TestDatabase.ts"
import * as Messages from "./Messages.ts"
import { eventually, row, rowCount, testFile, uuid } from "./test/harness.ts"

const runtime = testFile("messages")

/** Runs `effect` on a connection of its own, as ChatApi does for each request. */
const alone = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const scratch = yield* TestDatabase.Scratch
      return yield* Effect.provide(effect, scratch.database)
    }),
  )

/** Settles a streaming answer with `text`, as the answer routes do (worker/Answers.ts). */
const settle = (answerId: string, text: string, status: "done" | "failed") =>
  runtime.runPromise(
    Effect.flatMap(
      SqlClient.SqlClient,
      (sql) =>
        sql`UPDATE messages SET status = ${status}, text = ${text},
          failure = ${status === "failed" ? "model_error" : null}
          WHERE id = ${answerId} AND status = 'streaming'`,
    ),
  )

/** The ids of every message, in the conversation's order. */
const order = () =>
  runtime.runPromise(
    Effect.map(
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) => sql<{ readonly id: string }>`SELECT id FROM messages ORDER BY position`,
      ),
      (rows) => rows.map((found) => found.id),
    ),
  )

describe("ask", () => {
  test("inserts the question and its empty streaming answer in one transaction, the answer next", async () => {
    const ids = { id: uuid(), answerId: uuid() }
    const asked = await runtime.runPromise(Messages.ask({ ...ids, text: "Say hi." }))
    const question = await row(runtime, ids.id)
    const answer = await row(runtime, ids.answerId)
    expect(question).toMatchObject({
      role: "user",
      text: "Say hi.",
      status: "done",
      questionId: null,
      xmin: asked.txid,
    })
    expect(answer).toMatchObject({
      role: "assistant",
      text: "",
      status: "streaming",
      questionId: ids.id,
      xmin: asked.txid,
      position: question.position + 1,
    })
  })

  test("takes no lock: an ask held mid-statement while another transaction asks keeps its answer next", async () => {
    // The ask of "held" waits, after its question has drawn a position, until another transaction lets it go: a
    // trigger in this file's schema only, on an advisory lock that transaction holds.
    const key = 4_242_001
    const first = { id: uuid(), answerId: uuid() }
    const second = { id: uuid(), answerId: uuid() }
    const held = { id: uuid(), answerId: uuid() }
    const locked = await runtime.runPromise(Deferred.make<void>())
    const go = await runtime.runPromise(Deferred.make<void>())
    await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql.unsafe(`CREATE FUNCTION hold() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN IF NEW.text = 'held' THEN PERFORM pg_advisory_xact_lock(${key}); END IF; RETURN NEW; END $$`)
        yield* sql.unsafe(`CREATE TRIGGER hold BEFORE INSERT ON messages FOR EACH ROW EXECUTE FUNCTION hold()`)
      }),
    )
    // The other transaction asks, takes the lock, stays open until `go`, asks again, then commits.
    const other = runtime.runFork(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* Messages.ask({ ...first, text: "first" })
            yield* sql`SELECT pg_advisory_xact_lock(${key})`
            yield* Deferred.succeed(locked, undefined)
            yield* Deferred.await(go)
            yield* Messages.ask({ ...second, text: "second" })
          }),
        )
      }),
    )
    await runtime.runPromise(Deferred.await(locked))
    const asking = alone(Messages.ask({ ...held, text: "held" }))
    try {
      // What this file's connections wait on.
      const waiting = () =>
        runtime.runPromise(
          Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient
            const scratch = yield* TestDatabase.Scratch
            return yield* sql<{ readonly locktype: string; readonly objid: string }>`
              SELECT l.locktype, l.objid::int8::text AS objid
              FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
              WHERE NOT l.granted AND a.application_name = ${scratch.name}`
          }),
        )
      await eventually(async () => (await waiting()).length > 0)
      // It waits in the trigger, on the other transaction's lock: no lock of asking's own held it back.
      expect(await waiting()).toEqual([{ locktype: "advisory", objid: String(key) }])
    } finally {
      await runtime.runPromise(Deferred.succeed(go, undefined))
      await runtime.runPromise(Fiber.await(other))
      await asking.catch(() => undefined)
      await runtime.runPromise(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql.unsafe(`DROP TRIGGER hold ON messages`)
          yield* sql.unsafe(`DROP FUNCTION hold()`)
        }),
      )
    }
    expect((await asking).txid).toEqual(expect.any(Number))
    // "held" drew its position before "second" did, and its answer still comes right after it.
    expect(await order()).toEqual([first.id, first.answerId, held.id, held.answerId, second.id, second.answerId])
    for (const ids of [first, held, second]) {
      expect((await row(runtime, ids.answerId)).position).toBe((await row(runtime, ids.id)).position + 1)
    }
  })

  test("a retry of the same question changes nothing, whether its answer streams or has settled", async () => {
    const question = { id: uuid(), answerId: uuid(), text: "Ask me once." }
    await runtime.runPromise(Messages.ask(question))
    expect(await runtime.runPromise(Messages.ask(question))).toEqual({ txid: null })
    await settle(question.answerId, "Once.", "done")
    expect(await runtime.runPromise(Messages.ask(question))).toEqual({ txid: null })
    expect(await rowCount(runtime)).toBe(2)
    expect(await row(runtime, question.answerId)).toMatchObject({ status: "done", text: "Once." })
  })

  test("an answer id another message has fails the statement, and the question isn't written either", async () => {
    const answerId = uuid()
    await runtime.runPromise(Messages.ask({ id: uuid(), answerId, text: "first" }))
    const clash = uuid()
    const error = await runtime.runPromise(Effect.flip(Messages.ask({ id: clash, answerId, text: "second" })))
    expect(SqlError.isSqlError(error) && error.reason._tag).toBe("UniqueViolation")
    expect(await rowCount(runtime)).toBe(2)
    expect(await order()).not.toContain(clash)
  })
})

describe("history", () => {
  /** A question and its answer: finished, failed, or still streaming. */
  const exchange = (question: string, answer: string, status: "done" | "failed" | "streaming") =>
    runtime.runPromise(
      Effect.gen(function* () {
        const ids = { id: uuid(), answerId: uuid() }
        yield* Messages.ask({ ...ids, text: question })
        return ids
      }),
    ).then(async (ids) => {
      if (status !== "streaming") await settle(ids.answerId, answer, status)
      return ids
    })

  test("is the finished exchanges before the answer, oldest first", async () => {
    await exchange("one", "1", "done")
    await exchange("broken", "", "failed")
    await exchange("elsewhere", "", "streaming")
    await exchange("two", "2", "done")
    const target = await exchange("target", "", "streaming")
    await exchange("after", "later", "done")
    expect(await runtime.runPromise(Messages.history(target.answerId))).toEqual([
      { question: "one", answer: "1" },
      { question: "two", answer: "2" },
    ])
  })
})
