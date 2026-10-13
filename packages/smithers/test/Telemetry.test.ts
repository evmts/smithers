/**
 * The timing records the host writes to a run's journal: where a record goes,
 * what the start-up clock and the timed spawner measure under a controlled
 * clock, and what a reader may rely on when decoding one.
 */
import { digestSync } from "@smthrs/crypto"
import * as Action from "@smthrs/flow/Action"
import * as FlowRuntime from "@smthrs/flow/FlowRuntime"
import * as Journal from "@smthrs/journal/Journal"
import * as JournalEvent from "@smthrs/journal/JournalEvent"
import * as TestJournal from "@smthrs/journal/test/TestJournal"
import { Clock, Effect, Exit, Fiber, Schema, Sink, Stream, Tracer } from "effect"
import { PlatformError, systemError } from "effect/PlatformError"
import { TestClock } from "effect/testing"
import * as ChildProcess from "effect/process/ChildProcess"
import {
  type ChildProcessSpawner,
  ExitCode,
  make as makeSpawner,
  makeHandle,
  ProcessId
} from "effect/process/ChildProcessSpawner"
import { describe, expect, it } from "vitest"
import * as Telemetry from "../src/internal/Telemetry.ts"

const runId = JournalEvent.RunId.make("run-7")

/** The engine execution a fiber runs under, as the engine provides it. */
const inRun = Effect.provideService(
  FlowRuntime.FlowInstance,
  { executionId: runId } as unknown as FlowRuntime.FlowInstance["Service"]
)

/** What the journal holds for the run, written through the production journal over a scratch database. */
const journaled = Effect.gen(function*() {
  const journal = yield* Journal.Journal
  yield* journal.flush
  const page = yield* journal.entries({ runId, limit: 64 })
  return page.entries.map((entry) => ({ eventType: entry.eventType, payload: entry.payload, sourceId: entry.sourceId }))
})

/** Runs `effect` over a scratch journal and a clock the test moves. */
const run = <A, E>(effect: Effect.Effect<A, E, Journal.Journal>) =>
  Effect.runPromise(effect.pipe(Effect.provide(TestJournal.layer()), Effect.provide(TestClock.layer()), Effect.orDie))

/** Every span the effect opened, with the attributes it ended with. */
const traced = <A, E, R>(effect: Effect.Effect<A, E, R>) => {
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    }
  })
  return Effect.map(Effect.withTracer(effect, tracer), (value) => ({
    value,
    spans: spans.map((span) => ({ name: span.name, attributes: Object.fromEntries(span.attributes) }))
  }))
}

const signIn: Telemetry.SignIn = {
  trigger: "request",
  readMs: 2,
  lockWaitMs: 4025,
  refreshed: true,
  refreshMs: 1500,
  refreshOutcome: "rotated",
  totalMs: 5527,
  ok: true
}

