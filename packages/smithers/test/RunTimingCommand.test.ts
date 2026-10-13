import * as Audience from "@smthrs/build-cli/Audience"
import { Control, type ControlSchema } from "@smthrs/control"
import { Effect, Stream } from "effect"
import { Cli } from "incur"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCli } from "../src/Cli.ts"
import type * as Bridge from "../src/cli/ControlBridge.ts"
import * as RunTiming from "../src/cli/RunTiming.ts"
import { appendRunTiming } from "../src/cli/RunTimingCommand.ts"

const ports = vi.hoisted(() => ({
  read: vi.fn(),
  project: vi.fn(),
  hasRecords: vi.fn(),
  list: vi.fn(),
  watch: vi.fn(),
  reconcile: vi.fn(),
  localRoot: vi.fn()
}))
vi.mock("../src/cli/ControlBridge.ts", async (load) => ({
  ...await load<typeof import("../src/cli/ControlBridge.ts")>(),
  read: ports.read,
  project: ports.project,
  hasRecords: ports.hasRecords
}))
vi.mock("../src/history/History.ts", async (load) => ({
  ...await load<typeof import("../src/history/History.ts")>(),
  reconcile: ports.reconcile
}))
vi.mock("../src/Project.ts", async (load) => ({
  ...await load<typeof import("../src/Project.ts")>(),
  localRoot: ports.localRoot
}))

beforeEach(() => {
  for (const port of Object.values(ports)) port.mockReset()
  ports.read.mockImplementation((effect: Effect.Effect<unknown, unknown, Control.Control>) =>
    Effect.runPromise(
      Effect.gen(function*() {
        const base = yield* Control.Control
        return yield* effect.pipe(
          Effect.provideService(Control.Control, { ...base, list: ports.list, watch: ports.watch })
        )
      }).pipe(Effect.provide(Control.layerNoop))
    )
  )
  ports.project.mockResolvedValue(undefined)
  ports.hasRecords.mockReturnValue(true)
  ports.localRoot.mockImplementation((options) => options.root ?? process.cwd())
  ports.list.mockReturnValue(
    Effect.succeed({
      _tag: "runs",
      items: [{ runId: "run-1", flowId: "demo/ship", status: "completed", createdAt: 0, updatedAt: 9_000 }]
    })
  )
  ports.watch.mockReturnValue(Stream.fromIterable(events))
})

const event = (sequence: number, kind: string, at: number, payload: Record<string, unknown> = {}) =>
  ({ sequence, kind, runId: "run-1", occurredAt: at, payload: { ...payload, at } }) as ControlSchema.ControlEvent

/** Two frames: the second call carries wire timing and leaves the workspace changed. */
const events = [
  event(0, "control.run.running", 0, { runId: "run-1", status: "running" }),
  event(1, "control.agent.turn-opened", 500, { seat: "test:gpt-test" }),
  event(2, "control.agent.model-requested", 500, { frame: 0, attempt: 1, purpose: "frame" }),
  event(3, "control.agent.model-settled", 3_500, {
    durationMillis: 3_000,
    costUsd: 0.01,
    usage: { inputTokens: 1_000, cachedInputTokens: 0, outputTokens: 100, reasoningTokens: 40, totalTokens: 1_100 }
  }),
  event(4, "control.agent.cell-produced", 3_500),
  event(5, "control.agent.cell-call-started", 3_600, { callId: "c1", flowName: "bash" }),
  event(6, "control.agent.cell-call-settled", 3_900, { callId: "c1", flowName: "bash", outcome: "success" }),
  event(7, "control.agent.cell-settled", 4_000),
  event(8, "control.agent.mutation-observed", 4_000, { mutated: false }),
  event(9, "control.agent.turn-closed", 4_000),
  event(10, "control.agent.turn-opened", 4_000, { seat: "test:gpt-test" }),
  event(11, "control.agent.model-requested", 4_000, { frame: 1, attempt: 1, purpose: "frame" }),
  event(12, "control.agent.model-settled", 8_000, {
    durationMillis: 4_000,
    costUsd: 0.02,
    usage: {
      inputTokens: 2_000,
      cachedInputTokens: 1_000,
      outputTokens: 300,
      reasoningTokens: 100,
      totalTokens: 2_300
    },
    timing: {
      attempts: 1,
      signedMs: 4,
      sentMs: 8,
      headersMs: 900,
      firstEventMs: 950,
      firstThinkingMs: 1_000,
      firstOutputMs: 2_500,
      lastOutputMs: 3_900,
      completedMs: 3_950,
      closedMs: 3_990
    }
  }),
  event(13, "control.agent.cell-produced", 8_000),
  event(14, "control.agent.cell-settled", 8_500),
  event(15, "control.agent.mutation-observed", 8_500, { mutated: true }),
  event(16, "control.agent.turn-closed", 8_500),
  event(17, "control.run.completed", 9_000, { runId: "run-1", status: "completed" })
]

const invoke = async (args: Array<string>, tty = false) => {
  const result = { stdout: "", stderr: "", codes: [] as Array<number> }
  const terminal = (key: "stdout" | "stderr") => ({
    isTTY: tty,
    columns: 120,
    write: (text: string) => {
      result[key] += text
    }
  })
  const runtime: Bridge.Runtime = { environment: {}, stdout: terminal("stdout"), stderr: terminal("stderr") }
  const presentation = Audience.fromArguments(args, { env: runtime.environment, stdout: tty, stderr: tty })
  await makeCli({ ...runtime, presentation }).serve(Audience.incurArguments(args, presentation), {
    env: runtime.environment,
    stdout: (text) => {
      result.stdout += text
    },
    exit: (code) => {
      result.codes.push(code)
    }
  })
  return result
}

