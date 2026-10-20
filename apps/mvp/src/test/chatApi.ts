import { Model, ModelError, type ModelEvent, type ModelRequest } from "@smthrs/model"
import { HostModel } from "@smthrs/model-host"
import {
  Cause,
  ConfigProvider,
  Context,
  Effect,
  Fiber,
  Layer,
  Metric,
  Option,
  Queue,
  Redacted,
  Schedule,
  Stream,
  Tracer,
} from "effect"
import { FetchHttpClient, HttpEffect } from "effect/http"
import { SqlClient } from "effect/sql"
import * as Database from "../../db/Database.ts"
import * as Chat from "../../worker/Chat.ts"
import { appLayer } from "../boot"
import type { ChatConfig } from "../features/chat/store"
import { makeRuntime } from "../lib/runtime"
import { DATABASE_URL, ELECTRIC_URL, postgres, scratchSchema } from "./postgres"

// ChatApi's real handler (worker/Chat.ts), run as worker/ChatApi.test.ts runs it, behind the browser's network, over
// the compose Postgres and Electric (`pnpm db:up`). Only the model is scripted: a test writes each answer.
//
// Each instance gets its own schema, migrated by db/migrations and dropped when its scope closes, so tests never touch
// the dev conversation. ChatApi's SQL reaches it through the connection's search_path; its shape requests reach it
// because the fetch ChatApi calls Electric with names the schema in `table`, the one place the schema shows.
//
// Seams, each outside our code:
// - the browser's network to `POST /api/questions`: `failNext` drops a request, as offline, or answers 503, as a
//   gateway does without ChatApi; `duplicateNext` delivers one twice, as a network that retried it does;
//   `conflictNext` lets another writer store a different question with its id first; `stallNext` passes ChatApi's
//   status and headers, then holds the body;
// - the browser's network to the shapes: `failShapes` drops them, as offline, or answers 400, as a gateway might;
// - Electric, as ChatApi reaches it: `pauseElectric` holds its responses until `resumeElectric`, as a slow Electric
//   would; `cutElectric` makes it unreachable, so ChatApi's proxy answers 502, until `healElectric`;
// - the model: `answerTo(question)` scripts the answer to a question.

/** What a test writes into the answer to one question. */
export interface Reply {
  readonly say: (text: string) => void
  readonly done: () => void
  readonly fail: () => void
}

export class TestChatApi extends Context.Service<
  TestChatApi,
  {
    readonly origin: string
    /** The browser's network to ChatApi. */
    readonly fetch: typeof globalThis.fetch
    /** Fails the next `POST /api/questions` on the browser's network: dropped, or 503 from a gateway. */
    readonly failNext: (failure: "unreachable" | "refused") => void
    /** Delivers the next `POST /api/questions` to ChatApi twice; the browser gets the second answer. */
    readonly duplicateNext: () => void
    /** Before the next `POST /api/questions`, another writer stores a different question with its id. */
    readonly conflictNext: () => void
    /** Passes the next `POST /api/questions` to ChatApi, then holds its answer's body; says when it was aborted. */
    readonly stallNext: () => { readonly aborted: () => boolean }
    /** Fails every shape request on the browser's network from now on: dropped, or 400 from a gateway; or none. */
    readonly failShapes: (failure: "unreachable" | "refused" | undefined) => void
    readonly pauseElectric: () => void
    readonly resumeElectric: () => void
    readonly cutElectric: () => void
    readonly healElectric: () => void
    /** The scripted answer to the model request whose question is `question`, once ChatApi asks the model. */
    readonly answerTo: (question: string) => Effect.Effect<Reply>
    /** Asks as another device would, through ChatApi. */
    readonly askElsewhere: (text: string) => Effect.Effect<{ readonly questionId: string; readonly answerId: string }>
    /** The rows in Postgres, in order. */
    readonly rows: Effect.Effect<ReadonlyArray<{ readonly id: string; readonly text: string; readonly position: number }>>
    /** Every OTLP request the browser sent: its path and JSON body. */
    readonly telemetry: Array<{ readonly path: string; readonly body: string }>
    /** Every span ChatApi recorded. */
    readonly spans: Array<Tracer.NativeSpan>
  }
