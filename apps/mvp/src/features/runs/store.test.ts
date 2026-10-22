// The runs store's reads (src/features/runs/store.ts): what it keeps of the engine's answers. The engine's answers are a
// test implementation of the tab's `BrowserEngine` (test.faults-by-injection): a journal longer than a page, a refusal
// and an engine that can't be reached would take a real engine minutes to produce. The real engine's answers are proved
// in src/features/flows-ui/tab.test.ts. A run on Cloudflare's answers are a test `RemoteRunsClient` here, for each
// refusal ChatApi can answer; ChatApi's real ones, and following a run live, are proved in remote.test.ts.
import { Persistence } from "@smthrs/effect-tanstack-db"
import { BrowserEngine } from "@smthrs/platform-browser"
import { Deferred, Effect, Layer, ManagedRuntime, Metric, Option, PubSub, Stream } from "effect"
import { afterEach, describe, expect, test, vi } from "vitest"
import { RemoteReadFailed, RemoteRunsClient } from "./api"
import type { Inspection } from "./schema"
import { VIEW } from "./schema"
import { openList } from "./actions"
import { Runs } from "./runs"
import { followChanges, RunsStore, stateOf } from "./store"

const value = (text: string) => ({ text, bytes: text.length, clipped: false })

const event = (seq: number) => ({ seq, eventType: "flows.engine.node-scheduled", emittedAtMs: seq, payload: value("{}") })

const summary = (runId: string) => ({
  runId,
  flowName: "flow/run",
  status: "running" as const,
  createdAtMs: 1,
  startedAtMs: 2,
  finishedAtMs: null,
  parentRunId: null,
  cancelRequestedAtMs: 5,
  waiting: null,
  lastSeq: 3,
})

const inspection = (runId: string, events: ReadonlyArray<ReturnType<typeof event>>, hasMore: boolean): Inspection => ({
  run: { ...summary(runId), input: value("{}"), result: null },
  steps: [],
  children: [],
  journal: { events, afterSeq: -1, nextSeq: events.at(-1)?.seq ?? -1, hasMore },
})

/** What the engine answers, and ChatApi for a run on Cloudflare: set by each test. */
interface Answers {
  inspect: (runId: string, options?: { readonly afterSeq?: number }) => Effect.Effect<Inspection, BrowserEngine.RequestRefused | BrowserEngine.EngineUnavailable>
  list: () => Effect.Effect<{ runs: ReadonlyArray<ReturnType<typeof summary>>; cursor: null }, BrowserEngine.RequestRefused>
  remote?: (runId: string, options?: { readonly afterSeq?: number }) => Effect.Effect<Inspection, RemoteReadFailed>
}

const runtimes: Array<ManagedRuntime.ManagedRuntime<unknown, unknown>> = []
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.dispose()
})

const open = (answers: Answers) => {
  const events = Effect.runSync(PubSub.unbounded<BrowserEngine.RunEvent>())
  const engine = Layer.succeed(BrowserEngine.BrowserEngine, BrowserEngine.BrowserEngine.of({
    start: () => Effect.die("unused"),
    result: () => Effect.die("unused"),
    cancel: () => Effect.die("unused"),
    signal: () => Effect.die("unused"),
    inspect: (runId, options) => answers.inspect(runId, options),
    list: () => answers.list(),
    events: Stream.fromPubSub(events),
    unavailable: Effect.never,
  }))
  const remote = Layer.succeed(RemoteRunsClient, RemoteRunsClient.of({
    inspect: (runId, options) => answers.remote === undefined ? Effect.die("unused") : answers.remote(runId, options),
    // The store never steers or stops: the outbox's mutation does (writes.ts), and run/cancel's step (steps.ts).
    steer: () => Effect.die("unused"),
    stop: () => Effect.die("unused"),
  }))
  const runtime = ManagedRuntime.make(
    RunsStore.layer({ origin: "http://chat.test" }).pipe(Layer.provide(Layer.mergeAll(engine, remote, Persistence.memory))),
  )
  runtimes.push(runtime as never)
  const store = runtime.runSync(Effect.service(RunsStore))
  const page = (runId: string) => Option.getOrUndefined(runtime.runSync(store.pages.get(runId)))
  return {
    store,
    page,
    run: <A, E>(effect: Effect.Effect<A, E, RunsStore>) => runtime.runPromise(effect),
    publish: (executionId: string) => Effect.runSync(PubSub.publish(events, { executionId, eventType: "x" })),
  }
}

