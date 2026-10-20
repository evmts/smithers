// The browser's records as ChatApi's relay keeps them (docs/observability.md#relayed-browser-records), for the tests.
// `captured` runs an OTLP exporter the tab or the engine worker installs with its posts landing in a list in place of
// ChatApi; `relayed` hands each export to `OtlpRelay.serve` twice, with the browser's allowlist and with none, and
// reports what the allowlist dropped: whole records, and fields of the records it kept.
import { Logger as StructuredLogger, OtlpRelay } from "@smthrs/observability"
import { Effect, Layer, Logger } from "effect"
import { FetchHttpClient, HttpServerRequest } from "effect/http"

/** One OTLP request: its path, `<route>/v1/{logs,traces,metrics}`, and its JSON body. */
export interface Export {
  readonly path: string
  readonly body: string
}

/** Where a test's exporters post: any origin works, since nothing leaves the process. */
export const ORIGIN = "http://relay.test"

/**
 * `exporter`, an `Otlp.layerFetch` as the browser installs it, with each post it makes kept in `exports` and answered
 * as the relay answers a whole export. It flushes when its scope closes.
 */
export const captured = <E>(exporter: Layer.Layer<never, E>) => {
  const exports: Array<Export> = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    exports.push({ path: new URL(request.url).pathname, body: await request.text() })
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
  }
  return { layer: exporter.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)), Layer.orDie), exports }
}

/** A line the relay logged: the record's name, its message, and its fields. */
export interface Line {
  readonly name: string
  readonly fields: Record<string, unknown>
}

/** Every line `OtlpRelay.serve` logs for `exports`, with `allow` or with no allowlist, and no limits. */
export const relay = (exports: ReadonlyArray<Export>, allow?: OtlpRelay.Allowlist) =>
  Effect.gen(function* () {
    const lines: Array<Line> = []
    const logger = Logger.make((options) => {
      const record = StructuredLogger.formatStructured.log(options) as {
        readonly message: unknown
        readonly annotations: Record<string, unknown>
      }
      const message = Array.isArray(record.message) && record.message.length === 1 ? record.message[0] : record.message
      lines.push({ name: String(message), fields: record.annotations })
    })
    for (const { path, body } of exports) {
      yield* OtlpRelay.serve({
        maxBodyBytes: Number.MAX_SAFE_INTEGER,
        maxRecords: Number.MAX_SAFE_INTEGER,
        ...(allow === undefined ? {} : { allow }),
      }).pipe(
        Effect.provideService(
          HttpServerRequest.HttpServerRequest,
          HttpServerRequest.fromWeb(new Request(`${ORIGIN}${path}`, { method: "POST", body })),
        ),
        Effect.provideService(Logger.CurrentLoggers, new Set([logger])),
      )
    }
    return lines
  })

/** What the allowlist dropped: records by name, and by record name the fields it removed from the ones it kept. */
export interface Dropped {
  readonly records: ReadonlySet<string>
  readonly fields: ReadonlyMap<string, ReadonlySet<string>>
}

/**
 * Relays `exports` with `allow` and with no allowlist, and compares the two. The kept lines are the unfiltered lines in
 * order with some removed, since the relay drops a record by its name alone, so each kept line is the next unfiltered
 * line with its name.
 */
export const relayed = (exports: ReadonlyArray<Export>, allow: OtlpRelay.Allowlist) =>
  Effect.gen(function* () {
    const all = yield* relay(exports)
    const kept = yield* relay(exports, allow)
    const records = new Set<string>()
    const fields = new Map<string, Set<string>>()
    let next = 0
    for (const line of all) {
      const { name } = line
      const match = kept[next]
      if (match === undefined || match.name !== name) {
        records.add(name)
        continue
      }
      next++
      for (const key of Object.keys(line.fields)) {
        if (key in match.fields) continue
        fields.set(name, (fields.get(name) ?? new Set()).add(key))
      }
    }
    if (next !== kept.length) return yield* Effect.die(new Error("the relay kept a line it was never sent"))
    return { all, kept, dropped: { records, fields } satisfies Dropped }
  })
