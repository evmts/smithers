/**
 * A view's failure must not carry its data to a telemetry collector.
 *
 * A generated view is model output and its props are conversation or
 * repository content; the frame keeps them off the network, so telemetry must
 * not carry them out either. Each case checks a module whose identifier is a
 * sentinel, or renders or plays a real checked module that throws a sentinel
 * taken from its props, state or event, inside a caller's ordinary span that
 * also logs the failure, and exports traces, logs and metrics with Effect's
 * own OTLP exporters to a collector that keeps every request body. The
 * sentinel must appear in none of those bytes, while the caller still reads
 * it from the error's redacted `detail`.
 */
import { Cause, Effect, Exit, Layer, Redacted } from "effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Otlp from "effect/observability/Otlp"
import type * as Scope from "effect/Scope"
import { describe, expect, it } from "vitest"
import { Bridge, PresentationRealm, ViewCode } from "../src/index.ts"
import { checked, unchecked, withRealm } from "./fixtures/realm.ts"

const sentinel = "PRIVATE_VIEW_SENTINEL"

interface ExportedSpan {
  readonly name: string
  readonly status: { readonly code?: number; readonly message?: string }
  readonly attributes: ReadonlyArray<{ readonly key: string; readonly value: { readonly stringValue?: string } }>
}

interface Exported {
  /** Every byte the collector received, decoded, by signal. */
  readonly traces: string
  readonly logs: string
  readonly metrics: string
  readonly spans: ReadonlyArray<ExportedSpan>
}

/**
 * Runs `use` against a realm the way a host would: inside its own span, with
 * a log line on failure, under OTLP exporters for traces, logs and metrics.
 * Returns the caller's exit and every request body the collector received
 * once the exporters' scope closes and flushes them.
 */
const exported = async <A, E>(
  use: (realm: PresentationRealm.Realm) => Effect.Effect<A, E, Scope.Scope>
): Promise<{ readonly exit: Exit.Exit<A, E>; readonly exported: Exported }> => {
  const bodies: Record<string, Array<string>> = { traces: [], logs: [], metrics: [] }
  const collector = HttpClient.make((request) =>
    Effect.sync(() => {
      const signal = request.url.split("/").at(-1)!
      if (request.body._tag === "Uint8Array") bodies[signal]?.push(new TextDecoder().decode(request.body.body))
      return HttpClientResponse.fromWeb(request, new Response(null, { status: 200 }))
    })
  )
  const telemetry = Otlp.layerJson({ baseUrl: "http://collector.test", resource: { serviceName: "views-test" } }).pipe(
    Layer.provide(Layer.succeed(HttpClient.HttpClient)(collector))
  )
  const exit = await withRealm((realm) =>
    Effect.scoped(
      use(realm).pipe(
        Effect.tapCause((cause) => Effect.logError("the view failed", cause)),
        Effect.tapError((error) => Effect.logError("the view failed", error)),
        Effect.withSpan("Host.showView"),
        Effect.exit,
        Effect.provide(telemetry)
      )
    )
  )
  const spans = bodies.traces!.flatMap((body) =>
    (JSON.parse(body) as {
      readonly resourceSpans: ReadonlyArray<
        { readonly scopeSpans: ReadonlyArray<{ readonly spans: ReadonlyArray<ExportedSpan> }> }
      >
    }).resourceSpans.flatMap((resource) => resource.scopeSpans.flatMap((scope) => scope.spans))
  )
  return {
    exit,
    exported: {
      traces: bodies.traces!.join("\n"),
      logs: bodies.logs!.join("\n"),
      metrics: bodies.metrics!.join("\n"),
      spans
    }
  }
}

const named = (exported: Exported, name: string): ExportedSpan => {
  const span = exported.spans.find((candidate) => candidate.name === name)
  expect(span, `exported span ${name}`).toBeDefined()
  return span!
}

const attribute = (span: ExportedSpan, key: string): string | undefined =>
  span.attributes.find((entry) => entry.key === key)?.value.stringValue

/** The sentinel reached no signal, and every signal actually exported something. */
const expectContentFree = (exported: Exported) => {
  expect(exported.spans.length).toBeGreaterThan(0)
  expect(exported.logs).toContain("the view failed")
  expect(exported.metrics.length).toBeGreaterThan(0)
  for (const signal of [exported.traces, exported.logs, exported.metrics]) expect(signal).not.toContain(sentinel)
}

