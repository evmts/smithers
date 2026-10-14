/*
 * #3882, the second half of root's native journey: `Issue flows` on the hosted
 * app refused "The selected working copy is no longer available for this
 * repository." for root's own `roninjin10/e2e-verify` box, and kept refusing
 * after main was reselected through its dropdown. The same button had opened
 * the box prerequisite form before the box existed.
 *
 * `workspaces.loaded` deletes every box row its list did not name, and every
 * box row projects the working copy a selection points at, so a prune orphans
 * the key — and an orphan refused instead of reading as nothing-selected. A
 * list in flight when the box was created could prune it on arrival, too: it
 * answers for the inventory as it stood when it was REQUESTED.
 *
 * A refusal here is not inert: `boxPrerequisite` renders the box form only
 * when the selection answers `undefined`, so a dangling pointer blocks the one
 * act that would replace it.
 */
import { expect, test } from "bun:test"
import { createAppStore } from "./AppStore"
import { gatewayBindingFor, selectedBoxBinding } from "./RepoContext"
import { memoryStorage } from "./TestFixtures"

const REPO = "roninjin10/e2e-verify"
const BOX = "0b0c0d0e-0000-4000-8000-000000003882"
const OTHER = "0b0c0d0e-0000-4000-8000-000000003883"

const box = (id: string, name: string) => ({
  id, repoId: REPO, name, targetBookmark: "main", status: "running" as const,
  provisioningStage: null, suspendedAt: null, createdAt: "2026-10-14T00:17:00Z", kind: "vm" as const
})

const signedIn = async () => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "roninjin10", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "cloud.session.loaded", actor: "system", state: "signed-in", username: "roninjin10", expiresAt: null, scopes: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [{ id: REPO, org: "roninjin10", ownerKind: "user", name: "e2e-verify", head: null }] }).isPersisted.promise
  return store
}

/** What `openWorkspaceNow` dispatches: the row, then the selection. No repository list reload. */
const opened = async (store: Awaited<ReturnType<typeof signedIn>>, id = BOX, name = "main") => {
  await store.dispatch({ type: "workspace.updated", actor: "system", workspace: box(id, name) }).isPersisted.promise
  await store.dispatch({ type: "repo.selected", actor: "user", id: `${REPO}#workspace:${id}` }).isPersisted.promise
}

test("the box a create just selected binds, with no repository list reload", async () => {
  const store = await signedIn()
  await opened(store)
  /* The row projects the copy the selection names, so the key resolves. */
  expect(store.session().activeRepoKey).toBe(`${REPO}#workspace:${BOX}`)
  expect(store.collections.workingCopies.get(`workspace:${BOX}`)?.workspaceId).toBe(BOX)
  expect(selectedBoxBinding(store, REPO)).toEqual({ workspaceId: BOX })
  expect(gatewayBindingFor(store, REPO)).toEqual({ workspaceId: BOX })
})

test("an explicit selection still wins over the repository default while both boxes run", async () => {
  const store = await signedIn()
  await store.dispatch({ type: "workspace.updated", actor: "system", workspace: box(OTHER, "other") }).isPersisted.promise
  await opened(store)
  expect(gatewayBindingFor(store, REPO)).toEqual({ workspaceId: BOX })
})

test("a list that omits a box in flight keeps it, and the selection with it", async () => {
  const store = await signedIn()
  /* The list is asked first; the create lands while it is in flight. */
  await store.dispatch({ type: "workspaces.list.started", actor: "system", requestId: "refresh", repoId: REPO }).isPersisted.promise
  await opened(store)
  await store.dispatch({ type: "workspaces.loaded", actor: "system", requestId: "refresh", repoId: REPO, workspaces: [] }).isPersisted.promise
  expect(store.collections.cloudWorkspaces.get(BOX)?.id).toBe(BOX)
  expect(selectedBoxBinding(store, REPO)).toEqual({ workspaceId: BOX })
})

test("a list the box really is missing from prunes it, keeps the human's selection, and refuses nothing", async () => {
  const store = await signedIn()
  await opened(store)
  await store.dispatch({ type: "workspaces.loaded", actor: "system", repoId: REPO, workspaces: [] }).isPersisted.promise
  expect(store.collections.cloudWorkspaces.get(BOX)).toBeUndefined()
  expect(store.collections.workingCopies.get(`workspace:${BOX}`)).toBeUndefined()
  /* The pointer is the human's own choice: a box the list omitted can be
   * listed again, so it is kept and read as nothing-selected. */
  expect(store.session().activeRepoKey).toBe(`${REPO}#workspace:${BOX}`)
  expect(selectedBoxBinding(store, REPO)).toBeUndefined()
  /* And the act that would open a box is reachable again. */
  expect(gatewayBindingFor(store, REPO)).toHaveProperty("noBox", true)
  /* Listed again, the selection it names binds again. */
  await store.dispatch({ type: "workspaces.loaded", actor: "system", repoId: REPO, workspaces: [box(BOX, "main")] }).isPersisted.promise
  expect(selectedBoxBinding(store, REPO)).toEqual({ workspaceId: BOX })
})

test("a key left dangling by a delete recovers once the inventory is read", async () => {
  const store = await signedIn()
  await opened(store)
  /* The same orphan a delete leaves: the key, and neither row nor copy. */
  await store.dispatch({ type: "workspace.deleted", actor: "user", workspaceId: BOX }).isPersisted.promise
  expect(store.session().activeRepoKey).toBe(`${REPO}#workspace:${BOX}`)
  expect(store.collections.workingCopies.get(`workspace:${BOX}`)).toBeUndefined()
  /* Unread, the refusal stands. */
  expect(selectedBoxBinding(store, REPO)).toEqual({ error: "The selected working copy is no longer available for this repository." })
  /* Read, the repository's default answers and the box form is reachable. */
  await store.dispatch({ type: "workspaces.loaded", actor: "system", repoId: REPO, workspaces: [] }).isPersisted.promise
  expect(selectedBoxBinding(store, REPO)).toBeUndefined()
  expect(gatewayBindingFor(store, REPO)).toHaveProperty("noBox", true)
})

test("an unread inventory never reroutes a selected box to another one", async () => {
  const store = await signedIn()
  await store.dispatch({ type: "repo.selected", actor: "user", id: `${REPO}#workspace:${BOX}` }).isPersisted.promise
  /* `repo.selected` refuses a key the projected copies do not hold. */
  expect(store.session().activeRepoKey).toBeNull()
  await store.dispatch({ type: "workspace.updated", actor: "system", workspace: box(OTHER, "other") }).isPersisted.promise
  await store.dispatch({ type: "repo.selected", actor: "user", id: `${REPO}#workspace:${OTHER}` }).isPersisted.promise
  await store.dispatch({ type: "workspace.deleted", actor: "system", workspaceId: OTHER }).isPersisted.promise
  /* Deleted, with no list read since: the refusal stands rather than guessing. */
  expect(selectedBoxBinding(store, REPO)).toEqual({ error: "The selected working copy is no longer available for this repository." })
})
