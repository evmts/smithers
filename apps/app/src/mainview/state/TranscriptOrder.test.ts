import { describe, expect, test } from "bun:test"
import type { Card, IdentitySession, Session } from "./AppState"
import { TranscriptOrder } from "./TranscriptOrder"
import type { SharedConversation } from "./seams/SharedConversationSeam"
import { createAppStore } from "./AppStore"
import type { AppStore } from "./AppStore"
import { addWorldNote, memoryStorage } from "./TestFixtures"

/*
 * §7.5: the transcript is ONE ordered list of messages and cards. Numbering a
 * message over the messages alone put every message posted after a card above
 * that card, and the ordinals persist, so the wrong order survived a reload.
 */

const cardAt = (id: string, ordinal: number): Card => ({
  id,
  kind: "browser",
  title: id,
  status: "active",
  createdAt: Date.now(),
  ordinal,
  payload: {
    url: "https://example.com",
    finalUrl: "https://example.com",
    status: 200,
    frameable: true,
    blockReason: null
  }
})

/** The merged transcript, in the order it renders. */
const order = (store: AppStore): string[] =>
  [
    ...[...store.collections.messages.values()].map((message) => ({
      ordinal: message.ordinal,
      label: `msg:${message.text.slice(0, 12)}`
    })),
    ...[...store.collections.cards.values()].map((card) => ({
      ordinal: card.ordinal,
      label: `card:${card.id}`
    }))
  ]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((entry) => entry.label)

describe("a pending question never survives a restart", () => {
  test("an unanswered /world.delete confirm is dropped at boot, not re-asked", async () => {
    const storage = memoryStorage()
    const first = await createAppStore({ kind: "localStorage", storage })
    await addWorldNote(first)
    const note = [...first.collections.worldDocuments.values()][0]
    expect(note).toBeDefined()
    await first.dispatch({ type: "world.delete.asked", actor: "user", id: note?.id ?? "" }).isPersisted.promise
    expect(first.session().pendingWorldDeleteId).toBe(note?.id ?? "")

    // The same persisted store, opened again — the modal's overlay swallows
    // every pointer press, so re-asking makes the whole app unreachable.
    const second = await createAppStore({ kind: "localStorage", storage })
    expect(second.session().pendingWorldDeleteId ?? null).toBeNull()
    expect(second.collections.worldDocuments.get(note?.id ?? "")).toBeDefined()
  })
})

describe("messages and cards share one transcript counter", () => {
  test("a message posted after a card sorts below it", async () => {
    const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
    store.dispatch({ type: "message.appended", actor: "system", text: "opening digest" })
    store.dispatch({ type: "card.upsert", actor: "user", card: cardAt("reco", 1) })
    store.dispatch({ type: "card.upsert", actor: "user", card: cardAt("balance", 2) })
    store.dispatch({ type: "message.submitted", actor: "user", turnId: "turn-1", text: "reply with ping" })
    expect(order(store)).toEqual([
      "msg:opening dige",
      "card:reco",
      "card:balance",
      "msg:reply with p"
    ])
  })

  test("the ordinals themselves are ordered, so the order survives a reload", async () => {
    const storage = memoryStorage()
    const store = await createAppStore({ kind: "localStorage", storage })
    await store.dispatch({ type: "card.upsert", actor: "user", card: cardAt("first", 0) }).isPersisted.promise
    await store.dispatch({ type: "message.appended", actor: "system", text: "after the card" }).isPersisted.promise
    const message = [...store.collections.messages.values()][0]
    expect(message?.ordinal).toBe(1)
    const reopened = await createAppStore({ kind: "localStorage", storage })
    expect(order(reopened)).toEqual(order(store))
    expect(reopened.collections.cards.get("first")?.ordinal).toBe(0)
    expect([...reopened.collections.messages.values()][0]?.ordinal).toBe(1)
  })
})


