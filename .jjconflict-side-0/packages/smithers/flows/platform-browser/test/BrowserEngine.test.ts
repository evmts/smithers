/**
 * A tab's view of the engine, against a real leader over Node's own Web
 * Locks and `BroadcastChannel`.
 */
import { describe, expect, it } from "@effect/vitest"
import { Flow } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { BrowserEngine, TabChannel } from "../src/index.ts"
import * as Engines from "./fixtures/Engines.ts"
import { Sleeper, Step, Steps, Waiter } from "./fixtures/Flows.ts"
import * as MemorySqlite from "./fixtures/MemorySqlite.ts"
import * as Telemetry from "./fixtures/Telemetry.ts"

/** A leader over a fresh store, and a tab beside it. */
const setup = (run: Engines.Steps = Engines.steps()) =>
  Effect.gen(function*() {
    const name = Engines.name()
    const database = yield* MemorySqlite.open
    const leader = yield* Engines.leader(name, Engines.engine(name, database, run))
    const engine = yield* Engines.tab(name)
    return { name, database, leader, engine, run }
  })

describe("BrowserEngine", () => {
  it.live("starts a run, returns once it is recorded, and waits for its result", () =>
    Effect.gen(function*() {
      const { engine, run } = yield* setup()
      const events = yield* engine.events.pipe(
        Stream.filter((event) => event.executionId === "steps-1"),
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild
      )
      yield* Effect.yieldNow
      yield* engine.start(Steps, { executionId: "steps-1", payload: { prefix: "a" } })
      expect(yield* engine.result(Steps, "steps-1")).toEqual(Exit.succeed("a:three"))
      expect(run.ran).toEqual(["a:one", "a:two", "a:three"])
      // Starting it again admits nothing new and runs no step again.
      yield* engine.start(Steps, { executionId: "steps-1", payload: { prefix: "a" } })
      expect(yield* engine.result(Steps, "steps-1")).toEqual(Exit.succeed("a:three"))
      expect(run.ran).toEqual(["a:one", "a:two", "a:three"])
      const [event] = yield* Fiber.join(events)
      expect(event).toEqual({ executionId: "steps-1", eventType: expect.any(String) })
    }).pipe(Effect.scoped))

  it.live("runs a flow from its reference: its tag and schemas, without its declaration", () =>
    Effect.gen(function*() {
      const { engine, run } = yield* setup()
      const reference = {
        _tag: Steps._tag,
        payloadSchema: Steps.payloadSchema,
        successSchema: Steps.successSchema,
        errorSchema: Steps.errorSchema
      } satisfies BrowserEngine.FlowReference
      expect("body" in reference).toBe(false)
      yield* engine.start(reference, { executionId: "ref-1", payload: { prefix: "r" } })
      const exit: Exit.Exit<string, never> = yield* engine.result(reference, "ref-1")
      expect(exit).toEqual(Exit.succeed("r:three"))
      expect(run.ran).toEqual(["r:one", "r:two", "r:three"])
    }).pipe(Effect.scoped))

  it.live("returns a failed run's failure", () =>
    Effect.gen(function*() {
      const { engine } = yield* setup(Engines.steps({ die: ["f:two"] }))
      yield* engine.start(Steps, { executionId: "steps-f", payload: { prefix: "f" } })
      const exit = yield* engine.result(Steps, "steps-f")
      expect(Exit.isFailure(exit) && Exit.hasDies(exit)).toBe(true)
    }).pipe(Effect.scoped))

  it.live("cancels a run, which then ends interrupted", () =>
    Effect.gen(function*() {
      const { engine, run } = yield* setup(Engines.steps({ block: ["c:two"] }))
      yield* engine.start(Steps, { executionId: "steps-c", payload: { prefix: "c" } })
      while (!run.ran.includes("c:two")) yield* Effect.sleep("10 millis")
      yield* engine.cancel(Steps, "steps-c")
      const exit = yield* engine.result(Steps, "steps-c")
      expect(Exit.isFailure(exit) && Exit.hasInterrupts(exit)).toBe(true)
    }).pipe(Effect.scoped))

  it.live("signals a WaitFor point, and the run returns what it received", () =>
    Effect.gen(function*() {
      const { engine, run } = yield* setup()
      yield* engine.start(Waiter, { executionId: "wait-1", payload: { prefix: "w" } })
      while (!run.ran.includes("w:asked")) yield* Effect.sleep("10 millis")
      yield* engine.signal(Waiter, "wait-1", "approval", { approved: true })
      expect(yield* engine.result(Waiter, "wait-1")).toEqual(Exit.succeed({ approved: true }))
    }).pipe(Effect.scoped))

  it.live("fails a request the leader refuses with RequestRefused, naming what failed", () =>
    Effect.gen(function*() {
      const { engine } = yield* setup()
      const Stranger = Flow.make("browser-test/Stranger", {
        payload: {},
        success: Schema.String,
        body: Node.capture({}, () => Step.call({ label: "x" }))
      })
      const unknown = yield* engine.start(Stranger, { executionId: "s-1", payload: {} }).pipe(Effect.flip)
      expect(unknown).toEqual(
        new BrowserEngine.RequestRefused({ request: "Start", error: "@smthrs/platform-browser/UnknownFlow" })
      )
      const missing = yield* engine.result(Steps, "never-started").pipe(Effect.flip)
      expect(missing).toMatchObject({ _tag: "@smthrs/platform-browser/RequestRefused", request: "Poll" })
      // A tab whose declaration of a flow differs from the leader's sends a
      // payload the leader cannot decode.
      const Drifted = Flow.make("browser-test/Steps", {
        payload: { prefix: Schema.Number },
        success: Schema.String,
        body: Node.capture({}, () => Step.call({ label: "x" }))
      })
      const drifted = yield* engine.start(Drifted, { executionId: "d-1", payload: { prefix: 1 } }).pipe(Effect.flip)
      expect(drifted).toMatchObject({ request: "Start", error: "SchemaError" })
    }).pipe(Effect.scoped))

  it.live("refuses a payload its own flow cannot encode, before sending anything", () =>
    Effect.gen(function*() {
      const { engine } = yield* setup()
      const invalid = yield* engine.start(Steps, {
        executionId: "bad-1",
        payload: { prefix: 1 } as unknown as { prefix: string }
      }).pipe(Effect.flip)
      expect(invalid._tag).toBe("SchemaError")
    }).pipe(Effect.scoped))

  it.live("holds a request until a leader exists, then sends it again", () =>
    Effect.gen(function*() {
      const name = Engines.name()
      const run = Engines.steps()
      const engine = yield* Engines.tab(name)
      const started = yield* Effect.forkChild(engine.start(Steps, { executionId: "late-1", payload: { prefix: "l" } }))
      yield* Effect.sleep("50 millis")
      expect(started.pollUnsafe()).toBeUndefined()
      yield* Engines.leader(name, Engines.engine(name, yield* MemorySqlite.open, run))
      yield* Fiber.join(started)
      expect(yield* engine.result(Steps, "late-1")).toEqual(Exit.succeed("l:three"))
    }).pipe(Effect.scoped))

  it.live("finishes a run on the next leader after the leader's tab closes", () =>
    Effect.gen(function*() {
      const { database, engine, leader, name, run } = yield* setup(Engines.steps({ block: ["h:two"] }))
      yield* engine.start(Steps, { executionId: "hand-1", payload: { prefix: "h" } })
      while (!run.ran.includes("h:two")) yield* Effect.sleep("10 millis")
      const result = yield* Effect.forkChild(engine.result(Steps, "hand-1"))
      yield* Engines.close(leader)
      const next = Engines.steps()
      yield* Engines.leader(name, Engines.engine(name, database, next))
      expect(yield* Fiber.join(result)).toEqual(Exit.succeed("h:three"))
      // The sealed first step replays; the interrupted second runs again.
      expect(next.ran).toEqual(["h:two", "h:three"])
    }).pipe(Effect.scoped))

  it.live("ignores what is not a reply to one of its own open requests", () =>
    Effect.gen(function*() {
      const { engine, name } = yield* setup()
      // Once this run settles the leader is listening too.
      yield* engine.start(Sleeper, { executionId: "sleep-p", payload: { prefix: "p", pauseMs: 0 } })
      yield* engine.result(Sleeper, "sleep-p")
      const stranger = yield* Effect.flatMap(TabChannel.TabChannel, (channels) => channels.open(name)).pipe(
        Effect.provide(TabChannel.layer)
      )
      yield* stranger.post("not a message")
      yield* stranger.post({ _tag: "Replied", client: "someone-else", id: 0, result: null })
      yield* stranger.post({ _tag: "Refused", client: "someone-else", id: 0, error: "x" })
      yield* stranger.post({ _tag: "Poll", client: "someone-else", id: 0, flow: Steps._tag, executionId: "x" })
      yield* engine.start(Sleeper, { executionId: "sleep-q", payload: { prefix: "q", pauseMs: 0 } })
      expect(yield* engine.result(Sleeper, "sleep-q")).toEqual(Exit.succeed("q:after"))
    }).pipe(Effect.scoped))

  it.live("starts the tab's worker and terminates it with the scope", () =>
    Effect.gen(function*() {
      const worker = Engines.worker()
      yield* Engines.tab(Engines.name(), { worker: worker.handle, granted: false }).pipe(Effect.scoped)
      expect(worker.terminated()).toBe(1)
    }))

  it.live("fails a waiting request and every later one when the tab's worker throws, says why once, without content", () => {
    const telemetry = Telemetry.make()
    const worker = Engines.worker()
    return telemetry.observed(
      Effect.gen(function*() {
        // No leader: nothing would ever answer.
        const engine = yield* Engines.tab(Engines.name(), { worker: worker.handle })
        const waiting = yield* Effect.forkChild(engine.start(Steps, { executionId: "w-1", payload: { prefix: "w" } }))
        yield* Effect.sleep("20 millis")
        expect(waiting.pollUnsafe()).toBeUndefined()
        worker.fail(new ErrorEvent("error", { error: new TypeError("secret detail"), message: "secret" }))
        const failure = new BrowserEngine.EngineUnavailable({ reason: "worker-failed", error: "TypeError" })
        expect(yield* Fiber.join(waiting).pipe(Effect.flip)).toEqual(failure)
        expect(yield* engine.unavailable).toEqual(failure)
        expect(yield* engine.cancel(Steps, "w-1").pipe(Effect.flip)).toEqual(failure)
        expect(yield* engine.signal(Waiter, "w-1", "approval", null).pipe(Effect.flip)).toEqual(failure)
        expect(yield* engine.result(Steps, "w-1").pipe(Effect.flip)).toEqual(failure)
        // A second error changes nothing.
        worker.fail(new ErrorEvent("error", { message: "secret" }))
        yield* Effect.sleep("10 millis")
      }).pipe(Effect.scoped)
    ).pipe(Effect.andThen(Effect.sync(() => {
      expect(telemetry.count(BrowserEngine.unavailable, { reason: "worker-failed" })).toBe(1)
      expect(telemetry.lines("browser.engine.unavailable").map((line) => line.annotations)).toEqual([
        expect.objectContaining({ reason: "worker-failed", "error.type": "TypeError" })
      ])
      expect(Telemetry.dump(telemetry)).not.toContain("secret")
    })))
  })

  it.live("names an error event that carries no error ErrorEvent", () =>
    Effect.gen(function*() {
      const worker = Engines.worker()
      const engine = yield* Engines.tab(Engines.name(), { worker: worker.handle })
      worker.fail(new ErrorEvent("error", { message: "secret" }))
      expect(yield* engine.unavailable).toMatchObject({ reason: "worker-failed", error: "ErrorEvent" })
    }).pipe(Effect.scoped))

  it.live("fails when the worker reports its engine could not be built, and ignores its other messages", () =>
    Effect.gen(function*() {
      const worker = Engines.worker()
      const engine = yield* Engines.tab(Engines.name(), { worker: worker.handle })
      worker.post({ kind: "smithers/tab-call" })
      yield* Effect.sleep("10 millis")
      const before = yield* Effect.forkChild(engine.unavailable)
      yield* Effect.sleep("10 millis")
      expect(before.pollUnsafe()).toBeUndefined()
      worker.post({ _tag: "@smthrs/platform-browser/EngineStopped", error: "SqlError" })
      expect(yield* Fiber.join(before)).toEqual(
        new BrowserEngine.EngineUnavailable({ reason: "engine-failed", error: "SqlError" })
      )
    }).pipe(Effect.scoped))

  it.live("ends a result that waits on a running run when the tab's worker fails", () =>
    Effect.gen(function*() {
      const worker = Engines.worker()
      const run = Engines.steps({ block: ["r:two"] })
      const name = Engines.name()
      yield* Engines.leader(name, Engines.engine(name, yield* MemorySqlite.open, run))
      const engine = yield* Engines.tab(name, { worker: worker.handle })
      yield* engine.start(Steps, { executionId: "r-1", payload: { prefix: "r" } })
      const result = yield* Effect.forkChild(engine.result(Steps, "r-1"))
      while (!run.ran.includes("r:two")) yield* Effect.sleep("10 millis")
      worker.fail(new ErrorEvent("error", { error: new RangeError("x") }))
      expect(yield* Fiber.join(result).pipe(Effect.flip)).toMatchObject({
        reason: "worker-failed",
        error: "RangeError"
      })
    }).pipe(Effect.scoped))

  it.live("counts whether the origin holds persistent storage", () => {
    const telemetry = Telemetry.make()
    return telemetry.observed(Effect.gen(function*() {
      yield* Engines.tab(Engines.name(), { granted: true }).pipe(
        Effect.andThen(Effect.sleep("10 millis")),
        Effect.scoped
      )
      yield* Engines.tab(Engines.name(), { granted: false }).pipe(
        Effect.andThen(Effect.sleep("10 millis")),
        Effect.scoped
      )
    })).pipe(Effect.andThen(Effect.sync(() => {
      expect(telemetry.count(BrowserEngine.persistence, { outcome: "granted" })).toBe(1)
      expect(telemetry.count(BrowserEngine.persistence, { outcome: "denied" })).toBe(1)
    })))
  })
})

describe("BrowserEngine.layer", () => {
  it.live("composes the browser's own channel and storage", () => {
    const worker = Engines.worker()
    return Effect.gen(function*() {
      yield* BrowserEngine.BrowserEngine
    }).pipe(
      Effect.provide(BrowserEngine.layer({ name: Engines.name(), worker: () => worker.handle })),
      Effect.andThen(Effect.sync(() => expect(worker.terminated()).toBe(1)))
    )
  })
})