describe("runs show --timing", { timeout: 120_000 }, () => {
  it("returns the timing report of the requested run as JSON", async () => {
    const result = await invoke(["runs", "show", "run-1", "--timing", "--root", "/fixture", "--json"])
    expect(result.codes).toEqual([])
    expect(ports.list).toHaveBeenCalledExactlyOnceWith({ _tag: "runs", filters: { runId: "run-1" } })
    expect(ports.watch).toHaveBeenCalledExactlyOnceWith({ runId: "run-1", follow: false })
    // The report reads; it never repairs the store it is pointed at.
    expect(ports.reconcile).not.toHaveBeenCalled()
    const report = JSON.parse(result.stdout) as RunTiming.Report
    expect(report).toMatchObject({
      runId: "run-1",
      status: "completed",
      wallMs: 9_000,
      time: { modelMs: 7_000, cellsMs: 1_000, judgeMs: 0, compactionMs: 0, otherMs: 1_000 },
      total: { calls: 2, spent: 3_400 }
    })
    expect(report.calls).toMatchObject([
      { index: 1, frame: 0, durationMs: 3_000, tries: 1, moved: false },
      { index: 2, frame: 1, durationMs: 4_000, waitMs: 1_000, thinkingMs: 1_500, writingMs: 1_400, moved: true }
    ])
    expect(report.calls[1]!.timing).toMatchObject({ signedMs: 4, headersMs: 900, firstOutputMs: 2_500 })
  })

  it("prints a person the table of the same report the JSON carries", async () => {
    const json = await invoke(["runs", "show", "run-1", "--timing", "--json"])
    const human = await invoke(["runs", "show", "run-1", "--timing", "--audience", "human"], true)
    expect(human.codes).toEqual([])
    const printed = human.stdout
    const table = RunTiming.render(JSON.parse(json.stdout) as RunTiming.Report)
    expect(table).toContain("Wait by stage (seconds from the call's start)")
    // Every line of the table rendered from the JSON document is on the terminal.
    for (const line of table.split("\n").filter((entry) => entry.trim() !== "")) expect(printed).toContain(line)
    expect(printed).not.toContain("wallMs")
  })

  it("leaves the run card unchanged without the flag", async () => {
    const result = await invoke(["runs", "show", "run-1", "--json"])
    const card = JSON.parse(result.stdout)
    expect(card).toMatchObject({ runId: "run-1", flowId: "demo/ship", diagnosis: { turns: 2 } })
    expect(card.wallMs).toBeUndefined()
    expect(ports.reconcile).toHaveBeenCalledOnce()
  })

  it("refuses a run the store does not hold, and a project with no store, without reading events", async () => {
    ports.list.mockReturnValue(Effect.succeed({ _tag: "runs", items: [] }))
    const missing = await invoke(["runs", "show", "run-2", "--timing", "--json"])
    expect(missing.codes).toEqual([1])
    expect(JSON.parse(missing.stdout)).toMatchObject({ code: "run_not_found", message: "Unknown run run-2" })
    ports.hasRecords.mockReturnValue(false)
    const empty = await invoke(["runs", "show", "run-1", "--timing", "--json"])
    expect(empty.codes).toEqual([1])
    expect(JSON.parse(empty.stdout)).toMatchObject({ code: "run_not_found", message: "Unknown run run-1" })
    expect(ports.watch).not.toHaveBeenCalled()
  })

  it("counts from the plan's creation when the store holds the plan's events", async () => {
    ports.list.mockReturnValue(
      Effect.succeed({
        _tag: "runs",
        items: [{
          runId: "run-1",
          flowId: "demo/ship",
          planId: "plan-7",
          status: "completed",
          createdAt: 0,
          updatedAt: 9_000
        }]
      })
    )
    ports.watch.mockImplementation(({ runId }: { runId: string }) =>
      Stream.fromIterable(
        runId === "plan:plan-7"
          ? [
            { sequence: 0, kind: "control.plan.created", runId, occurredAt: -5_000, payload: { planId: "plan-7" } },
            { sequence: 1, kind: "control.approval.approved", runId, occurredAt: -2_000, payload: {} }
          ]
          : events
      )
    )
    const result = await invoke(["runs", "show", "run-1", "--timing", "--json"])
    expect(ports.watch.mock.calls.map(([filter]) => filter)).toEqual([
      { runId: "plan:plan-7", follow: false },
      { runId: "run-1", follow: false }
    ])
    const report = JSON.parse(result.stdout) as RunTiming.Report
    // Five seconds passed between planning the run and its first event.
    expect(report).toMatchObject({
      status: "completed",
      wallMs: 14_000,
      time: { modelMs: 7_000, cellsMs: 1_000, judgeMs: 0, compactionMs: 0, otherMs: 6_000 }
    })
    expect(report.frames[0]).toMatchObject({ frame: "start", wallMs: 5_500, otherMs: 5_500 })
    expect(report.calls[0]).toMatchObject({ startMs: 5_500 })
  })

  it("refuses a listing that is not a run listing", async () => {
    ports.list.mockReturnValue(Effect.succeed({ _tag: "flows", items: [] }))
    const result = await invoke(["runs", "show", "run-1", "--timing", "--json"])
    expect(result.codes).toEqual([1])
    expect(result.stdout).toContain("Unknown run run-1")
  })

  it("mounts only on a runs group that has the status command", () => {
    expect(() => appendRunTiming(Cli.create("runs"))).toThrow("runs show is not registered")
  })

  it("lists the flag where the status command is discovered", async () => {
    const help = await invoke(["runs", "show", "--help"])
    expect(help.stdout).toMatch(/^ +--timing\b/m)
  })
})
