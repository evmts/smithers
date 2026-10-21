import { describe, expect, it } from "vitest"
import { type Ended, outcomeOf, render, summarize } from "./summary"
import { describeBroken, describeNeed } from "./target"

const ended = (fields: Partial<Ended>): Ended => ({
  file: "/repo/apps/mvp/e2e/chat.spec.ts",
  title: "ask",
  outcome: "expected",
  expectedStatus: "passed",
  status: "passed",
  annotations: [],
  ...fields,
})
const skip = (description?: string) => ({ type: "skip", description })

describe("a test's outcome", () => {
  it("is passed or failed by Playwright's verdict", () => {
    expect(outcomeOf(ended({}))).toEqual({ kind: "passed" })
    expect(outcomeOf(ended({ outcome: "flaky" }))).toEqual({ kind: "passed" })
    expect(outcomeOf(ended({ outcome: "unexpected" }))).toEqual({ kind: "failed" })
  })

  it("is a declared skip when the skip names a need, and blocked when that need is a missing prerequisite", () => {
    expect(outcomeOf(ended({ outcome: "skipped", annotations: [skip(describeNeed("faults"))] }))).toMatchObject({ kind: "skipped", name: "faults" })
    expect(outcomeOf(ended({ outcome: "skipped", annotations: [skip(describeNeed("member"))] }))).toMatchObject({
      kind: "blocked",
      name: "member",
      reason: expect.stringMatching(/^it asks, clones or tracks/),
    })
  })

  it("is undeclared for any other skip, with what it said", () => {
    expect(outcomeOf(ended({ outcome: "skipped", annotations: [skip("BASE_URL is a deployment")] }))).toEqual({
      kind: "undeclared",
      reason: "BASE_URL is a deployment",
    })
    expect(outcomeOf(ended({ outcome: "skipped", annotations: [{ type: "summary", description: "x" }] }))).toEqual({
      kind: "undeclared",
      reason: "no reason given",
    })
  })

  it("reads the first declared skip among several", () => {
    expect(outcomeOf(ended({ outcome: "skipped", annotations: [skip("no"), skip(describeNeed("localLogs"))] }))).toMatchObject({ name: "localLogs" })
  })

  it("is broken when a test marked broken fails, fixed only when it passes, and failed when it fails otherwise", () => {
    const fail = { type: "fail", description: describeBroken("remoteFlows") }
    expect(outcomeOf(ended({ expectedStatus: "failed", status: "failed", annotations: [fail] }))).toEqual({ kind: "broken", name: "remoteFlows" })
    expect(outcomeOf(ended({ expectedStatus: "failed", outcome: "unexpected", annotations: [fail] }))).toEqual({ kind: "fixed", name: "remoteFlows" })
    expect(outcomeOf(ended({ expectedStatus: "failed", outcome: "unexpected", status: "timedOut", annotations: [fail] }))).toEqual({ kind: "failed" })
  })

  it("is broken by a spec's own test.fail too, named by its description", () => {
    const own = { type: "fail", description: "Broken, cause not found: the clock" }
    expect(outcomeOf(ended({ expectedStatus: "failed", status: "failed", annotations: [own] }))).toEqual({ kind: "broken", name: own.description })
    expect(outcomeOf(ended({ expectedStatus: "failed", status: "failed", annotations: [] }))).toEqual({ kind: "broken", name: "marked broken" })
    expect(outcomeOf(ended({ expectedStatus: "failed", outcome: "unexpected", annotations: [own] }))).toEqual({ kind: "fixed", name: own.description })
  })
})