const refused = (error: string) => Effect.fail(new BrowserEngine.RequestRefused({ request: "Inspect", error }))

describe("readRun and readMore", () => {
  test("loads the complete journal snapshot, retains later pages and reads More from the last event", async () => {
    const afters: Array<number | undefined> = []
    let first = [event(0), event(1)]
    let more = true
    const t = open({
      inspect: (runId, options) => {
        afters.push(options?.afterSeq)
        return Effect.succeed(
          options?.afterSeq === undefined ? inspection(runId, first, more) : inspection(runId, [event(options.afterSeq + 1)], false),
        )
      },
      list: () => Effect.succeed({ runs: [], cursor: null }),
    })
    await t.run(t.store.readRun("a"))
    expect(t.page("a")).toMatchObject({ state: "read", more: [event(2)], hasMore: false })
    await t.run(t.store.readMore("a"))
    expect(t.page("a")).toMatchObject({ more: [event(2), event(3)], hasMore: false })
    expect(afters).toEqual([undefined, 1, 2])
    // Read again while its first page still has more: what More read stays.
    await t.run(t.store.readRun("a"))
    expect(t.page("a")?.more).toEqual([event(2), event(3)])
    // Once the first page holds it all, More's pages go.
    more = false
    await t.run(t.store.readRun("a"))
    expect(t.page("a")).toMatchObject({ more: [], hasMore: false })
    // A run with no events yet reads More from the start.
    first = []
    await t.run(t.store.readRun("b"))
    await t.run(t.store.readMore("b"))
    expect(afters.at(-1)).toBe(-1)
    // A list row follows each read, with the stop it was asked for.
    expect((await t.run(t.store.runs.toArray)).map((row) => [row.id, row.cancelRequested])).toEqual([["a", true], ["b", true]])
  })

  test("a run the engine doesn't hold is not found; an engine that can't answer, unavailable; More of either reads nothing", async () => {
    const t = open({
      inspect: (runId) =>
        runId === "gone"
          ? refused("@smthrs/engine-store/RunNotFound")
          : runId === "refused"
          ? refused("SchemaError")
          : Effect.fail(new BrowserEngine.EngineUnavailable({ reason: "worker-failed", error: "x" })),
      list: () => refused("x"),
    })
    await t.run(t.store.readRun("gone"))
    await t.run(t.store.readRun("refused"))
    await t.run(t.store.readRun("down"))
    expect([t.page("gone")?.state, t.page("refused")?.state, t.page("down")?.state]).toEqual([
      "not_found",
      "unavailable",
      "unavailable",
    ])
    await t.run(t.store.readMore("gone"))
    await t.run(t.store.readMore("never-read"))
    expect(t.page("gone")).toMatchObject({ inspection: null, more: [] })
    // A list the engine can't give leaves the list as it was.
    await t.run(t.store.readList)
    expect(await t.run(t.store.runs.toArray)).toEqual([])
  })

  test("More that the engine refuses keeps the page as it was", async () => {
    let refuse = false
    const t = open({
      inspect: (runId) => (refuse ? refused("x") : Effect.succeed(inspection(runId, [event(0)], true))),
      list: () => Effect.succeed({ runs: [], cursor: null }),
    })
    await t.run(t.store.readRun("a"))
    refuse = true
    await t.run(t.store.readMore("a"))
    expect(t.page("a")).toMatchObject({ more: [], hasMore: true })
  })
})

