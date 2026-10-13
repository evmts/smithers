import type { ControlSchema } from "@smthrs/control"
import { describe, expect, it } from "vitest"
import * as RunTiming from "../src/cli/RunTiming.ts"

/** Builds a run's watch stream, one sequence per event, stamped as the journal stamps them. */
const journal = () => {
  const events: Array<ControlSchema.ControlEvent> = []
  const push = (kind: string, at: number, payload: Record<string, unknown> = {}, stamped = true) => {
    events.push({
      sequence: events.length,
      kind,
      runId: "run-1" as ControlSchema.ControlEvent["runId"],
      occurredAt: at,
      payload: (stamped ? { ...payload, at } : payload) as ControlSchema.ControlEvent["payload"]
    })
  }
  const agent = (name: string, at: number, payload: Record<string, unknown> = {}) =>
    push(`control.agent.${name}`, at, payload)
  return {
    events,
    push,
    agent,
    run: (status: string, at: number) => push(`control.run.${status}`, at, { runId: "run-1", status }, false),
    spend: (at: number, stepKey: string, spent: number, costUsd: number, more: Record<string, unknown> = {}) =>
      push("flows.agent.usage.v1", at, { stepKey, spent, costUsd, costSource: "estimated", ...more }, false),
    requested: (at: number, frame: number, more: Record<string, unknown> = {}) =>
      agent("model-requested", at, { frame, attempt: 1, purpose: "frame", modelId: "gpt-test", ...more }),
    settled: (
      at: number,
      durationMillis: number,
      usage: readonly [input: number, cached: number, output: number, reasoning: number],
      costUsd: number,
      more: Record<string, unknown> = {}
    ) =>
      agent("model-settled", at, {
        durationMillis,
        costUsd,
        usage: {
          inputTokens: usage[0],
          cachedInputTokens: usage[1],
          outputTokens: usage[2],
          reasoningTokens: usage[3],
          totalTokens: usage[0] + usage[2]
        },
        ...more
      })
  }
}

const jev = (input: number, output: number) => ({ inputTokens: input, outputTokens: output, modelId: "jev" })

/**
 * One run in today's journal shape, with none of the fields the observability
 * lanes add: three frames, a re-ask, a compaction whose summary call never
 * settles, a transport retry, and every kind of judge reading.
 */
const oldShape = () => {
  const j = journal()
  j.run("accepted", 0)
  j.run("running", 100)
  j.spend(790, "boundary-usage/a", 1_000, 0.001)
  j.agent("decision-settled", 800, {
    frame: 0,
    classifier: "relevance/unnecessary",
    latencyMs: 600,
    usage: jev(950, 50)
  })
  j.agent("relevance-settled", 800, { frame: 0, latencyMs: 600, usage: jev(950, 50) })
  // Frame 0: one call, one cell with one flow call, the workspace unchanged.
  j.agent("turn-opened", 1_000, { seat: "test:gpt-test" })
  j.requested(1_000, 0)
  j.spend(10_990, "key1_a", 1_200, 0.01)
  j.settled(11_000, 10_000, [1_000, 0, 200, 50], 0.01)
  j.agent("cell-produced", 11_000)
  j.agent("cell-call-started", 11_100, { callId: "c1", flowName: "bash" })
  j.agent("cell-call-settled", 11_600, { callId: "c1", flowName: "bash", outcome: "success" })
  j.agent("cell-settled", 12_000, { outcome: { _tag: "settled", transition: { _tag: "continue" } } })
  j.agent("mutation-observed", 12_000, { mutated: false, basis: "observed" })
  j.agent("turn-closed", 12_000, { outcome: "continue" })
  // Frame 1: the judge reads frame 0 beside the call; the reply is rejected and asked again.
  j.agent("turn-opened", 12_000, { seat: "test:gpt-test" })
  j.requested(12_000, 1)
  j.spend(12_390, "boundary-usage/b", 500, 0.0005)
  j.agent("decision-settled", 12_400, { frame: 0, classifier: "supervisor/turn", latencyMs: 300, acted: false })
  j.agent("supervisor-settled", 12_400, {
    frame: 0,
    latencyMs: 300,
    crossed: false,
    nudged: false,
    usage: jev(450, 50)
  })
  j.spend(31_990, "key1_b", 2_400, 0.02)
  j.settled(32_000, 20_000, [2_000, 1_000, 400, 100], 0.02)
  j.agent("cell-rejected-in-frame", 32_000, { attempt: 1, code: "compile_failed" })
  j.requested(32_000, 1, { attempt: 2 })
  j.spend(46_990, "key1_c", 2_800, 0.015)
  j.settled(47_000, 15_000, [2_500, 2_000, 300, 0], 0.015)
  j.agent("cell-produced", 47_000)
  j.agent("cell-call-started", 47_200, { callId: "c2", flowName: "bash" })
  j.agent("cell-call-settled", 49_200, { callId: "c2", flowName: "bash", outcome: "success" })
  j.agent("cell-settled", 50_000, { outcome: { _tag: "settled", transition: { _tag: "continue" } } })
  j.agent("mutation-observed", 50_000, { mutated: true, basis: "observed" })
  j.agent("turn-closed", 50_000, { outcome: "continue" })
  // Compaction before frame 2: its summary call is requested and never settled.
  j.requested(50_000, 2, { purpose: "compaction" })
  j.spend(50_340, "boundary-usage/c", 600, 0.0006)
  j.agent("decision-settled", 50_350, { frame: 1, classifier: "supervisor/turn", latencyMs: 250, acted: true })
  j.agent("decision-settled", 50_350, { frame: 1, classifier: "compaction/marks", latencyMs: 200, usage: jev(40, 10) })
  j.agent("supervisor-settled", 50_350, {
    frame: 1,
    latencyMs: 250,
    crossed: true,
    nudged: true,
    monitors: [{ id: "supervisor", kind: "lint", crossed: true, p: 0.9 }],
    usage: jev(500, 50)
  })
  j.spend(59_900, "key1_d", 900, 0.009)
  j.agent("compaction-settled", 60_000, { marks: { kept: 1, squashed: 2, removed: 0 }, removedTokens: "[REDACTED]" })
  // Frame 2: one transport retry, a cell with no calls, then the completion claim.
  j.agent("turn-opened", 60_000, { seat: "test:gpt-test" })
  j.requested(60_000, 2)
  j.agent("model-retried", 62_000, { attempt: 1, code: "transport", delayMillis: 900 })
  j.spend(89_990, "key1_e", 4_000, 0.04)
  j.settled(90_000, 30_000, [3_000, 0, 1_000, 500], 0.04)
  j.agent("cell-produced", 90_000)
  j.agent("cell-settled", 90_500, { outcome: { _tag: "settled", transition: { _tag: "complete" } } })
  j.agent("mutation-observed", 90_500, { mutated: false, basis: "observed" })
  j.spend(91_490, "boundary-usage/d", 2_000, 0.002)
  j.agent("claim-demanded", 91_500, { latencyMs: 1_000, demanded: false, refused: false, usage: jev(1_900, 100) })
  j.agent("decision-settled", 91_500, { frame: 2, classifier: "completion/claim", latencyMs: 1_000, acted: false })
  j.agent("turn-closed", 91_500, { outcome: "resolved" })
  j.agent("resolved", 91_500, { text: "done" })
  // The status monitor and the gateway keepalive observe a run; neither is part of it.
  j.push("control.status.observed", 500_000, {}, false)
  j.run("completed", 92_000)
  return j.events
}