describe("private output joins authoritative shared turns (#3813)", () => {
  const identity = { state: "signed-in", login: "will", memberId: 7 } as IdentitySession
  const main = { activeRepoKey: "owner/repo", branchNavigation: { owner: "will", selected_branch: "main" } } as Session
  const turn = (id: string, sequence?: number) => ({ id, ...(sequence === undefined ? {} : { sequence }) }) as SharedConversation["entries"][number]
  const ids = (items: ReturnType<typeof TranscriptOrder.merge<string>>) => items.map(item => item.kind === "shared" ? item.turn.id : item.entry.id)

  test("account, member, repository and owned branch have independent private placements", () => {
    const scope = TranscriptOrder.scope(identity, main)!
    expect(TranscriptOrder.scope(undefined, main)).toBeUndefined()
    expect(TranscriptOrder.scope({ ...identity, state: "signed-out" }, main)).toBeUndefined()
    expect(TranscriptOrder.scope({ ...identity, login: "alice" }, main)).not.toBe(scope)
    expect(TranscriptOrder.scope({ ...identity, memberId: 8 }, main)).not.toBe(scope)
    expect(TranscriptOrder.scope(identity, { ...main, activeRepoKey: "other/repo" })).not.toBe(scope)
    expect(TranscriptOrder.scope(identity, { ...main, branchNavigation: { ...main.branchNavigation!, selected_branch: "feature" } })).not.toBe(scope)
    expect(TranscriptOrder.scope(identity, { ...main, branchNavigation: { ...main.branchNavigation!, owner: "alice", selected_branch: "feature" } })).toBe(scope)
    expect(TranscriptOrder.scope({ ...identity, memberId: undefined }, { activeRepoKey: null })).toBe(JSON.stringify(["will", null, null, "main"]))
  })

  test("legacy cards precede shared history and an anchor never crosses scopes", () => {
    const shared = [turn("old", 10), turn("new", 11)]
    const local = [{ id: "docs", value: "read" }]
    const scope = TranscriptOrder.scope(identity, main)!
    const anchors = { [TranscriptOrder.key(scope, "docs")]: { scope, afterSequence: 10 } }
    expect(ids(TranscriptOrder.merge(shared, local, undefined, scope))).toEqual(["docs", "old", "new"])
    expect(ids(TranscriptOrder.merge(shared, local, anchors, scope))).toEqual(["old", "docs", "new"])
    expect(ids(TranscriptOrder.merge(shared, local, anchors, "another account"))).toEqual(["docs", "old", "new"])
    expect(ids(TranscriptOrder.merge(shared, local, anchors, undefined))).toEqual(["docs", "old", "new"])
    expect(ids(TranscriptOrder.merge(shared, local, { [TranscriptOrder.key(scope, "docs")]: { scope: "wrong", afterSequence: 10 } }, scope))).toEqual(["docs", "old", "new"])
  })

  test("requested prompts and cards at the same shared turn retain journal admission order", () => {
    const scope = "scope"
    const anchors = {
      [TranscriptOrder.key(scope, "request")]: { scope, afterSequence: 10, localOrdinal: 20 },
      [TranscriptOrder.key(scope, "card")]: { scope, afterSequence: 10, localOrdinal: 21 }
    }
    // They are supplied by different collections; collection enumeration is not chronology.
    const local = [{ id: "card", value: "read" }, { id: "request", value: "pending" }]
    expect(ids(TranscriptOrder.merge([turn("old", 10), turn("new", 11)], local, anchors, scope))).toEqual(["old", "request", "card", "new"])
    expect(ids(TranscriptOrder.merge([], local, anchors, scope))).toEqual(["request", "card"])
  })

  test("sequence gaps and older servers without sequences preserve the served history", () => {
    expect(TranscriptOrder.sequence([])).toBe(0)
    expect(TranscriptOrder.sequence([turn("first"), turn("second")])).toBe(2)
    expect(TranscriptOrder.sequence([turn("first", 10), turn("second", 14)])).toBe(14)
    const local = [{ id: "docs", value: "read" }, { id: "other", value: "read" }]
    const anchors = { [TranscriptOrder.key("scope", "docs")]: { scope: "scope", afterSequence: 1 }, [TranscriptOrder.key("scope", "other")]: { scope: "scope", afterSequence: 1 } }
    expect(ids(TranscriptOrder.merge([turn("first"), turn("second")], local, anchors, "scope"))).toEqual(["first", "docs", "other", "second"])
  })
})
