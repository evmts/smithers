// Dispatch (src/flows/dispatch.ts): a flow on the Node host's engine over the compose Postgres (`pnpm db:up`), and
// every dispatch's records, read back without the flow's input. Unhappy paths inject the faulty service: an engine
// that refuses or dies, `Preferences` that can't be written.
import { Persistence } from "@smthrs/effect-tanstack-db"
import { Action, type Flow, Interpreter } from "@smthrs/flow"
import { BrowserEngine } from "@smthrs/platform-browser"
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, Logger, Metric, Option, Schema, Scope, Tracer } from "effect"
import { afterEach, describe, expect, test } from "vitest"
import { Pause } from "../../worker/flows/Pause.ts"
import { build } from "../../worker/test/flowHost.ts"
import { Preferences, PreferencesUnavailable, registration as themeRegistration, SetTheme } from "../features/theme/flows"
import { tabPreferences, ThemeStore } from "../features/theme/store"
import { clientFlows } from "./declarations"
import { ClientEngine, dispatches, DispatchFailed, FlowDispatch, makeDispatch } from "./dispatch"
import { registry } from "./registry"
import { TabRequests } from "./requests"

/** What an exit failed with, stack traces aside. */
const failure = (exit: Exit.Exit<unknown, unknown>) => (Exit.isFailure(exit) ? Cause.squash(exit.cause) : exit)

/** The app's theme flow and `probe/Pause`, whose payload carries free text, in one registry. */
const entries = {
  "app/theme/set": registry["app/theme/set"],
  "probe/Pause": { flow: Pause },
} as const

const scopes: Array<Scope.Closeable> = []
afterEach(async () => {
  for (const scope of scopes.splice(0)) await Effect.runPromise(Scope.close(scope, Exit.void))
})

type Recorded = {
  readonly logs: Array<ReturnType<typeof Logger.formatStructured.log>>
  readonly spans: Array<Tracer.NativeSpan>
  readonly registry: Metric.MetricRegistry
}

/**
 * Dispatch over `entries`, with `engine` as this device's engine (the Node host's, running the declarations in
 * `declared`, unless set); every record kept.
 */