const sum = (values: ReadonlyArray<number>) => values.reduce((total, value) => total + value, 0)

describe("RunTiming.fold", () => {
  it("splits the run's wall time into model, cells, judge, compaction and other, summing to the run", () => {
    const report = RunTiming.fold(oldShape(), "run-1")
    expect(report.runId).toBe("run-1")
    expect(report.status).toBe("completed")
    expect(report.wallMs).toBe(92_000)
    // A judge reading that settles beside a model call or a compaction holds
    // the run up for nothing, so only the relevance read and the claim count.
    expect(report.time).toEqual({ modelMs: 75_000, cellsMs: 4_500, judgeMs: 1_600, compactionMs: 10_000, otherMs: 900 })
    expect(sum(Object.values(report.time))).toBe(report.wallMs)
  })

  it("splits each frame the same way, the frames summing to the run", () => {
    const report = RunTiming.fold(oldShape(), "run-1")
    expect(report.frames).toEqual([
      {
        frame: "start",
        wallMs: 1_000,
        modelMs: 0,
        modelCalls: 0,
        cellsMs: 0,
        cellCalls: 0,
        judgeMs: 600,
        compactionMs: 0,
        otherMs: 400
      },
      {
        frame: 0,
        wallMs: 11_000,
        modelMs: 10_000,
        modelCalls: 1,
        cellsMs: 1_000,
        cellCalls: 1,
        judgeMs: 0,
        compactionMs: 0,
        otherMs: 0
      },
      {
        frame: 1,
        wallMs: 38_000,
        modelMs: 35_000,
        modelCalls: 2,
        cellsMs: 3_000,
        cellCalls: 1,
        judgeMs: 0,
        compactionMs: 0,
        otherMs: 0
      },
      // The compaction's own summary call is compaction time, not model wait.
      {
        frame: 2,
        wallMs: 41_500,
        modelMs: 30_000,
        modelCalls: 1,
        cellsMs: 500,
        cellCalls: 0,
        judgeMs: 1_000,
        compactionMs: 10_000,
        otherMs: 0
      },
      {
        frame: "end",
        wallMs: 500,
        modelMs: 0,
        modelCalls: 0,
        cellsMs: 0,
        cellCalls: 0,
        judgeMs: 0,
        compactionMs: 0,
        otherMs: 500
      }
    ])
    for (const key of ["modelMs", "cellsMs", "judgeMs", "compactionMs", "otherMs"] as const) {
      expect(sum(report.frames.map((frame) => frame[key])), key).toBe(report.time[key])
    }
    expect(sum(report.frames.map((frame) => frame.wallMs))).toBe(report.wallMs)
  })

  it("lists every model call, a re-ask and an unsettled call as rows of their own", () => {
    const report = RunTiming.fold(oldShape(), "run-1")
    expect(
      report.calls.map((
        call
      ) => [call.index, call.frame, call.ask, call.purpose, call.startMs, call.durationMs, call.settled])
    )
      .toEqual([
        [1, 0, 1, "frame", 1_000, 10_000, true],
        [2, 1, 1, "frame", 12_000, 20_000, true],
        [3, 1, 2, "frame", 32_000, 15_000, true],
        // Requested, never settled: its elapsed time runs to the compaction that ended it.
        [4, 2, 1, "compaction", 50_000, 10_000, false],
        [5, 2, 1, "frame", 60_000, 30_000, true]
      ])
    expect(report.calls[1]).toMatchObject({
      usage: { input: 2_000, cached: 1_000, uncached: 1_000, thinking: 100, written: 300 },
      spent: 2_400,
      cacheShare: 0.5,
      costUsd: 0.02,
      tries: 1,
      rejected: "compile_failed",
      moved: false
    })
    expect(report.calls[2]).toMatchObject({ moved: true, tries: 1 })
    // The ledger is the only record of what an unsettled call spent.
    expect(report.calls[3]).toMatchObject({ spent: 900, costUsd: 0.009 })
    expect(report.calls[3]!.usage).toBeUndefined()
    expect(report.calls[3]!.moved).toBeUndefined()
    // One model-retried record inside the call is a second try of the same call.
    expect(report.calls[4]).toMatchObject({ tries: 2, moved: false })
    // Nothing in this journal says when a first token arrived.
    for (const call of report.calls) {
      expect(call.waitMs).toBeUndefined()
      expect(call.thinkingMs).toBeUndefined()
      expect(call.writingMs).toBeUndefined()
      expect(call.stages).toBeUndefined()
      expect(call.timing).toBeUndefined()
    }
  })

  it("totals tokens and cost by purpose, the purposes summing to the run's ledger", () => {
    const report = RunTiming.fold(oldShape(), "run-1")
    const rows = Object.fromEntries(report.spend.map((row) => [row.purpose, row]))
    expect(Object.keys(rows)).toEqual(["frame", "compaction", "judge", "marks", "claim", "relevance"])
    expect(rows.frame).toEqual({
      purpose: "frame",
      calls: 4,
      input: 8_500,
      cached: 3_000,
      uncached: 5_500,
      thinking: 650,
      written: 1_250,
      spent: 10_400,
      costUsd: expect.closeTo(0.085, 12)
    })
    expect(rows.compaction).toEqual({ purpose: "compaction", calls: 1, spent: 900, costUsd: 0.009 })
    expect(rows.judge).toMatchObject({ calls: 2, input: 950, written: 100, spent: 1_050 })
    expect(rows.marks).toMatchObject({ calls: 1, input: 40, written: 10, spent: 50 })
    expect(rows.claim).toMatchObject({ calls: 1, input: 1_900, written: 100, spent: 2_000, costUsd: 0.002 })
    expect(rows.relevance).toMatchObject({ calls: 1, input: 950, written: 50, spent: 1_000, costUsd: 0.001 })
    // One ledger entry paid for a judge reading and a marks reading together.
    expect(rows.judge!.costUsd).toBeCloseTo(0.0005 + 0.0006 * 550 / 600, 12)
    expect(rows.marks!.costUsd).toBeCloseTo(0.0006 * 50 / 600, 12)
    expect(report.total).toMatchObject({ calls: 10, spent: 15_400 })
    expect(sum(report.spend.map((row) => row.spent))).toBe(report.total.spent)
    expect(sum(report.spend.map((row) => row.costUsd))).toBeCloseTo(report.total.costUsd, 12)
    expect(report.total.costUsd).toBeCloseTo(0.0981, 12)
    expect(report.ledger).toEqual({ entries: 9, spent: 15_400, costUsd: expect.closeTo(0.0981, 12) })
    expect(report.cacheShare).toBeCloseTo(3_000 / 8_500, 12)
  })

  it("counts the calls that moved nothing, each compaction, and each judge reading that fired", () => {
    const report = RunTiming.fold(oldShape(), "run-1")
    expect(report.unmoved).toEqual({ calls: 3, durationMs: 60_000, spent: 7_600 })
    expect(report.compactions).toEqual([
      { frame: 2, startMs: 50_000, durationMs: 10_000, marks: { kept: 1, squashed: 2, removed: 0 }, spent: 900 }
    ])
    expect(report.judge.readings).toBe(5)
    expect(report.judge.latencyMs).toBe(600 + 300 + 250 + 200 + 1_000)
    expect(report.judge.fired).toEqual([
      { frame: 1, purpose: "judge", startMs: 50_100, latencyMs: 250, fired: ["supervisor", "nudged"] }
    ])
  })

  it("names every number it derived instead of reading", () => {
    const report = RunTiming.fold(oldShape(), "run-1")
    expect(report.derived.map((entry) => entry.field)).toEqual([
      "time",
      "frames",
      "call tries",
      "call moved",
      "unsettled call total",
      "unsettled call tokens",
      "reading cost",
      "compaction total",
      "judge fired"
    ])
    for (const entry of report.derived) expect(entry.from.length).toBeGreaterThan(0)
  })

  it("reads wire timing, purpose and tries from a call that carries them", () => {
    const j = journal()
    j.run("running", 0)
    j.agent("turn-opened", 0)
    j.requested(0, 0)
    j.agent("model-retried", 1_000, { attempt: 1, code: "transport", delayMillis: 100 })
    j.settled(10_000, 10_000, [1_000, 800, 400, 300], 0.01, {
      purpose: "frame",
      servedTier: "priority",
      timing: {
        startedAt: 1_791_000_000_000,
        attempts: 3,
        requestBytes: 12_345,
        preparedMs: 3,
        signedMs: 5,
        sentMs: 9,
        headersMs: 2_100,
        firstEventMs: 2_150,
        firstThinkingMs: 2_300,
        firstOutputMs: 7_400,
        lastOutputMs: 9_800,
        completedMs: 9_900,
        closedMs: 9_950,
        failedTries: [{ sentMs: 4, failedMs: 600, code: "transport" }, {
          failedMs: 1_900,
          code: "rate_limit",
          httpStatus: 429
        }]
      }
    })
    j.run("completed", 10_000)
    const [call] = RunTiming.fold(j.events, "run-1").calls
    expect(call).toMatchObject({
      purpose: "frame",
      // Two tries by the harness, the answered one taking three on the wire.
      tries: 4,
      failedTries: [{ sentMs: 4, failedMs: 600, code: "transport" }, {
        failedMs: 1_900,
        code: "rate_limit",
        httpStatus: 429
      }],
      waitMs: 2_300,
      thinkingMs: 5_100,
      writingMs: 2_400,
      requestBytes: 12_345,
      servedTier: "priority",
      timing: {
        preparedMs: 3,
        signedMs: 5,
        sentMs: 9,
        headersMs: 2_100,
        firstEventMs: 2_150,
        firstThinkingMs: 2_300,
        firstOutputMs: 7_400,
        lastOutputMs: 9_800,
        completedMs: 9_900,
        closedMs: 9_950
      }
    })
  })

  it("leaves a stage out when the wire did not see it", () => {
    const j = journal()
    j.run("running", 0)
    j.requested(0, 0)
    // No thinking event, and a terminal event straight after the first output.
    j.settled(5_000, 5_000, [100, 0, 10, 0], 0, {
      timing: {
        attempts: 1,
        signedMs: 1,
        sentMs: 2,
        headersMs: 900,
        firstEventMs: 950,
        firstOutputMs: 4_000,
        completedMs: 4_900
      }
    })
    j.run("completed", 5_000)
    const [call] = RunTiming.fold(j.events, "run-1").calls
    expect(call!.waitMs).toBe(4_000)
    expect(call!.thinkingMs).toBeUndefined()
    // Without a last-output stamp the writing runs to the provider's terminal event.
    expect(call!.writingMs).toBe(900)
    expect(call!.stages).toBeUndefined()
    expect(call!.timing).toEqual({
      signedMs: 1,
      sentMs: 2,
      headersMs: 900,
      firstEventMs: 950,
      firstOutputMs: 4_000,
      completedMs: 4_900
    })
  })

  it("shows a call the run died inside as unsettled, with its elapsed time", () => {
    const j = journal()
    j.run("running", 0)
    j.agent("turn-opened", 1_000)
    j.requested(1_000, 0)
    j.push("control.run.failed", 9_000, { runId: "run-1", status: "failed", cause: "boom" }, false)
    const report = RunTiming.fold(j.events, "run-1")
    expect(report.status).toBe("failed")
    expect(report.calls).toMatchObject([{
      frame: 0,
      purpose: "frame",
      settled: false,
      startMs: 1_000,
      durationMs: 8_000
    }])
    expect(report.time).toEqual({ modelMs: 8_000, cellsMs: 0, judgeMs: 0, compactionMs: 0, otherMs: 1_000 })
  })

  it("renders a journal older than frame numbers, purposes, durations and the ledger", () => {
    const j = journal()
    j.push("control.run.running", 0, { runId: "run-1", status: "running" }, false)
    j.push("control.agent.turn-opened", 100, { seat: "old:seat" }, false)
    j.push("control.agent.model-requested", 100, {}, false)
    j.push("control.agent.model-settled", 4_100, { usage: { inputTokens: 10, outputTokens: 5 } }, false)
    j.push("control.agent.cell-call-started", 4_200, { flowName: "bash" }, false)
    j.push("control.agent.cell-call-settled", 5_200, { flowName: "bash", outcome: "success" }, false)
    j.push("control.agent.turn-closed", 5_300, {}, false)
    j.push("control.agent.turn-opened", 5_300, { seat: "old:seat" }, false)
    j.push("control.agent.model-requested", 5_300, {}, false)
    j.push("control.agent.model-settled", 6_300, { usage: { inputTokens: 20, outputTokens: 5 } }, false)
    j.push("control.run.completed", 6_400, { runId: "run-1", status: "completed" }, false)
    const report = RunTiming.fold(j.events, "run-1")
    expect(report.calls).toMatchObject([
      {
        frame: 0,
        ask: 1,
        purpose: "frame",
        startMs: 100,
        durationMs: 4_000,
        usage: { input: 10, cached: 0, uncached: 10, thinking: 0, written: 5 }
      },
      { frame: 1, ask: 1, purpose: "frame", startMs: 5_300, durationMs: 1_000 }
    ])
    // A flow call outside any recorded cell is still cell time.
    expect(report.time).toEqual({ modelMs: 5_000, cellsMs: 1_000, judgeMs: 0, compactionMs: 0, otherMs: 400 })
    expect(report.total).toMatchObject({ calls: 2, spent: 40, costUsd: 0 })
    expect(report.ledger).toBeUndefined()
    expect(report.derived.map((entry) => entry.field)).toEqual(expect.arrayContaining(["call frame", "call total"]))
    expect(() => RunTiming.render(report)).not.toThrow()
  })

  it("reads a labelled ledger without counting a spend twice, whichever side of its record it lands", () => {
    const j = journal()
    j.run("running", 0)
    j.requested(0, 0)
    j.settled(5_000, 5_000, [1_000, 0, 200, 50], 0.01)
    // Journaled after the settle it belongs to, and labelled.
    j.spend(5_010, "key1_a", 1_200, 0.01, { purpose: "frame" })
    j.agent("supervisor-settled", 5_300, { frame: 0, latencyMs: 200, usage: jev(400, 100) })
    j.agent("decision-settled", 5_300, { frame: 0, classifier: "compaction/marks", latencyMs: 150, usage: jev(90, 10) })
    // One entry after the two readings it paid for.
    j.spend(5_310, "boundary-usage/a", 600, 0.0006, { purpose: "judge" })
    // A labelled spend no call or reading record explains keeps its purpose.
    j.spend(5_400, "boundary-usage/b", 70, 0.0001, { purpose: "claim" })
    j.run("completed", 6_000)
    const report = RunTiming.fold(j.events, "run-1")
    expect(report.spend.map((row) => [row.purpose, row.calls, row.spent])).toEqual([
      ["frame", 1, 1_200],
      ["judge", 1, 500],
      ["marks", 1, 100],
      ["claim", 0, 70]
    ])
    expect(report.spend[1]!.costUsd).toBeCloseTo(0.0005, 12)
    expect(report.spend[2]!.costUsd).toBeCloseTo(0.0001, 12)
    expect(report.total).toMatchObject({ calls: 3, spent: 1_870 })
    expect(report.ledger).toMatchObject({ entries: 3, spent: 1_870 })
    expect(report.total.costUsd).toBeCloseTo(report.ledger!.costUsd, 12)
  })

  it("files ledger spend no record explains as unattributed, so the purposes still sum to the ledger", () => {
    const j = journal()
    j.run("running", 0)
    j.requested(0, 0)
    j.spend(4_990, "key1_a", 1_200, 0.01)
    j.settled(5_000, 5_000, [1_000, 0, 200, 50], 0.01)
    j.spend(5_500, "key1_orphan", 300, 0.003)
    j.spend(5_600, "boundary-usage/orphan", 40, 0.0004)
    j.run("completed", 6_000)
    const report = RunTiming.fold(j.events, "run-1")
    expect(report.spend).toMatchObject([
      { purpose: "frame", calls: 1, spent: 1_200 },
      { purpose: "unattributed", calls: 0, spent: 340 }
    ])
    expect(report.total.spent).toBe(report.ledger!.spent)
    expect(report.total.costUsd).toBeCloseTo(report.ledger!.costUsd, 12)
  })

  it("counts a call whose request record the journal never kept", () => {
    const j = journal()
    j.run("running", 0)
    j.agent("turn-opened", 1_000)
    j.settled(5_000, 4_000, [1_000, 0, 200, 50], 0.01)
    j.run("completed", 6_000)
    const report = RunTiming.fold(j.events, "run-1")
    expect(report.calls).toMatchObject([{
      frame: 0,
      purpose: "frame",
      startMs: 1_000,
      durationMs: 4_000,
      settled: true
    }])
    expect(report.time.modelMs).toBe(4_000)
  })

  it("reads what a judge reading fired, did and cost from a reading that records them", () => {
    const j = journal()
    j.run("running", 0)
    j.requested(0, 0)
    j.spend(4_990, "key1_a", 1_200, 0.01)
    j.settled(5_000, 5_000, [1_000, 0, 200, 50], 0.01)
    j.spend(5_290, "boundary-usage/a", 600, 0.0009)
    j.agent("supervisor-settled", 5_300, {
      frame: 0,
      latencyMs: 200,
      crossed: false,
      nudged: false,
      triggers: ["outdated_context", "irrelevant_context"],
      compact: ["outdated_context"],
      costUsd: 0.0004,
      usage: jev(400, 100)
    })
    j.agent("decision-settled", 5_300, { frame: 0, classifier: "compaction/marks", latencyMs: 150, usage: jev(90, 10) })
    j.spend(6_290, "boundary-usage/b", 400, 0.0003)
    j.agent("supervisor-settled", 6_300, {
      frame: 1,
      latencyMs: 200,
      triggers: ["outdated_context"],
      compactSuppressed: "floor",
      costUsd: 0.0003,
      usage: jev(300, 100)
    })
    j.spend(7_290, "boundary-usage/c", 40, 0)
    // No trigger fired, and a monitor still nudged the run.
    j.agent("supervisor-settled", 7_300, { frame: 2, latencyMs: 200, triggers: [], nudged: true, usage: jev(10, 10) })
    j.agent("supervisor-settled", 7_400, { frame: 2, latencyMs: 50, triggers: [], nudged: false, usage: jev(10, 10) })
    j.spend(7_990, "boundary-usage/d", 1_000, 0.002)
    j.agent("claim-demanded", 8_000, {
      latencyMs: 500,
      nextFrame: 3,
      demanded: true,
      costUsd: 0.002,
      usage: jev(900, 100)
    })
    j.run("completed", 9_000)
    const report = RunTiming.fold(j.events, "run-1")
    expect(report.judge.fired).toEqual([
      {
        frame: 0,
        purpose: "judge",
        startMs: 5_100,
        latencyMs: 200,
        fired: ["outdated_context", "irrelevant_context", "compact"]
      },
      {
        frame: 1,
        purpose: "judge",
        startMs: 6_100,
        latencyMs: 200,
        fired: ["outdated_context", "compact suppressed: floor"]
      },
      { frame: 2, purpose: "judge", startMs: 7_100, latencyMs: 200, fired: ["nudged"] },
      { frame: 2, purpose: "claim", startMs: 7_500, latencyMs: 500, fired: ["demanded"] }
    ])
    const rows = Object.fromEntries(report.spend.map((row) => [row.purpose, row]))
    // A reading's own recorded cost is its cost; the ledger entry's remainder goes to the reading that has none.
    expect(rows.judge!.costUsd).toBeCloseTo(0.0004 + 0.0003, 12)
    expect(rows.marks!.costUsd).toBeCloseTo(0.0005, 12)
    expect(rows.claim!.costUsd).toBeCloseTo(0.002, 12)
    expect(report.total.costUsd).toBeCloseTo(report.ledger!.costUsd, 12)
    expect(report.derived.map((entry) => entry.field)).not.toContain("judge fired")
    // The marks reading has no price of its own, so its cost is still worked out.
    expect(report.derived.map((entry) => entry.field)).toContain("reading cost")
  })

  it("reads the stream stages, tries and join keys the harness journals on a settle", () => {
    const j = journal()
    j.run("running", 0)
    j.agent("turn-opened", 0)
    j.requested(0, 0)
    j.agent("model-retried", 1_000, { attempt: 1, code: "transport", delayMillis: 100 })
    j.agent("model-retried", 2_000, { attempt: 2, code: "transport", delayMillis: 100 })
    j.agent("model-settled", 10_000, {
      durationMillis: 10_000,
      costUsd: 0.01,
      // No reasoning count in the usage: the settle's own split carries it.
      usage: { inputTokens: 1_000, cachedInputTokens: 800, outputTokens: 400, totalTokens: 1_400 },
      scope: "run-1",
      frame: 0,
      attempt: 1,
      purpose: "frame",
      tries: 2,
      stages: { firstEventMs: 7_000, firstThinkingMs: 7_200, firstOutputMs: 8_000, lastOutputMs: 9_900 },
      output: { thinking: 300, written: 100 }
    })
    j.run("completed", 10_000)
    const report = RunTiming.fold(j.events, "run-1")
    expect(report.calls).toMatchObject([{
      frame: 0,
      ask: 1,
      purpose: "frame",
      // The settle's own count, not the retry records counted around it.
      tries: 2,
      waitMs: 7_200,
      thinkingMs: 800,
      writingMs: 1_900,
      stages: { firstEventMs: 7_000, firstThinkingMs: 7_200, firstOutputMs: 8_000, lastOutputMs: 9_900 },
      // The settle's split fills in what its usage left out.
      usage: { input: 1_000, cached: 800, uncached: 200, thinking: 300, written: 100 }
    }])
    expect(report.calls[0]!.timing).toBeUndefined()
    expect(report.derived.map((entry) => entry.field)).not.toContain("call tries")
  })

  it("times the wait as the harness saw it and keeps the wire's record beside it", () => {
    const j = journal()
    j.run("running", 0)
    j.requested(0, 0)
    // The wire saw the first thinking at 2.3 s; the harness was handed it at 7.2 s.
    j.settled(10_000, 10_000, [1_000, 0, 400, 300], 0.01, {
      tries: 1,
      stages: { firstEventMs: 7_000, firstThinkingMs: 7_200, firstOutputMs: 8_000, lastOutputMs: 9_900 },
      timing: { attempts: 1, headersMs: 2_100, firstEventMs: 2_150, firstThinkingMs: 2_300, firstOutputMs: 7_400 }
    })
    j.run("completed", 10_000)
    const [call] = RunTiming.fold(j.events, "run-1").calls
    expect(call).toMatchObject({
      waitMs: 7_200,
      thinkingMs: 800,
      writingMs: 1_900,
      stages: { firstThinkingMs: 7_200 },
      timing: { headersMs: 2_100, firstThinkingMs: 2_300 }
    })
  })

  it("reads a compaction's causes, duration, context and summary call from a record that carries them", () => {
    const j = journal()
    j.run("running", 0)
    j.requested(1_000, 0, { purpose: "compaction" })
    j.spend(7_990, "key1_summary", 5_900, 0.03)
    // The summary call settles on the compaction's own record, never as a model-settled.
    j.agent("compaction-settled", 10_000, {
      scope: "run-1",
      frame: 0,
      causes: ["outdated_context", "window"],
      durationMillis: 9_500,
      context: { before: 180_000, after: 40_000 },
      removed: 120_000,
      marks: { kept: 2, squashed: 1, removed: 3 },
      marksCall: { requests: 1, latencyMs: 400, usage: jev(2_000, 40) },
      summaryCall: {
        usage: { inputTokens: 5_000, cachedInputTokens: 0, outputTokens: 900, reasoningTokens: 0, totalTokens: 5_900 },
        costUsd: 0.03,
        durationMillis: 7_000,
        tries: 1,
        stages: { firstEventMs: 2_000, firstOutputMs: 2_500, lastOutputMs: 6_900 }
      }
    })
    j.requested(10_000, 0)
    j.spend(11_990, "key1_frame", 700, 0.001)
    j.settled(12_000, 2_000, [600, 0, 100, 0], 0.001)
    j.run("completed", 12_000)
    const report = RunTiming.fold(j.events, "run-1")
    expect(report.compactions).toEqual([{
      frame: 0,
      startMs: 500,
      durationMs: 9_500,
      cause: "outdated_context, window",
      contextBefore: 180_000,
      contextAfter: 40_000,
      freed: 120_000,
      marks: { kept: 2, squashed: 1, removed: 3 },
      spent: 5_900
    }])
    // The summary call is a settled row like any other, and its time is compaction time.
    expect(report.calls).toMatchObject([
      {
        frame: 0,
        purpose: "compaction",
        settled: true,
        startMs: 1_000,
        durationMs: 7_000,
        waitMs: 2_500,
        writingMs: 4_400,
        tries: 1,
        usage: { input: 5_000, written: 900 },
        spent: 5_900,
        costUsd: 0.03
      },
      { frame: 0, purpose: "frame", settled: true }
    ])
    expect(report.time).toEqual({ modelMs: 2_000, cellsMs: 0, judgeMs: 0, compactionMs: 9_500, otherMs: 500 })
    expect(report.spend).toMatchObject([
      { purpose: "frame", calls: 1, spent: 700 },
      { purpose: "compaction", calls: 1, input: 5_000, written: 900, spent: 5_900 }
    ])
    expect(report.total.spent).toBe(report.ledger!.spent)
    const fields = report.derived.map((entry) => entry.field)
    for (const field of ["compaction total", "unsettled call total", "unsettled call tokens"]) {
      expect(fields).not.toContain(field)
    }
  })

  it("is total over an empty or malformed journal", () => {
    const empty = RunTiming.fold([], "run-1")
    expect(empty).toMatchObject({ wallMs: 0, calls: [], frames: [], spend: [], compactions: [] })
    expect(empty.speed).toBeUndefined()
    expect(RunTiming.render(empty)).toContain("0 model calls")
    const j = journal()
    for (
      const kind of [
        "model-requested",
        "model-settled",
        "cell-call-settled",
        "supervisor-settled",
        "compaction-settled"
      ]
    ) {
      j.push(`control.agent.${kind}`, 1_000, { usage: "many", latencyMs: "slow", frame: null, timing: 7 }, false)
    }
    j.push("flows.agent.usage.v1", 1_000, { spent: "[REDACTED]" }, false)
    j.push("control.agent.model-settled", 2_000, null as never, false)
    expect(() => RunTiming.render(RunTiming.fold(j.events))).not.toThrow()
  })

  it("keeps the split equal to the wall however the readings and calls overlap", () => {
    // A fixed linear congruential sequence: the same journals on every run.
    let seed = 20_261_013
    const next = (bound: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
      return seed % bound
    }
    for (let round = 0; round < 50; round++) {
      const j = journal()
      let at = next(500)
      j.run("running", 0)
      const frames = 1 + next(6)
      for (let frame = 0; frame < frames; frame++) {
        if (next(4) === 0) {
          j.requested(at, frame, { purpose: "compaction" })
          at += 1 + next(3_000)
          j.agent("compaction-settled", at, {})
        }
        j.agent("turn-opened", at)
        j.requested(at, frame)
        const duration = 1 + next(20_000)
        // A reading of the frame before, landing anywhere from before the call to after its cell.
        j.agent("supervisor-settled", at + next(duration + 4_000), {
          frame,
          latencyMs: next(6_000),
          usage: jev(next(900), 10)
        })
        at += duration
        j.settled(at, next(2) === 0 ? duration : duration + next(40) - 20, [next(9_000), 0, next(900), 0], 0.001)
        j.agent("cell-produced", at)
        at += next(3_000)
        j.agent("cell-settled", at)
        at += next(200)
        j.agent("turn-closed", at)
        at += next(200)
      }
      j.run("completed", at + next(500))
      const report = RunTiming.fold(j.events, "run-1")
      expect(sum(Object.values(report.time)), `round ${round}`).toBe(report.wallMs)
      expect(sum(report.frames.map((frame) => frame.wallMs)), `round ${round}`).toBe(report.wallMs)
      for (const frame of report.frames) {
        expect(frame.modelMs + frame.cellsMs + frame.judgeMs + frame.compactionMs + frame.otherMs).toBe(frame.wallMs)
      }
      for (const value of Object.values(report.time)) expect(value).toBeGreaterThanOrEqual(0)
    }
  })
})