describe("a run on Cloudflare", () => {
  const RUN = "todo:6f1c2a7e-3b4d-4c5e-8f90-1a2b3c4d5e6f"
  const runId = (n: number) => `todo:6f1c2a7e-3b4d-4c5e-8f90-1a2b3c4d5e${n.toString(16).padStart(2, "0")}`

  test("reads through ChatApi, page after page, never this device's engine, and never joins this device's list", async () => {
    const engine: Array<string> = []
    const remote: Array<[string, number | undefined]> = []
    const t = open({
      inspect: (id) => {
        engine.push(id)
        return Effect.succeed(inspection(id, [], false))
      },
      list: () => Effect.succeed({ runs: [], cursor: null }),
      remote: (id, options) => {
        remote.push([id, options?.afterSeq])
        return Effect.succeed(
          options?.afterSeq === undefined
            ? {
              ...inspection(id, [event(0), event(1)], true),
              // A run it started is read from where the run is too.
              children: [{ ...summary("child"), parentRunId: id, input: value("{}"), result: null }],
            }
            : inspection(id, [event(options.afterSeq + 1)], false),
        )
      },
    })
    await t.run(t.store.readRun(RUN))
    expect(t.page(RUN)).toMatchObject({ state: "read", more: [event(2)], hasMore: false })
    expect((t.page(RUN)!.descendants as ReadonlyArray<Inspection>).map((read) => read.run.runId)).toEqual(["child"])
    await t.run(t.store.readMore(RUN))
    expect(remote).toEqual([[RUN, undefined], [RUN, 1], ["child", undefined], ["child", 1], [RUN, 2]])
    expect(engine).toEqual([])
    expect(await t.run(t.store.runs.toArray)).toEqual([])
    // Following a run of this device's engine needs no shape: it does nothing.
    await t.run(t.store.follow("local-run"))
  })

  test("ChatApi's refusals: not started, not found for one this person may not read, else unavailable", async () => {
    const answers: ReadonlyArray<RemoteReadFailed> = [
      new RemoteReadFailed({ status: 404, code: "not_started" }),
      new RemoteReadFailed({ status: 404, code: "not_found" }),
      new RemoteReadFailed({ status: 403, code: "forbidden" }),
      new RemoteReadFailed({ status: 401, code: "authentication" }),
      new RemoteReadFailed({ status: 503, code: "unavailable" }),
      new RemoteReadFailed({ status: 400 }),
      new RemoteReadFailed({}),
    ]
    const t = open({
      inspect: () => Effect.die("unused"),
      list: () => Effect.succeed({ runs: [], cursor: null }),
      remote: (id) => Effect.fail(answers[Number.parseInt(id.slice(-2), 16)]!),
    })
    for (let n = 0; n < answers.length; n++) await t.run(t.store.readRun(runId(n)))
    expect(answers.map((_, n) => t.page(runId(n))?.state)).toEqual([
      "not_started",
      "not_found",
      "not_found",
      "not_found",
      "unavailable",
      "unavailable",
      "unavailable",
    ])
  })

  test("a read that can't reach a run already shown keeps its page; an answer about the run replaces it", async () => {
    const answers: Array<Effect.Effect<Inspection, RemoteReadFailed>> = [
      Effect.succeed(inspection(RUN, [event(0)], false)),
      Effect.fail(new RemoteReadFailed({})),
      Effect.fail(new RemoteReadFailed({ status: 503, code: "unavailable" })),
      Effect.fail(new RemoteReadFailed({ status: 404, code: "not_found" })),
    ]
    let asked = 0
    const t = open({
      inspect: () => Effect.die("unused"),
      list: () => Effect.succeed({ runs: [], cursor: null }),
      remote: () => answers[asked++]!,
    })
    await t.run(t.store.readRun(RUN))
    const shown = t.page(RUN)
    expect(shown?.state).toBe("read")
    // No network, then ChatApi unavailable: what the page last read stays.
    await t.run(t.store.readRun(RUN))
    await t.run(t.store.readRun(RUN))
    expect(t.page(RUN)).toEqual(shown)
    // The run itself is gone: the page says so.
    await t.run(t.store.readRun(RUN))
    expect(t.page(RUN)).toMatchObject({ state: "not_found", inspection: null })
  })

  test("a page's state from a failure: the engine's not-found, ChatApi's, and anything else", () => {
    expect(stateOf(new BrowserEngine.RequestRefused({ request: "Inspect", error: "@smthrs/engine-store/RunNotFound" })))
      .toBe("not_found")
    expect(stateOf(new BrowserEngine.RequestRefused({ request: "Inspect", error: "SchemaError" }))).toBe("unavailable")
    expect(stateOf(new RemoteReadFailed({ status: 404, code: "not_started" }))).toBe("not_started")
    expect(stateOf(new Error("x"))).toBe("unavailable")
  })
})