>()("@smthrs/mvp/test/TestChatApi") {
  static readonly layer = Layer.effect(
    TestChatApi,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const schema = scratchSchema("test_chat")
      yield* Effect.acquireRelease(sql.unsafe(`create schema ${schema}`), () =>
        sql.unsafe(`drop schema ${schema} cascade`).pipe(Effect.ignore),
      )
      const url = new URL(DATABASE_URL)
      url.searchParams.set("options", `-c search_path=${schema}`)
      const database = Database.layer(Effect.succeed(Redacted.make(url.toString())))
      yield* Effect.provide(Database.migrate, database)

      // The model: one queue of events per request, written by the test through `answerTo`.
      const requests: Array<{ readonly question: string; readonly events: Queue.Queue<ModelEvent.ModelEvent, Model.ModelFailure | Cause.Done> }> = []
      const questionOf = (request: ModelRequest.ModelRequest) =>
        request.messages.at(-1)?.content.map((part) => ("text" in part ? part.text : "")).join("") ?? ""
      const model = Model.make({
        stream: (request) =>
          Stream.unwrap(
            Effect.map(Queue.unbounded<ModelEvent.ModelEvent, Model.ModelFailure | Cause.Done>(), (events) => {
              requests.push({ question: questionOf(request), events })
              return Stream.fromQueue(events)
            }),
          ),
      })

      const spans: Array<Tracer.NativeSpan> = []
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options)
          spans.push(span)
          return span
        },
      })
      const config = ConfigProvider.fromUnknown({ ELECTRIC_URL })
      const chat = yield* Chat.make(database).pipe(
        Effect.provide(Layer.succeed(HostModel, HostModel.of({ modelId: "test-model", model }))),
        Effect.provideService(ConfigProvider.ConfigProvider, config),
      )

      // Background answers, interrupted when the scope closes, before the schema is dropped.
      const background = new Set<Fiber.Fiber<void>>()
      yield* Effect.addFinalizer(() => Fiber.interruptAll(background))

      // Electric, as ChatApi calls it: the table in this schema, and responses held while paused.
      let resume: { readonly promise: Promise<void>; readonly resolve: () => void } | undefined
      let electricCut = false
      const electric: typeof globalThis.fetch = async (input, init) => {
        const upstream = new URL(input instanceof Request ? input.url : String(input))
        if (upstream.searchParams.get("table") === "messages") upstream.searchParams.set("table", `${schema}.messages`)
        if (electricCut) throw new TypeError("fetch failed")
        const response = await globalThis.fetch(upstream, init)
        if (resume !== undefined) await resume.promise
        return response
      }

      const handler = HttpEffect.toWebHandler(
        chat.fetch.pipe(
          Effect.provideService(
            Chat.Background,
            Chat.Background.of({
              run: (effect) =>
                Effect.map(Effect.forkDetach(effect), (fiber) => {
                  background.add(fiber)
                }),
            }),
          ),
          Effect.provide(FetchHttpClient.layer),
          Effect.provideService(FetchHttpClient.Fetch, electric),
          Effect.provideService(Tracer.Tracer, tracer),
          Effect.provideService(ConfigProvider.ConfigProvider, config),
        ),
      )

      type QuestionFault =
        | { readonly _tag: "unreachable" | "refused" | "duplicate" | "conflict" }
        | { readonly _tag: "stall"; readonly aborted: { value: boolean } }
      let fault: QuestionFault | undefined
      let shapeFault: "unreachable" | "refused" | undefined
      const telemetry: Array<{ path: string; body: string }> = []
      const origin = "http://chatapi.test"
      const postQuestion = (body: unknown) =>
        handler(
          new Request(`${origin}/api/questions`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
        )
      const fetch: typeof globalThis.fetch = async (input, init) => {
        const request = new Request(input, init)
        const { pathname } = new URL(request.url)
        if (pathname.startsWith("/api/shapes/") && shapeFault !== undefined) {
          if (shapeFault === "unreachable") throw new TypeError("fetch failed")
          return Response.json({ message: "Refused" }, { status: 400 })
        }
        if (pathname === "/api/questions" && fault !== undefined) {
          const next = fault
          fault = undefined
          switch (next._tag) {
            case "unreachable":
              throw new TypeError("fetch failed")
            case "refused":
              return new Response(null, { status: 503 })
            case "duplicate":
              await handler(request.clone())
              return handler(request)
            case "conflict": {
              const { id } = (await request.clone().json()) as { id: string }
              await postQuestion({ id, answerId: crypto.randomUUID(), text: "another question" })
              return handler(request)
            }
            case "stall": {
              const { status, headers } = await handler(request)
              request.signal.addEventListener("abort", () => {
                next.aborted.value = true
              })
              return new Response(new ReadableStream({}), { status, headers })
            }
          }
        }
        if (pathname.startsWith("/api/telemetry/")) telemetry.push({ path: pathname, body: await request.clone().text() })
        return handler(request)
      }

      const answerTo = (question: string) =>
        Effect.sync(() => Option.fromUndefinedOr(requests.find((request) => request.question === question))).pipe(
          Effect.flatMap(Option.match({ onNone: () => Effect.fail("not asked yet"), onSome: Effect.succeed })),
          Effect.retry({ schedule: Schedule.spaced("10 millis"), times: 1_000 }),
          Effect.orDie,
          Effect.map(({ events }): Reply => ({
            say: (text) => void Queue.offerUnsafe(events, { type: "text-delta", id: "t", text }),
            done: () => {
              Queue.offerUnsafe(events, { type: "usage", inputTokens: 10, outputTokens: 20 })
              Queue.offerUnsafe(events, { type: "settle", stopReason: "stop" })
              Queue.endUnsafe(events)
            },
            fail: () =>
              void Queue.failCauseUnsafe(
                events,
                Cause.fail(new ModelError.ModelError({ code: "provider_internal", message: "scripted failure", httpStatus: 500 })),
              ),
          })),
        )

      return TestChatApi.of({
        origin,
        fetch,
        failNext: (next) => {
          fault = { _tag: next }
        },
        duplicateNext: () => {
          fault = { _tag: "duplicate" }
        },
        conflictNext: () => {
          fault = { _tag: "conflict" }
        },
        stallNext: () => {
          const aborted = { value: false }
          fault = { _tag: "stall", aborted }
          return { aborted: () => aborted.value }
        },
        failShapes: (next) => {
          shapeFault = next
        },
        cutElectric: () => {
          electricCut = true
        },
        healElectric: () => {
          electricCut = false
        },
        pauseElectric: () => {
          if (resume !== undefined) return
          let resolve = () => {}
          const promise = new Promise<void>((done) => {
            resolve = done
          })
          resume = { promise, resolve }
        },
        resumeElectric: () => {
          resume?.resolve()
          resume = undefined
        },
        answerTo,
        askElsewhere: (text) =>
          Effect.promise(async () => {
            const ids = { questionId: crypto.randomUUID(), answerId: crypto.randomUUID() }
            const response = await postQuestion({ id: ids.questionId, answerId: ids.answerId, text })
            if (response.status !== 202) throw new Error(`ChatApi answered ${response.status}`)
            return ids
          }),
        rows: sql<{ id: string; text: string; position: bigint }>`
          select id, text, position from ${sql(`${schema}.messages`)} order by position`.pipe(
          Effect.map((rows) => rows.map((row) => ({ ...row, position: Number(row.position) }))),
          Effect.orDie,
        ),
        telemetry,
        spans,
      })
    }),
  )
}