/** The error the caller receives. */
const failureOf = <A, E>(exit: Exit.Exit<A, E>): E => {
  expect(Exit.isFailure(exit)).toBe(true)
  const error = Cause.findErrorOption((exit as Exit.Failure<A, E>).cause)
  expect(error._tag).toBe("Some")
  return (error as { readonly value: E }).value
}

/** The caller still reads the module's own words. */
const detailOf = <A, E extends { readonly detail: Redacted.Redacted<string> }>(exit: Exit.Exit<A, E>): string =>
  Redacted.value(failureOf(exit).detail)

describe("a failing view exports none of its data", () => {
  it("a module the checker refuses, whose identifier is the sentinel", async () => {
    const source = `export const ${sentinel} = 1\nexport default function View() { return <p /> }`
    const { exit, exported: sent } = await exported((realm) => ViewCode.check(source, { components: realm.components }))
    expectContentFree(sent)
    expect(detailOf(exit)).toBe(`1:13: A view exports only default, interactions and reduce, not ${sentinel}`)
    expect(Redacted.value(failureOf(exit).problems)).toEqual([
      { message: `A view exports only default, interactions and reduce, not ${sentinel}`, line: 1, column: 13 }
    ])
    expect(named(sent, "Host.showView").status).toEqual({
      code: 2,
      message: "The view's module does something a view may not"
    })
  })

  it("a render that throws its props", async () => {
    const module = checked(`export default function View({ props }) { throw new Error(props.secret) }`)
    const { exit, exported: sent } = await exported((realm) =>
      realm.render({ module, props: { secret: sentinel }, state: null })
    )
    expectContentFree(sent)
    expect(detailOf(exit)).toBe(`Error: ${sentinel}`)
    const span = named(sent, "PresentationRealm.render")
    expect(span.status).toEqual({ code: 2, message: "redacted" })
    expect(attribute(span, "realm.reason")).toBe("render_failed")
    expect(named(sent, "Host.showView").status).toEqual({ code: 2, message: "The view's module failed" })
  })

  it("a reduce that throws its state and event", async () => {
    const module = checked(`export const interactions = { go: { kind: "state" } }
export const reduce = (state, event) => { throw new Error(state.secret + event.arg) }
export default function View() { return <p data-event="go">go</p> }`)
    const { exit, exported: sent } = await exported((realm) =>
      realm.interact({ module, props: {}, state: { secret: sentinel }, event: { name: "go", arg: sentinel } })
    )
    expectContentFree(sent)
    expect(detailOf(exit)).toBe(`Error: ${sentinel}${sentinel}`)
    expect(attribute(named(sent, "PresentationRealm.interact"), "realm.reason")).toBe("render_failed")
  })

  it("a render after reduce that throws its props", async () => {
    const module = checked(`export const interactions = { go: { kind: "state" } }
export const reduce = (state) => state + 1
export default function View({ props, state }) {
  if (state > 0) throw new Error(props.secret)
  return <p data-event="go">go</p>
}`)
    const { exit, exported: sent } = await exported((realm) =>
      realm.interact({ module, props: { secret: sentinel }, state: 0, event: { name: "go" } })
    )
    expectContentFree(sent)
    expect(detailOf(exit)).toBe(`Error: ${sentinel}`)
  })

  it("an import the realm refuses, which names the module", async () => {
    const module = unchecked(`require(${JSON.stringify(sentinel)})`)
    const { exit, exported: sent } = await exported((realm) => realm.render({ module, props: {}, state: null }))
    expectContentFree(sent)
    expect(detailOf(exit)).toContain(sentinel)
  })

  it("a crossed bound, with its limit as an attribute and a count", async () => {
    const times = Math.ceil(Bridge.maxHtmlBytes / sentinel.length) + 1
    const module = checked(`export default function View({ props }) { return <p>{props.secret.repeat(${times})}</p> }`)
    const { exit, exported: sent } = await exported((realm) =>
      realm.render({ module, props: { secret: sentinel }, state: null })
    )
    expect(Exit.isFailure(exit)).toBe(true)
    expectContentFree(sent)
    const span = named(sent, "PresentationRealm.render")
    expect(attribute(span, "realm.reason")).toBe("limit_exceeded")
    expect(attribute(span, "realm.limit")).toBe("html")
    expect(sent.metrics).toContain("realm.limit_hit")
  })
})
