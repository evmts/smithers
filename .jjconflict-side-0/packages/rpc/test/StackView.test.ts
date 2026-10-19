import { describe, expect, test } from "vitest"
import {
  MYTHICAL_ROUTES,
  type MythicalChange,
  type MythicalItem,
  mythicalRoute,
  type MythicalStack
} from "../src/Mythical.ts"
import {
  accountLabel,
  ACTIVE_ITEM_STATES,
  itemReason,
  itemStateLabel,
  itemTitle,
  landable,
  laneRows,
  settled,
  stackCounts,
  stackRows,
  wikiRow,
  wikiTone
} from "../src/StackView.ts"

const head = "c".repeat(40)
const proposed: MythicalItem = {
  id: "item-1",
  issue: { number: 12, title: "Add the footer link", url: "https://github.com/o/r/issues/12" },
  state: "proposed",
  attempt: 1,
  runs: {},
  todo: { replans: 0 },
  pullRequest: { number: 40, url: "https://github.com/o/r/pull/40", state: "open", head },
  dependsOn: [],
  updatedAt: "2026-09-30T10:00:00Z"
}

describe("landable", () => {
  test("a proposed TODO whose pull request is open at a known head, not yet asked to merge", () => {
    expect(landable(proposed)).toBe(true)
  })

  test("anything else is not landed from Smithers", () => {
    const { issue: _issue, ...chat } = proposed
    const { todo: _todo, ...proposal } = proposed
    const { head: _head, ...headless } = proposed.pullRequest!
    const { pullRequest: _pull, ...unopened } = proposed
    for (
      const item of [
        chat,
        proposal,
        unopened,
        { ...proposed, automerge: true },
        { ...proposed, state: "landed" as const },
        { ...proposed, state: "verifying" as const },
        { ...proposed, pullRequest: { ...proposed.pullRequest!, state: "closed" as const } },
        { ...proposed, pullRequest: headless }
      ]
    ) {
      expect(landable(item)).toBe(false)
    }
  })

  test("a blocked item is never landable", () => {
    expect(landable({ ...proposed, state: "blocked" })).toBe(false)
  })

  test("the merge route names the item", () => {
    expect(MYTHICAL_ROUTES.merge).toBe("/api/repos/{owner}/{repo}/mythical/items/{id}/merge")
    expect(mythicalRoute("merge", "o", "r", "item 1")).toBe("/api/repos/o/r/mythical/items/item%201/merge")
  })
})

const item = (id: string, state: MythicalItem["state"], extra: Partial<MythicalItem> = {}): MythicalItem => ({
  id,
  state,
  attempt: 1,
  runs: {},
  dependsOn: [],
  updatedAt: "2026-09-30T10:00:00Z",
  ...extra
})

const change = (changeId: string, extra: Partial<MythicalChange> = {}): MythicalChange => ({
  changeId,
  commitId: `${changeId}-commit`,
  title: `Change ${changeId}`,
  kind: "item",
  state: "pending",
  ...extra
})

const stackOf = (extra: Partial<MythicalStack>): MythicalStack => ({
  repository: "o/r",
  state: "active",
  generation: 1,
  mainBehind: false,
  changes: [],
  items: [],
  lanes: [],
  limits: { maxParallel: 2 },
  ...extra
})

describe("stackRows", () => {
  test("lists pending work by lane, queue, decision and the rest, above the stack's changes in order", () => {
    const stack = stackOf({
      items: [
        item("declined", "declined"),
        item("queued-a", "queued"),
        item("blocked", "blocked"),
        item("lane-1", "verifying", { lane: 1 }),
        item("landed", "landed"),
        item("cancelled", "cancelled"),
        item("queued-b", "queued"),
        item("lane-0", "running", { lane: 0 }),
        item("on-stack", "waiting")
      ],
      changes: [change("tip", { itemId: "on-stack" }), change("base", { state: "landed" })]
    })
    const rows = stackRows(stack)
    expect(rows.map((row) => row.key)).toEqual([
      "item:lane-0",
      "item:lane-1",
      "item:queued-a",
      "item:queued-b",
      "item:blocked",
      "item:declined",
      "change:tip:0",
      "change:base:1"
    ])
    expect(rows[6]).toMatchObject({ kind: "change", item: { id: "on-stack" } })
    expect(rows[7]).toMatchObject({ kind: "change", item: undefined })
  })

  test("a change listed twice keeps two distinct keys", () => {
    const rows = stackRows(stackOf({ changes: [change("same"), change("same")] }))
    expect(new Set(rows.map((row) => row.key)).size).toBe(2)
  })
})