describe("readList and following the engine", () => {
  test("a slow engine is warmed without opening the list, and the click reuses it until an engine event", async () => {
    const started = Effect.runSync(Deferred.make<void>())
    const pending = Effect.runSync(Deferred.make<{ runs: ReadonlyArray<ReturnType<typeof summary>>; cursor: null }>())
    let lists = 0
    const t = open({
      inspect: () => Effect.die("unused"),
      // An injected slow engine: the real engine's happy path is in flows-ui/tab.test.ts.
      list: () => Effect.gen(function* () {
        lists++
        yield* Deferred.succeed(started, undefined)
        return yield* Deferred.await(pending)
      }),
    })
    const warm = t.run(t.store.warmList)
    await t.run(Deferred.await(started))
    expect((await t.run(t.store.view.get(VIEW))).pipe(Option.getOrThrow).listOpen).toBe(false)
    const again = t.run(t.store.warmList)
    await t.run(Deferred.succeed(pending, { runs: [summary("a")], cursor: null }))
    await Promise.all([warm, again])
    await t.run(openList)
    expect(lists).toBe(1)
    expect((await t.run(t.store.runs.toArray)).map((row) => row.id)).toEqual(["a"])
    expect((await t.run(t.store.view.get(VIEW))).pipe(Option.getOrThrow).listOpen).toBe(true)
    await t.run(t.store.view.update(VIEW, (view) => { view.listOpen = false }))
    t.publish("a")
    await vi.waitFor(async () => expect((await t.run(t.store.view.get(VIEW))).pipe(Option.getOrThrow).listReady).toBe(false))
    await t.run(t.store.warmList)
    expect(lists).toBe(2)
  })

  test("an unavailable engine never leaves a warmed list behind", async () => {
    let lists = 0
    const t = open({ inspect: () => Effect.die("unused"), list: () => { lists++; return refused("unavailable") } })
    await t.run(t.store.warmList)
    await t.run(t.store.warmList)
    expect(lists).toBe(2)
  })

  test("an engine event during a slow warm prevents the click from reusing that old snapshot", async () => {
    const started = Effect.runSync(Deferred.make<void>())
    const pending = Effect.runSync(Deferred.make<{ runs: ReadonlyArray<ReturnType<typeof summary>>; cursor: null }>())
    let lists = 0
    const t = open({
      inspect: () => Effect.die("unused"),
      list: () => ++lists === 1
        ? Effect.andThen(Deferred.succeed(started, undefined), Deferred.await(pending))
        : Effect.succeed({ runs: [summary("new")], cursor: null }),
    })
    const warm = t.run(t.store.warmList)
    await t.run(Deferred.await(started))
    t.publish("new")
    await vi.waitFor(async () => expect((await t.run(t.store.view.get(VIEW))).pipe(Option.getOrThrow).listRevision).toBe(1))
    await t.run(Deferred.succeed(pending, { runs: [summary("old")], cursor: null }))
    await warm
    await t.run(openList)
    expect(lists).toBe(2)
    expect((await t.run(t.store.runs.toArray)).map((row) => row.id)).toEqual(["new"])
  })

  test("the list keeps the engine's runs and drops the ones it no longer lists; an event reads the open run and list", async () => {
    let listed = ["a", "b"]
    const reads: Array<string> = []
    const t = open({
      inspect: (runId) => {
        reads.push(runId)
        return Effect.succeed(inspection(runId, [], false))
      },
      list: () => Effect.succeed({ runs: listed.map(summary), cursor: null }),
    })
    await t.run(t.store.readList)
    expect((await t.run(t.store.runs.toArray)).map((row) => row.id).sort()).toEqual(["a", "b"])
    listed = ["b"]
    await t.run(t.store.readList)
    expect((await t.run(t.store.runs.toArray)).map((row) => row.id)).toEqual(["b"])

    // The list showing and no run open: an event reads the list alone.
    await t.run(Effect.orDie(t.store.view.update(VIEW, (view) => void Object.assign(view, { listOpen: true }))))
    listed = ["b", "c"]
    t.publish("b")
    await vi.waitFor(async () => expect((await t.run(t.store.runs.toArray)).map((row) => row.id).sort()).toEqual(["b", "c"]))
    expect(reads).toEqual([])
    // A run open and the list hidden: an event reads the run alone.
    await t.run(Effect.orDie(t.store.view.update(VIEW, (view) => void Object.assign(view, { runId: "b", listOpen: false }))))
    listed = ["d"]
    t.publish("b")
    await vi.waitFor(() => expect(reads).toEqual(["b"]))
    expect((await t.run(t.store.runs.toArray)).map((row) => row.id).sort()).toEqual(["b", "c"])
  })
})

