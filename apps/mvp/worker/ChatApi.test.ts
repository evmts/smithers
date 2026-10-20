// ChatApi's handlers, run as they are against the compose Postgres and Electric (`pnpm db:up`). The model is the
// only stand-in: a scripted `Model` through HostModel, since the model is the seam. Answers run in a fiber, where
// ChatApi runs them in `waitUntil`. Postgres tests share one database (`<DATABASE_URL's database>_test`, never the
// dev conversation), so they live in this one file and run in order.
import { Model, ModelError, type ModelEvent, type ModelRequest } from "@smthrs/model"
import { HostModel } from "@smthrs/model-host"
import { Logger as StructuredLogger } from "@smthrs/observability"
import { AgentInstructions } from "@smthrs/rpc"
import {
  Cause,
  Clock,
  ConfigProvider,
  Deferred,
  Effect,
  Fiber,
  Layer,
  Logger,
  Metric,
  Redacted,
  Stream,
  Tracer,
} from "effect"
import { FetchHttpClient, HttpEffect } from "effect/http"
import { SqlClient } from "effect/sql"
import { beforeEach, describe, expect, test } from "vitest"
import * as Database from "../db/Database.ts"
import * as Answer from "./Answer.ts"
import * as Chat from "./Chat.ts"
import * as ChatMetrics from "./ChatMetrics.ts"
import * as Messages from "./Messages.ts"

const serverUrl = new URL(Redacted.value(await Effect.runPromise(Database.url)))
const testDatabase = `${serverUrl.pathname.slice(1)}_test`
const testUrl = Object.assign(new URL(serverUrl), { pathname: `/${testDatabase}` })
const testDb = Database.layer(Effect.succeed(Redacted.make(testUrl.toString())))
const devDb = Database.layer(Effect.succeed(Redacted.make(serverUrl.toString())))
const ELECTRIC_URL = "http://localhost:30001"

const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.runPromise(Effect.provide(effect, testDb))

/** Socket error codes that only say nothing is listening there, or there is no route to it. */
const UNREACHABLE = new Set(["ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "ENOTFOUND", "EAI_AGAIN"])

/**
 * Whether a failure only says the server isn't there: an unreachable socket error, anywhere in its causes, or a
 * connection attempt that timed out.
 */
const unreachable = (error: unknown): boolean => {
  if (Cause.isTimeoutError(error)) return true
  if (typeof error !== "object" || error === null) return false
  const { code, reason, cause, errors } = error as {
    code?: unknown
    reason?: unknown
    cause?: unknown
    errors?: unknown
  }
  return (typeof code === "string" && UNREACHABLE.has(code)) || unreachable(reason) || unreachable(cause) ||
    (Array.isArray(errors) && errors.some(unreachable))
}

/**
 * Whether Postgres is there: `false` only when it can't be reached. Any other failure, here or creating and
 * migrating the test database, fails the file.
 */
const postgres = await Effect.runPromise(
  Effect.flatMap(SqlClient.SqlClient, (sql) => sql`SELECT 1`).pipe(
    Effect.provide(devDb),
    Effect.timeout("5 seconds"),
    Effect.as(true),
    Effect.catch((error) => (unreachable(error) ? Effect.succeed(false) : Effect.fail(error))),
  ),
)
if (postgres) {
  await Effect.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const existing = yield* sql`SELECT 1 FROM pg_database WHERE datname = ${testDatabase}`
      if (existing.length === 0) yield* sql`CREATE DATABASE ${sql(testDatabase)}`
    }).pipe(Effect.provide(devDb), Effect.andThen(Effect.provide(Database.migrate, testDb))),
  )
}
/** Whether Electric is there: `false` only when it can't be reached; an unhealthy Electric fails the file. */
const electric = await fetch(`${ELECTRIC_URL}/v1/health`).then(
  (response) => {
    if (!response.ok) throw new Error(`Electric at ${ELECTRIC_URL} answered ${response.status} to /v1/health`)
    return true
  },
  (error: unknown) => {
    if (unreachable(error)) return false
    throw error
  },
)
if (!postgres) console.warn(`ChatApi tests skipped: no Postgres at ${serverUrl.host}. Start it with pnpm db:up.`)
if (!electric) console.warn(`Shape proxy tests skipped: no Electric at ${ELECTRIC_URL}. Start it with pnpm db:up.`)

const uuid = () => crypto.randomUUID()
type Script = (request: ModelRequest.ModelRequest) => Stream.Stream<ModelEvent.ModelEvent, Model.ModelFailure>
const delta = (text: string): ModelEvent.ModelEvent => ({ type: "text-delta", id: "t", text })
const usage: ModelEvent.ModelEvent = { type: "usage", inputTokens: 12, outputTokens: 34 }
const settle: ModelEvent.ModelEvent = { type: "settle", stopReason: "stop" }
/** A model that answers with these pieces of text, then reports usage and stops. */
const answers = (...pieces: ReadonlyArray<string>): Script => () => Stream.make(...pieces.map(delta), usage, settle)
/** The text of a request's messages, in order. */
const contents = (request: ModelRequest.ModelRequest) =>
  request.messages.map((message) => message.content.map((part) => ("text" in part ? part.text : "")).join(""))

// The record ChatApi's JSON logger writes (Logger.layerStructuredJson in @smthrs/observability), span ids included.
type StructuredLog = ReturnType<typeof StructuredLogger.formatStructured.log>