describe("RunTiming speed fit", () => {
  const fitted = (rows: ReadonlyArray<readonly [thinking: number, written: number, durationMs: number]>) => {
    const j = journal()
    j.run("running", 0)
    let at = 0
    for (const [frame, [thinking, written, durationMs]] of rows.entries()) {
      j.requested(at, frame)
      at += durationMs
      j.settled(at, durationMs, [1_000, 0, thinking + written, thinking], 0)
    }
    j.run("completed", at)
    return RunTiming.fold(j.events, "run-1").speed
  }

  it("recovers fixed seconds per call and milliseconds per thinking and written token", () => {
    // Every call takes exactly 5 s, plus 20 ms a thinking token, plus 30 ms a written token.
    const law = (thinking: number, written: number) =>
      [thinking, written, 5_000 + 20 * thinking + 30 * written] as const
    const speed = fitted([law(100, 50), law(400, 20), law(0, 300), law(250, 250), law(900, 10), law(30, 700)])
    expect(speed).toBeDefined()
    expect(speed!.calls).toBe(6)
    expect(speed!.fixedMs).toBeCloseTo(5_000, 6)
    expect(speed!.perThinkingMs).toBeCloseTo(20, 6)
    expect(speed!.perWrittenMs).toBeCloseTo(30, 6)
    expect(speed!.r2).toBeCloseTo(1, 9)
  })

  it("reports how much of the spread the fit explains", () => {
    const speed = fitted([
      [100, 50, 9_000],
      [400, 20, 13_000],
      [0, 300, 15_500],
      [250, 250, 17_000],
      [900, 10, 22_000],
      [
        30,
        700,
        27_500
      ]
    ])
    expect(speed!.r2).toBeGreaterThan(0.9)
    expect(speed!.r2).toBeLessThan(1)
  })

  it("fits nothing from too few calls or from calls that cannot tell the two rates apart", () => {
    expect(fitted([[100, 50, 9_000], [400, 20, 13_000], [0, 300, 15_500]])).toBeUndefined()
    // Thinking and written tokens move together, so no fit separates their rates.
    expect(fitted([[100, 100, 9_000], [200, 200, 13_000], [300, 300, 15_500], [400, 400, 17_000]])).toBeUndefined()
  })
})