test("replay freezes the forest when a child appears; returning live loads its own journal", async () => {
  let childAppeared = false
  const reads: string[] = []
  const t = open({
    inspect: (runId) => {
      reads.push(runId)
      const read = inspection(runId, [event(0), event(1)], false)
      return Effect.succeed(runId === "r" && childAppeared ? { ...read, children: [{ ...summary("child"), parentRunId: "r", input: value("{}"), result: null }] } : read)
    },
    list: () => Effect.succeed({ runs: [], cursor: null }),
  })
  await t.run(t.store.readRun("r"))
  const snapshot = t.page("r")
  await t.run(t.store.view.update(VIEW, (draft) => { draft.runId = "r"; draft.at = 1 }))
  childAppeared = true
  await t.run(t.store.readRun("r"))
  await t.run(t.store.readMore("r"))
  expect(reads).toEqual(["r"])
  expect(t.page("r")).toEqual(snapshot)
  await t.run(t.store.view.update(VIEW, (draft) => { draft.at = null }))
  await t.run(t.store.readRun("r"))
  expect(reads).toEqual(["r", "r", "child"])
  expect((t.page("r")!.descendants as Inspection[])[0]!.run.runId).toBe("child")
})

test("More already awaiting the engine cannot overwrite a replay snapshot", async () => {
  const started = Effect.runSync(Deferred.make<void>())
  const pending = Effect.runSync(Deferred.make<Inspection>())
  const t = open({
    inspect: (id, options) => options?.afterSeq === undefined ? Effect.succeed(inspection(id, [event(0)], false)) : Effect.andThen(Deferred.succeed(started, undefined), Deferred.await(pending)),
    list: () => Effect.succeed({ runs: [], cursor: null }),
  })
  await t.run(t.store.readRun("r"))
  await t.run(t.store.view.update(VIEW, (draft) => { draft.runId = "r"; draft.at = null }))
  const snapshot = t.page("r")
  const reading = t.run(t.store.readMore("r"))
  await t.run(Deferred.await(started))
  await t.run(t.store.view.update(VIEW, (draft) => { draft.at = 0 }))
  await t.run(Deferred.succeed(pending, inspection("r", [event(1)], false)))
  await reading
  expect(t.page("r")).toEqual(snapshot)
})

