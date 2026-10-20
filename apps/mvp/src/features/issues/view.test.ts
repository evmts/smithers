// What the issue pages render (src/features/issues/view.ts), the drafts a press takes (actions.ts), and keeping a
// write on the device (writes.ts): pure functions over rows, and one local collection.
import { ElectricCollection } from "@smthrs/effect-electric"
import { Collection } from "@smthrs/effect-tanstack-db"
import { Effect } from "effect"
import { describe, expect, test } from "vitest"
import { commentBodyOf, newIssueOf } from "./actions"
import { MAX_BODY_LENGTH, MAX_TITLE_LENGTH } from "./contract"
import { Requested, type Sending } from "./schema"
import {
  commentOf,
  conversationProps,
  draftOf,
  issueOf,
  listProps,
  type ListRow,
  mayWrite,
  pageOf,
  reasonText,
} from "./view"
import { accessOf } from "./store"
import { keep } from "./writes"

const synced: ListRow = {
  id: "github/octo/hello#3",
  number: 3,
  title: "Synced",
  state: "closed",
  author: "ben",
  comments: 2,
  updatedAt: "2026-10-20 10:00:00+00",
  pending: "",
  reason: "",
  local: 0,
}

const mine = (id: string, pending: string, reason: unknown = ""): ListRow => ({
  id,
  number: 0,
  title: `Mine ${id}`,
  state: "open",
  author: "",
  comments: 0,
  updatedAt: "",
  pending,
  reason,
  local: 1,
})

describe("the list", () => {
  test("GitHub's rows as they are; this device's own as #– with their chip; Not sent ones with why", () => {
    expect(listProps([mine("a", "not_sent", "conflict"), mine("b", "requested"), synced], { syncedAt: "x" })).toEqual({
      issues: [
        { id: "a", number: null, title: "Mine a", state: "open", pending: "not_sent" },
        { id: "b", number: null, title: "Mine b", state: "open", pending: "requested" },
        {
          id: synced.id,
          number: 3,
          title: "Synced",
          state: "closed",
          author: "ben",
          comments: 2,
          updatedAt: synced.updatedAt,
        },
      ],
      loading: false,
      notSent: [{ id: "a", title: "Mine a", reason: "Conflict" }],
    })
    // GitHub no longer has the author's account.
    expect(issueOf({ ...synced, author: "", state: "open" })).toMatchObject({ author: undefined, state: "open" })
  })

  test("loading until the first complete sync, unless GitHub's rows are here already; never 'No issues' before", () => {
    expect(listProps([], undefined).loading).toBe(true)
    expect(listProps([mine("a", "requested")], undefined).loading).toBe(true)
    expect(listProps([synced], undefined).loading).toBe(false)
    expect(listProps([], { syncedAt: null }).loading).toBe(false)
  })

  test("a reason's words, and none for what isn't a reason", () => {
    expect(reasonText("forbidden")).toBe("Not allowed")
    expect(reasonText("unavailable")).toBe("GitHub unavailable")
    for (const reason of ["", null, undefined, "pending", 3]) expect(reasonText(reason)).toBeUndefined()
  })
})

describe("an issue's page", () => {
  test("the issue with its link out, GitHub's comments, then this device's own with their chip; Not sent ones editable", () => {
    const shown = conversationProps(
      {
        number: 7,
        title: "Crash",
        body: "Body",
        state: "open",
        author: null,
        createdAt: "2026-10-20 10:00:00+00",
      },
      [
        { id: "c1", author: "ben", createdAt: "2026-10-20 11:00:00+00", body: "Hi", pending: "", reason: "", local: 0 },
        { id: "c2", author: "", createdAt: "", body: "Mine", pending: "requested", reason: "", local: 1 },
        { id: "c3", author: "", createdAt: "", body: "Refused", pending: "not_sent", reason: "too_large", local: 1 },
      ],
      { owner: "octo", name: "hello" },
    )
    expect(shown).toEqual({
      title: "Crash",
      number: 7,
      state: "open",
      author: undefined,
      createdAt: "2026-10-20 10:00:00+00",
      body: "Body",
      externalHref: "https://github.com/octo/hello/issues/7",
      comments: [
        {
          id: "c1",
          author: "ben",
          createdAt: "2026-10-20 11:00:00+00",
          body: "Hi",
          pending: undefined,
          reason: undefined,
          editable: false,
        },
        { id: "c2", author: undefined, createdAt: undefined, body: "Mine", pending: "requested", reason: undefined, editable: false },
        { id: "c3", author: undefined, createdAt: undefined, body: "Refused", pending: "not_sent", reason: "Too long", editable: true },
      ],
    })
    expect(commentOf({ id: "c", author: null, createdAt: "t", body: "", pending: "", reason: null, local: 0 }).author)
      .toBeUndefined()
    expect(conversationProps({ ...shownItem, state: "closed" }, [], { owner: "o", name: "n" }).state).toBe("closed")
  })

  test("loading until the first complete sync; then an issue the device doesn't have is missing", () => {
    expect(pageOf(undefined, undefined)).toBe("loading")
    expect(pageOf(undefined, { syncedAt: "x" })).toBe("missing")
    expect(pageOf(shownItem, undefined)).toBe("shown")
  })
})

const shownItem = { number: 1, title: "t", body: "", state: "open", author: "a", createdAt: "c" }

