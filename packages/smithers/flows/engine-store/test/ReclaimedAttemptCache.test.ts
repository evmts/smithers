/**
 * Issue #3898: a run reclaimed from a SIGKILLed owner re-ran a step that the
 * step cache could already answer.
 *
 * The launch demo runs `Plan` then `Test`, both keyed, sealed, hard-bounded
 * and shared-scope cached. Kill it during `Test` and restart it as a new run:
 * the new run reuses `Plan` from the cache and runs `Test` once. The killed
 * run is still `running` under a dead owner, and the restart's stale-running
 * sweep steals it and re-drives it. Its `Test` attempt row is `running`, and
 * adoption re-executed the body without asking the cache:
 *
 * - steal during the restart's `Test` (restart more than 30 s after the kill):
 *   the reclaimed body ran concurrently with the restart's;
 * - steal after the restart recorded `Test` (quick restart, then any later
 *   process): the reclaimed body ran although the cache held that exact key.
 *
 * Each case kills a real child process, so the abandoned rows are the ones a
 * SIGKILL leaves, then reclaims on a `TestClock` set past the dead owner's
 * last heartbeat, with the pid probe a Node host uses. The bodies count
 * themselves; a label never decides.
 */
import { describe, expect, it } from "@effect/vitest"
import { FlowRuntime } from "@smthrs/flow"
import { Journal, JournalEvent } from "@smthrs/journal"
import { Ownership, RunStore } from "@smthrs/run-store"
import type * as Crypto from "effect/Crypto"
import * as Deferred from "effect/Deferred"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import type * as Scope from "effect/Scope"
import { TestClock } from "effect/testing"
import * as Tracer from "effect/Tracer"
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import * as EngineStore from "../src/EngineStore.ts"
import * as StepBoundary from "../src/StepBoundary.ts"
import * as TestStores from "../src/test/TestStores.ts"
import * as PersistentDatabase from "./fixtures/PersistentDatabase.ts"
import * as ReclaimedAttemptFlow from "./fixtures/ReclaimedAttemptFlow.ts"
import { runPromise } from "./Sha256.ts"

const fixture = fileURLToPath(new URL("./fixtures/reclaimed-attempt-child.ts", import.meta.url))
const repositoryRoot = fileURLToPath(new URL("../../../../../", import.meta.url))

/** Wall-clock budget per case: a child boot plus migrations, under coverage, on a loaded host. */
const processBudget = 180_000

const heartbeatMs = Duration.toMillis(Ownership.heartbeatInterval)
/** How far past the dead owner's last heartbeat its lease has expired. */
const expiry = Duration.toMillis(Ownership.heartbeatStaleAfter) + heartbeatMs

const orphan = "orphan"
const restart = "restart"

/** Kills the child once its `Test` body is running. */
const killDuringTest = async (filename: string): Promise<void> => {
  const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [fixture, filename, orphan, "#42"], {
    cwd: repositoryRoot,
    // The fixture reads only argv; never hand it the parent's credentials.
    env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, LANG: "C.UTF-8" }
  })
  try {
    const marker = await new Promise<{ readonly status: string }>((resolve, reject) => {
      let stdout = ""
      let stderr = ""
      const timeout = setTimeout(
        () => reject(new Error(`child never reached Test\n${stderr}\n${stdout}`)),
        processBudget
      )
      child.stdout.setEncoding("utf8")
      child.stderr.setEncoding("utf8")
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk
        const newline = stdout.indexOf("\n")
        if (newline < 0) return
        clearTimeout(timeout)
        resolve(JSON.parse(stdout.slice(0, newline)))
      })
      child.stderr.on("data", (chunk: string) => {
        stderr = (stderr + chunk).slice(-4096)
      })
      child.once("exit", (code, signal) => {
        clearTimeout(timeout)
        reject(new Error(`child exited before Test with ${code ?? signal}\n${stderr}\n${stdout}`))
      })
    })
    expect(marker.status).toBe("testing")
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL")
      await once(child, "exit")
    }
  }
}

/** What the survivor's step bodies did, in order. */
interface Ran {
  readonly plan: Array<string>
  readonly test: Array<string>
}

/** Real time for the store's own I/O, with the test clock held still. */
const pause = Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 5)))

/**
 * Waits for `done`, moving the test clock one heartbeat, and so one sweep
 * tick, per quarter second of real time. The clock never outruns the store:
 * a lease the survivor holds renews long before it could lapse, on SQLite and
 * on PostgreSQL alike.
 */
const until = <R>(done: Effect.Effect<boolean, unknown, R>) =>
  Effect.gen(function*() {
    for (let turn = 0; turn < 4000; turn++) {
      if (yield* done) return true
      if (turn % 50 === 0) yield* TestClock.adjust(heartbeatMs)
      yield* pause
    }
    return yield* done
  })

const decisions = (runId: string) =>
  Effect.gen(function*() {
    const journal = yield* Journal.Journal
    yield* journal.flush
    const page = yield* journal.entries({ runId: JournalEvent.RunId.make(runId), limit: 1000 })
    return page.entries
      .filter((entry) => entry.eventType === "flows.engine.run-decision")
      .map((entry) => entry.payload as { readonly decision: string; readonly evidence?: string })
  })