describe("the run's summary", () => {
  const run = [
    ended({ file: "/e/chat.spec.ts", title: "ask" }),
    ended({ file: "/e/chat.spec.ts", title: "reload", outcome: "skipped", annotations: [skip(describeNeed("member"))] }),
    ended({ file: "/e/sync.spec.ts", title: "down", outcome: "skipped", annotations: [skip(describeNeed("faults"))] }),
    ended({ file: "/e/sync.spec.ts", title: "down twice", outcome: "skipped", annotations: [skip(describeNeed("faults"))] }),
    ended({ file: "/e/repo.spec.ts", title: "clone", expectedStatus: "failed", annotations: [{ type: "fail", description: describeBroken("remoteFlows") }] }),
  ]

  it("counts each spec's outcomes and each skip reason", () => {
    const summary = summarize(run)
    expect(summary.rows.map((row) => row.spec)).toEqual(["chat.spec.ts", "repo.spec.ts", "sync.spec.ts"])
    expect(summary.rows[0]!.counts).toMatchObject({ passed: 1, blocked: 1 })
    expect(summary.total).toEqual({ passed: 1, failed: 0, broken: 1, fixed: 0, skipped: 2, blocked: 1, undeclared: 0 })
    expect(summary.reasons.map(({ count, reason }) => [count, reason.split(":")[0]])).toEqual([[2, "needs faults"], [1, "blocked member"]])
  })

  it("passes with only passes, broken marks and declared skips", () => {
    const summary = summarize(run.filter((test) => test.title !== "reload"))
    expect(summary.passed).toBe(true)
    expect(render(summary)).toContain("Run passed.")
  })

  it("fails for a blocked need, a failure, an undeclared skip and a broken mark that passes, saying which", () => {
    const summary = summarize([
      ...run,
      ended({ file: "/e/chat.spec.ts", title: "stream", outcome: "unexpected" }),
      ended({ file: "/e/web.spec.ts", title: "open", outcome: "skipped", annotations: [skip("the conversation is short")] }),
      ended({ file: "/e/repo.spec.ts", title: "browse", expectedStatus: "failed", outcome: "unexpected", annotations: [{ type: "fail", description: describeBroken("remoteFlows") }] }),
    ])
    expect(summary.passed).toBe(false)
    expect(summary.failing).toEqual([
      "chat.spec.ts: stream: failed",
      "web.spec.ts: open: skipped without a declared need (the conversation is short)",
      "repo.spec.ts: browse: passes though marked broken remoteFlows; remove the mark",
      "1 tests blocked: the run lacks a prerequisite (see \"blocked\" below)",
    ])
  })

  it("says once that nothing ran after the setup failed, instead of one undeclared skip per test", () => {
    const summary = summarize([
      ended({ file: "/e/deployment/sign-in.setup.ts", title: "sign in", outcome: "unexpected" }),
      ended({ file: "/e/chat.spec.ts", title: "ask", outcome: "skipped" }),
      ended({ file: "/e/sync.spec.ts", title: "down", outcome: "skipped" }),
      ended({ file: "/e/sync.spec.ts", title: "up", outcome: "skipped", annotations: [skip("its own reason")] }),
    ])
    expect(summary.failing).toEqual([
      "sign-in.setup.ts: sign in: failed",
      "sync.spec.ts: up: skipped without a declared need (its own reason)",
      "2 tests didn't run: the setup failed",
    ])
  })

  it("lists a test that ran without a part its target lacks, and still passes it", () => {
    const partly = { type: "partly", description: describeNeed("localLogs") }
    const summary = summarize([ended({ annotations: [partly] }), ended({ title: "other", annotations: [partly, { type: "partly", description: "unknown" }] })])
    expect(summary.passed).toBe(true)
    expect(summary.reasons).toEqual([{ reason: `partly, ${describeNeed("localLogs")}`, count: 2 }])
  })

  it("renders a table with a total, the reasons, and the verdict", () => {
    const text = render(summarize(run))
    const lines = text.split("\n")
    expect(lines[0]).toMatch(/^spec\s+passed\s+failed\s+broken\s+fixed\s+skipped\s+blocked\s+undeclared$/)
    expect(lines[1]).toMatch(/^chat\.spec\.ts\s+1\s+·\s+·\s+·\s+·\s+1\s+·$/)
    expect(text).toMatch(/^total\s+1\s+0\s+1\s+0\s+2\s+1\s+0$/m)
    expect(text).toContain("   2 × needs faults: the app's faulty services")
    expect(text).toContain("Run failed:\n  - 1 tests blocked")
  })
})