/** ChatApi's routes on the test database and a scripted model, recording every log line, span and metric. */
const harness = async (script: Script, config: Record<string, string> = {}, database = testDb) => {
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    },
  })
  const logs: Array<StructuredLog> = []
  const logger = Logger.make((options) => {
    logs.push(StructuredLogger.formatStructured.log(options))
  })
  const registry: Metric.MetricRegistry = new Map()
  const requests: Array<ModelRequest.ModelRequest> = []
  const upstream: Array<URL> = []
  const fibers: Array<Fiber.Fiber<void>> = []
  const model = Model.make({
    stream: (request) => {
      requests.push(request)
      return script(request)
    },
  })
  const observed = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideService(Tracer.Tracer, tracer),
      Effect.provideService(Logger.CurrentLoggers, new Set([logger])),
      Effect.provideService(Metric.MetricRegistry, registry),
      Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown(config)),
    )
  const hostModel = Layer.succeed(HostModel, HostModel.of({ modelId: "test-model", model }))
  const chat = await Effect.runPromise(observed(Chat.make(database).pipe(Effect.provide(hostModel))))
  const answer = await Effect.runPromise(observed(Answer.make(database).pipe(Effect.provide(hostModel))))
  const background = Chat.Background.of({
    run: (effect) => Effect.map(Effect.forkDetach(effect), (fiber) => void fibers.push(fiber)),
  })
  let held: Promise<void> | undefined
  const spy: typeof globalThis.fetch = async (input, init) => {
    upstream.push(new URL(input instanceof Request ? input.url : String(input)))
    if (held !== undefined) await held
    return fetch(input, init)
  }
  const handler = HttpEffect.toWebHandler(
    observed(
      chat.fetch.pipe(
        Effect.provideService(Chat.Background, background),
        Effect.provide(FetchHttpClient.layer),
        Effect.provideService(FetchHttpClient.Fetch, spy),
      ),
    ),
  )
  return {
    fetch: (path: string, init?: RequestInit) => handler(new Request(`http://chat.test${path}`, init)),
    ask: (body: unknown) =>
      handler(
        new Request("http://chat.test/api/questions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: typeof body === "string" ? body : JSON.stringify(body),
        }),
      ),
    /** Waits for every background answer. */
    settled: () => Effect.runPromise(Fiber.joinAll(fibers)),
    sweep: () => Effect.runPromise(observed(chat.sweep.pipe(Effect.provideService(Chat.Background, background)))),
    /** Answers one answer directly, as another isolate's run would, outside ChatApi's dispatch. */
    answer: (answerId: string) => Effect.runPromise(observed(answer.run(answerId))),
    count: (metric: Metric.Metric<number, Metric.CounterState<number>>, attributes: Record<string, string>) =>
      Effect.runSync(
        Metric.value(Metric.withAttributes(metric, attributes)).pipe(
          Effect.provideService(Metric.MetricRegistry, registry),
        ),
      ).count,
    snapshot: () => Effect.runSync(Metric.snapshot.pipe(Effect.provideService(Metric.MetricRegistry, registry))),
    /** Holds every request to Electric until the returned function is called, as a slow Electric would. */
    holdElectric: () => {
      let release = () => {}
      held = new Promise<void>((resolve) => (release = resolve))
      return () => {
        held = undefined
        release()
      }
    },
    line: (message: string) => logs.filter((log) => log.message === message),
    span: (name: string) => spans.filter((span) => span.name === name),
    spans,
    logs,
    requests,
    upstream,
  }
}

interface Row {
  readonly id: string
  readonly role: string
  readonly text: string
  readonly status: string
  readonly failure: string | null
  readonly questionId: string | null
  readonly modelId: string | null
  readonly stopReason: string | null
  readonly inputTokens: number | null
  readonly outputTokens: number | null
  readonly position: string
  readonly attempts: number
  readonly xmin: string
}

const row = (id: string) =>
  run(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const [found] = yield* sql<Row>`
        SELECT id, role, text, status, failure, question_id AS "questionId", model_id AS "modelId",
          stop_reason AS "stopReason", input_tokens AS "inputTokens", output_tokens AS "outputTokens",
          position::text AS position, attempts, xmin::text AS xmin
        FROM messages WHERE id = ${id}`
      return found!
    }),
  )

const rowCount = () =>
  run(
    Effect.flatMap(SqlClient.SqlClient, (sql) => sql<{ readonly n: number }>`SELECT count(*)::int AS n FROM messages`),
  ).then(
    ([result]) => result!.n,
  )

/** Ages an answer: no write for `idle` seconds, asked `age` seconds ago, and `attempts` streaming attempts. */
const stale = (id: string, options: { readonly idle: number; readonly age?: number; readonly attempts?: number }) =>
  run(
    Effect.flatMap(
      SqlClient.SqlClient,
      (sql) =>
        sql`UPDATE messages SET
          updated_at = now() - make_interval(secs => ${options.idle}),
          created_at = now() - make_interval(secs => ${options.age ?? options.idle}),
          attempts = ${options.attempts ?? 0}
        WHERE id = ${id}`,
    ),
  )

/**
 * A question and its answer, written straight to Postgres and never dispatched: finished, failed, or still
 * streaming, as after a crash between asking and dispatching.
 */
const exchange = (question: string, answer: string, status: "done" | "failed" | "streaming" = "done") =>
  run(
    Effect.gen(function* () {
      const ids = { id: uuid(), answerId: uuid() }
      yield* Messages.ask({ ...ids, text: question })
      if (status === "streaming") return ids
      const attempt = (yield* Messages.claim(ids.answerId))!
      if (status === "done") {
        yield* Messages.append(ids.answerId, attempt, answer)
        yield* Messages.settle(ids.answerId, attempt, { status: "done", modelId: "earlier-model" })
      } else {
        yield* Messages.settle(ids.answerId, attempt, {
          status: "failed",
          failure: "model_error",
          modelId: "earlier-model",
        })
      }
      return ids
    }),
  )

/** A `POST /api/questions` whose body arrives in these chunks. */
const chunked = (h: Awaited<ReturnType<typeof harness>>, chunks: ReadonlyArray<Uint8Array>) =>
  h.fetch("/api/questions", {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk)
        controller.close()
      },
    }),
    duplex: "half",
  } as RequestInit)

const bytes = (...parts: ReadonlyArray<string | ReadonlyArray<number>>) =>
  new Uint8Array(parts.flatMap((part) => (typeof part === "string" ? [...new TextEncoder().encode(part)] : part)))

/** Polls until `check` holds, for up to two seconds. */
const eventually = async (check: () => Promise<boolean>) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error("condition never held")
}