/** Every attempt the run's journal opened, with whether it also closed it. */
const attemptSpans = (runId: string) =>
  Effect.gen(function*() {
    const journal = yield* Journal.Journal
    yield* journal.flush
    const page = yield* journal.entries({ runId: JournalEvent.RunId.make(runId), limit: 1000 })
    const named = (eventType: string) =>
      page.entries
        .filter((entry) => entry.eventType === eventType)
        .map((entry) => entry.payload as { readonly stepKeyDigest: string; readonly attempt: number })
    const finished = named("flows.engine.attempt-finished")
    return named("flows.engine.attempt-started").map((started) => ({
      ...started,
      finished: finished.some((row) => row.stepKeyDigest === started.stepKeyDigest && row.attempt === started.attempt)
    }))
  })

const statusOf = (runId: string) =>
  Effect.flatMap(RunStore.RunStore, (runs) => Effect.map(runs.get(runId), (row) => row.status))

const resultOf = (engine: FlowRuntime.FlowRuntime["Service"], runId: string) =>
  Effect.gen(function*() {
    const polled = yield* engine.poll(ReclaimedAttemptFlow.Fix, runId)
    const result = Option.getOrThrow(polled)
    if (result._tag !== "Complete" || !Exit.isSuccess(result.exit)) {
      return yield* Effect.die(new Error(`run ${runId} did not succeed: ${JSON.stringify(result)}`))
    }
    return result.exit.value
  })

/** The survivor's view of one case, handed to its observation. */
interface Survivor {
  readonly engine: FlowRuntime.FlowRuntime["Service"]
  readonly execute: (runId: string) => Effect.Effect<string, never, Crypto.Crypto>
  /** What the survivor's bodies have done so far. */
  readonly ran: Ran
  /** Every span the survivor opened, so a case can see a dispatch begin. */
  readonly spans: ReadonlyArray<Tracer.NativeSpan>
}

/**
 * A fresh engine over the killed child's database, with its own bodies
 * attached, starting while the dead owner's lease is still `fresh` or once it
 * has `expired`. `observe` runs with the flow registered, so the sweep can
 * re-drive the orphan for as long as it runs. The sweep first ticks one
 * heartbeat after the engine starts.
 */
const survive = <A>(
  filename: string,
  lease: "fresh" | "expired",
  bodies: (ran: Ran) => ReclaimedAttemptFlow.Bodies,
  observe: (
    survivor: Survivor
  ) => Effect.Effect<A, unknown, RunStore.RunStore | Journal.Journal | Scope.Scope | Crypto.Crypto>
) => {
  const ran: Ran = { plan: [], test: [] }
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    }
  })
  return Effect.scoped(Effect.gen(function*() {
    const runs = yield* RunStore.RunStore
    const killed = yield* runs.get(orphan)
    // What SIGKILL left: the orphan still `running` under the dead child.
    expect(killed.status).toBe("running")
    expect(killed.owner?.hostId).toBe(ReclaimedAttemptFlow.hostId)
    expect(killed.owner?.pid).not.toBe(process.pid)
    const killedHeartbeatAtMs = killed.heartbeatAtMs ?? 0
    yield* TestClock.setTime(killedHeartbeatAtMs + (lease === "fresh" ? 0 : expiry))
    // The probe a Node host uses: the child's pid is gone, so its expired
    // lease admits the steal, and the survivor's own runs stay its own however
    // far the test clock runs ahead of their heartbeats.
    const engine = yield* EngineStore.make({
      owner: { hostId: ReclaimedAttemptFlow.hostId },
      journalSource: "survivor",
      isAlive: Ownership.sameHostPidProbe
    })
    const context = yield* Layer.build(ReclaimedAttemptFlow.layer(engine, bodies(ran)))
    const execute = (runId: string) =>
      ReclaimedAttemptFlow.Fix.execute({ issue: "#42" }, { executionId: runId }).pipe(
        Effect.provide(context),
        Effect.orDie
      )
    return yield* observe({ engine, execute, ran, spans })
  })).pipe(
    Effect.map((observed) => ({ ran, observed })),
    Effect.provideService(Tracer.Tracer, tracer),
    Effect.provide(ReclaimedAttemptFlow.jj),
    Effect.provide(StepBoundary.layerTest()),
    Effect.provide(TestStores.layerAt(filename)),
    Effect.provide(TestClock.layer()),
    Effect.orDie,
    runPromise
  )
}

/** A fresh database holding what the child left when it was killed during `Test`. */
const killedDatabase = async <A>(use: (filename: string) => Promise<A>): Promise<A> => {
  const directory = await mkdtemp(join(tmpdir(), "reclaimed-attempt-"))
  const filename = PersistentDatabase.filename(join(directory, "engine.db"))
  try {
    await killDuringTest(filename)
    return await use(filename)
  } finally {
    await PersistentDatabase.remove(filename)
    await rm(directory, { recursive: true, force: true })
  }
}

