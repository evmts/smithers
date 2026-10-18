// The remote door (worker/Flows.ts, docs/features/flows.md#the-remote-door) over the start ChatApi runs in production:
// `ExecutionHost`'s Durable Object `start`, on an in-memory stand-in for the object's storage, the one Cloudflare
// binding it takes. `probe/Pause` is the remote flow it starts; the app registers no remote flow of its own yet.
import { Logger as StructuredLogger } from "@smthrs/observability"
import { Effect, Layer, Logger, Metric, Option } from "effect"
import { HttpEffect, HttpServerRequest } from "effect/http"
import { describe, expect, test } from "vitest"
import { type Actor, Sessions } from "./Actor.ts"
import * as ExecutionHost from "./ExecutionHost.ts"
import * as Flows from "./Flows.ts"
import * as Expire from "./flows/Expire.ts"
import { Pause } from "./flows/Pause.ts"

const member: Actor = { subject: { kind: "person", id: "person-member" }, role: "member" }

/** One execution's Durable Object per execution id, each with its storage in memory. */
const objects = () => {
  const stored = new Map<string, Map<string, unknown>>()
  const storageOf = (executionId: string): ExecutionHost.Storage => {
    const values = stored.get(executionId) ?? new Map<string, unknown>()
    stored.set(executionId, values)
    return {
      get: <A>(key: string) => Effect.sync(() => structuredClone(values.get(key)) as A | undefined),
      put: (key, value) => Effect.sync(() => void values.set(key, structuredClone(value))),
      delete: (key) => Effect.sync(() => values.delete(key)),
      setAlarm: () => Effect.void,
      deleteAlarm: () => Effect.void,
    }
  }
  /** The start ChatApi gives the door: the flow's intent, recorded on its execution's object. */
  const starter = Flows.FlowStarter.of({
    start: (flow, options) =>
      ExecutionHost.intent(flow, options as never).pipe(
        Effect.flatMap((intent) => ExecutionObjectStart(storageOf(options.executionId), intent)),
        Effect.catchTag("@smthrs/platform-cloudflare/IntentConflict", () => Effect.fail(new Flows.StartConflict())),
        Effect.mapError((error) =>
          error instanceof Flows.StartConflict ? error : new Flows.StartUnavailable({ errorCode: "intent" })
        ),
      ),
  })
  return { stored, starter }
}

/** `ExecutionHost.make`'s `start`, which needs no engine: it records the intent and arms the alarm. */
const ExecutionObjectStart = (
  storage: ExecutionHost.Storage,
  intent: Parameters<ReturnType<typeof ExecutionHost.make>["start"]>[0],
) =>
  ExecutionHost.make(storage, {
    hostId: "door-test",
    // `start` builds no engine; only an alarm would open this.
    database: ExecutionHost.database("postgresql://unused@127.0.0.1:1/none", ExecutionHost.ENGINE_SCHEMA),
    flows: ExecutionHost.remote({
      database: ExecutionHost.database("postgresql://unused@127.0.0.1:1/none", ExecutionHost.ENGINE_SCHEMA),
      expiry: Expire.DEFAULT_EXPIRY,
    }),
    router: { start: () => Effect.void, wake: () => Effect.void },
  }).start(intent)

type StructuredLog = ReturnType<typeof StructuredLogger.formatStructured.log>

/** The door over `probe/Pause`, as `actor` (signed out when `null`), starting through `starter`. */
const door = (starter: Flows.FlowStarter["Service"], actor: Actor | null = member) => {
  const logs: Array<StructuredLog> = []
  const registry: Metric.MetricRegistry = new Map()
  const handler = HttpEffect.toWebHandler(
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      return yield* Flows.make([Pause])(request.url.split("/api/flows/")[1]!)
    }).pipe(
      Effect.provideService(Flows.FlowStarter, starter),
      Effect.provide(Layer.succeed(Sessions, Sessions.of({ resolve: Effect.succeed(Option.fromNullishOr(actor)) }))),
      Effect.provideService(
        Logger.CurrentLoggers,
        new Set([Logger.make((options) => void logs.push(StructuredLogger.formatStructured.log(options)))]),
      ),
      Effect.provideService(Metric.MetricRegistry, registry),
    ),
  )
  const post = (name: string, body: unknown, init: RequestInit = {}) =>
    handler(
      new Request(`http://chat.test/api/flows/${name}`, {
        method: "POST",
        body: typeof body === "string" ? body : JSON.stringify(body),
        ...init,
      }),
    )
  const count = (flow: string, status: string) =>
    Effect.runSync(
      Metric.value(Metric.withAttributes(Flows.requests, { flow, status })).pipe(
        Effect.provideService(Metric.MetricRegistry, registry),
      ),
    ).count
  return { post, logs, count }
}

