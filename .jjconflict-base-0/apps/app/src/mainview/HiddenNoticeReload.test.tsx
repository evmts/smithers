import { createRoot } from "./cards/views/testDom"
import { act } from "react"
import { afterEach, expect, test } from "bun:test"
import { ToastStack } from "./ToastStackView"
import { railNotices, toastActions } from "./ShellRail"
import { createAppStore, type AppStore } from "./state/AppStore"
import { createAppController, type AppController } from "./state/AppController"
import { memoryStorage, settle, unavailableAgent, waitFor } from "./state/TestFixtures"
import { createTodoSeam, type TodoEntry } from "./state/seams/TodoSeam"
import type { SeamContext } from "./state/seams/SeamContext"
import { noticeDismissalKey } from "./state/NoticeDismissals"
import { fixtures } from "../../../../packages/rpc/test/fixtures/Todo"
import type { StorageApi } from "@tanstack/db"

/*
 * The production defect this pins (#4034, native UI 282d3e59): pressing Hide
 * on an own verification-failure notice removed it, and an ordinary reload of
 * the same signed-in app — with the failed action never rerun — brought back
 * the identical title and detail.
 *
 * Boot reconciliation drops every toast row, so nothing resurrected the row
 * itself: the seam read the same persisted failed TODO again and raised the
 * same notice, because the dismissal was not recorded anywhere a second
 * session could read. The notice occurrence (`ToastAudience.entryId`, which
 * carries the run and the attempt) and the member it reached are what Hide now
 * records.
 */
const opened: Array<{ store: AppStore; controller: AppController }> = []
afterEach(async () => {
  for (const { store, controller } of opened.splice(0)) { await controller.dispose(); await store.dispose?.() }
})
const close = async (live: { store: AppStore; controller: AppController }) => {
  opened.splice(opened.findIndex(each => each.store === live.store), 1)
  await live.controller.dispose()
  await live.store.dispose?.()
}

const failureNotices = (store: AppStore) =>
  [...store.collections.toasts.values()].filter(toast => toast.audience?.kind === "failed")

/** Every notice fact this stream sealed, so a repeated Hide or re-read can be shown to write none. */
const noticeJournal = async (store: AppStore) => (await store.eventHistory()).events
  .filter(event => event.type.startsWith("toast.")).sort((left, right) => left.sequence - right.sequence)
  .map(event => `${event.type}/${event.actor}`)

/** A real persisted session: the store, its controller, and a TODO seam on the shared context. */
const session = async (storage: StorageApi, http: SeamContext["http"] = async () => new Response("{}", { status: 200 })) => {
  const store = await createAppStore({ kind: "localStorage", storage })
  const controller = createAppController(store, unavailableAgent, {})
  opened.push({ store, controller })
  const context: SeamContext = {
    http, store, dispatch: store.dispatch, baseUrl: "https://install.test", actor: () => "user",
    nextOrdinal: store.nextOrdinal, report: () => {}, isDisposed: () => false,
    // The settlement door the seam uses for waits and merges; a failure notice never resolves.
    resolveToast: (key, outcome) => { store.dispatch({ type: "toast.resolved", actor: "system", key, status: outcome.status, detail: outcome.detail }) }
  }
  return { store, controller, seam: createTodoSeam(context, { debounceMs: 1 }) }
}

/** The production rail, its supplied View, and the real Hide button the person presses. */
const hideThroughTheRail = (store: AppStore, controller: AppController, member: string, toastId: string) => {
  const host = document.createElement("div"); document.body.append(host)
  const root = createRoot(host)
  const rows = [...store.collections.toasts.values()]
  act(() => root.render(<ToastStack toasts={railNotices(rows, [], member)} more={0} onAction={toastActions(controller, rows)}
    onView={patch => { if (patch.toast_hidden) controller.runCommand("toast.dismiss", patch.toast_hidden) }} />))
  const hide = [...host.querySelectorAll<HTMLButtonElement>("button.notice-hide")]
  const title = store.collections.toasts.get(toastId)!.title
  const button = hide.find(each => each.getAttribute("aria-label") === `Hide ${title}`)
  if (button === undefined) throw new Error(`no Hide button for ${toastId}`)
  // Keyboard-only access: a native button with its own name, reachable by Tab.
  expect(button.tagName).toBe("BUTTON")
  expect(button.getAttribute("aria-label")).toBe(`Hide ${title}`)
  act(() => { button.click() })
  act(() => root.unmount())
  host.remove()
}

