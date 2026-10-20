// Dispatch (src/flows/dispatch.ts) for both placements: a client flow on the Node host's engine over the compose
// Postgres (`pnpm db:up`), and a remote one through the real remote door (worker/Flows.ts) on ChatApi's origin. Every
// dispatch's records, read back without the flow's input. Unhappy paths inject the faulty service: an engine that
// refuses or dies, a door that refuses, `Preferences` that can't be written.
import { Persistence } from "@smthrs/effect-tanstack-db"
import { Action, type Flow } from "@smthrs/flow"
import { BrowserEngine } from "@smthrs/platform-browser"
import { Cause, Effect, Exit, Layer, Logger, Metric, Schema, Scope, Tracer } from "effect"
import { FetchHttpClient, HttpEffect, HttpServerRequest } from "effect/http"
import { afterEach, describe, expect, test } from "vitest"
import { Sessions } from "../../worker/Actor.ts"
import * as Flows from "../../worker/Flows.ts"
import { Pause } from "../../worker/flows/Pause.ts"
import { build } from "../../worker/test/flowHost.ts"
import { Preferences, PreferencesUnavailable, registration as themeRegistration, SetTheme } from "../features/theme/flows"
import { tabPreferences, ThemeStore } from "../features/theme/store"
import { clientFlows } from "./declarations"
import { ClientEngine, dispatches, DispatchFailed, FlowDispatch, makeDispatch, RemoteFlows } from "./dispatch"
import { registry } from "./registry"

const ORIGIN = "http://chat.test"

/** What an exit failed with, stack traces aside. */
const failure = (exit: Exit.Exit<unknown, unknown>) => (Exit.isFailure(exit) ? Cause.squash(exit.cause) : exit)

/** The app's theme flow and a remote flow, the door's `probe/Pause`, in one registry. */
const entries = {
  "app/theme/set": registry["app/theme/set"],
  "probe/Pause": { flow: Pause, needs: ["server-key"] },
} as const

const scopes: Array<Scope.Closeable> = []
afterEach(async () => {
  for (const scope of scopes.splice(0)) await Effect.runPromise(Scope.close(scope, Exit.void))
})

/** The remote door over `probe/Pause`, signed in, recording each start; `refuse` makes it answer 409. */
const door = (options: { readonly refuse?: boolean } = {}) => {
  const started: Array<{ readonly executionId: string; readonly payload: unknown }> = []
  const handler = HttpEffect.toWebHandler(
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      return yield* Flows.make([Pause])(request.url.split("/api/flows/")[1]!)
    }).pipe(
      Effect.provideService(
        Flows.FlowStarter,
        Flows.FlowStarter.of({
          start: (_flow, start) =>
            options.refuse === true
              ? Effect.fail(new Flows.StartConflict())
              : Effect.sync(() => void started.push(start)),
        }),
      ),
      Effect.provide(
        Layer.succeed(
          Sessions,
          Sessions.of({ resolve: Effect.succeedSome({ subject: { kind: "person", id: "p" }, role: "member" }) }),
        ),
      ),
    ),
  )
  const fetch: typeof globalThis.fetch = (input, init) => handler(new Request(input, init))
  return { started, fetch }
}

type Recorded = {
  readonly logs: Array<ReturnType<typeof Logger.formatStructured.log>>
  readonly spans: Array<Tracer.NativeSpan>
  readonly registry: Metric.MetricRegistry
}

/**
 * Dispatch over `entries`, with `engine` as this device's engine (the Node host's, running the declarations in
 * `declared`, unless set) and the door at `fetch`; every record kept.
 */
const open = async (
  options: {
    readonly engine?: Layer.Layer<ClientEngine>
    readonly declared?: ReadonlyArray<Flow.Any>
    readonly fetch?: typeof globalThis.fetch
    readonly preferences?: Layer.Layer<Preferences>
  } = {},
) => {
  const scope = Effect.runSync(Scope.make())
  scopes.push(scope)
  const painted: Array<"light" | "dark"> = []
  const store = ThemeStore.layer({
    paint: (mode) => void painted.push(mode),
    mirror: () => {},
    system: () => "light",
    painted: () => painted.at(-1),
  })
    .pipe(Layer.provide(Persistence.memory))
  const recorded: Recorded = { logs: [], spans: [], registry: new Map() }
  const engine = options.engine ?? await Effect.runPromise(
    Scope.provide(scope)(
      Effect.map(
        build(
          themeRegistration.pipe(
            Layer.provideMerge(Action.layerImplementations),
            Layer.provide(options.preferences ?? tabPreferences.pipe(Layer.provide(store))),
          ),
        ),
        ({ context }) =>
          ClientEngine.layerRuntime(options.declared ?? [SetTheme]).pipe(Layer.provide(Layer.succeedContext(context))),
      ),
    ),
  )
  const services = Layer.mergeAll(
    engine,
    RemoteFlows.layerHttp(ORIGIN).pipe(
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(Layer.succeed(FetchHttpClient.Fetch, options.fetch ?? door().fetch)),
    ),
  )
  const dispatch = await Effect.runPromise(Effect.provide(makeDispatch(entries), services))
  const observed = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.runPromise(
      Effect.exit(effect).pipe(
        Effect.provideService(
          Logger.CurrentLoggers,
          new Set([Logger.make((o) => void recorded.logs.push(Logger.formatStructured.log(o)))]),
        ),
        Effect.provideService(
          Tracer.Tracer,
          Tracer.make({
            span: (o) => {
              const span = new Tracer.NativeSpan(o)
              recorded.spans.push(span)
              return span
            },
          }),
        ),
        Effect.provideService(Metric.MetricRegistry, recorded.registry),
      ),
    )
  const count = (attributes: Record<string, string>) =>
    Effect.runSync(
      Metric.value(Metric.withAttributes(dispatches, attributes)).pipe(
        Effect.provideService(Metric.MetricRegistry, recorded.registry),
      ),
    ).count
  return { dispatch, observed, recorded, count, painted }
}

