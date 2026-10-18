import { expect, test } from "bun:test"
import { drift, type DriftInput } from "./drift"
import type { RunResult } from "./results"
import { issueOwner } from "./issueOwner"

const receipt = (mode: "mock" | "live", ok = true): RunResult => ({ journey: "default/test", mode, revision: "r", startedAt: "2026-10-18T10:00:00Z", state: "stale", steps: [{ caption: "Open", spec: "D1", status: ok ? "passed" : "failed", screenshot: "1.png", ms: 1, assertions: [{ kind: "see", ok, expected: true, actual: ok }] }] })
const input = (patch: Partial<DriftInput> = {}): DriftInput => ({ runs: [receipt("mock"), { ...receipt("live"), state: "unverified", reason: "Pair mock/live evidence in drift before assigning shipped or ahead" }], journeys: [{ id: "default/test" }], ahead: {}, capabilities: [], builtAt: "2026-10-18T09:48:00Z", now: Date.parse("2026-10-18T10:00:00Z"), aheadMaxDays: 14, ...patch })
const open = async () => ({ state: "open" as const, createdAt: "2026-10-01T10:00:00Z" })
test("one cycle detects seeded regression and retains shipped history across subsequent failures", async () => {
  const first = await drift(input(), open)
  expect(first.rows[0]?.state).toBe("shipped")
  const second = await drift(input({ runs: [receipt("mock"), receipt("live", false)], previous: first.rows }), open)
  expect(second.regressed).toBe(1)
  expect((await drift(input({ runs: [receipt("mock"), receipt("live", false)], previous: second.rows }), open)).regressed).toBe(1)
  expect((await drift(input({ previous: second.rows }), open)).regressed).toBe(0)
})
test("ahead requires a verified open owner, shows age and factory warning", async () => {
  const patch = { runs: [receipt("mock"), receipt("live", false)], journeys: [{ id: "default/test", owner: "issue#1" }] }
  const value = await drift(input(patch), open)
  expect(value.rows[0]?.state).toBe("ahead"); expect(value.rows[0]?.owner).toEqual({ issue: "issue#1", ageDays: 17, warning: true })
  expect((await drift(input(patch), async () => { throw new Error("offline") })).rows[0]?.state).toBe("unverified")
  expect((await drift(input(patch), async () => ({ ...await open(), state: "closed" }))).ahead).toBe(0)
})
test("capability drift has no open owner; unavailable bootstrap never implies a gap", async () => {
  expect((await drift(input({ capabilities: ["a"] }), open)).capability).toEqual([])
  const value = await drift(input({ capabilities: ["a", "b", "c"], productionCapabilities: ["a"], ahead: { b: "issue#1" } }), open)
  expect(value.capability).toEqual([{ capability: "c", state: "drift", reason: "No open owning issue" }])
  expect((await drift(input({ runs: [receipt("mock"), receipt("live", false)], journeys: [{ id: "default/test", capabilities: ["b"] }], ahead: { b: "issue#1" } }), open)).ahead).toBe(1)
})
test("wire drift rejects malformed and unknown fields without copying capture values", async () => {
  const value = await drift(input({ captures: [{ schema: "FileCard", response: {} }, { schema: "unknown", response: { secret: "do-not-copy" } }] }), open)
  expect(value.wire).toHaveLength(2); expect(JSON.stringify(value)).not.toContain("do-not-copy")
})
test("unverified never goes green, mock failure needs Product to call it stale", async () => {
  expect((await drift(input({ runs: [] }), open)).rows[0]?.state).toBe("unverified")
  expect((await drift(input({ runs: [{ ...receipt("mock"), state: "unverified", reason: "Out of budget" }, receipt("live")] }), open)).rows[0]?.state).toBe("unverified")
  expect((await drift(input({ runs: [receipt("mock", false), receipt("live")] }), open)).rows[0]?.state).toBe("unverified")
  expect((await drift(input({ runs: [receipt("mock", false)], journeys: [{ id: "default/test", stale: { by: "Product", reason: "App moved" } }] }), open)).rows[0]?.state).toBe("stale")
})
test("REST owner adapter is GET only and refuses redirects, PRs, bad data and missing token", async () => {
  const calls: RequestInit[] = []
  const reader = issueOwner("test-token", "owner/repo", (async (url, init) => { expect(String(url)).toBe("https://api.github.com/repos/owner/repo/issues/1"); calls.push(init!); return Response.json({ state: "open", created_at: "2026-10-01T00:00:00Z" }) }) as typeof fetch)
  expect((await reader("issue#1")).state).toBe("open"); expect(calls[0]?.method).toBeUndefined(); expect(calls[0]?.redirect).toBe("error")
  await expect(reader("bad")).rejects.toThrow("Invalid issue")
  await expect(issueOwner("")("#1")).rejects.toThrow("token")
})
test("a runner-rejected capture stays wire drift even though no override was written", async () => {
  const value = await drift(input({ runs: [receipt("mock"), { ...receipt("live"), reason: "GET /api/bootstrap: sandbox: invalid do-not-copy" }] }), open)
  expect(value.wire).toEqual([{ journey: "default/test", schema: "GET /api/bootstrap", reason: "Route schema rejected capture" }])
  expect(JSON.stringify(value)).not.toContain("do-not-copy")
})
export { receipt, input }