describe("POST /api/flows/<name>", () => {
  test("starts a registered remote flow once: 202, the same start again 202, another payload under its id 409", async () => {
    const { stored, starter } = objects()
    const d = door(starter)
    const executionId = crypto.randomUUID()
    const sentinel = `sentinel-${crypto.randomUUID()}`

    const first = await d.post("probe/Pause", { executionId, payload: { label: sentinel, pauseMs: 10 } })
    const again = await d.post("probe/Pause", {
      executionId: executionId.toUpperCase(),
      payload: { label: sentinel, pauseMs: 10 },
    })
    const other = await d.post("probe/Pause", { executionId, payload: { label: "else", pauseMs: 10 } })

    expect([first.status, await first.json()]).toEqual([202, { executionId }])
    expect(again.status).toBe(202)
    expect([other.status, await other.json()]).toEqual([409, { code: "conflict" }])
    expect([...stored.keys()]).toEqual([executionId])
    expect(d.count("probe/Pause", "202")).toBe(2)
    expect(d.logs.filter((line) => line.message === "flow.door").map((line) => line.annotations.status)).toEqual([
      202,
      202,
      409,
    ])
    expect(JSON.stringify(d.logs)).not.toContain(sentinel)
  })

  test("refuses an unregistered flow, another method, a signed-out caller, a bad body, a bad payload and a large one", async () => {
    const { stored, starter } = objects()
    const d = door(starter)
    const signedOut = door(starter, null)
    const executionId = crypto.randomUUID()

    expect((await d.post("chat/Answer", { executionId, payload: {} })).status).toBe(404)
    const get = await d.post("probe/Pause", "", { method: "GET", body: null })
    expect([get.status, get.headers.get("allow")]).toEqual([405, "POST"])
    expect((await signedOut.post("probe/Pause", { executionId, payload: { label: "a", pauseMs: 1 } })).status).toBe(401)
    expect((await d.post("probe/Pause", "not json")).status).toBe(400)
    expect((await d.post("probe/Pause", "", { body: new Uint8Array([0x7b, 0xff]) })).status).toBe(400)
    expect((await d.post("probe/Pause", { executionId: "not-a-uuid", payload: { label: "a", pauseMs: 1 } })).status)
      .toBe(
        400,
      )
    const badPayload = await d.post("probe/Pause", { executionId, payload: { label: 1 } })
    expect([badPayload.status, await badPayload.json()]).toEqual([400, { code: "invalid_payload" }])
    const large = await d.post("probe/Pause", { executionId, payload: { label: "x".repeat(70 * 1024), pauseMs: 1 } })
    expect(large.status).toBe(413)
    expect(stored.size).toBe(0)
  })

  test("answers 503 when the remote host can't record the start, logged by its code", async () => {
    const d = door(
      Flows.FlowStarter.of({ start: () => Effect.fail(new Flows.StartUnavailable({ errorCode: "sql:Unavailable" })) }),
    )
    const dies = door(Flows.FlowStarter.of({ start: () => Effect.die(new Error("boom")) }))
    const body = { executionId: crypto.randomUUID(), payload: { label: "a", pauseMs: 1 } }

    const failed = await d.post("probe/Pause", body)
    const died = await dies.post("probe/Pause", body)

    expect([failed.status, await failed.json()]).toEqual([503, { code: "unavailable" }])
    expect(died.status).toBe(503)
    expect(d.logs.find((line) => line.message === "flow.door")).toMatchObject({
      level: "ERROR",
      annotations: { errorCode: "sql:Unavailable", status: 503 },
    })
    expect(dies.logs.find((line) => line.message === "flow.door")?.annotations.errorCode).toBe("unknown")
  })
})
