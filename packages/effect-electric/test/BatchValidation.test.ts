import { Effect, Fiber, Option, Schedule, Schema, Stream, Tracer } from "effect"
import { expect, test } from "vitest"
import { ElectricCollection, ShapeSource } from "../src/index.ts"

// Malformed responses are injected through the network service; the real collection and Electric client run.
const malformed = [
  null,
  {},
  [],
  { headers: null },
  { headers: {} },
  { headers: { control: "unknown" } },
  { headers: { control: 1 } },
  { headers: { event: "unknown", patterns: [] } },
  { headers: { event: "move-out" } },
  { key: "a" },
  { key: 1, value: {}, headers: { operation: "insert" } },
  { key: "a", value: null, headers: { operation: "insert" } },
  { key: "a", value: [], headers: { operation: "insert" } },
  { key: "a", value: {}, headers: { operation: "unknown" } },
  { key: "a", value: {}, headers: {} },
  { key: "a", value: { id: "a" }, headers: { operation: "insert", lsn: "bad" } },
  { key: "a", value: { id: "a" }, headers: { operation: "insert", txids: [1.5] } },
  { headers: { control: "up-to-date", global_last_seen_lsn: "bad" } },
  { headers: { control: "snapshot-end", xmin: "bad", xmax: "2", xip_list: [] } },
  { headers: { control: "snapshot-end", xmin: "1", xmax: "bad", xip_list: [] } },
  { headers: { control: "snapshot-end", xmin: "1", xmax: "2", xip_list: ["bad"] } }
]

const change = { key: "a", value: { id: "a" }, headers: { operation: "insert" } }
const upToDate = { headers: { control: "up-to-date" } }

test.each(malformed.map((message) => [JSON.stringify(message), message] as const))(
  "rejects every malformed member before accepting the batch offset: %s",
  async (_, message) => {
    const spans: Array<Tracer.NativeSpan> = []
    const tracer = Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options)
        if (options.name === "electric.shape.request") spans.push(span)
        return span
      }
    })
    const result = await Effect.runPromise(
      Effect.scoped(Effect.gen(function*() {
        const urls: Array<string> = []
        const source: ShapeSource.Source = {
          request: (url) =>
            Effect.sync(() => {
              urls.push(url)
              return new Response(JSON.stringify([change, message, upToDate]), {
                headers: {
                  "content-type": "application/json",
                  "electric-handle": "bad-batch",
                  "electric-offset": "99_0",
                  "electric-schema": JSON.stringify({ id: { type: "text" } })
                }
              })
            })
        }
        const collection = yield* ElectricCollection.make({
          id: `batch-${crypto.randomUUID()}`,
          schema: Schema.Struct({ id: Schema.String }),
          getKey: (row) => row.id,
          shape: { url: "http://invalid.test/v1/shape", params: { table: "notes" } },
          retry: Schedule.recurs(0)
        }).pipe(Effect.provideService(ShapeSource.ShapeSource, source))
        const outcome = () =>
          collection.sync.pipe(
            Stream.filter((event) => event._tag !== "Sent"),
            Stream.runHead
          )
        const first = yield* outcome().pipe(Effect.forkScoped({ startImmediately: true }))
        yield* collection.preload.pipe(Effect.ignore, Effect.forkScoped)
        const event = Option.getOrThrow(yield* Fiber.join(first))
        if (event._tag === "Stopped") {
          yield* collection.reconnect
          yield* collection.sync.pipe(Stream.filter((next) => next._tag === "Sent"), Stream.runHead)
          yield* outcome()
        }
        return { event, urls, size: collection.tanstack.size }
      })).pipe(Effect.provideService(Tracer.Tracer, tracer))
    )
    expect(result.event).toMatchObject({ _tag: "Stopped", error: { cause: { _tag: "Unreadable" } } })
    expect(result.size).toBe(0)
    expect(result.urls).toHaveLength(2)
    expect(result.urls.map((url) => new URL(url).searchParams.get("offset"))).toEqual(["-1", "-1"])
    expect(spans.map((span) => span.attributes.get("electric.shape.complete"))).toEqual([false, false])
    expect(spans.every((span) => !span.attributes.has("electric.shape.rows"))).toBe(true)
  }
)
