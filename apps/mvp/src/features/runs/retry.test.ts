import { expect, test } from "vitest"
import { failedTodoRun, todoRetryPayload } from "./retry"

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
