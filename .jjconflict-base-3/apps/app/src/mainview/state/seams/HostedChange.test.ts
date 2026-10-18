import { CodingResultSchema, HostedSessionSchema } from "./HostedChangeSchema"
import { expect, test } from "bun:test"
import {
  testingCopy,
  hostedSessionPhase,
  finishedCopy,
  deriveHostedChange,
  observeStages,
  landingRefusal,
  type CodingResult,
  type HostedSession,
  type HostedObservation
} from "./HostedChange"
const result = (exit_code = 0, tests_run: number | null = 33, commit = "abc"): CodingResult => ({
  head_commit: "abc",
  head_change_id: "change",
  test_receipt: {
    command: "bun test",
    exit_code,
    tests_run,
    commit,
    finished_at: "2026-10-18T00:01:12Z",
    output_tail: ""
  }
})
test.each([
  [result(), true, true, "bun test exited 0 in the agent's sandbox at abc · 33 tests"],
  [result(1), true, false, "bun test exited 1 in the agent's sandbox at abc · 33 tests"],
  [result(0, 0), true, false, "bun test ran 0 tests in the agent's sandbox"],
  [result(0, null), true, true, "bun test exited 0 in the agent's sandbox at abc"],
  [result(2, null), true, false, "bun test exited 2 in the agent's sandbox at abc"],
  [result(0, 33, "drift"), false, false, "Tests not run at this commit"],
  [{ ...result(), test_receipt: null }, false, false, "Tests not run at this commit"]
] as const)("receipt %#", (record, tested, passed, text) => {
  expect(testingCopy(record)).toMatchObject({ tested, passed, text })
  expect(testingCopy(record).note === null).toBe(passed)
})
const session: HostedSession = {
  id: "s",
  status: "completed",
  reason: null,
  reason_code: null,
  retryable: false,
  workspace: null,
  run: {
    id: 42,
    status: "success",
    model: null,
    started_at: "2026-10-18T00:00:00Z",
    finished_at: "2026-10-18T00:01:12Z"
  }
}
test("duration requires both recorded timestamps", () => {
  expect(finishedCopy(session)).toBe("finished just now · took\u00a01\u00a0m\u00a012\u00a0s")
  expect(finishedCopy({ ...session, run: { ...session.run!, started_at: null } })).toBeNull()
  expect(finishedCopy(null)).toBeNull()
})
test("only observed stages get clocks; failure preserves reason and retry", () => {
  const stages = observeStages({}, session, true, null, null, 100)
  expect(stages).toEqual({ Admitted: 100, "Allocating a machine": 100 })
  const row: HostedObservation = {
    id: "x",
    repo: "o/r",
    request: "change",
    owner: null,
    sessionId: "s",
    phase: "failed",
    accepted: true,
    session: { ...session, status: "failed", reason: "No machine is free.", retryable: true },
    result: null,
    pull: null,
    files: [],
    error: null,
    stages
  }
  const derived = deriveHostedChange(row)
  expect(derived.reason).toBe("No machine is free.")
  expect(derived.retryable).toBe(true)
  expect(derived.model).toBeNull()
  expect(derived.stages.slice(1).every((stage) => stage.duration === null)).toBe(true)
})
test("typed landing refusals keep an actionable sentence", () => {
  for (const code of [
    "sign_in_required",
    "guest_refused",
    "push_permission_required",
    "agent_credential_refused",
    "session_not_found",
    "head_receipt_mismatch",
    "no_coding_result",
    "no_turn_head"
  ])
    expect(landingRefusal(code, "fallback")).not.toBe("fallback")
  expect(landingRefusal(null, "GitHub unavailable.")).toBe("GitHub unavailable.")
})
test("runner names, unknown test counts and drift preserve exact copy", () => {
  expect(
    testingCopy({ ...result(), test_receipt: { ...result().test_receipt!, command: "node --test", tests_run: 0 } }).text
  ).toBe("node --test ran 0 tests in the agent's sandbox")
  expect(
    testingCopy({ ...result(), test_receipt: { ...result().test_receipt!, command: "make test", tests_run: null } })
  ).toMatchObject({ text: "make test exited 0 in the agent's sandbox at abc", passed: true, tested: true })
  expect(testingCopy(result(1)).note).toBe(
    "Tests failed (exit 1). You can still open a pull request; the failure goes in its description."
  )
})
test("stage clocks survive later observations without inventing a missing cloning clock", () => {
  const running: HostedSession = { ...session, run: { ...session.run!, status: "running", model: "provider:model" } }
  const stages = observeStages({ Admitted: 100, "Allocating a machine": 200 }, running, true, null, null, 1000)
  expect(stages).toEqual({ Admitted: 100, "Allocating a machine": 200, "Model working": 1000 })
  expect(observeStages(stages, running, true, null, null, 2000)).toEqual(stages)
  const row: HostedObservation = {
    id: "x",
    repo: "o/r",
    request: "change",
    sessionId: "s",
    owner: "maya",
    phase: "running",
    accepted: true,
    session: running,
    result: null,
    pull: null,
    files: [],
    error: null,
    stages
  }
  const view = deriveHostedChange(row)
  expect(view.model).toBe("provider:model")
  expect(view.stages[0]?.duration).toBe("0 s")
  expect(view.stages[2]?.duration).toBeNull()
  expect(view.stages[3]?.tone).toBe("live")
  expect(view.stages[5]?.tone).toBe("pending")
})