describe.skipIf(!postgres)("ChatApi against Postgres", () => {
  beforeEach(() => run(Effect.flatMap(SqlClient.SqlClient, (sql) => sql`TRUNCATE messages RESTART IDENTITY`)))

  describe("POST /api/questions", () => {
    test("inserts the question and a streaming answer in one transaction, and returns its id as the txid", async () => {
      const h = await harness(answers("Hi", " there"))
      const ids = { id: uuid(), answerId: uuid() }
      const response = await h.ask({ ...ids, text: "  Say hi.  " })
      expect(response.status).toBe(202)
      expect(response.headers.get("cache-control")).toBe("no-store")
      const { txid } = (await response.json()) as { txid: number }
      expect(Number.isInteger(txid)).toBe(true)

      const question = await row(ids.id)
      expect(question).toMatchObject({ role: "user", text: "Say hi.", status: "done", questionId: null })
      // Electric reports the transaction that inserted a row by this id; the browser waits for it.
      expect(Number(question.xmin)).toBe(txid)
      await h.settled()
      const answer = await row(ids.answerId)
      expect(answer).toMatchObject({ role: "assistant", questionId: ids.id, status: "done", text: "Hi there" })
      expect(Number(answer.position)).toBe(Number(question.position) + 1)
    })

    test("a retry of the same question is 200 { txid: null, existing: true } and changes nothing", async () => {
      const h = await harness(answers("Once."))
      const body = { id: uuid(), answerId: uuid(), text: "Ask me once." }
      expect((await h.ask(body)).status).toBe(202)
      // The same question: its text before trimming and its UUIDs' case may differ.
      const retry = await h.ask({
        id: body.id.toUpperCase(),
        answerId: body.answerId.toUpperCase(),
        text: ` ${body.text}`,
      })
      expect(retry.status).toBe(200)
      expect(await retry.json()).toEqual({ txid: null, existing: true })
      await h.settled()
      expect(await rowCount()).toBe(2)
      expect(h.requests).toHaveLength(1)
      expect(h.count(ChatMetrics.questions, { status: "200" })).toBe(1)
      expect(h.line("chat.question")[1]!.annotations).toMatchObject({ status: 200, existing: true })
    })

    test("a retry of a question whose answer never started starts it", async () => {
      // A crash between committing the rows and dispatching: the rows exist, and nothing answers them.
      const ids = await exchange("lost launch", "", "streaming")
      const h = await harness(answers("Found it."))
      const retry = await h.ask({ ...ids, text: "lost launch" })
      expect(retry.status).toBe(200)
      expect(await retry.json()).toEqual({ txid: null, existing: true })
      await h.settled()
      expect(await row(ids.answerId)).toMatchObject({ status: "done", text: "Found it.", attempts: 1 })
      expect(h.line("chat.question")[0]!.annotations).toMatchObject({
        status: 200,
        existing: true,
        dispatch: "started",
      })
      expect(h.count(ChatMetrics.dispatches, { trigger: "retry", outcome: "started" })).toBe(1)
      expect(h.line("chat.dispatch")[0]!.annotations).toMatchObject({
        answerId: ids.answerId,
        trigger: "retry",
        outcome: "started",
      })
    })

    test.each([
      ["different text", (ids: { id: string; answerId: string }) => ({ ...ids, text: "something else" })],
      [
        "a different answerId",
        (ids: { id: string; answerId: string }) => ({ ...ids, answerId: uuid(), text: "original" }),
      ],
      [
        "an answer's id",
        (ids: { id: string; answerId: string }) => ({ id: ids.answerId, answerId: uuid(), text: "hi" }),
      ],
    ])("409 for an id already used, with %s, and nothing changes", async (_, retry) => {
      const ids = await exchange("original", "kept")
      const h = await harness(answers("never"))
      const response = await h.ask(retry(ids))
      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({ message: "id belongs to another message." })
      expect(await rowCount()).toBe(2)
      expect(await row(ids.id)).toMatchObject({ text: "original" })
      expect(h.requests).toHaveLength(0)
      expect(h.line("chat.question")[0]).toMatchObject({ level: "WARN", annotations: { errorCode: "id_taken" } })
    })

    test("concurrent asks keep each answer right after its question", async () => {
      const h = await harness(answers("Fine."))
      const asked = Array.from({ length: 6 }, () => ({ id: uuid(), answerId: uuid() }))
      const responses = await Promise.all(asked.map((ids, n) => h.ask({ ...ids, text: `question ${n}` })))
      expect(responses.map((response) => response.status)).toEqual(asked.map(() => 202))
      for (const ids of asked) {
        const [question, answer] = await Promise.all([row(ids.id), row(ids.answerId)])
        expect(Number(answer.position)).toBe(Number(question.position) + 1)
      }
      await h.settled()
    })

    test.each([
      ["not JSON", "{"],
      ["no text", { id: uuid(), answerId: uuid() }],
      ["an id that is not a UUID", { id: "q1", answerId: uuid(), text: "hi" }],
      ["only whitespace", { id: uuid(), answerId: uuid(), text: " \n\t " }],
      ["8,001 characters", { id: uuid(), answerId: uuid(), text: "x".repeat(8_001) }],
      [
        "the same id twice",
        (() => {
          const id = uuid()
          return { id, answerId: id, text: "hi" }
        })(),
      ],
    ])("400 for %s, with a message and no rows", async (_, body) => {
      const h = await harness(answers("never"))
      const response = await h.ask(body)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ message: expect.stringContaining("Send JSON") })
      expect(await rowCount()).toBe(0)
      expect(h.count(ChatMetrics.questions, { status: "400" })).toBe(1)
    })

    test.each([
      ["split across chunks", [bytes([0xe2, 0x82]), bytes([0x28], "\"}")]],
      ["cut off at the end", [bytes([0xe2, 0x82])]],
    ])("400 for malformed UTF-8 %s, and no rows", async (_, rest) => {
      const h = await harness(answers("never"))
      const head = bytes(`{"id":"${uuid()}","answerId":"${uuid()}","text":"`)
      const response = await chunked(h, [head, ...rest])
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ message: expect.stringContaining("Send JSON") })
      expect(await rowCount()).toBe(0)
      expect(h.line("chat.question")[0]!.annotations).toMatchObject({ status: 400, errorCode: "utf8" })
    })

    test("a character split across chunks arrives whole", async () => {
      const h = await harness(answers("Euro."))
      const ids = { id: uuid(), answerId: uuid() }
      const head = bytes(`{"id":"${ids.id}","answerId":"${ids.answerId}","text":"`, [0xe2])
      const response = await chunked(h, [head, bytes([0x82, 0xac], "\"}")])
      expect(response.status).toBe(202)
      expect((await row(ids.id)).text).toBe("€")
      await h.settled()
    })

    test("8,000 characters after trimming is the longest question", async () => {
      const h = await harness(answers("Long."))
      const response = await h.ask({ id: uuid(), answerId: uuid(), text: ` ${"x".repeat(8_000)} ` })
      expect(response.status).toBe(202)
      await h.settled()
    })

    test("413 for a body over 64 KB, declared or streamed", async () => {
      const h = await harness(answers("never"))
      const big = JSON.stringify({ id: uuid(), answerId: uuid(), text: "x".repeat(Chat.MAX_BODY_BYTES) })
      const declared = await h.ask(big)
      expect(declared.status).toBe(413)
      expect(await declared.text()).toBe("")
      const bytes = new TextEncoder().encode(big)
      const streamed = await h.fetch("/api/questions", {
        method: "POST",
        body: new ReadableStream({
          start(controller) {
            for (let at = 0; at < bytes.length; at += 4096) controller.enqueue(bytes.slice(at, at + 4096))
            controller.close()
          },
        }),
        duplex: "half",
      } as RequestInit)
      expect(streamed.status).toBe(413)
      expect(await rowCount()).toBe(0)
      expect(h.count(ChatMetrics.questions, { status: "413" })).toBe(2)
    })

    test("409 when the answer id belongs to another message, and nothing is written", async () => {
      const h = await harness(answers("First."))
      const answerId = uuid()
      expect((await h.ask({ id: uuid(), answerId, text: "first" })).status).toBe(202)
      const clash = { id: uuid(), answerId, text: "second" }
      const response = await h.ask(clash)
      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({ message: "answerId belongs to another message." })
      expect(await rowCount()).toBe(2)
      await h.settled()
    })

    test("503 when Postgres can't be reached, and nothing is answered", async () => {
      const unreachable = Database.layer(
        Effect.succeed(Redacted.make("postgresql://smithers:smithers@127.0.0.1:9/smithers")),
      )
      const h = await harness(answers("never"), {}, unreachable)
      const response = await h.ask({ id: uuid(), answerId: uuid(), text: "anyone there?" })
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({ message: "Smithers can't reach its database. Try again." })
      expect(h.requests).toHaveLength(0)
      expect(h.line("chat.question")[0]).toMatchObject({
        level: "ERROR",
        annotations: { status: 503, errorCode: expect.stringMatching(/^sql:/) },
      })
    })

    test("405 for another method, 404 for another path", async () => {
      const h = await harness(answers("never"))
      const get = await h.fetch("/api/questions")
      expect(get.status).toBe(405)
      expect(get.headers.get("allow")).toBe("POST")
      expect((await h.fetch("/api/nothing")).status).toBe(404)
    })
  })

  describe("what the model sees", () => {
    test("Smithers' instructions, the 19 most recent finished exchanges oldest first, then the question", async () => {
      for (let n = 0; n < 25; n++) await exchange(`q${n}`, `a${n}`)
      const h = await harness(answers("Now."))
      await h.ask({ id: uuid(), answerId: uuid(), text: "now" })
      await h.settled()
      const [request] = h.requests
      expect(request!.modelId).toBe("test-model")
      expect(request!.system.map((part) => part.text)).toEqual(Answer.INSTRUCTIONS)
      expect(request!.system[0]!.text).toBe(AgentInstructions.AGENT_NAME_LINE)
      expect(request!.params.reasoningEffort).toBe("low")
      expect(request!.params.maxTokens).toBe(Answer.MAX_OUTPUT_TOKENS)
      expect(request!.messages.map((message) => message.role)).toEqual([
        ...Array.from({ length: 19 }, () => ["user", "assistant"]).flat(),
        "user",
      ])
      const texts = contents(request!)
      expect(texts.slice(0, 2)).toEqual(["q6", "a6"])
      expect(texts.slice(-3)).toEqual(["q24", "a24", "now"])
      expect(h.line("chat.answer")[0]!.annotations).toMatchObject({ historyExchanges: 19 })
    })

    test("leaves out exchanges whose answer failed or is still streaming", async () => {
      await exchange("first", "one")
      await exchange("count to 3000", "", "failed")
      await exchange("on another device", "", "streaming")
      const h = await harness(answers("Hi."))
      await h.ask({ id: uuid(), answerId: uuid(), text: "say hi" })
      await h.settled()
      expect(contents(h.requests[0]!)).toEqual(["first", "one", "say hi"])
    })

    test("stops at the first exchange, going back, that would pass 24,000 characters", async () => {
      await exchange("oldest", "ok")
      const big = "x".repeat(7_000)
      for (let n = 2; n <= 5; n++) await exchange(`q${n}`, big)
      const h = await harness(answers("Done."))
      await h.ask({ id: uuid(), answerId: uuid(), text: "now" })
      await h.settled()
      // Three 7,002-character exchanges fit; a fourth would pass 24,000, so the small "oldest" one is left out too.
      expect(contents(h.requests[0]!)).toEqual(["q3", big, "q4", big, "q5", big, "now"])
    })

    test("only what came before the answer", async () => {
      const before = await exchange("before", "yes")
      const target = await exchange("target", "", "streaming")
      await exchange("after", "later")
      expect(await run(Messages.history(target.answerId))).toEqual([{ question: "before", answer: "yes" }])
      expect(await run(Messages.history(before.answerId))).toEqual([])
    })
  })

  describe("budgets", () => {
    test("CHAT_MAX_OUTPUT_TOKENS sets the output-token limit", async () => {
      const h = await harness(answers("Short."), { CHAT_MAX_OUTPUT_TOKENS: "500" })
      await h.ask({ id: uuid(), answerId: uuid(), text: "be brief" })
      await h.settled()
      expect(h.requests[0]!.params.maxTokens).toBe(500)
    })

    test.each([["0"], ["-1"], ["1.5"], ["many"]])("CHAT_MAX_OUTPUT_TOKENS=%s is refused at start", async (value) => {
      await expect(harness(answers("never"), { CHAT_MAX_OUTPUT_TOKENS: value })).rejects.toThrow()
    })

    test("an isolate streams at most CHAT_MAX_CONCURRENT_ANSWERS answers at once; the rest wait", async () => {
      const release = Effect.runSync(Deferred.make<void>())
      const h = await harness(
        (request) =>
          contents(request).at(-1) === "first"
            ? Stream.concat(
              Stream.make(delta("One.")),
              Stream.fromEffect(Deferred.await(release)).pipe(Stream.flatMap(() => Stream.make(usage, settle))),
            )
            : Stream.make(delta("Two."), usage, settle),
        { CHAT_MAX_CONCURRENT_ANSWERS: "1" },
      )
      const first = { id: uuid(), answerId: uuid() }
      const second = { id: uuid(), answerId: uuid() }
      await h.ask({ ...first, text: "first" })
      await eventually(async () => (await row(first.answerId)).text === "One.")
      await h.ask({ ...second, text: "second" })
      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(h.requests).toHaveLength(1)
      expect(await row(second.answerId)).toMatchObject({ status: "streaming", attempts: 0 })
      Effect.runSync(Deferred.succeed(release, undefined))
      await h.settled()
      expect(h.requests).toHaveLength(2)
      expect(await row(second.answerId)).toMatchObject({ status: "done", text: "Two." })
    })
  })

  describe("writing the answer", () => {
    test("Answer.batches writes the first text at once, then what arrives within each 150 ms", async () => {
      const pieces = Array.from({ length: 12 }, (_, n) => `${n},`)
      const timed = await Effect.runPromise(
        Effect.gen(function* () {
          const start = yield* Clock.currentTimeMillis
          const texts = Stream.fromIterable(pieces).pipe(Stream.tap(() => Effect.sleep("25 millis")))
          return yield* Answer.batches(texts).pipe(
            Stream.mapEffect((text) => Effect.map(Clock.currentTimeMillis, (at) => ({ text, at: at - start }))),
            Stream.runCollect,
          )
        }),
      )
      expect(timed.map(({ text }) => text).join("")).toBe(pieces.join(""))
      expect(timed[0]).toMatchObject({ text: "0," })
      expect(timed[0]!.at).toBeLessThan(100)
      expect(timed.length).toBeGreaterThanOrEqual(3)
      expect(timed.length).toBeLessThanOrEqual(4)
      // Every write but the last, which flushes the end of the stream, is at least 150 ms after the one before.
      for (let n = 1; n < timed.length - 1; n++) expect(timed[n]!.at - timed[n - 1]!.at).toBeGreaterThanOrEqual(145)
    })

    test("a streaming answer is appended a few times a second, not once per delta", async () => {
      const pieces = Array.from({ length: 12 }, (_, n) => `w${n} `)
      const h = await harness(() =>
        Stream.concat(
          Stream.fromIterable(pieces.map(delta)).pipe(Stream.tap(() => Effect.sleep("25 millis"))),
          Stream.make(usage, settle),
        )
      )
      const ids = { id: uuid(), answerId: uuid() }
      await h.ask({ ...ids, text: "count" })
      await h.settled()
      const appends = h.spans.filter((span) => String(span.attributes.get("db.query.text")).includes("text = text ||"))
      expect(appends.length).toBeGreaterThanOrEqual(3)
      expect(appends.length).toBeLessThanOrEqual(4)
      expect((await row(ids.answerId)).text).toBe(pieces.join(""))
    })
  })

  describe("answering again", () => {
    test("a run started again after one died mid-stream starts the text over, so nothing is doubled", async () => {
      let calls = 0
      const h = await harness(() =>
        ++calls === 1
          ? Stream.concat(
            Stream.make(delta("Partial ")),
            Stream.fromEffect(Effect.sleep("100 millis")).pipe(Stream.flatMap(() => Stream.die("evicted"))),
          )
          : Stream.make(delta("Hello"), delta(" world."), usage, settle)
      )
      const ids = await exchange("greet me", "", "streaming")
      // A run cut off mid-stream, as when Cloudflare ends `waitUntil`, leaves its text and the answer streaming.
      expect(await h.answer(ids.answerId)).toMatchObject({ outcome: "error", errorCode: "defect" })
      expect(await row(ids.answerId)).toMatchObject({ status: "streaming", text: "Partial ", attempts: 1 })
      // The sweep's next run.
      expect(await h.answer(ids.answerId)).toMatchObject({ outcome: "done", attempt: 2, characters: 12 })
      expect(await row(ids.answerId)).toMatchObject({ status: "done", text: "Hello world.", attempts: 2 })
    })

    test("a run still streaming when the answer is started again is fenced out", async () => {
      const release = Effect.runSync(Deferred.make<void>())
      let calls = 0
      const h = await harness(() =>
        ++calls === 1
          ? Stream.concat(
            Stream.make(delta("first")),
            Stream.fromEffect(Deferred.await(release)).pipe(Stream.flatMap(() => Stream.make(delta(" late"), settle))),
          )
          : Stream.make(delta("second"), usage, settle)
      )
      const ids = await exchange("race", "", "streaming")
      const first = h.answer(ids.answerId)
      await eventually(async () => (await row(ids.answerId)).text === "first")
      // Another isolate starts it again, as the sweep does for an answer with no write for 60 s.
      const second = await h.answer(ids.answerId)
      Effect.runSync(Deferred.succeed(release, undefined))
      expect(await first).toMatchObject({ outcome: "fenced", attempt: 1 })
      expect(second).toMatchObject({ outcome: "done", attempt: 2 })
      expect(await row(ids.answerId)).toMatchObject({ status: "done", text: "second", attempts: 2 })
    })

    test("a write from a fenced-out attempt changes nothing", async () => {
      const ids = await exchange("q", "", "streaming")
      const first = (await run(Messages.claim(ids.answerId)))!
      const second = (await run(Messages.claim(ids.answerId)))!
      expect(await run(Messages.append(ids.answerId, first, "stale"))).toBe(false)
      expect(await run(Messages.settle(ids.answerId, first, { status: "done", modelId: "m" }))).toBe(false)
      expect(await run(Messages.append(ids.answerId, second, "fresh"))).toBe(true)
      expect(await row(ids.answerId)).toMatchObject({ status: "streaming", text: "fresh", attempts: 2 })
    })
  })

  describe("settling", () => {
    test("done, with the model id, tokens and stop reason, and one log line of metadata", async () => {
      const h = await harness(answers("Hello", " world."))
      const ids = { id: uuid(), answerId: uuid() }
      await h.ask({ ...ids, text: "greet me" })
      await h.settled()
      expect(await row(ids.answerId)).toMatchObject({
        status: "done",
        failure: null,
        text: "Hello world.",
        modelId: "test-model",
        stopReason: "stop",
        inputTokens: 12,
        outputTokens: 34,
      })
      const lines = h.line("chat.answer")
      expect(lines).toHaveLength(1)
      expect(lines[0]!.level).toBe("INFO")
      expect(lines[0]!.annotations).toEqual({
        trace_id: expect.any(String),
        span_id: expect.any(String),
        answerId: ids.answerId,
        questionId: ids.id,
        outcome: "done",
        modelId: "test-model",
        stopReason: "stop",
        inputTokens: 12,
        outputTokens: 34,
        attempt: 1,
        firstTextMs: expect.any(Number),
        durationMs: expect.any(Number),
        historyExchanges: 0,
        characters: 12,
      })
      expect(h.line("chat.question")[0]!.annotations).toMatchObject({
        status: 202,
        questionId: ids.id,
        answerId: ids.answerId,
        dispatch: "started",
      })
      expect(h.line("chat.dispatch")[0]).toMatchObject({
        level: "INFO",
        annotations: { answerId: ids.answerId, trigger: "ask", outcome: "started", durationMs: expect.any(Number) },
      })
      expect(h.count(ChatMetrics.questions, { status: "202" })).toBe(1)
      expect(h.count(ChatMetrics.dispatches, { trigger: "ask", outcome: "started" })).toBe(1)
      expect(h.count(ChatMetrics.answers, { outcome: "done", failure: "none" })).toBe(1)
      expect(h.count(ChatMetrics.tokens, { type: "input" })).toBe(12)
      expect(h.count(ChatMetrics.tokens, { type: "output" })).toBe(34)
      const histograms = h.snapshot().filter((metric) => metric.type === "Histogram").map((metric) => metric.id)
      expect(histograms).toEqual(
        expect.arrayContaining(["smithers_chat_answer_first_text_ms", "smithers_chat_answer_ms"]),
      )

      const [question] = h.span("chat.question")
      expect(question!.attributes.get("smithers.chat.answer_id")).toBe(ids.answerId)
      expect(question!.attributes.get("http.response.status_code")).toBe(202)
      const [dispatch] = h.span("chat.dispatch")
      expect(dispatch!.parent).toMatchObject({ _tag: "Some", value: { spanId: question!.spanId } })
      expect(dispatch!.attributes.get("smithers.chat.dispatch.outcome")).toBe("started")
      const [answer] = h.span("chat.answer")
      expect(answer!.attributes.get("smithers.chat.outcome")).toBe("done")
      expect(answer!.attributes.get("smithers.chat.attempt")).toBe(1)
      expect(answer!.parent).toMatchObject({ _tag: "Some", value: { spanId: dispatch!.spanId } })
      expect(answer!.traceId).toBe(question!.traceId)
      expect(answer!.attributes.get("smithers.chat.first_text_ms")).toEqual(expect.any(Number))
      const [model] = h.span("chat test-model")
      expect(model!.attributes.get("gen_ai.request.model")).toBe("test-model")
      expect(model!.attributes.get("gen_ai.usage.output_tokens")).toBe(34)
    })

    test.each([
      [
        "a model 429",
        new ModelError.ModelError({ code: "rate_limited", message: "slow down", httpStatus: 429 }),
        "rate_limited",
      ],
      [
        "a 429 the provider calls a quota",
        new ModelError.ModelError({ code: "quota_exceeded", message: "quota", httpStatus: 429 }),
        "rate_limited",
      ],
      [
        "any other model failure",
        new ModelError.ModelError({ code: "authentication", message: "bad key", httpStatus: 401 }),
        "model_error",
      ],
    ])("failed for %s", async (_, error, failure) => {
      const h = await harness(() => Stream.concat(Stream.make(delta("Partial")), Stream.fail(error)))
      const ids = { id: uuid(), answerId: uuid() }
      await h.ask({ ...ids, text: "try" })
      await h.settled()
      expect(await row(ids.answerId)).toMatchObject({
        status: "failed",
        failure,
        modelId: "test-model",
        text: "Partial",
      })
      expect(h.line("chat.answer")[0]).toMatchObject({
        level: "WARN",
        annotations: { outcome: "failed", failure, errorCode: error.code, httpStatus: error.httpStatus },
      })
      expect(h.count(ChatMetrics.answers, { outcome: "failed", failure })).toBe(1)
      expect(h.span("chat.answer")[0]!.attributes.get("error.type")).toBe(failure)
    })

    test("failed as empty when the model answers with no text", async () => {
      const h = await harness(() => Stream.make(delta(""), usage, settle))
      const ids = { id: uuid(), answerId: uuid() }
      await h.ask({ ...ids, text: "say nothing" })
      await h.settled()
      expect(await row(ids.answerId)).toMatchObject({ status: "failed", failure: "empty", text: "", outputTokens: 34 })
      expect(h.line("chat.answer")[0]!.annotations).toMatchObject({
        outcome: "failed",
        failure: "empty",
        characters: 0,
      })
    })
  })

  describe("fencing", () => {
    test("nothing changes an answer once it has settled", async () => {
      const ids = await exchange("q", "kept")
      expect(await run(Messages.claim(ids.answerId))).toBeUndefined()
      expect(await run(Messages.append(ids.answerId, 1, " more"))).toBe(false)
      expect(
        await run(Messages.settle(ids.answerId, 1, { status: "failed", failure: "model_error", modelId: "other" })),
      ).toBe(false)
      expect(await row(ids.answerId)).toMatchObject({
        status: "done",
        text: "kept",
        failure: null,
        modelId: "earlier-model",
      })
    })

    test("an answer the sweep settled mid-stream stays abandoned, and its writer stops", async () => {
      const release = Effect.runSync(Deferred.make<void>())
      const h = await harness(() =>
        Stream.concat(
          Stream.make(delta("first")),
          Stream.fromEffect(Deferred.await(release)).pipe(Stream.flatMap(() => Stream.make(delta(" late"), settle))),
        )
      )
      const ids = { id: uuid(), answerId: uuid() }
      await h.ask({ ...ids, text: "slow" })
      await eventually(async () => (await row(ids.answerId)).text === "first")
      await stale(ids.answerId, { idle: 61, attempts: Messages.MAX_ATTEMPTS })
      await h.sweep()
      Effect.runSync(Deferred.succeed(release, undefined))
      await h.settled()
      expect(await row(ids.answerId)).toMatchObject({ status: "failed", failure: "abandoned", text: "first" })
      expect(h.line("chat.answer")[0]).toMatchObject({ level: "WARN", annotations: { outcome: "fenced" } })
    })
  })

  describe("the sweep", () => {
    test("dispatches answers streaming with no write for over 60 s again, and they finish", async () => {
      const stuck = await exchange("stuck", "", "streaming")
      const fresh = await exchange("fresh", "", "streaming")
      await stale(stuck.answerId, { idle: 61 })
      await stale(fresh.answerId, { idle: 59 })
      const h = await harness(answers("Recovered."))
      await h.sweep()
      await h.settled()
      expect(await row(stuck.answerId)).toMatchObject({ status: "done", text: "Recovered.", attempts: 1 })
      expect(await row(fresh.answerId)).toMatchObject({ status: "streaming", attempts: 0 })
      expect(h.count(ChatMetrics.dispatches, { trigger: "sweep", outcome: "started" })).toBe(1)
      expect(h.count(ChatMetrics.swept, {})).toBe(0)
      expect(h.line("chat.sweep")[0]).toMatchObject({
        level: "WARN",
        annotations: { abandoned: 0, answerIds: "", redispatched: 1 },
      })
      expect(h.line("chat.dispatch")[0]!.annotations).toMatchObject({
        answerId: stuck.answerId,
        trigger: "sweep",
        outcome: "started",
      })
      expect(h.span("chat.sweep")[0]!.attributes.get("smithers.chat.sweep.redispatched")).toBe(1)
    })

    test("a dispatch of an answer already running here changes nothing", async () => {
      const release = Effect.runSync(Deferred.make<void>())
      const h = await harness(() =>
        Stream.concat(
          Stream.make(delta("slow")),
          Stream.fromEffect(Deferred.await(release)).pipe(Stream.flatMap(() => Stream.make(usage, settle))),
        )
      )
      const ids = { id: uuid(), answerId: uuid() }
      await h.ask({ ...ids, text: "think hard" })
      await eventually(async () => (await row(ids.answerId)).text === "slow")
      await stale(ids.answerId, { idle: 61, attempts: 1 })
      await h.sweep()
      expect(h.count(ChatMetrics.dispatches, { trigger: "sweep", outcome: "running" })).toBe(1)
      Effect.runSync(Deferred.succeed(release, undefined))
      await h.settled()
      expect(h.requests).toHaveLength(1)
      expect(await row(ids.answerId)).toMatchObject({ status: "done", text: "slow", attempts: 1 })
    })

    test("settles stuck answers as abandoned after 3 attempts or 10 minutes, and only those", async () => {
      const tried = await exchange("tried", "", "streaming")
      const old = await exchange("old", "", "streaming")
      const young = await exchange("young", "", "streaming")
      const done = await exchange("done", "yes")
      await stale(tried.answerId, { idle: 61, attempts: Messages.MAX_ATTEMPTS })
      await stale(old.answerId, { idle: 61, age: Messages.MAX_AGE_SECONDS + 1, attempts: 1 })
      await stale(young.answerId, { idle: 61, age: Messages.MAX_AGE_SECONDS - 60, attempts: 2 })
      await stale(done.answerId, { idle: 3600 })
      const h = await harness(answers("Recovered."))
      await h.sweep()
      await h.settled()
      expect(await row(tried.answerId)).toMatchObject({ status: "failed", failure: "abandoned" })
      expect(await row(old.answerId)).toMatchObject({ status: "failed", failure: "abandoned" })
      expect(await row(young.answerId)).toMatchObject({ status: "done", text: "Recovered.", attempts: 3 })
      expect(await row(done.answerId)).toMatchObject({ status: "done", failure: null })
      expect(h.count(ChatMetrics.swept, {})).toBe(2)
      expect(h.count(ChatMetrics.answers, { outcome: "failed", failure: "abandoned" })).toBe(2)
      const [line] = h.line("chat.sweep")
      expect(line).toMatchObject({ level: "WARN", annotations: { abandoned: 2, redispatched: 1 } })
      expect(String(line!.annotations.answerIds).split(",").sort()).toEqual([tried.answerId, old.answerId].sort())
      expect(h.span("chat.sweep")[0]!.attributes.get("smithers.chat.sweep.abandoned")).toBe(2)
    })

    test("a sweep with nothing stuck records no log line", async () => {
      await exchange("done", "yes")
      const h = await harness(answers("never"))
      await h.sweep()
      expect(h.line("chat.sweep")).toHaveLength(0)
      expect(h.span("chat.sweep")[0]!.attributes.get("smithers.chat.sweep.abandoned")).toBe(0)
    })

    test("a sweep that can't reach Postgres logs an error and raises nothing", async () => {
      const unreachableDb = Database.layer(
        Effect.succeed(Redacted.make("postgresql://smithers:smithers@127.0.0.1:9/smithers")),
      )
      const h = await harness(answers("never"), {}, unreachableDb)
      await h.sweep()
      expect(h.line("chat.sweep")[0]).toMatchObject({ level: "ERROR", annotations: { outcome: "error" } })
    })
  })

  test("every line of a request with a traceparent carries its trace id and the span that logged it", async () => {
    const traceId = "4bf92f3577b34da6a3ce929d0e0e4736"
    const h = await harness(answers("Traced."))
    const ids = { id: uuid(), answerId: uuid() }
    const response = await h.fetch("/api/questions", {
      method: "POST",
      headers: { "content-type": "application/json", traceparent: `00-${traceId}-00f067aa0ba902b7-01` },
      body: JSON.stringify({ ...ids, text: "trace me" }),
    })
    expect(response.status).toBe(202)
    await h.settled()
    // Each line is logged inside the span of the same name.
    for (const name of ["chat.question", "chat.dispatch", "chat.answer"]) {
      const [line] = h.line(name)
      expect(line!.annotations).toMatchObject({ trace_id: traceId, span_id: h.span(name)[0]!.spanId })
    }
  })

  test("question text never reaches a log line, span or metric", async () => {
    const sentinel = "SENTINEL-7f3a9c"
    const h = await harness((request) => {
      const question = contents(request).at(-1)!
      return question.includes("fail")
        ? Stream.fail(
          new ModelError.ModelError({ code: "invalid_request", message: `echoed ${sentinel}`, httpStatus: 400 }),
        )
        : Stream.make(delta(`You said ${question}`), usage, settle)
    })
    const ids = { id: uuid(), answerId: uuid() }
    await h.ask({ ...ids, text: `remember ${sentinel}` })
    await h.ask({ id: uuid(), answerId: uuid(), text: `fail ${sentinel}` })
    await h.ask({ id: "not-a-uuid", answerId: uuid(), text: sentinel })
    await h.ask({ id: ids.id, answerId: ids.answerId, text: `retry ${sentinel}` })
    await h.settled()
    expect((await row(ids.answerId)).text).toContain(sentinel)
    expect(h.line("chat.answer")).toHaveLength(2)
    expect(JSON.stringify(h.logs)).not.toContain(sentinel)
    for (const span of h.spans) {
      expect(JSON.stringify([...span.attributes])).not.toContain(sentinel)
      expect(JSON.stringify(span.events, (_, value) => (typeof value === "bigint" ? String(value) : value))).not
        .toContain(sentinel)
    }
    expect(JSON.stringify(h.snapshot().map((metric) => metric.attributes))).not.toContain(sentinel)
  })
})

