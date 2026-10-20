// `terminal/Open` (worker/flows/TerminalOpen.ts, docs/features/branch-workspace.md#opening-a-terminal) on the Node host
// (worker/test/flowHost.ts) and as its steps alone, over this file's schema of the compose Postgres (`pnpm db:up`). The
// branch's machine is a test `Sandboxes`, standing in for the Cloudflare `SandboxObject` (worker/BranchSandboxes.ts),
// whose real container the e2e suite drives (e2e/branch-workspace.spec.ts).
import { Logger as StructuredLogger } from "@smthrs/observability"
import { Cause, Effect, Exit, Layer, Logger, Metric } from "effect"
import { SqlClient } from "effect/sql"
import { beforeEach, describe, expect, test } from "vitest"
import * as TestDatabase from "../../db/TestDatabase.ts"
import { OPEN_DEADLINE_SECONDS } from "../../src/features/terminal/contract.ts"
import { CheckoutFailed, type SandboxBranch, Sandboxes, SandboxUnavailable } from "../branch/Sandboxes.ts"
import { resetBranches, terminal, terminalRows, tracked } from "../test/branch.ts"
import { runFlow } from "../test/flowHost.ts"
import { testFile } from "../test/harness.ts"
import * as TerminalOpen from "./TerminalOpen.ts"

const runtime = testFile("terminal_open")
beforeEach(() => resetBranches(runtime))

const REPO = "github/octocat/spoon-knife"
const OWNER = "person-owner"

type Wake = Sandboxes["Service"]["wake"]
type Session = Sandboxes["Service"]["session"]

/** A branch's machine that answers each call from its script, in order, recording every call. */
const machine = (wakes: ReadonlyArray<ReturnType<Wake>>, sessions: ReadonlyArray<ReturnType<Session>> = []) => {
  const calls: Array<string> = []
  let woke = 0
  let started = 0
  const service = Sandboxes.of({
    wake: (branch) =>
      Effect.suspend(() => {
        calls.push(`wake ${branch.branchId} ${branch.owner}/${branch.name}@${branch.branch}`)
        return wakes[Math.min(woke++, wakes.length - 1)]!
      }),
    session: (branchId, terminalId, ownerId) =>
      Effect.suspend(() => {
        calls.push(`session ${branchId} ${terminalId} ${ownerId}`)
        return sessions[Math.min(started++, sessions.length - 1)] ?? Effect.void
      }),
  })
  return { calls, layer: Layer.succeed(Sandboxes, service) }
}

/** A tracked branch with an `opening` terminal of `OWNER`, created `ageSeconds` ago: what the flow is started for. */
const opening = async (ageSeconds = 0) => {
  const { branchId } = await tracked(runtime, REPO, `b-${crypto.randomUUID().slice(0, 8)}`)
  const terminalId = crypto.randomUUID()
  await terminal(runtime, { id: terminalId, branchId, ownerId: OWNER, status: "opening", ageSeconds })
  const branch: SandboxBranch = { branchId, owner: "octocat", name: "Spoon-Knife", branch: "test-branch" }
  return { branchId, terminalId, branch }
}

const database = () => runtime.runPromise(Effect.map(Effect.service(TestDatabase.Scratch), (scratch) => scratch.database))

const run = async (
  started: Awaited<ReturnType<typeof opening>>,
  sandboxes: ReturnType<typeof machine>,
) =>
  runFlow(
    TerminalOpen.TerminalOpen,
    { terminalId: started.terminalId, ownerId: OWNER, branch: started.branch },
    TerminalOpen.registration(await database()).pipe(Layer.provide(sandboxes.layer)),
  )

const row = async (branchId: string) => (await terminalRows(runtime, branchId))[0]!

