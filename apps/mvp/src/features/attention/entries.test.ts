// The feed as a person sees it (src/features/attention/entries.ts, decision 0009 §4): pure, so every rule is a case
// here: which rows toast and when they hide, which stay in the list, how this device's acts read before they sync,
// what each toast says, and the order.
import { describe, expect, test } from "vitest"
import { HOME_HREF, LISTED_FOR_MS } from "./contract"
import { feedOf, follows, landed, timeOf, withPending, wordsOf } from "./entries"
import type { Notice, Pending } from "./schema"

const T0 = Date.parse("2026-10-20T12:00:00.000Z")
/** `ms` after T0, as Electric sends a timestamptz. */
const at = (ms: number) => new Date(T0 + ms).toISOString().replace("T", " ").replace("Z", "000+00")

const notice = (overrides: Partial<Notice> = {}): Notice => ({
  recipient: "person-ann",
  subject: "run:r1",
  kind: "run",
  state: "working",
  mine: true,
  quiet: false,
  runId: "r1",
  repoId: "github/acme/widgets",
  conversationId: "c-home",
  actor: "ann",
  title: "Deploy the docs preview",
  ref: null,
  href: HOME_HREF,
  version: 1,
  readVersion: 0,
  dismissedVersion: 0,
  hiddenVersion: 0,
  occurredAt: at(0),
  createdAt: at(0),
  updatedAt: at(0),
  ...overrides,
})

const pending = (subject: string, act: Pending["act"], version: number): Pending => ({
  id: `${subject}:${act}`,
  subject,
  act,
  version,
})

const one = (row: Notice, nowMs = T0 + 100, place: string | null = null, acts: ReadonlyArray<Pending> = []) =>
  feedOf([row], acts, nowMs, place).entries[0]

describe("timeOf", () => {
  test("reads Electric's timestamptz and ISO, to the millisecond, and nothing else", () => {
    expect(timeOf("2026-10-20 12:00:00.123456+00")).toBe(Date.parse("2026-10-20T12:00:00.123Z"))
    expect(timeOf("2026-10-20 12:00:00+00")).toBe(Date.parse("2026-10-20T12:00:00Z"))
    expect(timeOf("2026-10-20T12:00:00.5Z")).toBe(Date.parse("2026-10-20T12:00:00.500Z"))
    expect(timeOf("2026-10-20 17:30:00+05:30")).toBe(Date.parse("2026-10-20T12:00:00Z"))
    expect(timeOf("2026-10-20 17:30:00+0530")).toBe(Date.parse("2026-10-20T12:00:00Z"))
    expect(timeOf("2026-10-20 12:00:00")).toBe(Date.parse("2026-10-20T12:00:00Z"))
    expect(timeOf("yesterday")).toBeNaN()
  })
})