describe.skipIf(!electric)("GET /api/shapes/messages", () => {
  test("passes Electric's response through, with only Electric's protocol parameters and table=messages", async () => {
    await Effect.runPromise(Effect.provide(Database.migrate, devDb))
    const h = await harness(answers("never"))
    const response = await h.fetch(
      "/api/shapes/messages?offset=-1&table=users&where=true&columns=text&params%5B1%5D=x&secret=stolen",
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("electric-handle")).toEqual(expect.any(String))
    expect(response.headers.get("electric-offset")).toEqual(expect.any(String))
    expect(response.headers.get("content-type")).toContain("application/json")
    for (const name of ["content-encoding", "content-length", "access-control-allow-origin"]) {
      expect(response.headers.get(name)).toBeNull()
    }
    const body = await response.text()
    expect(Array.isArray(JSON.parse(body))).toBe(true)
    const [sent] = h.upstream
    expect(`${sent!.origin}${sent!.pathname}`).toBe(`${ELECTRIC_URL}/v1/shape`)
    expect([...sent!.searchParams]).toEqual([["offset", "-1"], ["table", "messages"]])
    // One line per request, once its body has ended, with the bytes it sent.
    await eventually(async () => h.line("chat.shape").length === 1)
    expect(h.line("chat.shape")[0]).toMatchObject({
      level: "INFO",
      annotations: {
        status: 200,
        live: false,
        durationMs: expect.any(Number),
        bytes: new TextEncoder().encode(body).byteLength,
        outcome: "complete",
      },
    })
    expect(h.count(ChatMetrics.shapes, { status: "200", live: "false" })).toBe(1)
  })

  test("a request the browser abandons while Electric holds it records one line, aborted", async () => {
    const h = await harness(answers("never"))
    const release = h.holdElectric()
    const abort = new AbortController()
    const pending = h.fetch("/api/shapes/messages?offset=-1&live=true", { signal: abort.signal }).catch(() => null)
    await eventually(async () => h.upstream.length === 1)
    abort.abort()
    // Effect's HttpClient sees the abort once Electric's fetch settles: 499 if before its response, else mid-body.
    release()
    await pending
    await eventually(async () => h.line("chat.shape").length === 1)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(h.line("chat.shape")).toHaveLength(1)
    expect(h.line("chat.shape")[0]).toMatchObject({
      level: "INFO",
      annotations: { live: true, bytes: 0, durationMs: expect.any(Number), outcome: "aborted" },
    })
  })

  test("forwards every Electric protocol parameter", async () => {
    const h = await harness(answers("never"))
    await h.fetch(
      "/api/shapes/messages?offset=0_0&handle=h-1&live=true&cursor=7&live_sse=false&log=full&expired_handle=h-0",
    )
    expect(Object.fromEntries(h.upstream[0]!.searchParams)).toEqual({
      offset: "0_0",
      handle: "h-1",
      live: "true",
      cursor: "7",
      live_sse: "false",
      log: "full",
      expired_handle: "h-0",
      table: "messages",
    })
  })

  test("adds ELECTRIC_SECRET as secret and ELECTRIC_SOURCE_ID as source_id, and never records the secret", async () => {
    const secret = "electric-secret-4b2d"
    const h = await harness(answers("never"), { ELECTRIC_SECRET: secret, ELECTRIC_SOURCE_ID: "source-1" })
    await h.fetch("/api/shapes/messages?offset=-1&source_id=browser-choice")
    expect(h.upstream[0]!.searchParams.get("secret")).toBe(secret)
    expect(h.upstream[0]!.searchParams.getAll("source_id")).toEqual(["source-1"])
    expect(JSON.stringify(h.logs)).not.toContain(secret)
    for (const span of h.spans) expect(JSON.stringify([...span.attributes])).not.toContain(secret)
  })

  test("502 when Electric can't be reached", async () => {
    const h = await harness(answers("never"), { ELECTRIC_URL: "http://127.0.0.1:9" })
    const response = await h.fetch("/api/shapes/messages?offset=-1")
    expect(response.status).toBe(502)
    expect(h.line("chat.shape")[0]).toMatchObject({
      level: "ERROR",
      annotations: { status: 502, live: false, bytes: 0, durationMs: expect.any(Number), outcome: "complete" },
    })
  })

  test("405 for another method", async () => {
    const h = await harness(answers("never"))
    const response = await h.fetch("/api/shapes/messages?offset=-1", { method: "POST" })
    expect(response.status).toBe(405)
    expect(h.upstream).toHaveLength(0)
    expect(h.line("chat.shape")[0]).toMatchObject({ level: "WARN", annotations: { status: 405, bytes: 0 } })
  })
})

test("POST /api/telemetry/v1/* relays the browser's OTLP records into ChatApi's log", async () => {
  const h = await harness(answers("never"))
  const response = await h.fetch("/api/telemetry/v1/logs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      resourceLogs: [
        {
          resource: { attributes: [{ key: "service.name", value: { stringValue: "smithers-web" } }] },
          scopeLogs: [
            {
              logRecords: [
                {
                  severityNumber: 9,
                  body: { stringValue: "answer shown" },
                  attributes: [{ key: "answerId", value: { stringValue: "a-1" } }],
                },
              ],
            },
          ],
        },
      ],
    }),
  })
  expect(response.status).toBe(200)
  expect(h.line("answer shown")[0]).toMatchObject({
    level: "INFO",
    annotations: { answerId: "a-1", "otlp.signal": "logs", "service.name": "smithers-web" },
  })
})