describe("terminal/Open on the Node host", () => {
  test("wakes the branch's machine, starts the owner's session and records the terminal open on that generation", async () => {
    const started = await opening()
    const sandboxes = machine([Effect.succeed({ generation: 3 })])
    const ran = await run(started, sandboxes)
    expect(ran.exit).toEqual(Exit.succeed({ recorded: true }))
    expect(ran.status).toBe("completed")
    expect(sandboxes.calls).toEqual([
      `wake ${started.branchId} octocat/Spoon-Knife@test-branch`,
      `session ${started.branchId} ${started.terminalId} ${OWNER}`,
    ])
    expect(await row(started.branchId)).toMatchObject({ status: "open", generation: "3", failure: null, ended: false })
  })

  test("a machine that can't start yet is woken again, and the terminal opens", async () => {
    const started = await opening()
    const sandboxes = machine([
      Effect.fail(new SandboxUnavailable({ reason: "start" })),
      Effect.succeed({ generation: 1 }),
    ])
    const ran = await run(started, sandboxes)
    expect(ran.exit).toEqual(Exit.succeed({ recorded: true }))
    expect(sandboxes.calls.filter((call) => call.startsWith("wake"))).toHaveLength(2)
    expect(await row(started.branchId)).toMatchObject({ status: "open", generation: "1" })
  }, 30_000)

  test("a refused checkout isn't retried: the terminal fails as `checkout` and no session starts", async () => {
    const started = await opening()
    const sandboxes = machine([Effect.fail(new CheckoutFailed())])
    const ran = await run(started, sandboxes)
    expect(ran.exit).toEqual(Exit.succeed({ recorded: true }))
    expect(sandboxes.calls).toEqual([`wake ${started.branchId} octocat/Spoon-Knife@test-branch`])
    expect(await row(started.branchId)).toMatchObject({ status: "failed", failure: "checkout", ended: true })
  })

  test("an open that settles past the deadline fails the terminal as `unavailable`", async () => {
    const started = await opening(OPEN_DEADLINE_SECONDS + 5)
    const ran = await run(started, machine([Effect.succeed({ generation: 2 })]))
    expect(ran.exit).toEqual(Exit.succeed({ recorded: true }))
    expect(await row(started.branchId)).toMatchObject({
      status: "failed",
      failure: "unavailable",
      generation: "2",
      ended: true,
    })
  })

  test("a terminal no longer opening is left as it is", async () => {
    const { branchId } = await tracked(runtime, REPO, "settled")
    const terminalId = crypto.randomUUID()
    await terminal(runtime, { id: terminalId, branchId, ownerId: OWNER, status: "ended" })
    const ran = await run(
      { branchId, terminalId, branch: { branchId, owner: "octocat", name: "Spoon-Knife", branch: "settled" } },
      machine([Effect.succeed({ generation: 9 })]),
    )
    expect(ran.exit).toEqual(Exit.succeed({ recorded: false }))
    expect(await row(branchId)).toMatchObject({ status: "ended", generation: null })
  })
})

/** Runs `effect` with a logger and metric registry of its own: its result, log lines and the opens it counted. */
const observed = async <A, E>(effect: Effect.Effect<A, E>) => {
  const lines: Array<ReturnType<typeof StructuredLogger.formatStructured.log>> = []
  const logger = Logger.make((options) => void lines.push(StructuredLogger.formatStructured.log(options)))
  const registry: Metric.MetricRegistry = new Map()
  const exit = await Effect.runPromiseExit(
    effect.pipe(
      Effect.provideService(Logger.CurrentLoggers, new Set([logger])),
      Effect.provideService(Metric.MetricRegistry, registry),
    ),
  )
  const opens = (outcome: string) =>
    Effect.runSync(
      Metric.value(Metric.withAttributes(TerminalOpen.opens, { outcome })).pipe(
        Effect.provideService(Metric.MetricRegistry, registry),
      ),
    ).count
  return { exit, lines, opens }
}

