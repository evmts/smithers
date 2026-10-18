// The answer routes (worker/Answers.ts, docs/features/agent.md#the-answer-routes), through ChatApi's real handler on
// this file's schema of the compose Postgres (`pnpm db:up`). No model runs here: the browser's agent is what calls
// these routes, and src/features/agent/agent.test.ts runs it against them.
import { Effect, Redacted, Stream } from "effect"
import { SqlClient } from "effect/sql"
import { describe, expect, test } from "vitest"
import * as Database from "../db/Database.ts"
import { AGENT_LIVE_SECONDS } from "../src/features/model/contract.ts"
import { answerRow } from "../src/test/agent.ts"
import type { Actor } from "./Actor.ts"
import * as Answers from "./Answers.ts"
import { harness, recorded, row, testFile } from "./test/harness.ts"

const runtime = testFile("answers")

const member: Actor = { subject: { kind: "person", id: "person-member" }, role: "member" }

const open = (options: { readonly actor?: Actor | null; readonly config?: Record<string, string> } = {}) =>
  harness(runtime, () => Stream.empty, {
    ...(options.actor === null ? {} : { actor: options.actor ?? member }),
    ...(options.config === undefined ? {} : { config: options.config }),
  })

type Harness = Awaited<ReturnType<typeof open>>

/** Asks `text`; resolves with the answer's id. */
const ask = async (h: Harness, text: string) => {
  const question = { id: crypto.randomUUID(), answerId: crypto.randomUUID(), text }
  expect((await h.ask(question)).status).toBe(202)
  return question.answerId
}

/** Settles an answer as the agent would, through the route. */
const write = (h: Harness, answerId: string, body: unknown) =>
  h.fetch(`/api/answers/${answerId}`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) })

const turn = (h: Harness, answerId: string) => h.fetch(`/api/answers/${answerId}`)

/** Dates an answer's last write `seconds` ago, as if its device had gone quiet that long. */
const quiet = (answerId: string, seconds: number) =>
  runtime.runPromise(
    Effect.flatMap(
      SqlClient.SqlClient,
      (sql) => sql`UPDATE messages SET updated_at = now() - make_interval(secs => ${seconds}) WHERE id = ${answerId}`,
    ),
  )

/** When an answer was last written, in epoch milliseconds. */
const writtenAt = (answerId: string) =>
  runtime.runPromise(
    Effect.map(
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) => sql<{ readonly at: Date }>`SELECT updated_at AS at FROM messages WHERE id = ${answerId}`,
      ),
      ([found]) => found!.at.getTime(),
    ),
  )

const step = (id: string, status: "running" | "done" | "failed" = "done") => ({
  id,
  kind: "step",
  flow: "app/theme/set",
  status,
})