describe("Telemetry.record", () => {
  it("writes the record to the journal of the run the fiber serves, with every field intact", async () => {
    const result = await run(Effect.gen(function*() {
      const written = yield* inRun(Telemetry.record(Telemetry.signInEvent, signIn))
      return { written, entries: yield* journaled }
    }))

    expect(result.written).toBe(true)
    // The journal redacts fields whose names read as credentials; none of these do.
    expect(result.entries).toEqual([
      { eventType: "flows.host.sign-in.v1", payload: signIn, sourceId: "@smthrs/cli/Telemetry" }
    ])
  })

  it("keys the record to the engine step it was measured in, as the engine's attempt events name that step", async () => {
    const stepKey = "key1_014ebbc9368c55eb0f17a18aa8286ee1f46125c4a27eab1ef3bd7379fa4f6aa6"
    const stepKeyDigest = digestSync(stepKey)
    const { entries, spans } = await run(
      traced(
        Effect.gen(function*() {
          yield* inRun(Telemetry.record(Telemetry.signInEvent, signIn)).pipe(
            Effect.provideService(Action.CurrentInvocationKey, stepKey),
            Effect.withSpan("Auth.sign")
          )
          return yield* journaled
        })
      ).pipe(Effect.map(({ spans, value }) => ({ entries: value, spans })))
    )

    expect(entries.map((entry) => entry.payload)).toEqual([{ ...signIn, stepKeyDigest }])
    expect(stepKeyDigest).toMatch(/^[0-9a-f]{64}$/)
    expect(Schema.decodeUnknownSync(Telemetry.SignIn)(entries[0]!.payload).stepKeyDigest).toBe(stepKeyDigest)
    // The engine already names the step on its spans; the record's own fields are what it adds.
    expect(Object.keys(spans.find((span) => span.name === "Auth.sign")!.attributes)).not.toContain(
      "flows.host.sign-in.v1.stepKeyDigest"
    )
  })

  it("writes nothing for a fiber that serves no run", async () => {
    const result = await run(Effect.gen(function*() {
      const written = yield* Telemetry.record(Telemetry.signInEvent, signIn)
      return { written, entries: yield* journaled }
    }))

    expect(result).toEqual({ written: false, entries: [] })
    // And nothing without a journal, in a run or out of one.
    expect(await Effect.runPromise(inRun(Telemetry.record(Telemetry.signInEvent, signIn)))).toBe(false)
  })

  it.each([
    ["drops it", () => Effect.succeed({ _tag: "Dropped", seq: 0, sourceSeq: 0, policy: "drop-newest" })],
    ["refuses it", () => Effect.fail(new Journal.JournalError({ code: "queue_overflow", message: "full" }))],
    ["throws on it", () => Effect.die(new Error("journal defect"))]
  ])("costs the record and nothing else when the journal %s", async (_state, emitLossy) => {
    const journal = { emitLossy } as unknown as Journal.Service

    const written = await Effect.runPromise(
      inRun(Telemetry.record(Telemetry.signInEvent, signIn)).pipe(Effect.provideService(Journal.Journal, journal))
    )

    expect(written).toBe(false)
  })

  it("sets each scalar field on the open span under the event's name", async () => {
    const { spans } = await Effect.runPromise(
      traced(Telemetry.record(Telemetry.signInEvent, signIn).pipe(Effect.withSpan("Auth.sign")))
    )

    expect(spans).toEqual([{
      name: "Auth.sign",
      attributes: {
        "flows.host.sign-in.v1.trigger": "request",
        "flows.host.sign-in.v1.readMs": 2,
        "flows.host.sign-in.v1.lockWaitMs": 4025,
        "flows.host.sign-in.v1.refreshed": true,
        "flows.host.sign-in.v1.refreshMs": 1500,
        "flows.host.sign-in.v1.refreshOutcome": "rotated",
        "flows.host.sign-in.v1.totalMs": 5527,
        "flows.host.sign-in.v1.ok": true
      }
    }])
  })
})

describe("Telemetry records on read", () => {
  it("decodes a record that carries only what every record has", () => {
    // A resolution that ran no refresh, and a process stopped before it exited.
    expect(
      Schema.decodeUnknownSync(Telemetry.SignIn)({
        trigger: "request",
        readMs: 0,
        lockWaitMs: 0,
        refreshed: false,
        totalMs: 0,
        ok: true
      })
    ).toEqual({ trigger: "request", readMs: 0, lockWaitMs: 0, refreshed: false, totalMs: 0, ok: true })
    expect(
      Schema.decodeUnknownSync(Telemetry.Command)({
        spawnMs: 30,
        runMs: 70,
        collectMs: 0,
        totalMs: 100,
        bytesOut: 0
      })
    ).toEqual({ spawnMs: 30, runMs: 70, collectMs: 0, totalMs: 100, bytesOut: 0 })
  })

  it("decodes a record a later version added a field to", () => {
    expect(
      Schema.decodeUnknownSync(Telemetry.StartUp)({
        processStartedAtMs: 1000,
        totalMs: 400,
        stages: [{ stage: "boot", ms: 400, addedLater: true }],
        addedLater: "ignored"
      })
    ).toEqual({ processStartedAtMs: 1000, totalMs: 400, stages: [{ stage: "boot", ms: 400 }] })
  })
})