describe("the steps", () => {
  test("wake logs the generation it woke, or the failure's code, by branch", async () => {
    const steps = TerminalOpen.steps(await database())
    const branch: SandboxBranch = { branchId: "b-1", owner: "octocat", name: "Spoon-Knife", branch: "main" }
    const woke = await observed(
      steps.wake({ branch }).pipe(Effect.provide(machine([Effect.succeed({ generation: 4 })]).layer)),
    )
    expect(woke.exit).toEqual(Exit.succeed({ generation: 4 }))
    expect(woke.lines).toMatchObject([
      { message: "terminal.open.wake", level: "INFO", annotations: { branchId: "b-1", generation: 4 } },
    ])

    const refused = await observed(
      steps.wake({ branch }).pipe(Effect.provide(machine([Effect.fail(new CheckoutFailed())]).layer)),
    )
    expect(Exit.isFailure(refused.exit) && Cause.squash(refused.exit.cause)).toEqual(new CheckoutFailed())
    expect(refused.lines).toHaveLength(1)
    expect(refused.lines[0]).toMatchObject({ message: "terminal.open.wake", level: "WARN" })
    expect(refused.lines[0]!.annotations).toMatchObject({ branchId: "b-1" })
    expect(refused.lines[0]!.annotations).toHaveProperty("errorCode")
  })

  test("a session the machine can't start fails the step for the engine to retry", async () => {
    const steps = TerminalOpen.steps(await database())
    const sandboxes = machine([], [Effect.fail(new SandboxUnavailable({ reason: "exec" }))])
    const exit = await Effect.runPromiseExit(
      steps.session({ branchId: "b-1", terminalId: crypto.randomUUID(), ownerId: OWNER, generation: 1 }).pipe(
        Effect.provide(sandboxes.layer),
      ),
    )
    expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toEqual(new SandboxUnavailable({ reason: "exec" }))
  })

  test("failed names the machine's failure: `checkout` for a refused clone, else `unavailable`", async () => {
    const steps = TerminalOpen.steps(await database())
    expect(await Effect.runPromise(steps.failed({ error: new CheckoutFailed() }))).toEqual({
      status: "failed",
      failure: "checkout",
    })
    for (const reason of ["start", "exec"] as const) {
      expect(await Effect.runPromise(steps.failed({ error: new SandboxUnavailable({ reason }) }))).toEqual({
        status: "failed",
        failure: "unavailable",
      })
    }
  })

  test("settle counts and logs an outcome it recorded, and only logs one it didn't", async () => {
    const steps = TerminalOpen.steps(await database())
    const opened = await opening()
    const open = await observed(steps.settle({ terminalId: opened.terminalId, outcome: { status: "open", generation: 1 } }))
    expect(open.exit).toEqual(Exit.succeed({ recorded: true }))
    expect(open.opens("open")).toBe(1)
    expect(open.lines).toMatchObject([
      {
        message: "terminal.open",
        level: "INFO",
        annotations: { terminalId: opened.terminalId, outcome: "open", recorded: true },
      },
    ])

    const failed = await opening()
    const refused = await observed(
      steps.settle({ terminalId: failed.terminalId, outcome: { status: "failed", failure: "checkout" } }),
    )
    expect(refused.exit).toEqual(Exit.succeed({ recorded: true }))
    expect(refused.opens("checkout")).toBe(1)
    expect(refused.lines).toMatchObject([
      { message: "terminal.open", level: "WARN", annotations: { outcome: "checkout", recorded: true } },
    ])
    expect(await row(failed.branchId)).toMatchObject({ status: "failed", failure: "checkout", ended: true })

    // The same outcome again finds the row settled: nothing counted, the line says so.
    const again = await observed(
      steps.settle({ terminalId: failed.terminalId, outcome: { status: "failed", failure: "checkout" } }),
    )
    expect(again.exit).toEqual(Exit.succeed({ recorded: false }))
    expect(again.opens("checkout")).toBe(0)
    expect(again.lines).toMatchObject([{ message: "terminal.open", annotations: { recorded: false } }])
  })

  test("settle fails as RecordUnavailable when Postgres can't be reached, for the engine to retry", async () => {
    const steps = TerminalOpen.steps(Layer.effect(SqlClient.SqlClient, Effect.fail(new Error("connection refused"))))
    const exit = await Effect.runPromiseExit(
      steps.settle({ terminalId: crypto.randomUUID(), outcome: { status: "open", generation: 1 } }),
    )
    expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toBeInstanceOf(TerminalOpen.RecordUnavailable)
  })
})