describe("GET /api/answers/<id>: the turn", () => {
  test("answers the question and the finished exchanges before it, oldest first", async () => {
    const h = await open()
    const first = await ask(h, "What is Smithers?")
    expect((await write(h, first, { status: "done", text: "A coding factory.", parts: [] })).status).toBe(200)
    const second = await ask(h, "And who makes it?")

    const response = await turn(h, second)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      question: "And who makes it?",
      history: [{ question: "What is Smithers?", answer: "A coding factory." }],
    })
    expect(h.only("chat.answer.turn").annotations).toMatchObject({ answerId: second, status: 200, historyExchanges: 1 })
  })

  test("waits its turn while an earlier answer streams, and refuses an answer that has settled", async () => {
    const h = await open()
    const first = await ask(h, "One")
    const second = await ask(h, "Two")

    const waiting = await turn(h, second)
    await write(h, first, { status: "failed", failure: "model_error" })
    const after = await turn(h, second)
    const settled = await turn(h, first)

    expect([waiting.status, await waiting.json()]).toEqual([409, { code: "not_your_turn" }])
    expect(after.status).toBe(200)
    expect([settled.status, await settled.json()]).toEqual([409, { code: "settled" }])
  })

  test("an earlier answer whose device went quiet past the bound no longer holds up the turn, and stays", async () => {
    const h = await open()
    const orphan = await ask(h, "One")
    const quietJustUnder = await ask(h, "Two")
    const next = await ask(h, "Three")

    await quiet(orphan, AGENT_LIVE_SECONDS + 1)
    await quiet(quietJustUnder, AGENT_LIVE_SECONDS - 5)
    const held = await turn(h, next)
    await quiet(quietJustUnder, AGENT_LIVE_SECONDS + 1)
    const free = await turn(h, next)

    // Two's last write was within the bound, so it still held Three; then it was past it, and nothing held Three.
    expect([held.status, await held.json()]).toEqual([409, { code: "not_your_turn" }])
    expect(free.status).toBe(200)
    // The routes settle nothing and re-run nothing: the quiet answers stream until their devices return, or until
    // chat/Expire settles them (worker/flows/Expire.test.ts).
    expect(await row(runtime, orphan)).toMatchObject({ status: "streaming", text: "" })
    expect(await row(runtime, quietJustUnder)).toMatchObject({ status: "streaming", text: "" })
  })

  test("an answer waiting its turn stays live, so it keeps the answers after it in order", async () => {
    const h = await open()
    const first = await ask(h, "One")
    const second = await ask(h, "Two")
    const third = await ask(h, "Three")
    await quiet(second, AGENT_LIVE_SECONDS * 2)
    const before = await writtenAt(second)

    const waiting = await turn(h, second)
    await quiet(first, AGENT_LIVE_SECONDS + 1)
    const behind = await turn(h, third)
    const now = await turn(h, second)

    expect(waiting.status).toBe(409)
    expect(await writtenAt(second)).toBeGreaterThan(before)
    expect([behind.status, await behind.json()]).toEqual([409, { code: "not_your_turn" }])
    expect(now.status).toBe(200)
  })

  test("ANSWER_TURN_LIVE_SECONDS sets the bound: 30 seconds unless set, and a positive integer", async () => {
    const short = await open({ config: { ANSWER_TURN_LIVE_SECONDS: "10" } })
    const usual = await open()
    const first = await ask(short, "One")
    const second = await ask(short, "Two")
    await quiet(first, 11)

    expect((await turn(short, second)).status).toBe(200)
    expect((await turn(usual, second)).status).toBe(409)
    expect(AGENT_LIVE_SECONDS).toBe(30)
    await expect(open({ config: { ANSWER_TURN_LIVE_SECONDS: "0" } })).rejects.toThrow()
  })

  test("refuses a signed-out caller, an id that isn't an answer, and a method it doesn't serve", async () => {
    const signedOut = await open({ actor: null })
    const h = await open()
    const answerId = await ask(h, "Hello")

    expect((await turn(signedOut, answerId)).status).toBe(401)
    expect((await turn(h, "not-a-uuid")).status).toBe(404)
    expect((await turn(h, crypto.randomUUID())).status).toBe(404)
    const put = await h.fetch(`/api/answers/${answerId}`, { method: "PUT", body: "{}" })
    expect([put.status, put.headers.get("allow")]).toEqual([405, "GET, POST"])
  })
})

