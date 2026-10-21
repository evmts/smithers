// `AttentionClient` against every answer ChatApi's feed routes give (worker/Notifications.ts), through the host's
// `fetch`: the browser's own capability, given here as a function answering the request it is handed. The steps that
// call it (`watch/set/request`, `notification/ack/request`) are driven over a client that answers as told.
import { Cause, Effect, Exit, Layer, Metric } from "effect"
import { FetchHttpClient } from "effect/http"
import { describe, expect, test } from "vitest"
import { AttentionClient, AttentionRefused } from "./api"
import { ActRefused, ActUnsent } from "./flows"
import { acks, watches } from "./metrics"
import { requestAck, requestWatch } from "./steps"

/** The client over a `fetch` that answers with `respond`, recording each request it was handed. */
const client = (respond: (request: Request) => Promise<Response>, within?: `${number} millis`) => {
  const seen: Array<{ readonly url: string; readonly body: string }> = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    seen.push({ url: request.url, body: await request.clone().text() })
    return respond(request)
  }
  const layer = AttentionClient.layer({ origin: "http://chat.test", ...(within === undefined ? {} : { within }) }).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
  )
  const run = <A, E>(effect: (client: AttentionClient["Service"]) => Effect.Effect<A, E>) =>
    Effect.runPromise(Effect.exit(Effect.flatMap(AttentionClient, effect).pipe(Effect.provide(layer))))
  return { run, seen }
}

const refusalOf = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? { ...(Cause.squash(exit.cause) as AttentionRefused) } : "succeeded"

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))

describe("AttentionClient", () => {
  test("follows at /api/watches and acts at /api/notifications/ack, taking a 200 with or without a transaction", async () => {
    const { run, seen } = client(() => json({ txid: 7 }))
    expect(await run((c) => c.watch(null))).toEqual(Exit.void)
    const again = client(() => json({ txid: null }))
    expect(await again.run((c) => c.ack({ subject: "run:r1", version: 2, act: "read" }))).toEqual(Exit.void)
    expect(seen).toEqual([{ url: "http://chat.test/api/watches", body: `{"conversationId":null}` }])
    expect(again.seen).toEqual([
      { url: "http://chat.test/api/notifications/ack", body: `{"subject":"run:r1","version":2,"act":"read"}` },
    ])
  })

  test("a refusal carries its status and the route's code, or its status alone without one", async () => {
    expect(refusalOf(await client(() => json({ code: "not_found" }, 404)).run((c) => c.watch("c-1")))).toEqual({
      _tag: "AttentionRefused",
      status: 404,
      code: "not_found",
    })
    expect(refusalOf(await client(() => Promise.resolve(new Response("", { status: 503 }))).run((c) => c.watch(null))))
      .toEqual({ _tag: "AttentionRefused", status: 503 })
  })

  test("no network, a body that isn't the route's, and no answer within the deadline are refusals without a code", async () => {
    expect(refusalOf(await client(() => Promise.reject(new TypeError("offline"))).run((c) => c.watch(null)))).toEqual({
      _tag: "AttentionRefused",
    })
    expect(refusalOf(await client(() => json({ nope: 1 })).run((c) => c.watch(null)))).toEqual({
      _tag: "AttentionRefused",
      status: 200,
    })
    expect(refusalOf(await client(() => new Promise<Response>(() => {}), "50 millis").run((c) => c.watch(null))))
      .toEqual({ _tag: "AttentionRefused" })
  })
})

describe("the steps", () => {
  /** A step over a client whose every call answers `answer`, counting into its own registry. */
  const step = async <A, E>(answer: Effect.Effect<void, AttentionRefused>, effect: Effect.Effect<A, E, AttentionClient>) => {
    const registry: Metric.MetricRegistry = new Map()
    const exit = await Effect.runPromise(
      Effect.exit(effect).pipe(
        Effect.provideService(AttentionClient, AttentionClient.of({ watch: () => answer, ack: () => answer })),
        Effect.provideService(Metric.MetricRegistry, registry),
      ),
    )
    const count = (metric: typeof watches, attributes: Record<string, string>) =>
      Effect.runSync(
        Metric.value(Metric.withAttributes(metric, attributes)).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
      ).count
    return { exit, count }
  }

  const ack = { subject: "run:r1", version: 1, act: "hide" } as const

  test("a 200 is sent; a 4xx is a final refusal; anything else is tried again", async () => {
    const sent = await step(Effect.void, requestWatch({ conversationId: null }))
    expect(sent.exit).toEqual(Exit.succeed({ watching: true }))
    expect(sent.count(watches, { outcome: "sent" })).toBe(1)

    const refused = await step(Effect.fail(new AttentionRefused({ status: 403, code: "forbidden" })), requestWatch({ conversationId: null }))
    expect(refused.exit).toEqual(Exit.fail(new ActRefused({ status: 403 })))
    expect(refused.count(watches, { outcome: "refused" })).toBe(1)

    for (const failure of [new AttentionRefused({}), new AttentionRefused({ status: 503 })]) {
      const unsent = await step(Effect.fail(failure), requestAck(ack))
      expect(unsent.exit).toEqual(Exit.fail(new ActUnsent()))
      expect(unsent.count(acks, { act: "hide", outcome: "unsent" })).toBe(1)
    }

    const recorded = await step(Effect.void, requestAck(ack))
    expect(recorded.exit).toEqual(Exit.succeed({ recorded: true }))
    expect(recorded.count(acks, { act: "hide", outcome: "sent" })).toBe(1)
    const gone = await step(Effect.fail(new AttentionRefused({ status: 404, code: "not_found" })), requestAck(ack))
    expect(gone.exit).toEqual(Exit.fail(new ActRefused({ status: 404 })))
  })
})