describe("a client flow", () => {
  test("runs on this device's engine and answers its value, recorded by flow, placement, door and outcome", async () => {
    const d = await open()

    const exit = await d.observed(
      d.dispatch("app/theme/set", { mode: "dark" }, { door: "button", executionId: "theme-1" }),
    )

    expect(exit).toEqual(Exit.succeed({ _tag: "Done", value: { mode: "dark" } }))
    expect(d.painted).toEqual(["dark"])
    expect(d.count({ flow: "app/theme/set", placement: "client", door: "button", outcome: "done" })).toBe(1)
    const line = d.recorded.logs.find((log) => log.message === "flow.dispatch")
    expect(line).toMatchObject({
      level: "INFO",
      annotations: {
        flow: "app/theme/set",
        placement: "client",
        door: "button",
        outcome: "done",
        executionId: "theme-1",
      },
    })
    const span = d.recorded.spans.find((candidate) => candidate.name === "flow.dispatch")!
    expect(Object.fromEntries(span.attributes)).toMatchObject({
      "smithers.flow.name": "app/theme/set",
      "smithers.flow.placement": "client",
      "smithers.flow.door": "button",
      "smithers.flow.outcome": "done",
    })
  })

  test("answers the flow's declared failure as its value", async () => {
    const d = await open({
      preferences: Layer.succeed(
        Preferences,
        Preferences.of({ setTheme: () => Effect.fail(new PreferencesUnavailable()) }),
      ),
    })

    const exit = await d.observed(d.dispatch("app/theme/set", { mode: "dark" }, { door: "agent" }))

    expect(exit).toEqual(Exit.succeed({ _tag: "Failed", error: new PreferencesUnavailable() }))
    expect(d.recorded.logs.find((log) => log.message === "flow.dispatch")).toMatchObject({
      level: "WARN",
      annotations: { outcome: "failed" },
    })
  })

  test("fails as DispatchFailed when the flow dies, is interrupted, or the engine refuses it", async () => {
    const answering = (exit: Exit.Exit<unknown, unknown>) =>
      Layer.succeed(ClientEngine, ClientEngine.of({ run: () => Effect.succeed(exit) }))
    const died = await open({ engine: answering(Exit.die(new Error("bug"))) })
    const interrupted = await open({ engine: answering(Exit.interrupt()) })
    const refused = await open({
      engine: Layer.succeed(
        ClientEngine,
        ClientEngine.of({ run: (flow) => Effect.fail(new DispatchFailed({ flow: flow._tag, reason: "refused" })) }),
      ),
    })

    const dispatchTheme = (d: Awaited<ReturnType<typeof open>>) =>
      d.observed(d.dispatch("app/theme/set", { mode: "dark" }, { door: "view" }))

    expect(failure(await dispatchTheme(died))).toEqual(new DispatchFailed({ flow: "app/theme/set", reason: "defect" }))
    expect(failure(await dispatchTheme(interrupted))).toEqual(
      new DispatchFailed({ flow: "app/theme/set", reason: "interrupted" }),
    )
    expect(failure(await dispatchTheme(refused))).toEqual(
      new DispatchFailed({ flow: "app/theme/set", reason: "refused" }),
    )
    expect(died.recorded.logs.find((log) => log.message === "flow.dispatch")).toMatchObject({
      level: "ERROR",
      annotations: { outcome: "error", reason: "defect" },
    })
  })

  test("is refused by an engine in this process that doesn't declare it", async () => {
    const d = await open({ declared: [] })

    const exit = await d.observed(d.dispatch("app/theme/set", { mode: "dark" }, { door: "button" }))

    expect(failure(exit)).toEqual(new DispatchFailed({ flow: "app/theme/set", reason: "refused" }))
    expect(d.painted).toEqual([])
  })
})