test("Hide on an own failure notice survives a reload for this member and this occurrence", async () => {
  const storage = memoryStorage()
  const first = await session(storage)
  await first.store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "ben",
    provider: "github", admin: false, scopesPlain: null }).isPersisted.promise
  // The real seam raises the real notice from the real failed model.
  await first.seam.applyTodoProjection(12, fixtures.failed.model)
  await waitFor(() => failureNotices(first.store).length === 1)
  const notice = failureNotices(first.store)[0]!
  expect(notice.title).toBe(fixtures.failed.model.title)
  expect(notice.audience).toMatchObject({ member: "ben", kind: "failed", entryId: "todo.failed.12.run-42.2" })

  hideThroughTheRail(first.store, first.controller, "ben", notice.id)
  await waitFor(() => failureNotices(first.store).length === 0)
  // Let the dismissal commit, then end the session the way closing the page does.
  await settle(30)
  await close(first)

  // The reload: a new store and a new seam over the same storage, nothing rerun.
  const second = await session(storage)
  expect(second.store.collections.identitySessions.get("identity")?.login).toBe("ben")
  expect(failureNotices(second.store)).toEqual([])
  await second.seam.applyTodoProjection(12, fixtures.failed.model)
  await settle()
  expect(failureNotices(second.store)).toEqual([])
  // The receipt the reload read, written by the person's own Hide and nothing else.
  expect(second.store.collections.noticeDismissals.get(noticeDismissalKey("ben", "todo.failed.12.run-42.2")))
    .toMatchObject({ id: noticeDismissalKey("ben", "todo.failed.12.run-42.2"), member: "ben", entryId: "todo.failed.12.run-42.2" })
  // The original notice and the person's Hide are both still readable in the journal,
  // and re-reading the same failure after the reload seals no further notice fact.
  const afterReload = await noticeJournal(second.store)
  expect(afterReload).toEqual(["toast.shown/system", "toast.dismissed/user"])
  await second.seam.applyTodoProjection(12, fixtures.failed.model)
  await settle()
  expect(await noticeJournal(second.store)).toEqual(afterReload)

  // The failure itself is preserved and readable where it is asked for.
  const card = second.store.collections.cards.get("todo:12") as TodoEntry
  expect(card.payload.model?.state).toBe("failed")
  expect(card.payload.model?.failure?.message).toBe("Home rejected the limited state")
  expect(card.payload.model?.run).toEqual(fixtures.failed.model.run)

  // A NEW occurrence of the same failure, same title and same flow, notifies again.
  const retried = { ...fixtures.failed.model, run: { ...fixtures.failed.model.run!, attempt: 3 } }
  await second.seam.applyTodoProjection(12, retried)
  await waitFor(() => failureNotices(second.store).length === 1)
  expect(failureNotices(second.store)[0]).toMatchObject({ title: fixtures.failed.model.title,
    audience: { member: "ben", entryId: "todo.failed.12.run-42.3" } })

  // Hiding it is idempotent: the second press and a remounted rail seal nothing more.
  const fresh = failureNotices(second.store)[0]!
  hideThroughTheRail(second.store, second.controller, "ben", fresh.id)
  await waitFor(() => failureNotices(second.store).length === 0)
  await settle()
  const sealed = await noticeJournal(second.store)
  second.controller.runCommand("toast.dismiss", fresh.id)
  await second.seam.applyTodoProjection(12, retried)
  await settle()
  expect(await noticeJournal(second.store)).toEqual(sealed)
  expect(second.store.collections.noticeDismissals.size).toBe(2)

  // Another identity is never suppressed by this member's receipt.
  await second.store.dispatch({ type: "toast.shown", actor: "system", key: "todo.failed.12.run-42.2",
    title: fixtures.failed.model.title, audience: { member: "maya", entryId: "todo.failed.12.run-42.2", kind: "failed",
      actorLabel: "Coding agent", target: { flow: "todo", n: 12 } } }).isPersisted.promise
  expect(second.store.collections.toasts.get("toast-todo.failed.12.run-42.2")?.audience?.member).toBe("maya")
})

test("only the person's own Hide records a receipt: a settled notice may speak again", async () => {
  const storage = memoryStorage()
  const only = await session(storage)
  const store = only.store
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "ben",
    provider: "github", admin: false, scopesPlain: null }).isPersisted.promise
  const audience = { member: "ben", entryId: "todo.needs-you.12.wait-1", kind: "needs_you" as const,
    actorLabel: "Coding agent", target: { flow: "todo" as const, n: 12 } }
  const shown = () => store.collections.toasts.get("toast-todo.needs-you.12.wait-1")
  await store.dispatch({ type: "toast.shown", actor: "system", key: audience.entryId, title: "T12 needs you", audience }).isPersisted.promise
  expect(shown()).toBeDefined()
  // The ok timer and boot reconciliation are system dismissals: neither suppresses the next occurrence.
  await store.dispatch({ type: "toast.dismissed", actor: "system", id: "toast-todo.needs-you.12.wait-1" }).isPersisted.promise
  expect(store.collections.noticeDismissals.size).toBe(0)
  await store.dispatch({ type: "toast.shown", actor: "system", key: audience.entryId, title: "T12 needs you", audience }).isPersisted.promise
  expect(shown()).toBeDefined()

  // Ordinary background work carries no audience and is untouched by any receipt.
  await store.dispatch({ type: "toast.shown", actor: "system", key: "flow.catalog.workflow-list", title: "Reading flows" }).isPersisted.promise
  await store.dispatch({ type: "toast.dismissed", actor: "user", id: "toast-flow.catalog.workflow-list" }).isPersisted.promise
  expect(store.collections.noticeDismissals.size).toBe(0)
  await store.dispatch({ type: "toast.shown", actor: "system", key: "flow.catalog.workflow-list", title: "Reading flows" }).isPersisted.promise
  expect(store.collections.toasts.get("toast-flow.catalog.workflow-list")?.status).toBe("running")

  // The person's Hide on the member-routed notice hides that occurrence only.
  await store.dispatch({ type: "toast.dismissed", actor: "user", id: "toast-todo.needs-you.12.wait-1" }).isPersisted.promise
  expect(store.collections.noticeDismissals.size).toBe(1)
  await store.dispatch({ type: "toast.shown", actor: "system", key: audience.entryId, title: "T12 needs you", audience }).isPersisted.promise
  expect(shown()).toBeUndefined()
  const other = { ...audience, entryId: "todo.needs-you.12.wait-2" }
  await store.dispatch({ type: "toast.shown", actor: "system", key: other.entryId, title: "T12 needs you", audience: other }).isPersisted.promise
  expect(store.collections.toasts.get("toast-todo.needs-you.12.wait-2")).toBeDefined()

  // The receipts belong to the account that wrote them and leave with it.
  await store.dispatch({ type: "identity.session.cleared", actor: "user" }).isPersisted.promise
  expect(store.collections.noticeDismissals.size).toBe(0)
})
