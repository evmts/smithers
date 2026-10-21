import { expect, test } from "vitest"
import {
  CHECK_NAME,
  checkExecutionId,
  checkFlowOf,
  compareRoute,
  githubPullUrl,
  mergeExecutionId,
  reviewId,
  SHA,
  todoExecutionId,
} from "./contract"

// The pull requests contract's paths and ids (docs/features/pulls.md): what the routes, the flows and the device agree on.

test("the compare route, GitHub's page, a review's row id and each run's execution id", () => {
  expect(compareRoute("o w", "n", "a", "b")).toBe("/api/repos/o%20w/n/compare/a...b")
  expect(githubPullUrl("octo", "hello", 2)).toBe("https://github.com/octo/hello/pull/2")
  expect(reviewId("github/o/n", 7)).toBe("github/o/n/review/7")
  expect(todoExecutionId("x")).toBe("todo:x")
  expect(mergeExecutionId("x")).toBe("pr-merge:x")
  expect(checkExecutionId("github/o/n", "s", "all")).toBe("check:github/o/n:s:all")
  expect(checkFlowOf("readme")).toBe("checks/readme")
})

test("a SHA is 40 lowercase hex digits; a check's name is a file name's stem", () => {
  expect([SHA.test("a".repeat(40)), SHA.test("A".repeat(40)), SHA.test("a".repeat(39))]).toEqual([true, false, false])
  expect([CHECK_NAME.test("readme_1-x"), CHECK_NAME.test("a.b"), CHECK_NAME.test("")]).toEqual([true, false, false])
})
