import { afterEach, expect, test } from "bun:test"
import { createAppStore as openAppStore, type AppStore } from "./AppStore"
import { memoryStorage, repositoryHttpFixture } from "./TestFixtures"
import { disposePreparedViews } from "./PreparedView"
import { createIssuesSeam } from "./seams/IssuesSeam"
import { createLandingsSeam } from "./seams/LandingsSeam"
const REPO = "owner/repo"
import type { SeamContext } from "./seams/SeamContext"

// Controlled boundary units: real dispatcher/journal over Map storage and an HTTP fixture.
// These reload receipts do not qualify SQLite or a real repository backend.
const closeStore = async (store: AppStore): Promise<void> => {
  if (store.dispose === undefined) throw new Error("Fixture store has no disposal contract")
  await store.dispose()
}
const stores = new Set<AppStore>()
const createAppStore: typeof openAppStore = async (...args) => {
  const store = await openAppStore(...args)
  stores.add(store)
  return store
}
afterEach(async () => {
  const errors: unknown[] = []
  for (const store of stores) {
    try { disposePreparedViews(store); await closeStore(store) } catch (error) { errors.push(error) }
  }
  stores.clear()
  if (errors.length) throw new AggregateError(errors, "Embedded-history fixture cleanup failed")
})

test("issue navigation stays in one durable frame, supports back/forward, and forks forward history", async () => {
  const storage = memoryStorage()
  let store = await createAppStore({ kind: "localStorage", storage })
  let ordinal = 0
  let ctx: SeamContext = { store, dispatch: store.dispatch, actor: () => "user", nextOrdinal: () => ++ordinal, baseUrl: "", http: repositoryHttpFixture() }
  let issues = createIssuesSeam(ctx)
  await issues.listIssues("open", REPO)
  const before = [...store.collections.cards.values()][0]!
  await issues.viewIssue(3, REPO)
  const after = store.collections.cards.get(before.id)!
  expect(after.kind).toBe("issue")
  expect(after.ordinal).toBe(before.ordinal)
  expect(after.createdAt).toBe(before.createdAt)
  expect(store.collections.cards.size).toBe(1)
  expect(after.navigation).toEqual({ index: 1, length: 2 })
  await issues.viewIssue(3, REPO)
  expect(store.collections.cardHistories.get(before.id)?.entries).toHaveLength(2)
  await store.dispatch({ type: "card.history.moved", actor: "user", id: before.id, delta: -1 }).isPersisted.promise
  expect(store.collections.cards.get(before.id)?.kind).toBe("issue-list")
  await closeStore(store)
  const restored = await createAppStore({ kind: "localStorage", storage })
  expect(restored.collections.cards.get(before.id)?.kind).toBe("issue-list")
  await restored.dispatch({ type: "card.history.moved", actor: "user", id: before.id, delta: 1 }).isPersisted.promise
  expect(restored.collections.cards.get(before.id)?.kind).toBe("issue")
  store = restored
  ctx = { ...ctx, store, dispatch: store.dispatch }
  issues = createIssuesSeam(ctx)
  await store.dispatch({ type: "card.history.moved", actor: "user", id: before.id, delta: -1 }).isPersisted.promise
  await issues.viewIssue(2, REPO)
  expect(store.collections.cardHistories.get(before.id)?.entries).toHaveLength(2)
  const fork = store.collections.cards.get(before.id)
  expect(fork?.kind === "issue" && fork.payload.number).toBe(2)
  expect(await issues.viewIssue(999, REPO)).toContain("Issue #999 in owner/repo was not found.")
  expect(store.collections.cards.get(before.id)).toMatchObject({ kind: "status", status: "error" })
  await store.dispatch({ type: "card.history.moved", actor: "user", id: before.id, delta: -1 }).isPersisted.promise
  expect(store.collections.cards.get(before.id)).toMatchObject({ kind: "issue", payload: { number: 2 }, ordinal: before.ordinal, createdAt: before.createdAt })
  /* One web pane per repository: a PR detail navigates the same frame, it does not append a card. */
  await createLandingsSeam(ctx).viewLanding(4, REPO)
  expect(store.collections.cards.size).toBe(1)
  expect(store.collections.cards.get(before.id)?.kind).toBe("pr")
  await closeStore(store)
})

/*
 * Production 20261015 (UI 10a823b3, run 38764661812): `/issues.create` then
 * `/issues.list` on a saved shared conversation navigated the repository's one
 * pane card, which keeps its retained ordinal early in the transcript while
 * the composer's flow form stays last. The transcript read anchor named that
 * last entry, so neither result was ever brought into view. The read itself is
 * the only thing that knows which entry it published: it says so here.
 */
test("a user read names the pane card it navigated, not the transcript's last entry (#3813)", async () => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  let ordinal = 0
  const ctx: SeamContext = { store, dispatch: store.dispatch, actor: () => "user", nextOrdinal: () => ++ordinal, baseUrl: "", http: repositoryHttpFixture() }
  await createIssuesSeam(ctx).listIssues("open", REPO)
  const pane = [...store.collections.cards.values()].find(card => card.kind === "issue-list")!
  // The composer's own form is the transcript's last entry, as in production.
  await store.dispatch({ type: "card.upsert", actor: "user", card: { id: "issue-form", kind: "status", status: "active",
    title: "Create an issue", payload: {}, createdAt: 1, ordinal: 50 } }).isPersisted.promise
  await createIssuesSeam(ctx).viewIssue(3, REPO)
  const navigated = store.collections.cards.get(pane.id)!
  expect(navigated.kind).toBe("issue")
  // Stable ordinals: the pane keeps its place, so the read must name it by id.
  expect(navigated.ordinal).toBe(pane.ordinal)
  const read = store.session().requestedRead
  expect(read?.cardId).toBe(pane.id)
  expect(read!.afterOrdinal).toBeGreaterThan(50)
  // The agent reading the same pane is not a person asking to be moved.
  await createIssuesSeam({ ...ctx, actor: () => "smithers" }).listIssues("all", REPO)
  expect(store.collections.cards.get(pane.id)?.kind).toBe("issue-list")
  expect(store.session().requestedRead).toEqual(read)
  // Anything appended after the read retires it: the live edge is the destination again.
  await store.dispatch({ type: "message.appended", actor: "user", text: "and now something else" }).isPersisted.promise
  expect([...store.collections.messages.values()].at(-1)!.ordinal).toBeGreaterThanOrEqual(read!.afterOrdinal)
})