/** Reads one rendered table back: its header cells, then each row's cells. */
const table = (text: string, title: string): { header: Array<string>; rows: Array<Array<string>> } => {
  const lines = text.split("\n")
  const start = lines.findIndex((line) => line === title)
  if (start < 0) throw new Error(`no ${title} table in:\n${text}`)
  const body: Array<string> = []
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "") break
    body.push(line)
  }
  const cells = (line: string) => line.trim().split(/ {2,}/)
  return { header: cells(body[0]!), rows: body.slice(1).map(cells) }
}

const seconds = (ms: number) => (ms / 1_000).toFixed(1)
const count = (value: number) => value.toLocaleString("en-US")

describe("RunTiming.render", () => {
  it("prints the same calls, frames and totals the report holds", () => {
    const report = RunTiming.fold(oldShape(), "run-1")
    const text = RunTiming.render(report)
    const cellsOf = (printed: { header: Array<string>; rows: Array<Array<string>> }, index: number) =>
      Object.fromEntries(printed.header.map((name, column) => [name, printed.rows[index]![column]]))

    const calls = table(text, "Model calls (seconds)")
    // No call here says when its first token arrived, so no column claims to.
    expect(calls.header).toEqual(["#", "frame", "ask", "purpose", "start", "total"])
    expect(calls.rows).toHaveLength(report.calls.length)
    const tokens = table(text, "Model call tokens")
    expect(tokens.header).toEqual([
      "#",
      "input",
      "cached",
      "uncached",
      "thinking",
      "written",
      "cache %",
      "tries",
      "moved"
    ])
    expect(tokens.rows).toHaveLength(report.calls.length)
    for (const [index, call] of report.calls.entries()) {
      expect(cellsOf(calls, index)).toEqual({
        "#": String(call.index),
        frame: String(call.frame),
        ask: String(call.ask),
        purpose: call.purpose,
        start: seconds(call.startMs),
        total: call.settled ? seconds(call.durationMs) : `${seconds(call.durationMs)} unsettled`
      })
      expect(cellsOf(tokens, index)).toEqual({
        "#": String(call.index),
        input: call.usage === undefined ? "—" : count(call.usage.input),
        cached: call.usage === undefined ? "—" : count(call.usage.cached),
        uncached: call.usage === undefined ? "—" : count(call.usage.uncached),
        thinking: call.usage === undefined ? "—" : count(call.usage.thinking),
        written: call.usage === undefined ? "—" : count(call.usage.written),
        "cache %": call.cacheShare === undefined ? "—" : (call.cacheShare * 100).toFixed(1),
        tries: String(call.tries),
        moved: call.rejected !== undefined ? "rejected" : call.moved === undefined ? "—" : call.moved ? "yes" : "no"
      })
    }

    const frames = table(text, "Frames (seconds)")
    expect(frames.rows).toEqual(report.frames.map((frame) => [
      String(frame.frame),
      seconds(frame.wallMs),
      seconds(frame.modelMs),
      String(frame.modelCalls),
      seconds(frame.cellsMs),
      String(frame.cellCalls),
      seconds(frame.judgeMs),
      seconds(frame.compactionMs),
      seconds(frame.otherMs)
    ]))

    const time = table(text, "Time")
    expect(Object.fromEntries(time.rows.map((row) => [row[0], row[1]]))).toEqual({
      model: seconds(report.time.modelMs),
      cells: seconds(report.time.cellsMs),
      judge: seconds(report.time.judgeMs),
      compaction: seconds(report.time.compactionMs),
      other: seconds(report.time.otherMs),
      wall: seconds(report.wallMs)
    })

    const spend = table(text, "Tokens")
    expect(spend.rows.map((row) => row[0])).toEqual([...report.spend.map((row) => row.purpose), "run"])
    for (const [index, row] of [...report.spend, { ...report.total, purpose: "run" }].entries()) {
      const printed = cellsOf(spend, index)
      expect(printed.calls).toBe(String(row.calls))
      expect(printed.tokens).toBe(count(row.spent))
      expect(printed["cost $"]).toBe(row.costUsd.toFixed(4))
    }
    expect(cellsOf(spend, 0)).toMatchObject({ input: "8,500", cached: "3,000", thinking: "650", written: "1,250" })

    expect(table(text, "Compactions (seconds)")).toEqual({
      header: ["frame", "start", "total", "cause", "before", "after", "tokens"],
      rows: [["2", "50.0", "10.0", "—", "—", "—", "900"]]
    })
    expect(table(text, "Judge readings that fired (seconds)").rows).toEqual([
      ["1", "judge", "50.1", "0.3", "supervisor, nudged"]
    ])
    expect(text).toMatch(/^Moved nothing +3 of 4 settled calls · 60\.0 s · 7,600 tokens$/m)
    expect(text).toMatch(/^Cache share +35\.3 % of input$/m)
    expect(text).toMatch(/^Judge +5 readings · 2\.4 s latency · 1\.6 s holding the run$/m)
    expect(text).toMatch(/^Ledger +9 entries · 15,400 tokens · \$0\.0981$/m)
    expect(text).not.toContain("Wait by stage")
    expect(table(text, "Derived").rows.length + 1).toBe(report.derived.length)
    // A person reads this in a terminal that may be 80 columns wide.
    for (const line of text.split("\n")) expect(line.length, line).toBeLessThanOrEqual(74)
  })

  it("prints the wait by stage for the calls that carry wire timing", () => {
    const j = journal()
    j.run("running", 0)
    j.requested(0, 0)
    j.settled(10_000, 10_000, [1_000, 800, 400, 300], 0.01, {
      servedTier: "priority",
      timing: {
        attempts: 2,
        requestBytes: 12_345,
        preparedMs: 3,
        signedMs: 5,
        sentMs: 9,
        headersMs: 2_100,
        firstEventMs: 2_150,
        firstThinkingMs: 2_300,
        firstOutputMs: 7_400,
        lastOutputMs: 9_800,
        completedMs: 9_900,
        closedMs: 9_950
      }
    })
    j.requested(10_000, 1)
    j.settled(12_000, 2_000, [1_000, 800, 40, 0], 0.01, {
      stages: { firstEventMs: 900, firstOutputMs: 1_000, lastOutputMs: 1_900 }
    })
    j.run("completed", 12_000)
    const text = RunTiming.render(RunTiming.fold(j.events, "run-1"))
    const calls = table(text, "Model calls (seconds)")
    expect(calls.header).toEqual(["#", "frame", "ask", "purpose", "start", "total", "wait", "think", "write"])
    expect(calls.rows).toEqual([
      ["1", "0", "1", "frame", "0.0", "10.0", "2.3", "5.1", "2.4"],
      ["2", "1", "1", "frame", "10.0", "2.0", "1.0", "—", "0.9"]
    ])
    expect(table(text, "Model call tokens").rows[0]).toEqual([
      "1",
      "1,000",
      "800",
      "200",
      "300",
      "100",
      "80.0",
      "2",
      "—"
    ])
    // Only the call that carries timing; milliseconds matter before the first token.
    expect(table(text, "Wait by stage (seconds from the call's start)")).toEqual({
      header: ["#", "prepared", "signed", "sent", "headers", "1st event", "1st thinking", "1st output"],
      rows: [["1", "0.003", "0.005", "0.009", "2.100", "2.150", "2.300", "7.400"]]
    })
    expect(table(text, "Stream as the harness saw it (seconds from the call's start)")).toEqual({
      header: ["#", "1st event", "1st thinking", "1st output", "last output"],
      rows: [["2", "0.900", "—", "1.000", "1.900"]]
    })
    expect(table(text, "After the first output (seconds from the call's start)")).toEqual({
      header: ["#", "last output", "completed", "closed", "tries", "request bytes", "tier"],
      rows: [["1", "9.800", "9.900", "9.950", "2", "12,345", "priority"]]
    })
  })

  it("prints the speed fit in the units the comparison uses", () => {
    const j = journal()
    j.run("running", 0)
    let at = 0
    for (const [frame, [thinking, written]] of [[100, 50], [400, 20], [0, 300], [250, 250], [900, 10]].entries()) {
      const duration = 5_000 + 20 * thinking! + 30 * written!
      j.requested(at, frame)
      at += duration
      j.settled(at, duration, [1_000, 0, thinking! + written!, thinking!], 0)
    }
    j.run("completed", at)
    expect(table(RunTiming.render(RunTiming.fold(j.events, "run-1")), "Speed")).toEqual({
      header: ["calls", "fixed s per call", "ms per thinking token", "ms per written token", "R²"],
      rows: [["5", "5.0", "20.0", "30.0", "1.00"]]
    })
  })
})
