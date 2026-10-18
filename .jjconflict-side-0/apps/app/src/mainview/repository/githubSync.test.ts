import { describe, expect, test } from "bun:test"
import { githubSyncChip, githubSyncOf, mirrorFailureReason, syncAge } from "./githubSync"

/*
 * The sync chip rule (Platform d-zo8f5i, #4317) and the mock's strings
 * (design-mocks frame/RepoFrame.tsx:79-95, frame/githubSync.ts:17).
 */
const NOW = Date.parse("2026-10-18T22:00:00Z")
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString()
const sync = (status: string, behindRefs = 0, failedRefs = 0, lastMirrorAt: string | null = at(180), lastMirrorError: string | null = null) =>
  ({ status, behindRefs, failedRefs, lastMirrorAt, lastMirrorError })

describe("githubSyncOf", () => {
  test("reads the document's five fields as the backend writes them", () => {
    expect(githubSyncOf({ mirror_status: "behind", behind_refs: 2, failed_refs: 1, last_mirror_at: "2026-10-18T19:00:00Z", last_mirror_error: "x" }))
      .toEqual({ status: "behind", behindRefs: 2, failedRefs: 1, lastMirrorAt: "2026-10-18T19:00:00Z", lastMirrorError: "x" })
  })
  test("absent, empty or malformed fields are no status, no time, no error and zero refs", () => {
    expect(githubSyncOf({ mirror_status: "", behind_refs: -1, failed_refs: "3", last_mirror_at: null, last_mirror_error: "" }))
      .toEqual({ status: "", behindRefs: 0, failedRefs: 0, lastMirrorAt: null, lastMirrorError: null })
    expect(githubSyncOf({})).toEqual({ status: "", behindRefs: 0, failedRefs: 0, lastMirrorAt: null, lastMirrorError: null })
    expect(githubSyncOf(undefined)).toBeUndefined()
  })
})

describe("syncAge", () => {
  test("just now under a minute, then minutes, hours and days", () => {
    expect(syncAge(at(0), NOW)).toBe("just now")
    expect(syncAge(at(0.5), NOW)).toBe("just now")
    expect(syncAge(at(1), NOW)).toBe("1 min ago")
    expect(syncAge(at(59), NOW)).toBe("59 min ago")
    expect(syncAge(at(60), NOW)).toBe("1 h ago")
    expect(syncAge(at(180), NOW)).toBe("3 h ago")
    expect(syncAge(at(1439), NOW)).toBe("23 h ago")
    expect(syncAge(at(1440), NOW)).toBe("1 d ago")
    expect(syncAge(at(1440 * 12), NOW)).toBe("12 d ago")
  })
  test("a time ahead of now reads just now, never a negative age", () => {
    expect(syncAge(at(-30), NOW)).toBe("just now")
  })
})

describe("githubSyncChip", () => {
  test("synced: Synced with GitHub, no age", () => {
    expect(githubSyncChip(sync("synced"), NOW)).toEqual({ state: "synced" })
    expect(githubSyncChip(sync("synced", 3, 1), NOW)).toEqual({ state: "synced" })
  })
  test("behind with refs behind or failed is stale, with the last sync's age", () => {
    expect(githubSyncChip(sync("behind", 2, 0), NOW)).toEqual({ state: "stale", age: "3 h ago" })
    expect(githubSyncChip(sync("behind", 0, 1), NOW)).toEqual({ state: "stale", age: "3 h ago" })
    expect(githubSyncChip(sync("behind", 1, 1, at(5)), NOW)).toEqual({ state: "stale", age: "5 min ago" })
  })
  test("behind with 0/0 refs renders as synced (#4317)", () => {
    expect(githubSyncChip(sync("behind", 0, 0), NOW)).toEqual({ state: "synced" })
  })
  test("failed names the reason and the last success's age; no reason text, no invented one", () => {
    expect(githubSyncChip(sync("failed", 1, 1, at(180), "GitHub returned 401 for the app installation."), NOW))
      .toEqual({ state: "failed", failure: "GitHub sync failed: GitHub returned 401 for the app installation.", age: "3 h ago" })
    expect(githubSyncChip(sync("failed", 0, 0, at(1440 * 2), null), NOW)).toEqual({ state: "failed", failure: "GitHub sync failed", age: "2 d ago" })
  })
  test("no last_mirror_at, or no status word, is no claim at all, whatever the counts say", () => {
    expect(githubSyncChip(sync("behind", 3, 0, null), NOW)).toBeNull()
    expect(githubSyncChip(sync("synced", 0, 0, null), NOW)).toBeNull()
    expect(githubSyncChip(sync("failed", 0, 0, null, "down"), NOW)).toBeNull()
    expect(githubSyncChip(sync("", 0, 0), NOW)).toBeNull()
    expect(githubSyncChip(sync("synced", 0, 0, "yesterday"), NOW)).toBeNull()
    expect(githubSyncChip(undefined, NOW)).toBeNull()
  })
  test("a status word this app does not know is no claim", () => {
    expect(githubSyncChip(sync("unconfigured"), NOW)).toBeNull()
    expect(githubSyncChip(sync("SYNCED"), NOW)).toBeNull()
  })
})

test("a failed mirror's reason is redacted and bounded before a member reads it", () => {
  const raw = "fatal: unable to access 'https://x-access-token:ghs_abcdefghijklmnopqrstuvwxyz0123456789@github.com/acme/app.git/': Bearer sk-ant-api03-abcdefghijklmnop smithers_task_v1.eyJ0YXNrX2lkIjoxfQ.c2lnbmF0dXJl"
  const reason = mirrorFailureReason(raw)
  for (const secret of ["ghs_abcdefghijklmnopqrstuvwxyz0123456789", "sk-ant-api03-abcdefghijklmnop", "smithers_task_v1", "eyJ0YXNrX2lkIjoxfQ"]) expect(reason).not.toContain(secret)
  expect(reason).toContain("fatal: unable to access")
  const chip = githubSyncChip(sync("failed", 1, 1, at(180), raw))
  expect(chip?.state === "failed" && chip.failure.startsWith("GitHub sync failed: ")).toBe(true)
  expect(chip?.state === "failed" && chip.failure.includes("ghs_abcdefghijklmnopqrstuvwxyz0123456789")).toBe(false)
  expect(mirrorFailureReason("e".repeat(1000)).length).toBe(300)
})
