// A run's page as a frontend draws it (src/features/runs/page.ts, decision 0014 §5): the steps a person reads, the
// selected one, the journal with what More read, the acts a run offers, and the list's rows.
import { describe, expect, test } from "vitest"
import { actsOf, journalOf, listRows, retriesOf, selectedStep, STALLED_AFTER_MS, stepsOf, stepStateOf } from "./page"
import type { Inspection, RunRow } from "./schema"

const value = (text: string) => ({ text, bytes: text.length, clipped: false })

const run = (overrides: Partial<Inspection["run"]> = {}): Inspection["run"] => ({
  runId: "run-1",
  flowName: "flow/run",
  status: "completed",
  createdAtMs: 1_000,
  startedAtMs: 1_010,
  finishedAtMs: 2_000,
  parentRunId: null,
  cancelRequestedAtMs: null,
  waiting: null,
  lastSeq: 9,
  input: value("{}"),
  result: value('"Hello."'),
  ...overrides,
})

const inspection = (overrides: Partial<Inspection> = {}): Inspection => ({
  run: run(),
  steps: [
    { nodeId: "root", action: "flow/run", kind: "FlowCall", status: "completed", scheduledAtMs: 1_000, settledAtMs: 2_000, seq: 1, output: null, attempts: [] },
    { nodeId: "root.flow", action: null, kind: "AndThen", status: "completed", scheduledAtMs: 1_001, settledAtMs: 2_000, seq: 2, output: null, attempts: [] },
    {
      nodeId: "root.flow.load",
      action: "flow/run/load",
      kind: "ActionCall",
      status: "completed",
      scheduledAtMs: 1_002,
      settledAtMs: 1_100,
      seq: 3,
      output: value('{"name":"hello"}'),
      attempts: [
        { attempt: 1, state: "failed", startedAtMs: 1_002, finishedAtMs: 1_050, outcome: null, error: "FlowsUnavailable" },
        { attempt: 2, state: "succeeded", startedAtMs: 1_060, finishedAtMs: 1_100, outcome: value("{}"), error: null },
      ],
    },
    { nodeId: "root.flow.prompt", action: "flow/run/prompt", kind: "FlowCall", status: "completed", scheduledAtMs: 1_101, settledAtMs: 1_900, seq: 4, output: null, attempts: [] },
  ],
  children: [
    {
      runId: "run-1/child",
      flowName: "flow/run/prompt",
      status: "suspended",
      createdAtMs: 1_102,
      startedAtMs: 1_103,
      finishedAtMs: null,
      parentRunId: "run-1",
      cancelRequestedAtMs: null,
      waiting: { kind: "human", reason: "human", wakeAtMs: 9_000 },
      lastSeq: 3,
      input: value('{"input":""}'),
      result: null,
    },
  ],
  journal: {
    events: [{ seq: 0, eventType: "flows.engine.run-decision", emittedAtMs: 1_000, payload: value("{}") }],
    afterSeq: -1,
    nextSeq: 0,
    hasMore: true,
  },
  ...overrides,
})

describe("stepsOf", () => {
  test("the action calls and child boundaries, and the runs it started, in the order they started", () => {
    const steps = stepsOf(inspection())
    expect(steps.map((step) => step.row.id)).toEqual([
      "step:root.flow.load",
      "step:root.flow.prompt",
      "run:run-1/child",
    ])
    expect(steps[0]).toMatchObject({
      row: { label: "flow/run/load", depth: 0, attempts: 2, failedAttempts: 1, state: "completed", endedAtMs: 1_100 },
      input: null,
      output: value('{"name":"hello"}'),
      href: null,
    })
    expect(steps[2]).toMatchObject({
      row: { label: "flow/run/prompt", kind: "run", depth: 1, state: "waiting" },
      input: value('{"input":""}'),
      output: null,
      wait: { kind: "human", sinceMs: null, wakeAtMs: 9_000 },
      href: "/app/runs/run-1%2Fchild",
    })
  })

  test("a step with no action reads as its kind", () => {
    const [step] = stepsOf(inspection({
      steps: [{ nodeId: "a", action: null, kind: "ActionCall", status: "running", scheduledAtMs: 1, settledAtMs: null, seq: 1, output: null, attempts: [] }],
      children: [{ ...inspection().children[0]!, waiting: null }],
    }))
    expect(step!.row.label).toBe("ActionCall")
    expect(stepsOf(inspection({ steps: [], children: [{ ...inspection().children[0]!, waiting: null }] }))[0]!.wait).toBeNull()
  })

  test("a child's status as a step's", () => {
    expect(["pending", "running", "suspended", "completed", "failed", "cancelled"].map((status) => stepStateOf(status as never)))
      .toEqual(["running", "running", "waiting", "completed", "failed", "failed"])
  })
})