test("only completed sessions with the last reply's result become ready", () => {
  expect(
    hostedSessionPhase({ ...session, status: "active", run: { ...session.run!, status: "success" } }, result())
  ).toBe("running")
  expect(hostedSessionPhase({ ...session, status: "completed" }, result())).toBe("done")
  expect(hostedSessionPhase({ ...session, status: "completed" }, null)).toBe("failed")
  for (const status of ["failed", "cancelled", "timed_out"] as const) {
    expect(hostedSessionPhase({ ...session, status }, result())).toBe("failed")
  }
  for (const status of ["failure", "cancelled"] as const) {
    expect(hostedSessionPhase({ ...session, status: "active", run: { ...session.run!, status } }, null)).toBe("failed")
  }
})

test("wire status decoding rejects task statuses and nonexistent session states", () => {
  for (const status of ["done", "idle", "running"])
    expect(HostedSessionSchema.safeParse({ ...session, status }).success).toBe(false)
  for (const status of ["completed", "failed", "done"])
    expect(HostedSessionSchema.safeParse({ ...session, run: { ...session.run!, status } }).success).toBe(false)
  for (const status of ["queued", "running", "success", "failure", "cancelled"])
    expect(HostedSessionSchema.safeParse({ ...session, run: { ...session.run!, status } }).success).toBe(true)
})

test("a live stage uses only recorded observation times; Testing never counts the person's wait", () => {
  const row: HostedObservation = {
    id: "s",
    repo: "o/r",
    request: "change",
    owner: "maya",
    sessionId: "s",
    accepted: true,
    phase: "running",
    session: { ...session, status: "active", run: { ...session.run!, status: "running" } },
    result: null,
    pull: null,
    files: [],
    error: null,
    stages: { "Model working": 1000 },
    observedAt: 3000
  }
  expect(deriveHostedChange(row).stages[3]?.duration).toBe("2 s")
  expect(deriveHostedChange({ ...row, observedAt: undefined }).stages[3]?.duration).toBeNull()
  expect(
    deriveHostedChange({
      ...row,
      phase: "done",
      result: result(),
      stages: { Testing: Date.parse("2026-10-18T00:01:12Z"), "Pull request opened": Date.parse("2026-10-18T01:00:00Z") }
    }).stages[4]?.duration
  ).toBe("0 s")
})

test("a successful run keeps Model working complete while the session is still active", () => {
  const row: HostedObservation = {
    id: "s",
    repo: "o/r",
    request: "change",
    owner: "maya",
    sessionId: "s",
    accepted: true,
    phase: "running",
    session: { ...session, status: "active", run: { ...session.run!, status: "success" } },
    result: null,
    pull: null,
    files: [],
    error: null,
    stages: { "Model working": 1000 }
  }
  const view = deriveHostedChange(row)
  expect(view.stages[3]?.tone).toBe("done")
  expect(view.stages[4]?.tone).toBe("pending")
  expect(hostedSessionPhase(row.session!, null)).toBe("running")
})

test('sandbox copy truncates the receipt commit and never claims verification', () => {
 const commit = 'abcdef1234567890abcdef1234567890abcdef12'
 const record = { ...result(), head_commit: commit, test_receipt: { ...result().test_receipt!, commit } }
 expect(testingCopy(record).text).toBe("bun test exited 0 in the agent's sandbox at abcdef123456 · 33 tests")
 expect(testingCopy(null)).toMatchObject({ tested: false, passed: false, text: 'Tests not run at this commit', command: null })
 for (const item of [record, result(1), result(0, 0), result(0, null), result(0, 33, 'drift'), null]) {
  const copy = testingCopy(item)
  expect(`${copy.text} ${copy.note}`.toLowerCase()).not.toMatch(/passed|verified/)
 }
})

for (const [reason_code, reason] of [
  ["runtime_offline_unavailable", "Runtime offline execution is unavailable"],
  ["test_env_unavailable", "dependencies not installed in the sandbox"],
  ["future_reason", "A future runtime reason"]
]) test(`null receipt preserves ${reason_code}`, () => {
  const record = CodingResultSchema.parse({ ...result(), test_receipt: null, test_not_run: { reason_code, reason } })
  expect(record.test_not_run).toEqual({ reason_code, reason })
  expect(testingCopy(record)).toMatchObject({ tested: false, passed: false, command: null, text: `Tests not run: ${reason}` })
  expect(testingCopy(record).note).not.toContain("failed")
})
test("not-run schema supports old and nullable records and requires string reasons", () => {
  const record = { ...result(), test_receipt: null }
  for (const value of [record, { ...record, test_not_run: null }]) {
    expect(testingCopy(CodingResultSchema.parse(value)).text).toBe("Tests not run at this commit")
  }
  expect(CodingResultSchema.safeParse({ ...record, test_not_run: { reason_code: "future", reason: 42 } }).success).toBe(false)
})