// Each tab counts into its own registry, so one test's metrics never leak into another's.
const ownMetrics = () => Layer.succeed(Metric.MetricRegistry, new Map())

/**
 * The browser app (`appLayer`, as main.tsx builds it) over a fresh ChatApi, on its own runtime. Dispose the runtime
 * to close everything; the browser's OTLP exporter flushes then.
 */
export const openTestApp = (options: TabOptions = {}) =>
  makeRuntime(
    Layer.unwrap(
      Effect.gen(function* () {
        const api = yield* TestChatApi
        return appLayer({ origin: api.origin, fetch: api.fetch, ...options })
      }),
    ).pipe(Layer.provideMerge(TestChatApi.layer), Layer.provide(postgres), Layer.provideMerge(ownMetrics())),
  )

/** Another tab, or device, on the same ChatApi. Dispose it before the runtime that holds the ChatApi. */
export const openTab = (api: TestChatApi["Service"], options: TabOptions = {}) =>
  makeRuntime(appLayer({ origin: api.origin, fetch: api.fetch, ...options }).pipe(Layer.provideMerge(ownMetrics())))

/** A tab's deadlines, backoff and page size (`ChatConfig`). */
export type TabOptions = Omit<ChatConfig, "shapeUrl" | "questionsUrl" | "fetch">