describe("forms", () => {
  test("a draft's text, empty without one, and Too long over GitHub's limits", () => {
    expect(draftOf(undefined)).toEqual({ title: "", body: "", error: undefined })
    expect(draftOf({ title: undefined, body: undefined })).toEqual({ title: "", body: "", error: undefined })
    expect(draftOf({ title: "t", body: "b" })).toEqual({ title: "t", body: "b", error: undefined })
    expect(draftOf({ title: "x".repeat(MAX_TITLE_LENGTH + 1), body: "" }).error).toBe("Too long")
    expect(draftOf({ title: "", body: "x".repeat(MAX_BODY_LENGTH + 1) }).error).toBe("Too long")
  })

  test("a new issue takes a title that isn't blank, trimmed, and both within the limits", () => {
    expect(newIssueOf(undefined)).toBeUndefined()
    expect(newIssueOf({ id: "d", title: "  ", body: "b" })).toBeUndefined()
    expect(newIssueOf({ id: "d", title: "x".repeat(MAX_TITLE_LENGTH + 1), body: "" })).toBeUndefined()
    expect(newIssueOf({ id: "d", title: "t", body: "x".repeat(MAX_BODY_LENGTH + 1) })).toBeUndefined()
    expect(newIssueOf({ id: "d", title: "  Fix it ", body: "Body" })).toEqual({ title: "Fix it", body: "Body" })
  })

  test("a comment takes a body that isn't blank, within the limit", () => {
    expect(commentBodyOf(undefined)).toBeUndefined()
    expect(commentBodyOf({ id: "d", title: "", body: " \n " })).toBeUndefined()
    expect(commentBodyOf({ id: "d", title: "", body: "x".repeat(MAX_BODY_LENGTH + 1) })).toBeUndefined()
    expect(commentBodyOf({ id: "d", title: "", body: " Looks good " })).toBe(" Looks good ")
  })

  test("who may write: signed in with a role, as sign-in knows it, offline included", () => {
    expect(mayWrite({ status: "signed_in", role: "guest" }, undefined)).toBe(true)
    expect(mayWrite({ status: "signed_in", role: null }, undefined)).toBe(false)
    expect(mayWrite({ status: "signed_out", role: null }, { role: "member" })).toBe(false)
    expect(mayWrite({ status: "unreachable", role: null }, { role: "member" })).toBe(true)
    expect(mayWrite({ status: "loading", role: null }, undefined)).toBe(false)
  })
})

describe("keeping a write on the device", () => {
  test("inserted Requested, then its status replaced when a send replayed after a crash finds it", async () => {
    const write: Sending = {
      id: "w",
      repo: "octo/hello",
      repoId: "github/octo/hello",
      op: "issue/comment",
      via: "person",
      title: "",
      number: 7,
      body: "Hi",
      queuedAt: 1,
      v: 1,
    }
    const rows = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const requested = yield* Collection.local<Requested, string>({
        id: `issue-requested-${crypto.randomUUID()}`,
        schema: Requested,
        getKey: (row) => row.id,
      })
      yield* keep(requested, write, "requested", null)
      const first = yield* requested.toArray
      yield* keep(requested, write, "not_sent", "conflict")
      return [first, yield* requested.toArray]
    })))
    const kept = { id: "w", repo: "octo/hello", repoId: "github/octo/hello", op: "issue/comment", via: "person", title: "", number: 7, body: "Hi", queuedAt: 1 }
    expect(rows).toMatchObject([
      [{ ...kept, status: "requested", reason: null }],
      [{ ...kept, status: "not_sent", reason: "conflict" }],
    ])
    expect(rows.map((kept) => kept.length)).toEqual([1, 1])
  })
})

describe("a repository this person may not read", () => {
  test("a refused list never loads: it says why; an issue's page asks to sign in, or isn't there", () => {
    expect(listProps([], undefined, { status: "sign_in" })).toMatchObject({ refused: "sign_in", loading: false })
    expect(listProps([], undefined, { status: "forbidden" })).toMatchObject({ refused: "forbidden", loading: false })
    expect(listProps([], undefined, { status: "unknown" })).toMatchObject({ refused: undefined, loading: true })
    expect(listProps([], undefined, { status: "allowed" })).toMatchObject({ refused: undefined, loading: true })
    expect(pageOf(undefined, undefined, { status: "sign_in" })).toBe("sign_in")
    expect(pageOf(undefined, undefined, { status: "forbidden" })).toBe("missing")
    expect(pageOf(undefined, undefined, { status: "allowed" })).toBe("loading")
    expect(pageOf({ number: 1 }, undefined, { status: "sign_in" })).toBe("shown")
  })

  test("the items shape's answers: allowed once one succeeds, refused when stopped with 401 or 403, else nothing new", () => {
    expect(accessOf({ _tag: "Succeeded" })).toBe("allowed")
    expect(accessOf({ _tag: "Stopped", error: new ElectricCollection.SyncFailed({ cause: null, status: 401 }) })).toBe("sign_in")
    expect(accessOf({ _tag: "Stopped", error: new ElectricCollection.SyncFailed({ cause: null, status: 403 }) })).toBe(
      "forbidden",
    )
    expect(accessOf({ _tag: "Stopped", error: new ElectricCollection.SyncFailed({ cause: null, status: 400 }) })).toBeUndefined()
    expect(accessOf({ _tag: "Failed", status: 503 })).toBeUndefined()
    expect(accessOf({ _tag: "Sent" })).toBeUndefined()
  })
})