test("continuous engine events refresh the page before the stream goes quiet", async () => {
  let reads = 0
  const t = open({ inspect: (id) => { reads++; return Effect.succeed(inspection(id, [], false)) }, list: () => Effect.succeed({ runs: [], cursor: null }) })
  await t.run(t.store.view.update(VIEW, (draft) => { draft.runId = "r" }))
  // An event every 50 ms, which never goes quiet: a read comes while they continue, where a trailing debounce makes none.
  await vi.waitFor(() => {
    t.publish("r")
    expect(reads).toBeGreaterThan(0)
  }, { timeout: 5_000, interval: 50 })
})

test("a repeated or failed journal page terminates the snapshot read and preserves its events", async () => {
  for (const failure of [false, true]) {
    const reads: Array<number | undefined> = []
    const t = open({
      inspect: (id, options) => {
        reads.push(options?.afterSeq)
        if (options?.afterSeq !== undefined && failure) return refused("unavailable")
        return Effect.succeed(inspection(id, [event(0)], true))
      },
      list: () => Effect.succeed({ runs: [], cursor: null }),
    })
    await t.run(t.store.readRun("r"))
    expect(reads).toEqual([undefined, 0])
    expect(t.page("r")).toMatchObject({ state: "read", more: [], hasMore: true })
  }
})

test("descendants keep separate paginated journals, ignore cycles and tolerate an unreadable child", async () => {
  const reads: string[] = []
  let childFails = false
  let duplicate = false
  const child = (id: string) => ({ ...summary(id), parentRunId: "r", input: value("{}"), result: null })
  const t = open({
    inspect: (id, options) => {
      reads.push(`${id}:${options?.afterSeq ?? "first"}`)
      if (id === "gone" || (id === "child" && options?.afterSeq !== undefined && childFails)) return refused("unavailable")
      if (id === "r") return Effect.succeed({ ...inspection(id, [], false), children: [child("child"), child("gone"), child("child")] })
      const events = options?.afterSeq === undefined || duplicate ? [event(0)] : [event(1), event(2), event(3)]
      return Effect.succeed({ ...inspection(id, events, options?.afterSeq === undefined || duplicate), children: [child("r")] })
    },
    list: () => Effect.succeed({ runs: [], cursor: null }),
  })
  await t.run(t.store.readRun("r"))
  expect(reads).toEqual(["r:first", "child:first", "child:0", "gone:first"])
  expect((t.page("r")!.descendants as Inspection[]).map((read) => read.journal.events.map((event) => event.seq))).toEqual([[0, 1, 2, 3]])
  // A parent's event reuses the child's complete snapshot.
  await t.run(t.store.view.update(VIEW, (draft) => { draft.runId = "r" }))
  reads.length = 0
  t.publish("r")
  await vi.waitFor(() => expect(reads).toContain("r:first"))
  expect(reads).not.toContain("child:first")
  // A changed child keeps the previously read later pages.
  await t.run(t.store.readRun("r"))
  expect((t.page("r")!.descendants as Inspection[])[0]!.journal.events).toEqual([0, 1, 2, 3].map(event))
  // Fresh snapshots stop on refused or repeated child pages.
  for (const mode of ["failure", "duplicate"]) {
    childFails = mode === "failure"
    duplicate = mode === "duplicate"
    await t.run(t.store.pages.delete("r"))
    await t.run(t.store.readRun("r"))
    expect((t.page("r")!.descendants as Inspection[])[0]!.journal.events).toEqual([event(0)])
  }
})

