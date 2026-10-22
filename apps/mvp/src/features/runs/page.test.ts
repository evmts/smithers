// A run's page as a frontend draws it (src/features/runs/page.ts, decision 0014 §5): the steps a person reads, the
// selected one, the journal with what More read, the acts a run offers, and the list's rows.
import { describe, expect, test } from "vitest"
import { actsOf, hostOf, journalOf, listRows, missingOf, retriesOf, selectedStep, STALLED_AFTER_MS } from "./page"
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

describe("selectedStep", () => {
  test("explicit selection wins, otherwise follow live work, then the latest settled step", () => {
    const step = (id: string, state: import("@smthrs/ui").StepState): import("./page").PageStep => ({ row: { id, label: id, state, kind: "step", startedAtMs: 0, endedAtMs: null, depth: 0, attempts: 0, failedAttempts: 0 }, input: null, output: null, attempts: [], wait: null, href: null })
    const steps = [step("a", "completed"), step("b", "running"), step("c", "pending")]
    expect(selectedStep(steps, "a")?.row.id).toBe("a")
    expect(selectedStep(steps, null)?.row.id).toBe("b")
    expect(selectedStep([steps[0]!, steps[2]!], null)?.row.id).toBe("a")
    expect(selectedStep([steps[2]!], null)?.row.id).toBe("c")
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

describe("a run on Cloudflare", () => {
  const TODO_RUN = "todo:6f1c2a7e-3b4d-4c5e-8f90-1a2b3c4d5e6f"

  test("offers no acts, whatever its state: each act runs on this device's engine", () => {
    for (const status of ["running", "suspended", "completed", "failed"] as const) {
      expect(actsOf(inspection({ run: run({ runId: TODO_RUN, status }) }), 1_000 + STALLED_AFTER_MS))
        .toEqual({ stop: false, retry: false, resume: false })
    }
  })

  test("its header says Cloud; this device's says This device", () => {
    expect([hostOf(TODO_RUN), hostOf("run-1"), hostOf("todo:not-an-attempt")]).toEqual(["Cloud", "This device", "This device"])
  })

  test("a page without a run says why: Not started, Not found, On another device, or Couldn't read this run", () => {
    expect(missingOf({ id: TODO_RUN, state: "not_started" })).toBe("Not started")
    expect(missingOf({ id: TODO_RUN, state: "not_found" })).toBe("Not found")
    expect(missingOf({ id: "run-1", state: "not_found" })).toBe("On another device")
    expect(missingOf({ id: TODO_RUN, state: "unavailable" })).toBe("Couldn't read this run")
    expect(missingOf({ id: "run-1", state: "unavailable" })).toBe("Couldn't read this run")
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


test("stall detection uses the latest event from More as well as the first journal page", () => {
  const live = inspection({ run: run({ status: "running", finishedAtMs: null }) })
  const page = { id: "run-1", state: "read" as const, inspection: live, more: [{ seq: 501, eventType: "flows.engine.node-scheduled", emittedAtMs: 50_000, payload: value("{}") }], hasMore: false }
  expect(actsOf(live, 61_000, journalOf(page)).resume).toBe(false)
  expect(actsOf(live, 50_000 + STALLED_AFTER_MS, journalOf(page)).resume).toBe(true)
})

test("failed system TODO runs have Retry while remote running TODOs do not", () => {
  const input = { repoId: "github/octo/hello", number: 1 }
  const base = { runId: "todo:12345678-1234-1234-1234-123456789abc", flowName: "todo", input: value(JSON.stringify(input)), status: "running", result: null }
  const inspection = { run: base, journal: { events: [] } } as unknown as Parameters<typeof actsOf>[0]
  expect(actsOf(inspection, 0).retry).toBe(false)
  expect(actsOf({ ...inspection, run: { ...inspection.run, status: "completed", result: value(JSON.stringify({ state: "failed" })) } }, 0).retry).toBe(true)
  expect(actsOf({ ...inspection, run: { ...inspection.run, status: "completed", result: value(JSON.stringify({ state: "merged" })) } }, 0).retry).toBe(false)
})