describe("Telemetry.makeStartUp", () => {
  const stages: ReadonlyArray<readonly [Telemetry.Stage, number]> = [
    ["boot", 400],
    ["project", 150],
    ["journal", 50],
    ["executor", 700],
    ["launch", 90],
    ["seat", 10]
  ]

  it("writes stages that add up to the time from process start to the first model request", async () => {
    const entries = await run(Effect.gen(function*() {
      yield* TestClock.setTime(1_000)
      const startUp = Telemetry.makeStartUp(1_000)
      for (const [stage, millis] of stages) {
        yield* TestClock.adjust(millis)
        yield* startUp.mark(stage)
      }
      yield* TestClock.adjust(600)
      yield* inRun(startUp.firstRequest)
      return yield* journaled
    }))

    expect(entries).toEqual([{
      eventType: "flows.host.start-up.v1",
      sourceId: "@smthrs/cli/Telemetry",
      payload: {
        processStartedAtMs: 1_000,
        totalMs: 2_000,
        stages: [
          { stage: "boot", ms: 400 },
          { stage: "project", ms: 150 },
          { stage: "journal", ms: 50 },
          { stage: "executor", ms: 700 },
          { stage: "launch", ms: 90 },
          { stage: "seat", ms: 10 },
          { stage: "request", ms: 600 }
        ]
      }
    }])
    const [{ payload }] = entries as unknown as [{ readonly payload: Telemetry.StartUp }]
    // The measured total: the clock at the first request, less the process's start.
    expect(payload.totalMs).toBe(3_000 - 1_000)
    expect(payload.stages.reduce((sum, stage) => sum + stage.ms, 0)).toBe(payload.totalMs)
  })

  it("counts a stage once, and writes one record however many requests follow", async () => {
    const entries = await run(Effect.gen(function*() {
      const startUp = Telemetry.makeStartUp(0)
      yield* TestClock.adjust(100)
      yield* startUp.mark("boot")
      yield* TestClock.adjust(100)
      // A second host composed in the same process marks the same stage again.
      yield* startUp.mark("boot")
      yield* Effect.all([inRun(startUp.firstRequest), inRun(startUp.firstRequest)], { concurrency: "unbounded" })
      yield* TestClock.adjust(100)
      yield* startUp.mark("seat")
      yield* inRun(startUp.firstRequest)
      return yield* journaled
    }))

    expect(entries.map((entry) => entry.payload)).toEqual([
      { processStartedAtMs: 0, totalMs: 200, stages: [{ stage: "boot", ms: 100 }, { stage: "request", ms: 100 }] }
    ])
  })

  it("stays open through a request that serves no run, and closes at the first that does", async () => {
    const entries = await run(Effect.gen(function*() {
      const startUp = Telemetry.makeStartUp(0)
      yield* TestClock.adjust(100)
      yield* startUp.mark("executor")
      yield* TestClock.adjust(100)
      yield* startUp.firstRequest
      yield* TestClock.adjust(100)
      yield* startUp.mark("launch")
      yield* TestClock.adjust(100)
      yield* inRun(startUp.firstRequest)
      return yield* journaled
    }))

    expect(entries.map((entry) => entry.payload)).toEqual([{
      processStartedAtMs: 0,
      totalMs: 400,
      stages: [{ stage: "executor", ms: 100 }, { stage: "launch", ms: 200 }, { stage: "request", ms: 100 }]
    }])
  })

  it("keeps its stages adding up when the clock steps back", async () => {
    const entries = await run(Effect.gen(function*() {
      // The process's time origin is ahead of the clock the marks read.
      const startUp = Telemetry.makeStartUp(500.9)
      yield* TestClock.setTime(200)
      yield* startUp.mark("boot")
      yield* TestClock.setTime(800)
      yield* inRun(startUp.firstRequest)
      return yield* journaled
    }))

    expect(entries.map((entry) => entry.payload)).toEqual([
      { processStartedAtMs: 500, totalMs: 300, stages: [{ stage: "boot", ms: 0 }, { stage: "request", ms: 300 }] }
    ])
  })

  const host = { hostId: "test-host", pid: 4242 }

  /** The host's own stream in the journal, where a process writes its lifetime. */
  const lifetimes = Effect.gen(function*() {
    const journal = yield* Journal.Journal
    const page = yield* journal.entries({ runId: JournalEvent.RunId.make("flows.host:test-host"), limit: 64 })
    return page.entries.map((entry) => ({ eventType: entry.eventType, payload: entry.payload }))
  })

  it("journals the lifetime of a process that sent no model request, with the stages it reached", async () => {
    const entries = await run(Effect.gen(function*() {
      yield* TestClock.setTime(1_000)
      const startUp = Telemetry.makeStartUp(1_000)
      for (const [stage, millis] of stages.slice(0, 4)) {
        yield* TestClock.adjust(millis)
        yield* startUp.mark(stage)
      }
      // The command does its work, then its host closes.
      yield* TestClock.adjust(250)
      yield* startUp.ended(yield* Journal.Journal, host)
      return yield* lifetimes
    }))

    expect(entries).toEqual([{
      eventType: "flows.host.lifetime.v1",
      payload: {
        pid: 4242,
        processStartedAtMs: 1_000,
        endedAtMs: 2_550,
        stages: [
          { stage: "boot", ms: 400 },
          { stage: "project", ms: 150 },
          { stage: "journal", ms: 50 },
          { stage: "executor", ms: 700 }
        ]
      }
    }])
    expect(Schema.decodeUnknownSync(Telemetry.Lifetime, { onExcessProperty: "error" })(entries[0]!.payload)).toEqual(
      entries[0]!.payload
    )
  })

  it("journals the first model request among the stages of a process that sent one", async () => {
    const entries = await run(Effect.gen(function*() {
      const startUp = Telemetry.makeStartUp(0)
      yield* TestClock.adjust(100)
      yield* startUp.mark("executor")
      yield* TestClock.adjust(40)
      yield* inRun(startUp.firstRequest)
      yield* TestClock.adjust(5_000)
      yield* startUp.ended(yield* Journal.Journal, host)
      return yield* lifetimes
    }))

    expect(entries.map((entry) => entry.payload)).toEqual([{
      pid: 4242,
      processStartedAtMs: 0,
      endedAtMs: 5_140,
      stages: [{ stage: "executor", ms: 100 }, { stage: "request", ms: 40 }]
    }])
  })

  it("writes one lifetime for each host a process closes, and none of them fails the close", async () => {
    const result = await run(Effect.gen(function*() {
      const startUp = Telemetry.makeStartUp(0)
      const journal = yield* Journal.Journal
      yield* startUp.ended(journal, host)
      yield* TestClock.adjust(10)
      yield* startUp.ended(journal, host)
      const refused = yield* Effect.exit(startUp.ended(
        { emitDurableUnfenced: () => Effect.die(new Error("journal closed")) } as unknown as Journal.Service,
        host
      ))
      return { ended: (yield* lifetimes).map((entry) => (entry.payload as Telemetry.Lifetime).endedAtMs), refused }
    }))

    expect(result.ended).toEqual([0, 10])
    expect(Exit.isSuccess(result.refused)).toBe(true)
  })

  it("sets each stage on the span open at the first request", async () => {
    const { spans } = await run(traced(
      Effect.gen(function*() {
        const startUp = Telemetry.makeStartUp(0)
        yield* TestClock.adjust(40)
        yield* startUp.mark("boot")
        yield* TestClock.adjust(60)
        yield* inRun(startUp.firstRequest).pipe(Effect.withSpan("flows/model/Route.stream"))
      })
    ))

    expect(spans.find((span) => span.name === "flows/model/Route.stream")?.attributes).toEqual({
      "flows.host.start-up.v1.processStartedAtMs": 0,
      "flows.host.start-up.v1.totalMs": 100,
      "flows.host.start-up.v1.stage.boot": 40,
      "flows.host.start-up.v1.stage.request": 60
    })
  })
})

