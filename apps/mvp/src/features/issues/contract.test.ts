// The issues contract's helpers (src/features/issues/contract.ts): the routes, ids, keys and words the browser, ChatApi
// and the GitHub flows share.
import { describe, expect, test } from "vitest"
import {
  agentAttribution,
  applyExecutionId,
  commentDraftKey,
  commentId,
  githubIssueUrl,
  issueNumberOf,
  issuePath,
  issuesChannel,
  issuesPath,
  itemId,
  MAX_ISSUE_NUMBER,
  newDraftKey,
  newIssuePath,
  NOT_SENT_COPY,
  NOT_SENT_REASONS,
  reconcileExecutionId,
  refusalOf,
  SYNC_STALE_MS,
  writeExecutionId,
  writesRoute,
} from "./contract"

describe("routes and paths", () => {
  test("the writes route escapes its owner and name; the app's issue paths are GitHub's", () => {
    expect(writesRoute("octo", "hello")).toBe("/api/repos/octo/hello/writes")
    expect(writesRoute("a b", "c/d")).toBe("/api/repos/a%20b/c%2Fd/writes")
    expect(issuesPath("octo", "hello")).toBe("/octo/hello/issues")
    expect(newIssuePath("octo", "hello")).toBe("/octo/hello/issues/new")
    expect(issuePath("octo", "hello", 12)).toBe("/octo/hello/issues/12")
    expect(githubIssueUrl("octo", "hello", 12)).toBe("https://github.com/octo/hello/issues/12")
  })

  test("an issue route's number is 1 to the largest integer Postgres keeps, written plainly", () => {
    expect(issueNumberOf("1")).toBe(1)
    expect(issueNumberOf("12")).toBe(12)
    expect(issueNumberOf(String(MAX_ISSUE_NUMBER))).toBe(MAX_ISSUE_NUMBER)
    for (const text of ["", "0", "012", "-1", "1.5", "1e3", "abc", "new", String(MAX_ISSUE_NUMBER + 1), "99999999999"]) {
      expect([text, issueNumberOf(text)]).toEqual([text, undefined])
    }
  })
})

describe("ids and keys", () => {
  test("rows, runs, drafts and the engine channel are named from what both sides know", () => {
    expect(itemId("github/octo/hello", 12)).toBe("github/octo/hello#12")
    expect(commentId("github/octo/hello", 501)).toBe("github/octo/hello/comment/501")
    expect(writeExecutionId("w")).toBe("github-write:w")
    expect(applyExecutionId("d")).toBe("github-apply:d")
    expect(newDraftKey("github/octo/hello")).toBe("new:github/octo/hello")
    expect(commentDraftKey("github/octo/hello", 7)).toBe("comment:github/octo/hello#7")
    expect(issuesChannel("smithers")).toBe("smithers/issues")
    expect(agentAttribution("maya")).toBe("Smithers for @maya")
  })

  test("a stale read's reconcile run is one per repository and 5-minute bucket", () => {
    const start = 10 * SYNC_STALE_MS
    expect(reconcileExecutionId("r", start)).toBe(reconcileExecutionId("r", start + SYNC_STALE_MS - 1))
    expect(reconcileExecutionId("r", start)).not.toBe(reconcileExecutionId("r", start + SYNC_STALE_MS))
    expect(reconcileExecutionId("r", start)).toBe("github-reconcile:r:10")
  })
})

describe("Not sent", () => {
  test("the route's refusals by status; anything else is sent again", () => {
    expect([400, 401, 403, 404, 409, 413].map(refusalOf)).toEqual([
      "invalid",
      "authentication",
      "forbidden",
      "not_found",
      "conflict",
      "too_large",
    ])
    for (const status of [undefined, 200, 202, 408, 429, 500, 502, 503]) expect(refusalOf(status)).toBeUndefined()
  })

  test("every reason has its words", () => {
    expect(Object.keys(NOT_SENT_COPY).sort()).toEqual([...NOT_SENT_REASONS].sort())
    for (const words of Object.values(NOT_SENT_COPY)) expect(words.length).toBeGreaterThan(0)
  })
})
