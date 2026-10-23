import { expect, test } from "vitest"
import { answerOutcomeOf, domainOutcomeOf, draftOutcomeOf, failedTodoRun, hasDomainOutcome, headerStatusOf, todoRetryPayload } from "./todoRun"

const value = (data: unknown) => ({ text: JSON.stringify(data), clipped: false })
test("TODO retry decodes only whole inspection values and keeps repository and number", () => {
  expect(todoRetryPayload(value({ repoId: "github/octo/hello", number: 1, attemptId: "old" })))
    .toEqual({ repo: "octo/hello", number: 1 })
  for (const input of [
    null, {}, { repoId: "github/octo/hello", number: 1 },
    { ...value({ repoId: "github/octo/hello", number: 1 }), clipped: true },
    { text: "{", clipped: false }, value({ repoId: "octo/hello", number: 1 }),
    value({ repoId: "github/octo/hello", number: 0 }),
    value({ repoId: "github/octo/hello", number: 1.5 }),
  ]) expect(todoRetryPayload(input)).toBeUndefined()
})
test("failed and cancelled TODO runs retry, including failure returned as a successful flow result", () => {
  const run = { flowName: "todo", status: "completed", result: value({ state: "failed" }) }
  expect(failedTodoRun(run)).toBe(true)
  expect(failedTodoRun({ ...run, status: "failed", result: null })).toBe(true)
  expect(failedTodoRun({ ...run, status: "cancelled", result: null })).toBe(true)
  expect(failedTodoRun({ ...run, result: value({ state: "merged" }) })).toBe(false)
  expect(failedTodoRun({ ...run, status: "running", result: null })).toBe(false)
  expect(failedTodoRun({ ...run, flowName: "other" })).toBe(false)
})

test("a failed TODO result makes the run header Failed, while other completed work stays Done", () => {
  const failed = { flowName: "todo", status: "completed" as const, result: value({ state: "failed" }) }
  expect(headerStatusOf(failed)).toBe("failed")
  expect(headerStatusOf({ ...failed, result: value({ state: "merged" }) })).toBe("completed")
  expect(headerStatusOf({ ...failed, flowName: "flow/run" })).toBe("completed")
  expect(headerStatusOf({ ...failed, status: "running", result: null })).toBe("running")
})

test("a failed draft round makes its Run header Failed without changing an unrelated run", () => {
  const failed = { flowName: "flow/new", status: "completed" as const, result: value({ status: "failed", round: 0 }) }
  expect(domainOutcomeOf("flow/new", failed.result)).toBe("failed")
  expect(headerStatusOf(failed)).toBe("failed")
  expect(headerStatusOf({ ...failed, result: value({ status: "ready", round: 0 }) })).toBe("completed")
  expect(headerStatusOf({ ...failed, flowName: "flow/run" })).toBe("completed")
  expect(headerStatusOf({ ...failed, result: { ...value({ status: "failed" }), clipped: true } })).toBe("completed")
})

test("a failed answer makes its Run header Failed without exposing its text", () => {
  const failed = { flowName: "chat/Answer", status: "completed" as const, result: value({ status: "failed", text: "private" }) }
  expect(headerStatusOf(failed)).toBe("failed")
  expect(headerStatusOf({ ...failed, result: value({ status: "done" }) })).toBe("completed")
  expect(headerStatusOf({ ...failed, result: { ...failed.result, clipped: true } })).toBe("completed")
  expect(hasDomainOutcome("chat/Answer")).toBe(true)
  expect(hasDomainOutcome("app/theme/set")).toBe(false)
  expect(answerOutcomeOf(failed.result)).toBe("failed")
  expect(answerOutcomeOf(value({ status: "done", text: "private" }))).toBe("succeeded")
  expect(answerOutcomeOf(value({ status: "unexpected" }))).toBe("unknown")
  expect(answerOutcomeOf({ ...failed.result, clipped: true })).toBe("unknown")
})

test("a draft's list outcome uses only whole, finite round results", () => {
  expect(draftOutcomeOf(value({ status: "failed", request: "private" }))).toBe("failed")
  expect(draftOutcomeOf(value({ status: "ready" }))).toBe("succeeded")
  expect(draftOutcomeOf(value({ status: "needs_you" }))).toBe("succeeded")
  for (const result of [null, value({ status: "drafting" }), value({ status: "unexpected" }),
    { ...value({ status: "failed" }), clipped: true }, { text: "{", clipped: false }]) {
    expect(draftOutcomeOf(result)).toBe("unknown")
  }
})