describe("feedOf", () => {
  test("a live run toasts on a page; over its own conversation it shows there instead, and stays listed", () => {
    expect(one(notice())).toMatchObject({
      id: "run:r1",
      stack: true,
      stackHere: false,
      here: true,
      listed: true,
      action: "open",
      word: null,
      detail: "Deploy the docs preview",
      unread: true,
      settled: false,
    })
    // Over another conversation, it toasts there too.
    expect(one(notice(), T0, "c-other")).toMatchObject({ here: false, stackHere: true })
    expect(one(notice({ href: "/acme/widgets/tree/feature", conversationId: "c-1" }), T0, "c-1")).toMatchObject({
      here: true,
      stackHere: false,
    })
  })

  test("the person's own question toasts everywhere, with Answer", () => {
    expect(one(notice({ state: "needs_you", title: "Which branch?" }))).toMatchObject({
      stack: true,
      stackHere: true,
      action: "answer",
      detail: "Which branch?",
    })
  })

  test("someone else's run is quiet: a toast naming them while it lives, never an entry, gone 4 s after it settles", () => {
    const theirs = notice({ mine: false, quiet: true, state: "waiting" })
    expect(one(theirs)).toMatchObject({ stack: true, listed: false, unread: false, detail: "ann · Deploy the docs preview" })
    for (const state of ["done", "failed"] as const) {
      const settled = notice({ mine: false, quiet: true, state, updatedAt: at(0) })
      expect(feedOf([settled], [], T0 + 3_999, null)).toMatchObject({ nextAt: T0 + 4_000 })
      expect(one(settled, T0 + 3_999)).toMatchObject({ stack: true, listed: false })
      expect(feedOf([settled], [], T0 + 4_000, null).entries).toEqual([])
    }
    expect(one(notice({ mine: false, quiet: true, actor: null }))!.detail).toBe("Deploy the docs preview")
  })

  test("a finished or failed run toasts for 4 s; a finished one stays listed for 7 days, a failed one until dismissed", () => {
    const done = notice({ state: "done", version: 2 })
    expect(feedOf([done], [], T0 + 10, null)).toMatchObject({ nextAt: T0 + 4_000 })
    expect(one(done, T0 + 4_000)).toMatchObject({ stack: false, listed: true, settled: true })
    expect(feedOf([done], [], T0 + 4_000, null)).toMatchObject({ nextAt: T0 + LISTED_FOR_MS })
    expect(feedOf([done], [], T0 + LISTED_FOR_MS, null)).toEqual({ entries: [], nextAt: undefined })
    const failed = notice({ state: "failed" })
    expect(one(failed, T0 + 3_999)).toMatchObject({ stack: true, listed: true, settled: true })
    expect(one(failed, T0 + LISTED_FOR_MS * 2)).toMatchObject({ stack: false, listed: true, settled: true })
    expect(feedOf([failed], [], T0, null).nextAt).toBe(T0 + 4_000)
    expect(feedOf([failed], [], T0 + 4_000, null).nextAt).toBeUndefined()
  })

  test("Hide keeps the entry; Dismiss closes it; Read marks it read; a new version shows again", () => {
    expect(one(notice({ hiddenVersion: 1 }))).toMatchObject({ stack: false, listed: true })
    expect(one(notice({ dismissedVersion: 1 }))).toBeUndefined()
    expect(one(notice({ readVersion: 1 }))).toMatchObject({ unread: false })
    expect(one(notice({ version: 2, hiddenVersion: 1, readVersion: 1, dismissedVersion: 1 }))).toMatchObject({
      stack: true,
      listed: true,
      unread: true,
    })
  })

  test("this device's acts read at once, before the row syncs them", () => {
    const row = notice({ state: "failed", version: 3 })
    expect(one(row, T0, null, [pending("run:r1", "hide", 3)])).toMatchObject({ stack: false, listed: true })
    expect(one(row, T0, null, [pending("run:r1", "read", 3)])).toMatchObject({ unread: false })
    expect(one(row, T0, null, [pending("run:r1", "dismiss", 3)])).toBeUndefined()
    // Another subject's act changes nothing; an act for an older version doesn't hide a newer one.
    expect(one(row, T0, null, [pending("run:r2", "hide", 3), pending("run:r1", "hide", 2)])).toMatchObject({ stack: true })
    expect(withPending(row, [pending("run:r1", "read", 9)])).toMatchObject({ readVersion: 3 })
  })

  test("a repository's updates say main and its commit, or Release and its name", () => {
    const main = notice({
      subject: "main:github/acme/widgets",
      kind: "main",
      state: "update",
      runId: null,
      mine: false,
      ref: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
      title: "Fix the parser",
      href: "/acme/widgets",
    })
    expect(one(main)).toMatchObject({ word: "main", detail: "a1b2c3d Fix the parser", action: "open", here: false, stackHere: true })
    expect(wordsOf({ ...main, ref: null, title: null })).toEqual({ word: "main", detail: null })
    const release = { ...main, subject: "release:github/acme/widgets:v1", kind: "release" as const, ref: "v1" }
    expect(wordsOf({ ...release, title: "Widgets v1" })).toEqual({ word: "Release", detail: "Widgets v1" })
    expect(wordsOf({ ...release, title: null })).toEqual({ word: "Release", detail: "v1" })
    expect(one(main, T0 + 4_000)).toMatchObject({ stack: false, listed: true })
  })

  test("orders needs you, failed, live, done, updates, the newest first within each", () => {
    const rows = [
      notice({ subject: "u", kind: "main", state: "update", runId: null, updatedAt: at(50) }),
      notice({ subject: "d", state: "done", updatedAt: at(50) }),
      notice({ subject: "w-old", state: "working", updatedAt: at(10) }),
      notice({ subject: "w-new", state: "waiting", updatedAt: at(20) }),
      notice({ subject: "f", state: "failed", updatedAt: at(5) }),
      notice({ subject: "n", state: "needs_you", updatedAt: at(1) }),
      notice({ subject: "bad", state: "working", updatedAt: "not a time" }),
    ]
    expect(feedOf(rows, [], T0 + 100, null).entries.map((entry) => entry.id)).toEqual([
      "n",
      "f",
      "w-new",
      "w-old",
      "bad",
      "d",
      "u",
    ])
  })
})

describe("landed", () => {
  test("forgets acts the rows show, and keeps the rest, those whose row hasn't loaded included", () => {
    const rows = [notice({ subject: "a", version: 2, readVersion: 2 }), notice({ subject: "b", version: 2 })]
    expect(landed(rows, [pending("a", "read", 2), pending("b", "hide", 2), pending("unloaded", "dismiss", 1)])).toEqual([
      "a:read",
    ])
    expect(landed([], [pending("a", "read", 2)])).toEqual([])
  })
})

describe("follows", () => {
  test("a Member or above follows, and anyone while sign-in can't say; signed out, loading or a Guest, nobody", () => {
    expect(follows({ status: "signed_in", role: "member" })).toBe(true)
    expect(follows({ status: "signed_in", role: "guest" })).toBe(false)
    expect(follows({ status: "signed_in", role: null })).toBe(false)
    expect(follows({ status: "unreachable", role: null })).toBe(true)
    expect(follows({ status: "signed_out", role: null })).toBe(false)
    expect(follows({ status: "loading", role: null })).toBe(false)
  })
})