describe("selectedStep", () => {
  test("the selected step, else the latest; none without steps", () => {
    const steps = stepsOf(inspection())
    expect(selectedStep(steps, "step:root.flow.load")?.row.id).toBe("step:root.flow.load")
    expect(selectedStep(steps, null)?.row.id).toBe("run:run-1/child")
    expect(selectedStep([], null)).toBeUndefined()
  })
})

describe("journalOf", () => {
  test("the first page, then what More read", () => {
    const more = [{ seq: 1, eventType: "flows.engine.node-scheduled", emittedAtMs: 1_001, payload: value("{}") }]
    expect(journalOf({ id: "run-1", state: "read", inspection: inspection(), more, hasMore: false }).map((event) => event.seq))
      .toEqual([0, 1])
  })
})

describe("actsOf", () => {
  test("Retry once a retried flow settled; never for an act or an answer", () => {
    expect(actsOf(inspection(), 3_000)).toEqual({ stop: false, retry: true, resume: false })
    expect(actsOf(inspection({ run: run({ flowName: "chat/Answer" }) }), 3_000).retry).toBe(false)
  })

  test("Stop while it runs and no stop was asked; Resume while it waits, or once it recorded nothing for a minute", () => {
    const live = inspection({ run: run({ status: "running", finishedAtMs: null }) })
    expect(actsOf(live, 1_000 + STALLED_AFTER_MS - 1)).toEqual({ stop: true, retry: false, resume: false })
    expect(actsOf(live, 1_000 + STALLED_AFTER_MS).resume).toBe(true)
    expect(actsOf(inspection({ run: run({ status: "running", cancelRequestedAtMs: 1_500 }) }), 0).stop).toBe(false)
    expect(actsOf(inspection({ run: run({ status: "suspended" }) }), 0).resume).toBe(true)
    const silent = inspection({ run: run({ status: "running" }), journal: { ...inspection().journal, events: [] } })
    expect(actsOf(silent, 1_000 + STALLED_AFTER_MS).resume).toBe(true)
  })
})

describe("the list", () => {
  const row = (overrides: Partial<RunRow>): RunRow => ({
    id: "a",
    flow: "flow/run",
    status: "completed",
    cancelRequested: false,
    createdAtMs: 1,
    startedAtMs: null,
    finishedAtMs: null,
    seq: 0,
    ...overrides,
  })

  test("work only, newest first, each linking its page", () => {
    expect(listRows([row({ id: "a", createdAtMs: 1 }), row({ id: "b", createdAtMs: 2, startedAtMs: 3 }), row({ id: "c", flow: "run/retry" })]))
      .toEqual([
        { id: "b", flow: "flow/run", state: "completed", cancelRequested: false, startedAtMs: 3, finishedAtMs: null, href: "/app/runs/b" },
        { id: "a", flow: "flow/run", state: "completed", cancelRequested: false, startedAtMs: 1, finishedAtMs: null, href: "/app/runs/a" },
      ])
  })

  test("counts a run's retries from this device", () => {
    expect(retriesOf([row({ id: "retry:a:1", flow: "run/retry" }), row({ id: "retry:a:2", flow: "run/retry" }), row({ id: "retry:b:1", flow: "run/retry" })], "a"))
      .toBe(2)
  })
})