test("a run read awaiting the engine cannot overwrite a replay snapshot", async () => {
  const started = Effect.runSync(Deferred.make<void>())
  const pending = Effect.runSync(Deferred.make<Inspection>())
  let held = false
  const t = open({
    inspect: (id) => held ? Effect.andThen(Deferred.succeed(started, undefined), Deferred.await(pending)) : Effect.succeed(inspection(id, [event(0)], false)),
    list: () => Effect.succeed({ runs: [], cursor: null }),
  })
  await t.run(t.store.readRun("r"))
  held = true
  const snapshot = t.page("r")
  const reading = t.run(t.store.readRun("r"))
  await t.run(Deferred.await(started))
  await t.run(t.store.view.update(VIEW, (draft) => { draft.runId = "r"; draft.at = 0 }))
  await t.run(Deferred.succeed(pending, inspection("r", [event(1)], false)))
  await reading
  expect(t.page("r")).toEqual(snapshot)
})

test("replay selected while a child is loading keeps the previously shown forest", async () => {
  const started = Effect.runSync(Deferred.make<void>())
  const pending = Effect.runSync(Deferred.make<Inspection>())
  let hasChild = false
  const t = open({
    inspect: (id) => id === "child"
      ? Effect.andThen(Deferred.succeed(started, undefined), Deferred.await(pending))
      : Effect.succeed({ ...inspection(id, [], false), children: hasChild ? [{ ...summary("child"), parentRunId: id, input: value("{}"), result: null }] : [] }),
    list: () => Effect.succeed({ runs: [], cursor: null }),
  })
  await t.run(t.store.readRun("r"))
  const snapshot = t.page("r")
  hasChild = true
  const reading = t.run(t.store.readRun("r"))
  await t.run(Deferred.await(started))
  await t.run(t.store.view.update(VIEW, (draft) => { draft.runId = "r"; draft.at = 0 }))
  await t.run(Deferred.succeed(pending, inspection("child", [], false)))
  await reading
  expect(t.page("r")).toEqual(snapshot)
})


test("More preserves a concurrent live refresh and merges events without duplicates", async () => {
  const started = Effect.runSync(Deferred.make<void>())
  const pending = Effect.runSync(Deferred.make<Inspection>())
  let loadingMore = false
  let fresh = false
  const t = open({
    inspect: (id, options) => loadingMore && options?.afterSeq !== undefined
      ? Effect.andThen(Deferred.succeed(started, undefined), Deferred.await(pending))
      : Effect.succeed({ ...inspection(id, fresh ? [event(0), event(1), event(2)] : [event(0)], false), run: { ...inspection(id, [], false).run, lastSeq: fresh ? 2 : 0 } }),
    list: () => Effect.succeed({ runs: [], cursor: null }),
  })
  await t.run(t.store.view.update(VIEW, (draft) => { draft.runId = "r" }))
  await t.run(t.store.readRun("r"))
  loadingMore = true
  const reading = t.run(t.store.readMore("r"))
  await t.run(Deferred.await(started))
  fresh = true
  t.publish("r")
  await vi.waitFor(() => expect((t.page("r")?.inspection as Inspection).run.lastSeq).toBe(2))
  await t.run(Deferred.succeed(pending, inspection("r", [event(1)], true)))
  await reading
  expect((t.page("r")?.inspection as Inspection).run.lastSeq).toBe(2)
  expect(t.page("r")?.more).toEqual([])
  expect(t.page("r")?.hasMore).toBe(false)
})

