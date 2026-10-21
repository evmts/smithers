// The runs store's reads (src/features/runs/store.ts): what it keeps of the engine's answers. The engine's answers are a
// test implementation of the tab's `BrowserEngine` (test.faults-by-injection): a journal longer than a page, a refusal
// and an engine that can't be reached would take a real engine minutes to produce. The real engine's answers are proved
// in src/features/flows-ui/tab.test.ts.
import { BrowserEngine } from "@smthrs/platform-browser"
import { Deferred, Effect, Layer, ManagedRuntime, Option, PubSub, Stream } from "effect"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { Inspection } from "./schema"
import { VIEW } from "./schema"
import { RunsStore } from "./store"

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

/** What the engine answers: set by each test. */
interface Answers {
  inspect: (runId: string, options?: { readonly afterSeq?: number }) => Effect.Effect<Inspection, BrowserEngine.RequestRefused | BrowserEngine.EngineUnavailable>
  list: () => Effect.Effect<{ runs: ReadonlyArray<ReturnType<typeof summary>>; cursor: null }, BrowserEngine.RequestRefused>
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
  const runtime = ManagedRuntime.make(RunsStore.layer.pipe(Layer.provide(engine)))
  runtimes.push(runtime as never)
  const store = runtime.runSync(Effect.service(RunsStore))
  const page = (runId: string) => Option.getOrUndefined(runtime.runSync(store.pages.get(runId)))
  return {
    store,
    page,
    run: <A, E>(effect: Effect.Effect<A, E>) => runtime.runPromise(effect),
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

describe("readList and following the engine", () => {
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