const bytes = (length: number) => new Uint8Array(length)

/** After `millis`, `value`. */
const after = <A>(millis: number, value: A) => Effect.as(Effect.sleep(millis), value)

/**
 * A spawner whose one process takes 30 ms to start, exits 3 after 200 ms, and
 * closes its standard error at 100 ms and its standard output at 250 ms.
 */
const scripted = (): ChildProcessSpawner["Service"] =>
  makeSpawner(() =>
    after(
      30,
      makeHandle({
        pid: ProcessId(4242),
        exitCode: after(200, ExitCode(3)),
        isRunning: Effect.succeed(true),
        kill: () => Effect.void,
        stdin: Sink.drain,
        stdout: Stream.make(bytes(5)).pipe(Stream.concat(Stream.fromEffect(after(250, bytes(7))))),
        stderr: Stream.fromEffect(after(100, bytes(4))),
        all: Stream.empty,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
        unref: Effect.succeed(Effect.void)
      })
    )
  )

const command = ChildProcess.make("docker", ["exec", "--", "task", "bash", "-lc", "ls"])

/** Reads a process the way the shell flows do: both streams and the exit code at once, in one scope. */
const collect = (spawner: ChildProcessSpawner["Service"]) =>
  Effect.scoped(Effect.gen(function*() {
    const handle = yield* spawner.spawn(command)
    const [stdout, stderr, exitCode] = yield* Effect.all(
      [Stream.runCollect(handle.stdout), Stream.runCollect(handle.stderr), handle.exitCode],
      { concurrency: "unbounded" }
    )
    const size = (chunks: ReadonlyArray<Uint8Array>) => chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
    return { stdout: size(stdout), stderr: size(stderr), exitCode: Number(exitCode), pid: Number(handle.pid) }
  }))