test.each(["success", "failure"])("an older overlapping read cannot replace a newer read: %s", async (outcome) => {
  const started = Effect.runSync(Deferred.make<void>())
  const pending = Effect.runSync(Deferred.make<Inspection, BrowserEngine.RequestRefused>())
  let first = true
  const t = open({
    inspect: (id) => {
      if (!first) return Effect.succeed(inspection(id, [event(2)], false))
      first = false
      return Effect.andThen(Deferred.succeed(started, undefined), Deferred.await(pending))
    },
    list: () => Effect.succeed({ runs: [], cursor: null }),
  })
  const older = t.run(t.store.readRun("r"))
  await t.run(Deferred.await(started))
  await t.run(t.store.readRun("r"))
  const newest = t.page("r")
  await t.run(outcome === "success" ? Deferred.succeed(pending, inspection("r", [event(0)], false)) : Deferred.fail(pending, new BrowserEngine.RequestRefused({ request: "Inspect", error: "unavailable" })))
  await older
  expect(t.page("r")).toEqual(newest)
})

test("a superseded read awaiting a child cannot replace the newer forest", async () => {
  const started = Effect.runSync(Deferred.make<void>())
  const child = Effect.runSync(Deferred.make<Inspection>())
  let withChild = true
  const t = open({
    inspect: (id) => id === "child" ? Effect.andThen(Deferred.succeed(started, undefined), Deferred.await(child)) : Effect.succeed({ ...inspection(id, [], false), children: withChild ? [{ ...summary("child"), parentRunId: id, input: value("{}"), result: null }] : [] }),
    list: () => Effect.succeed({ runs: [], cursor: null }),
  })
  const old = t.run(t.store.readRun("r"))
  await t.run(Deferred.await(started))
  withChild = false
  await t.run(t.store.readRun("r"))
  await t.run(Deferred.succeed(child, inspection("child", [], false)))
  await old
  expect((t.page("r")?.inspection as Inspection).children).toEqual([])
})

test.each(["deleted", "unreadable"])("More discards a reply after the page becomes %s", async (mode) => {
  const started = Effect.runSync(Deferred.make<void>())
  const pending = Effect.runSync(Deferred.make<Inspection>())
  let more = false
  const t = open({ inspect: (id) => more ? Effect.andThen(Deferred.succeed(started, undefined), Deferred.await(pending)) : Effect.succeed(inspection(id, [], false)), list: () => Effect.succeed({ runs: [], cursor: null }) })
  await t.run(t.store.readRun("r"))
  more = true
  const reading = t.run(t.store.readMore("r"))
  await t.run(Deferred.await(started))
  if (mode === "deleted") await t.run(t.store.pages.delete("r"))
  else await t.run(t.store.pages.update("r", (draft) => { draft.inspection = null; draft.state = "unavailable" }))
  const snapshot = t.page("r")
  await t.run(Deferred.succeed(pending, inspection("r", [event(0)], false)))
  await reading
  expect(t.page("r")).toEqual(snapshot)
})

test("a followed remote run is ignored while another run is open", async () => {
  const { nodeDevice, openTab, openTestApp, TestChatApi } = await import("../../test/chatApi")
  const app = openTestApp({})
  let tab: ReturnType<typeof openTab> | undefined
  try {
    const api = await app.runPromise(Effect.service(TestChatApi))
    tab = openTab(api, { host: nodeDevice() })
    const runs = await tab.runPromise(Effect.service(Runs))
    const runId = await app.runPromise(api.remote.todoRun("Follow once"))
    await runs.actions.openRun(runId)
    await runs.actions.openRun(runId)
    await runs.actions.openRun("todo:00000000-0000-4000-8000-000000000000")
    const inspections = api.spans.filter((span) => span.name === "run.inspect").length
    const hidden = Metric.withAttributes(followChanges, { showing: "false" })
    const before = (await tab.runPromise(Metric.value(hidden))).count
    await app.runPromise(api.remote.start(runId, { label: "hidden", pauseMs: 0 }))
    const device = tab
    await vi.waitFor(async () => expect((await device.runPromise(Metric.value(hidden))).count).toBeGreaterThan(before), { timeout: 30_000 })
    expect(api.spans.filter((span) => span.name === "run.inspect")).toHaveLength(inspections)
  } finally {
    await tab?.dispose()
    await app.dispose()
  }
}, 120_000)