describe("the browser's engine as ClientEngine", () => {
  const over = (engine: Partial<BrowserEngine.Service>) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* ClientEngine
        return yield* Effect.exit(
          client.run(registry["app/theme/set"].flow, { executionId: "e", payload: { mode: "dark" } }),
        )
      }).pipe(
        Effect.provide(ClientEngine.layerBrowser),
        Effect.provide(
          Layer.succeed(BrowserEngine.BrowserEngine, BrowserEngine.BrowserEngine.of(engine as BrowserEngine.Service)),
        ),
      ),
    )

  test("starts the run, then answers how it ended", async () => {
    const started: Array<string> = []
    const exit = await over({
      start: (_flow, options) => Effect.sync(() => void started.push(options.executionId)),
      result: () => Effect.succeed(Exit.succeed({ mode: "dark" })) as never,
    })

    expect(exit).toEqual(Exit.succeed(Exit.succeed({ mode: "dark" })))
    expect(started).toEqual(["e"])
  })

  test("a refused request is refused, and a payload that won't encode is invalid", async () => {
    const result = () => Effect.never
    const refused = await over({
      start: () => Effect.fail(new BrowserEngine.RequestRefused({ request: "Start", error: "UnknownFlow" })),
      result,
    })
    const invalid = await over({ start: () => Effect.fail(new Schema.SchemaError(undefined as never)), result })

    expect(failure(refused)).toEqual(new DispatchFailed({ flow: "app/theme/set", reason: "refused" }))
    expect(failure(invalid)).toEqual(new DispatchFailed({ flow: "app/theme/set", reason: "invalid" }))
  })
})

describe("a remote flow", () => {
  test("starts at the remote door with its payload encoded, answers Started, and never records the payload", async () => {
    const remote = door()
    const d = await open({ fetch: remote.fetch })
    const sentinel = `sentinel-${crypto.randomUUID()}`

    const exit = await d.observed(
      d.dispatch("probe/Pause", { label: sentinel, pauseMs: 5 }, {
        door: "slash",
        executionId: "0f8fad5b-d9cb-469f-a165-70867728950e",
      }),
    )

    expect(exit).toEqual(Exit.succeed({ _tag: "Started", executionId: "0f8fad5b-d9cb-469f-a165-70867728950e" }))
    expect(remote.started).toEqual([
      { executionId: "0f8fad5b-d9cb-469f-a165-70867728950e", payload: { label: sentinel, pauseMs: 5 } },
    ])
    expect(d.count({ flow: "probe/Pause", placement: "remote", door: "slash", outcome: "started" })).toBe(1)
    expect(JSON.stringify(d.recorded.logs)).not.toContain(sentinel)
    expect(JSON.stringify(d.recorded.spans.map((span) => [...span.attributes]))).not.toContain(sentinel)
  })

  test("is refused when the door refuses, when nothing answers, and invalid when its payload won't encode", async () => {
    const conflicted = await open({ fetch: door({ refuse: true }).fetch })
    const unreachable = await open({ fetch: () => Promise.reject(new TypeError("offline")) })
    const start = (d: Awaited<ReturnType<typeof open>>, payload: unknown) =>
      d.observed(d.dispatch("probe/Pause", payload as never, { door: "button", executionId: crypto.randomUUID() }))

    expect(failure(await start(conflicted, { label: "a", pauseMs: 1 }))).toEqual(
      new DispatchFailed({ flow: "probe/Pause", reason: "refused" }),
    )
    expect(failure(await start(unreachable, { label: "a", pauseMs: 1 }))).toEqual(
      new DispatchFailed({ flow: "probe/Pause", reason: "refused" }),
    )
    expect(failure(await start(unreachable, { label: 1 }))).toEqual(
      new DispatchFailed({ flow: "probe/Pause", reason: "invalid" }),
    )
  })
})

describe("FlowDispatch", () => {
  test("binds the app's registry over this device's engine and the door, minting an execution id per dispatch", async () => {
    const scope = Effect.runSync(Scope.make())
    scopes.push(scope)
    const painted: Array<"light" | "dark"> = []
    const store = ThemeStore.layer({
      paint: (mode) => void painted.push(mode),
      mirror: () => {},
      system: () => "light",
      painted: () => painted.at(-1),
    })
      .pipe(Layer.provide(Persistence.memory))
    const { context } = await Effect.runPromise(
      Scope.provide(scope)(
        build(
          themeRegistration.pipe(
            Layer.provideMerge(Action.layerImplementations),
            Layer.provide(tabPreferences.pipe(Layer.provide(store))),
          ),
        ),
      ),
    )
    const exit = await Effect.runPromise(
      Effect.flatMap(FlowDispatch, (flows) => flows.dispatch("app/theme/set", { mode: "light" }, { door: "button" }))
        .pipe(
          Effect.provide(FlowDispatch.layer),
          Effect.provide(ClientEngine.layerRuntime(clientFlows)),
          Effect.provide(RemoteFlows.layerHttp(ORIGIN).pipe(Layer.provide(FetchHttpClient.layer))),
          Effect.provide(Layer.succeedContext(context)),
          Effect.exit,
        ),
    )

    expect(exit).toEqual(Exit.succeed({ _tag: "Done", value: { mode: "light" } }))
    expect(painted).toEqual(["light"])
  })
})