const passed = "passed: plan for #42"

describe("a reclaimed attempt reuses the step cache (issue #3898)", () => {
  it("serves the orphan's in-flight step from the record a later run made", async () => {
    const { observed, ran } = await killedDatabase((filename) =>
      survive(
        filename,
        "fresh",
        (ran) => ({
          plan: (issue) =>
            Effect.sync(() => {
              ran.plan.push(issue)
              return `plan for ${issue}`
            }),
          test: (plan) =>
            Effect.sync(() => {
              ran.test.push(plan)
              return `passed: ${plan}`
            })
        }),
        ({ engine, execute }) =>
          Effect.gen(function*() {
            // A quick restart: the dead owner's lease is fresh, so nothing
            // steals the orphan while the restart runs and records `Test`.
            const restarted = yield* execute(restart)
            const during = yield* statusOf(orphan)
            // Any later process: the lease has expired, so its sweep steals
            // the orphan and re-drives its in-flight `Test` attempt. The
            // survivor holds no lease across this jump.
            yield* TestClock.adjust(expiry)
            yield* until(Effect.map(statusOf(orphan), (status) => status === "completed"))
            return {
              restarted,
              during,
              reclaimed: yield* statusOf(orphan),
              result: yield* resultOf(engine, orphan),
              decisions: yield* decisions(orphan),
              attempts: yield* attemptSpans(orphan)
            }
          })
      )
    )

    expect(observed.restarted).toBe(passed)
    expect(observed.during).toBe("running")
    expect(observed.reclaimed).toBe("completed")
    expect(observed.result).toBe(passed)
    expect(observed.decisions).toContainEqual(
      expect.objectContaining({ decision: "stolen-and-activated", evidence: "same-host-pid-dead" })
    )
    // `Plan` came from the child's record for both runs, and `Test` ran once:
    // for the restart. The orphan's attempt was answered by that record.
    expect(ran.plan).toEqual([])
    expect(ran.test).toEqual(["plan for #42"])
    // The attempt the dead child opened is closed, not left running forever.
    expect(observed.attempts).toHaveLength(2)
    expect(observed.attempts.every((attempt) => attempt.finished)).toBe(true)
  }, processBudget)

  it("waits for the run already executing the orphan's step instead of running it beside it", async () => {
    const { observed, ran } = await killedDatabase(async (filename) => {
      const entered = Effect.runSync(Deferred.make<void>())
      const release = Effect.runSync(Deferred.make<void>())
      return survive(
        filename,
        "expired",
        (ran) => ({
          plan: (issue) =>
            Effect.sync(() => {
              ran.plan.push(issue)
              return `plan for ${issue}`
            }),
          test: (plan) =>
            Effect.gen(function*() {
              ran.test.push(plan)
              yield* Deferred.succeed(entered, undefined)
              yield* Deferred.await(release)
              return `passed: ${plan}`
            })
        }),
        ({ engine, execute, ran, spans }) =>
          Effect.gen(function*() {
            // The lease has expired, but the sweep has not ticked: the restart
            // reaches `Test` first, and is mid-`Test` when the sweep steals.
            const restarted = yield* Effect.forkScoped(execute(restart))
            yield* Deferred.await(entered)
            // The sweep steals the orphan and its re-drive dispatches `Test`.
            const stolen = yield* until(Effect.sync(() =>
              spans.some((span) =>
                span.name === "FlowEngine.actionExecute" &&
                span.attributes.get("runId") === orphan &&
                span.attributes.get("action") === ReclaimedAttemptFlow.Test.name
              )
            ))
            // Give the dispatch real time to reach the step: a body that runs
            // beside the restart's shows up here.
            for (let turn = 0; turn < 100 && ran.test.length < 2; turn++) yield* pause
            const concurrent = ran.test.length
            yield* Deferred.succeed(release, undefined)
            const result = yield* Fiber.join(restarted)
            yield* until(Effect.map(statusOf(orphan), (status) => status === "completed"))
            return {
              stolen,
              concurrent,
              restarted: result,
              reclaimed: yield* statusOf(orphan),
              result: yield* resultOf(engine, orphan),
              decisions: yield* decisions(orphan),
              attempts: yield* attemptSpans(orphan)
            }
          })
      )
    })

    expect(observed.stolen).toBe(true)
    expect(observed.decisions).toContainEqual(
      expect.objectContaining({ decision: "stolen-and-activated", evidence: "same-host-pid-dead" })
    )
    // Nothing ran beside the restart's `Test`, and nothing ran after it.
    expect(observed.concurrent).toBe(1)
    expect(ran.test).toEqual(["plan for #42"])
    expect(ran.plan).toEqual([])
    expect(observed.restarted).toBe(passed)
    expect(observed.reclaimed).toBe("completed")
    expect(observed.result).toBe(passed)
    expect(observed.attempts).toHaveLength(2)
    expect(observed.attempts.every((attempt) => attempt.finished)).toBe(true)
  }, processBudget)
})
