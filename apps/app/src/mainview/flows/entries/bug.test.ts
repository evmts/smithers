import { expect, test } from "bun:test"
import { bugReportUrl, bugRouteKind } from "../../BugReport"
import { parseSubmit } from "../registry"
import { createAppController } from "../../state/AppController"
import { createAppStore } from "../../state/AppStore"

test("bug URL carries safe diagnostics and empty report fields, never a private repository", () => {
  const url = new URL(bugReportUrl({ repository: "smithersai/smithers", build: "rc.14 abcdef", pathname: "/secret-owner/private-project/issues/12",
    failureCode: "host_no_capacity", correlationId: "request-123" }))
  expect(url.origin + url.pathname).toBe("https://github.com/smithersai/smithers/issues/new")
  expect(url.searchParams.get("title")).toBe("Bug report")
  const body = url.searchParams.get("body")!
  for (const part of ["## What happened\n\n", "## Expected\n\n", "## Steps\n\n", "Route kind: issues", "Build: rc.14 abcdef", "host_no_capacity", "request-123"]) expect(body).toContain(part)
  expect(url.href).not.toContain("secret-owner")
  expect(url.href).not.toContain("private-project")
  expect(new URL(bugReportUrl({ repository: "team/support", pathname: "/", build: "test" })).pathname).toBe("/team/support/issues/new")
  expect(bugRouteKind("/private-owner/private-repo/blob/main/secrets.txt")).toBe("file")
})
test("slash, button and agent share bug.report and create no issue or app card", async () => {
  const data = new Map<string, string>()
  const store = await createAppStore({ kind: "localStorage", storage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) }, removeItem: key => { data.delete(key) } } })
  const opened: unknown[][] = []
  const previous = globalThis.open
  globalThis.open = ((...args: unknown[]) => { opened.push(args); return null }) as typeof open
  const controller = createAppController(store, { available: false, startTurn: async () => { throw new Error("No model") }, cancelTurn: async () => {}, subscribe: () => () => {} }, {
    bootstrap: { apiVersion: 1, host: "cloud", version: "test", buildSha: "abcdef", capabilities: [], authFlow: "redirect", sandbox: null }
  })
  try {
    const before = store.collections.cards.size
    expect(parseSubmit("/bug", controller.commands.all())).toEqual({ kind: "command", name: "bug.report" })
    expect((await controller.commands.run("bug")).status).toBe("executed")
    expect((await controller.commands.run("bug.report", '{"correlationId":"req-7"}')).status).toBe("executed")
    expect(controller.commands.disclosed().some(row => row.name === "bug.report")).toBe(true)
    expect((await controller.commands.runAsAgent("bug.report")).status).toBe("executed")
    expect(opened).toHaveLength(3)
    expect(opened[1]![0]).toContain("req-7")
    expect(opened[0]!.slice(1)).toEqual(["_blank", "noopener,noreferrer"])
    expect(store.collections.cards.size).toBe(before)
  } finally { globalThis.open = previous; await controller.dispose() }
})

test("route kinds contain no repository, path, query or subject identifier", () => {
  for (const [path, kind] of [
    ["/", "launcher"], ["/docs", "other"], ["/secret/private", "repository"],
    ["/secret/private/tree/main/credentials", "file"], ["/secret/private/blob/main/.env", "file"],
    ["/secret/private/issues/71", "issues"], ["/secret/private/pull/72", "pull-request"], ["/secret/private/pulls", "pull-request"]
  ]) expect(bugRouteKind(path!)).toBe(kind!)
})

test("invalid destination configuration fails closed and unsafe diagnostic text stays out", () => {
  for (const repository of ["https://evil.example/a/b", "../support", "team/..", "team/repo/extra", ""]) {
    expect(() => bugReportUrl({ repository, build: "test", pathname: "/" })).toThrow("Invalid bug report repository")
  }
  const url = bugReportUrl({ repository: "team/support", build: "test", pathname: "/secret/private/issues/71", failureCode: "private/repository", correlationId: "token=SECRET\nprivate/repo" })
  const body = new URL(url).searchParams.get("body")!
  expect(body).not.toContain("Failure code")
  expect(body).not.toContain("Correlation id")
  expect(body).not.toContain("SECRET")
  expect(body).not.toContain("private")
})