describe("POST /api/answers/<id>: the answer", () => {
  test("writes text and parts while it streams, then settles with its text, parts and tokens", async () => {
    const h = await open()
    const answerId = await ask(h, "Dark mode")

    const streaming = await write(h, answerId, { status: "streaming", parts: [step("0.0", "running")], text: "Dark" })
    const partsOnly = await write(h, answerId, { status: "streaming", parts: [step("0.0")] })
    const midway = await answerRow(runtime, answerId)
    const done = await write(h, answerId, {
      status: "done",
      text: "Dark mode is on.",
      parts: [step("0.0")],
      inputTokens: 40,
      outputTokens: 7,
    })

    expect(streaming.status).toBe(200)
    expect(((await streaming.json()) as { readonly txid: unknown }).txid).toEqual(expect.any(Number))
    expect(partsOnly.status).toBe(200)
    expect(midway).toMatchObject({ status: "streaming", text: "Dark", parts: [step("0.0")] })
    expect(done.status).toBe(200)
    expect(await answerRow(runtime, answerId)).toMatchObject({
      status: "done",
      text: "Dark mode is on.",
      parts: [step("0.0")],
      inputTokens: 40,
      outputTokens: 7,
    })
  })

  test("a settle sent again after it landed is answered as landed; any other write to a settled answer is refused", async () => {
    const h = await open()
    const done = await ask(h, "One")
    const failed = await ask(h, "Two")
    await write(h, done, { status: "done", text: "Yes.", parts: [step("0.0")] })
    await write(h, failed, { status: "failed", failure: "unfinished", parts: [step("0.0", "failed")] })

    const again = await write(h, done, { status: "done", text: "Yes." })
    const other = await write(h, done, { status: "done", text: "No." })
    const streaming = await write(h, done, { status: "streaming", parts: [] })
    const failedAgain = await write(h, failed, { status: "failed", failure: "unfinished" })
    const failedOther = await write(h, failed, { status: "failed", failure: "model_error" })
    const doneOverFailed = await write(h, failed, { status: "done", text: "Late." })

    expect([again.status, await again.json()]).toEqual([200, { txid: null }])
    expect([other.status, await other.json()]).toEqual([409, { code: "settled" }])
    expect(streaming.status).toBe(409)
    expect(failedAgain.status).toBe(200)
    expect(failedOther.status).toBe(409)
    expect(doneOverFailed.status).toBe(409)
    // A settle without parts kept the parts the answer had.
    expect(await answerRow(runtime, done)).toMatchObject({ status: "done", text: "Yes.", parts: [step("0.0")] })
    expect(await answerRow(runtime, failed)).toMatchObject({
      status: "failed",
      failure: "unfinished",
      parts: [step("0.0", "failed")],
    })
  })

  test("refuses a body that isn't an answer write, one that is too large, and an answer that doesn't exist", async () => {
    const h = await open()
    const answerId = await ask(h, "Hello")
    const huge = JSON.stringify({ status: "done", text: "x".repeat(300 * 1024) })

    expect((await write(h, answerId, "not json")).status).toBe(400)
    const brokenUtf8 = await h.fetch(`/api/answers/${answerId}`, {
      method: "POST",
      body: new Uint8Array([0x7b, 0xff, 0x7d]),
    })
    expect(brokenUtf8.status).toBe(400)
    expect((await write(h, answerId, { status: "done", text: "" })).status).toBe(400)
    expect((await write(h, answerId, { status: "failed", failure: "abandoned" })).status).toBe(400)
    expect((await write(h, answerId, huge)).status).toBe(413)
    expect((await write(h, crypto.randomUUID(), { status: "done", text: "Hi." })).status).toBe(404)
    const signedOut = await open({ actor: null })
    expect((await write(signedOut, answerId, { status: "done", text: "Hi." })).status).toBe(401)
    expect((await answerRow(runtime, answerId)).status).toBe("streaming")
  })

  test("a question's id is not an answer's", async () => {
    const h = await open()
    const question = { id: crypto.randomUUID(), answerId: crypto.randomUUID(), text: "Hi" }
    await h.ask(question)

    expect((await write(h, question.id, { status: "done", text: "Hi." })).status).toBe(404)
  })
})

describe("who may write", () => {
  test.each([
    ["a Guest", "guest" as const],
    ["a person with no role", null],
  ])("%s is refused 403 forbidden on both routes, and the answer is unchanged", async (_, role) => {
    const h = await open()
    const answerId = await ask(h, "Hello")
    const refused = await open({ actor: { subject: { kind: "person", id: "person-other" }, role } })

    const read = await turn(refused, answerId)
    const written = await write(refused, answerId, { status: "done", text: "Hi." })

    expect([read.status, await read.json()]).toEqual([403, { code: "forbidden" }])
    expect([written.status, await written.json()]).toEqual([403, { code: "forbidden" }])
    expect(await answerRow(runtime, answerId)).toMatchObject({ status: "streaming", text: "" })
    expect(refused.count(Answers.requests, { route: "write", status: "403" })).toBe(1)
  })
})

describe("failures and records", () => {
  test("Postgres unreachable answers 503, logged by its SQL reason", async () => {
    const unreachable = Database.layer(Effect.succeed(Redacted.make("postgresql://nobody:nothing@127.0.0.1:1/none")))
    const h = await harness(runtime, () => Stream.empty, { actor: member, database: unreachable })

    const response = await turn(h, crypto.randomUUID())

    expect([response.status, await response.json()]).toEqual([503, { code: "unavailable" }])
    expect(h.only("chat.answer.turn")).toMatchObject({ level: "ERROR", annotations: { status: 503 } })
    expect(String(h.only("chat.answer.turn").annotations.errorCode)).toMatch(/^sql:/)
  })

  test("every request is counted by route and status, and no record carries the answer's text", async () => {
    const h = await open()
    const answerId = await ask(h, "Hello")
    const sentinel = `sentinel-${crypto.randomUUID()}`

    await turn(h, answerId)
    await write(h, answerId, { status: "done", text: sentinel })

    expect(h.count(Answers.requests, { route: "turn", status: "200" })).toBe(1)
    expect(h.count(Answers.requests, { route: "write", status: "200" })).toBe(1)
    expect(h.only("chat.answer.write").annotations).toMatchObject({ answerId, status: 200, write: "done", parts: -1 })
    expect(recorded(h)).not.toContain(sentinel)
    const rows = await runtime.runPromise(
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) => sql<{ readonly text: string }>`SELECT text FROM messages WHERE id = ${answerId}`,
      ),
    )
    expect(rows[0]!.text).toBe(sentinel)
  })
})