describe("Telemetry.timedSpawner", () => {
  it("writes spawn, run and output-collection times that add up to the process's whole", async () => {
    const result = await run(Effect.gen(function*() {
      const fiber = yield* Effect.forkChild(inRun(collect(Telemetry.timedSpawner(scripted()))), {
        startImmediately: true
      })
      yield* TestClock.adjust(30)
      yield* TestClock.adjust(200)
      yield* TestClock.adjust(50)
      const read = yield* Fiber.join(fiber)
      return { read, entries: yield* journaled, elapsed: yield* Clock.currentTimeMillis }
    }))

    // The handle is the spawner's own: what the caller reads is unchanged.
    expect(result.read).toEqual({ stdout: 12, stderr: 4, exitCode: 3, pid: 4242 })
    expect(result.entries).toEqual([{
      eventType: "flows.host.command.v1",
      sourceId: "@smthrs/cli/Telemetry",
      payload: { spawnMs: 30, runMs: 200, collectMs: 50, totalMs: 280, bytesOut: 16, exitCode: 3 }
    }])
    const payload = result.entries[0]!.payload as Telemetry.Command
    expect(payload.spawnMs + payload.runMs + payload.collectMs).toBe(payload.totalMs)
    // The call's own duration, on the same clock.
    expect(payload.totalMs).toBe(result.elapsed)
  })

  it("ends the run where a process was stopped before it exited, with no exit code", async () => {
    const entries = await run(Effect.gen(function*() {
      const fiber = yield* Effect.forkChild(
        inRun(collect(Telemetry.timedSpawner(scripted())).pipe(Effect.timeoutOption(100))),
        { startImmediately: true }
      )
      yield* TestClock.adjust(100)
      yield* Fiber.join(fiber)
      return yield* journaled
    }))

    expect(entries.map((entry) => entry.payload)).toEqual([
      { spawnMs: 30, runMs: 70, collectMs: 0, totalMs: 100, bytesOut: 5 }
    ])
  })

  it("counts no collection time for output that ended before the process did", async () => {
    const quick = makeSpawner(() =>
      Effect.succeed(makeHandle({
        pid: ProcessId(7),
        exitCode: after(80, ExitCode(0)),
        isRunning: Effect.succeed(true),
        kill: () => Effect.void,
        stdin: Sink.drain,
        stdout: Stream.make(bytes(3)),
        stderr: Stream.empty,
        all: Stream.empty,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
        unref: Effect.succeed(Effect.void)
      }))
    )

    const entries = await run(Effect.gen(function*() {
      const fiber = yield* Effect.forkChild(inRun(collect(Telemetry.timedSpawner(quick))), { startImmediately: true })
      yield* TestClock.adjust(80)
      yield* Fiber.join(fiber)
      return yield* journaled
    }))

    expect(entries.map((entry) => entry.payload)).toEqual([
      { spawnMs: 0, runMs: 80, collectMs: 0, totalMs: 80, bytesOut: 3, exitCode: 0 }
    ])
  })

  it("times a process whose caller reads only its exit code", async () => {
    const result = await run(Effect.gen(function*() {
      const fiber = yield* Effect.forkChild(inRun(Telemetry.timedSpawner(scripted()).exitCode(command)), {
        startImmediately: true
      })
      yield* TestClock.adjust(230)
      const exitCode = yield* Fiber.join(fiber)
      return { exitCode: Number(exitCode), entries: yield* journaled }
    }))

    expect(result.exitCode).toBe(3)
    // Nothing was read, so nothing was collected.
    expect(result.entries.map((entry) => entry.payload)).toEqual([
      { spawnMs: 30, runMs: 200, collectMs: 0, totalMs: 230, bytesOut: 0, exitCode: 3 }
    ])
  })

  it("passes a spawn that fails through unchanged and writes no record", async () => {
    const refused = systemError({ _tag: "NotFound", module: "ChildProcess", method: "spawn", description: "no docker" })
    const failing = makeSpawner(() => Effect.fail(refused))

    const result = await run(Effect.gen(function*() {
      const exit = yield* Effect.exit(inRun(collect(Telemetry.timedSpawner(failing))))
      return { exit, entries: yield* journaled }
    }))

    expect(Exit.isFailure(result.exit) && result.exit.cause.reasons.map((reason) => reason._tag)).toEqual(["Fail"])
    expect(Exit.isFailure(result.exit) && JSON.stringify(result.exit.cause)).toContain("no docker")
    expect(refused).toBeInstanceOf(PlatformError)
    expect(result.entries).toEqual([])
  })

  it("lays a Command.exec span over the process, carrying the same fields", async () => {
    const { spans } = await run(traced(Effect.gen(function*() {
      const fiber = yield* Effect.forkChild(inRun(collect(Telemetry.timedSpawner(scripted()))), {
        startImmediately: true
      })
      yield* TestClock.adjust(280)
      yield* Fiber.join(fiber)
    })))

    expect(spans.filter((span) => span.name === "Command.exec")).toEqual([{
      name: "Command.exec",
      attributes: {
        "flows.host.command.v1.spawnMs": 30,
        "flows.host.command.v1.runMs": 200,
        "flows.host.command.v1.collectMs": 50,
        "flows.host.command.v1.totalMs": 280,
        "flows.host.command.v1.bytesOut": 16,
        "flows.host.command.v1.exitCode": 3
      }
    }])
  })
})