const open = async (
  options: {
    readonly engine?: Layer.Layer<ClientEngine>
    readonly declared?: ReadonlyArray<Flow.Any>
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
  const services = Layer.mergeAll(engine, TabRequests.layer())
  const context = await Effect.runPromise(Scope.provide(scope)(Layer.build(services)))
  const dispatch = await Effect.runPromise(Effect.provide(makeDispatch(entries), context))
  const requests = Context.get(context, TabRequests)
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
  return { dispatch, observed, recorded, count, painted, requests }
}

describe("a client flow", () => {
  test("runs on this device's engine and answers its value, recorded by flow, door and outcome", async () => {
    const d = await open()

    const exit = await d.observed(
      d.dispatch("app/theme/set", { mode: "dark" }, { door: "button", executionId: "theme-1" }),
    )

    expect(exit).toEqual(Exit.succeed({ _tag: "Done", value: { mode: "dark" } }))
    expect(d.painted).toEqual(["dark"])
    expect(d.count({ flow: "app/theme/set", door: "button", outcome: "done" })).toBe(1)
    // The tab remembers the execution as its own, with its door: a step that acts on the tab that asked finds it.
    expect(await Effect.runPromise(d.requests.doorOf("theme-1"))).toEqual(Option.some("button"))
    const line = d.recorded.logs.find((log) => log.message === "flow.dispatch")
    expect(line).toMatchObject({
      level: "INFO",
      annotations: {
        flow: "app/theme/set",
        door: "button",
        outcome: "done",
        executionId: "theme-1",
      },
    })
    const span = d.recorded.spans.find((candidate) => candidate.name === "flow.dispatch")!
    expect(Object.fromEntries(span.attributes)).toMatchObject({
      "smithers.flow.name": "app/theme/set",
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
      Layer.succeed(ClientEngine, ClientEngine.of({ start: () => Effect.void, result: () => Effect.succeed(exit) }))
    const died = await open({ engine: answering(Exit.die(new Error("bug"))) })
    const interrupted = await open({ engine: answering(Exit.interrupt()) })
    const refused = await open({
      engine: Layer.succeed(
        ClientEngine,
        ClientEngine.of({
          start: (flow) => Effect.fail(new DispatchFailed({ flow: flow._tag, reason: "refused" })),
          result: () => Effect.never,
        }),
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

  test("a run the engine's interpreter refused fails with its refusal's code, which the log line carries", async () => {
    const refusal = new Interpreter.InterpreterError({
      code: "plan_changed",
      flow: "app/theme/set",
      node: "app/theme/write",
      message: "The rebuilt plan differs from the recorded plan",
    })
    const d = await open({
      engine: Layer.succeed(
        ClientEngine,
        ClientEngine.of({ start: () => Effect.void, result: () => Effect.succeed(Exit.die(refusal)) }),
      ),
    })

    const exit = await d.observed(d.dispatch("app/theme/set", { mode: "dark" }, { door: "composer" }))

    expect(failure(exit)).toEqual(
      new DispatchFailed({ flow: "app/theme/set", reason: "defect", refusal: "plan_changed" }),
    )
    expect(d.recorded.logs.find((log) => log.message === "flow.dispatch")).toMatchObject({
      level: "ERROR",
      annotations: { outcome: "error", reason: "defect", refusal: "plan_changed" },
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
        const flow = registry["app/theme/set"].flow
        const run = { executionId: "e", payload: { mode: "dark" } }
        return yield* Effect.exit(Effect.andThen(client.start(flow, run), client.result(flow, run)))
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

  test("a tab with no engine is unavailable, at the start or while waiting for the end", async () => {
    const gone = new BrowserEngine.EngineUnavailable({ reason: "worker-failed", error: "ReferenceError" })
    const atStart = await over({ start: () => Effect.fail(gone), result: () => Effect.never })
    const atResult = await over({ start: () => Effect.void, result: () => Effect.fail(gone) })

    expect(failure(atStart)).toEqual(new DispatchFailed({ flow: "app/theme/set", reason: "unavailable" }))
    expect(failure(atResult)).toEqual(new DispatchFailed({ flow: "app/theme/set", reason: "unavailable" }))
  })
})

describe("admitted", () => {
  const engineWith = (engine: ClientEngine["Service"]) => open({ engine: Layer.succeed(ClientEngine, engine) })
  const waiting = () => Effect.runSync(Deferred.make<void, DispatchFailed>())

  test("completes once the engine recorded the run, while the run goes on", async () => {
    const ended = Effect.runSync(Deferred.make<Exit.Exit<unknown, unknown>>())
    const d = await engineWith({ start: () => Effect.void, result: () => Deferred.await(ended) })
    const admitted = waiting()

    const dispatching = Effect.runFork(d.dispatch("app/theme/set", { mode: "dark" }, { door: "composer", admitted }))
    await Effect.runPromise(Deferred.await(admitted))

    expect(dispatching.pollUnsafe()).toBeUndefined()
    Effect.runSync(Deferred.succeed(ended, Exit.succeed({ mode: "dark" })))
    expect(await Effect.runPromise(Fiber.join(dispatching))).toEqual({ _tag: "Done", value: { mode: "dark" } })
  })

  test("a run on the Node host's engine is admitted, then answered", async () => {
    const d = await open()
    const admitted = waiting()

    const exit = await d.observed(d.dispatch("app/theme/set", { mode: "dark" }, { door: "composer", admitted }))

    expect(exit).toEqual(Exit.succeed({ _tag: "Done", value: { mode: "dark" } }))
    expect(Effect.runSync(Deferred.isDone(admitted))).toBe(true)
    expect(d.painted).toEqual(["dark"])
  })

  test("fails with the dispatch's failure when the start is refused or dies", async () => {
    const refused = await engineWith({
      start: (flow) => Effect.fail(new DispatchFailed({ flow: flow._tag, reason: "unavailable" })),
      result: () => Effect.never,
    })
    const died = await engineWith({ start: () => Effect.die(new Error("bug")), result: () => Effect.never })
    const admittedAfter = async (d: Awaited<ReturnType<typeof open>>) => {
      const admitted = waiting()
      await d.observed(d.dispatch("app/theme/set", { mode: "dark" }, { door: "composer", admitted }))
      return Effect.runPromise(Effect.flip(Deferred.await(admitted)))
    }

    expect(await admittedAfter(refused)).toEqual(new DispatchFailed({ flow: "app/theme/set", reason: "unavailable" }))
    expect(await admittedAfter(died)).toEqual(new DispatchFailed({ flow: "app/theme/set", reason: "defect" }))
  })

  test("fails interrupted when the dispatch is interrupted before the engine recorded the run", async () => {
    const d = await engineWith({ start: () => Effect.never, result: () => Effect.never })
    const admitted = waiting()

    const dispatching = Effect.runFork(d.dispatch("app/theme/set", { mode: "dark" }, { door: "composer", admitted }))
    await Effect.runPromise(Fiber.interrupt(dispatching))

    expect(await Effect.runPromise(Effect.flip(Deferred.await(admitted)))).toEqual(
      new DispatchFailed({ flow: "app/theme/set", reason: "interrupted" }),
    )
  })
})

describe("the records", () => {
  test("never carry the flow's payload", async () => {
    const d = await open({
      engine: Layer.succeed(
        ClientEngine,
        ClientEngine.of({ start: () => Effect.void, result: () => Effect.succeed(Exit.void) }),
      ),
    })
    const sentinel = `sentinel-${crypto.randomUUID()}`

    const exit = await d.observed(d.dispatch("probe/Pause", { label: sentinel, pauseMs: 5 }, { door: "slash" }))

    expect(exit).toEqual(Exit.succeed({ _tag: "Done", value: undefined }))
    expect(d.count({ flow: "probe/Pause", door: "slash", outcome: "done" })).toBe(1)
    expect(JSON.stringify(d.recorded.logs)).not.toContain(sentinel)
    expect(JSON.stringify(d.recorded.spans.map((span) => [...span.attributes]))).not.toContain(sentinel)
  })
})

describe("FlowDispatch", () => {
  test("binds the app's registry over this device's engine, minting an execution id per dispatch", async () => {
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
          Effect.provide(Layer.succeedContext(context)),
          Effect.exit,
        ),
    )

    expect(exit).toEqual(Exit.succeed({ _tag: "Done", value: { mode: "light" } }))
    expect(painted).toEqual(["light"])
  })
})
