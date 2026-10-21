import { expect, test } from "vitest"
import { BROWSER_TELEMETRY } from "../../telemetry"
import { WRITE_FAILURES } from "../issues/contract"
import {
  CHECK_NAME,
  CHECK_STATUS_WORDS,
  checkExecutionId,
  checkFlowOf,
  compareRoute,
  deployWarningOf,
  githubPullUrl,
  MERGE_FAILURE_COPY,
  MERGE_FAILURES,
  mergeExecutionId,
  PULL_COLUMNS,
  PULL_STATE_WORDS,
  PULL_TABS,
  PULLS_TELEMETRY,
  pullPath,
  pullStateOf,
  pullsPath,
  pullTabPath,
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

test("the pages are GitHub's paths; Conversation is the pull request's own", () => {
  expect(pullsPath("octo", "hello")).toBe("/octo/hello/pulls")
  expect(pullPath("octo", "hello", 2)).toBe("/octo/hello/pull/2")
  expect(PULL_TABS.map((tab) => pullTabPath("octo", "hello", 2, tab))).toEqual([
    "/octo/hello/pull/2",
    "/octo/hello/pull/2/commits",
    "/octo/hello/pull/2/checks",
    "/octo/hello/pull/2/files",
  ])
})

test("a pull request's state: merged over closed over draft; each with its word", () => {
  const states = [
    { state: "open", draft: false, merged: false },
    { state: "open", draft: true, merged: false },
    { state: "closed", draft: false, merged: true },
    { state: "closed", draft: true, merged: false },
  ].map(pullStateOf)
  expect(states).toEqual(["open", "draft", "merged", "closed"])
  expect(states.map((state) => PULL_STATE_WORDS[state])).toEqual(["Open", "Draft", "Merged", "Closed"])
  expect(CHECK_STATUS_WORDS["done"]).toBe("Passed")
})

test("every merge refusal is a write failure, and each says what happened in a few words", () => {
  expect(MERGE_FAILURES.every((failure) => (WRITE_FAILURES as ReadonlyArray<string>).includes(failure))).toBe(true)
  expect(MERGE_FAILURES.map((failure) => MERGE_FAILURE_COPY[failure]("trunk"))).toEqual([
    "New commits",
    "trunk moved",
    "Draft",
    "Can't merge",
    "Merged",
    "Closed",
  ])
})

test("ruling GH-9: merging into the default branch deploys it, in the branch's own name", () => {
  expect(deployWarningOf("main")).toBe("Merging into main deploys it.")
  expect(deployWarningOf("trunk")).toBe("Merging into trunk deploys it.")
  // The device syncs the default branch beside the base, so the page can compare them.
  expect(PULL_COLUMNS).toContain("default_branch")
})

test("the relay keeps what the pages record: a merge press and its outcome, a comparison's read", () => {
  for (const record of PULLS_TELEMETRY.records) expect(BROWSER_TELEMETRY.records).toContain(record)
  expect(BROWSER_TELEMETRY.fields).toContain("outcome")
})