describe("stackCounts", () => {
  test("counts each state family once and every unsettled item that holds a lane as busy", () => {
    const stack = stackOf({
      limits: { maxParallel: 3 },
      changes: [change("a", { state: "landed" }), change("b")],
      items: [
        item("busy", "running", { lane: 0 }),
        item("pr", "proposed", { lane: 1 }),
        item("queued", "queued"),
        item("blocked", "blocked", { lane: 2 }),
        item("rejected", "rejected"),
        item("declined", "declined")
      ]
    })
    expect(stackCounts(stack)).toEqual({
      changes: 2,
      landed: 1,
      busy: 1,
      maxParallel: 3,
      queued: 1,
      open: 1,
      blocked: 2,
      declined: 1
    })
  })
})

describe("laneRows", () => {
  test("joins each lane to its item and keeps a lane above a lowered limit that still holds work", () => {
    const stack = stackOf({
      lanes: [{ index: 1, state: "idle", workspaceId: "ws-1" }, { index: 0, state: "busy", workspaceId: "ws-0" }],
      items: [
        item("zero", "running", { lane: 0 }),
        item("five", "retrying", { lane: 5 }),
        item("done", "landed", { lane: 1 })
      ]
    })
    expect(laneRows(stack).map((row) => [row.index, row.workspaceId, row.item?.id, row.lane?.state])).toEqual([
      [0, "ws-0", "zero", "busy"],
      [1, "ws-1", undefined, "idle"],
      [5, undefined, "five", undefined]
    ])
  })
})

describe("item labels", () => {
  test("each API state reads in the owner's words", () => {
    expect(
      (["running", "delivering", "integrating", "verifying", "waiting", "proposed", "queued", "blocked"] as const).map(
        (state) => itemStateLabel(item("x", state))
      )
    ).toEqual(["implementing", "checking", "rebasing", "checking", "ready", "PR open", "queued", "blocked"])
  })

  test("an issue item is titled by its issue, a chat item by its change, else by a short id", () => {
    const stack = stackOf({ changes: [change("c", { itemId: "chat-item-1", title: "Rename the footer" })] })
    expect(itemTitle(stack, proposed)).toBe("#12 Add the footer link")
    expect(itemTitle(stack, item("chat-item-1", "waiting"))).toBe("Rename the footer")
    expect(itemTitle(stack, item("0123456789abcdef", "queued"))).toBe("01234567")
  })

  test("a retrying item names its conflicted paths until a typed failure explains it", () => {
    const integration = { conflict: { paths: ["a.ts", "b.ts"] } }
    expect(itemReason(item("x", "retrying", { integration, reason: "conflict" }))).toBe("a.ts, b.ts")
    expect(
      itemReason(
        item("x", "retrying", { integration, reason: "Checks failed", failure: { kind: "checks", fault: "user" } })
      )
    ).toBe("Checks failed")
    expect(itemReason(item("x", "blocked", { integration, reason: "Needs a person" }))).toBe("Needs a person")
    expect(itemReason(item("x", "blocked", { reason: "" }))).toBeUndefined()
    expect(itemReason(item("x", "queued"))).toBeUndefined()
  })

  test("an account reads its label or provider, and how many more served the lane", () => {
    expect(accountLabel({ provider: "claude", count: 1 })).toBe("Claude")
    expect(accountLabel({ provider: "codex", label: "work@example.com", count: 3 })).toBe("work@example.com +2")
  })

  test("settled covers finished, stopped and proposed items, not working ones", () => {
    expect(
      ["landed", "blocked", "declined", "proposed"].every((state) => settled(item("x", state as MythicalItem["state"])))
    ).toBe(true)
    expect([...ACTIVE_ITEM_STATES, "queued"].some((state) => settled(item("x", state as MythicalItem["state"])))).toBe(
      false
    )
  })
})

describe("wikiRow", () => {
  const wiki = { state: "current" as const, pages: 1, edited: 0, attempt: 1 }

  test("pluralises pages, names edits only when there are some, and carries a failure only when it failed", () => {
    expect(wikiRow(wiki)).toEqual({ state: "current", pages: "1 page", edited: undefined, failure: undefined })
    expect(wikiRow({ ...wiki, state: "failed", pages: 3, edited: 2, error: "Refresh timed out" })).toEqual({
      state: "failed",
      pages: "3 pages",
      edited: "2 edited",
      failure: "Refresh timed out"
    })
    expect(wikiRow({ ...wiki, state: "failed" }).failure).toBe("")
  })

  test("tones current as information, failed as danger, and the rest as in progress", () => {
    expect((["current", "failed", "refreshing", "stale"] as const).map(wikiTone)).toEqual([
      "info",
      "danger",
      "brand",
      "brand"
    ])
  })
})
