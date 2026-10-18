import { expect,test } from "bun:test"
import { createAppStore } from "./AppStore"
import { memoryStorage } from "./TestFixtures"

test("an open palette never restores on boot: the composer is summoned (Command-K), never persisted open", async () => {
  const storage = memoryStorage()
  const store = await createAppStore({ kind: "localStorage", storage })
  await store.dispatch({ type: "palette.toggled", actor: "user", open: true }).isPersisted.promise
  await store.dispatch({ type: "palette.actions.toggled", actor: "user", ref: "flow:wiki" }).isPersisted.promise
  expect(store.session().paletteOpen).toBe(true)
  expect(store.session().paletteActionsRef).toBe("flow:wiki")
  const reloaded = await createAppStore({ kind: "localStorage", storage })
  expect(reloaded.session().paletteOpen).toBe(false)
  expect(reloaded.session().paletteActionsRef).toBeNull()
})

for (const clearDraft of [false, true]) test(`a locally requested prompt ${clearDraft ? "dismisses its composer" : "preserves a newer composer draft"}`, async () => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "ben", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "palette.toggled", actor: "user", open: true }).isPersisted.promise
  await store.dispatch({ type: "palette.actions.toggled", actor: "user", ref: "flow:wiki" }).isPersisted.promise
  await store.dispatch({ type: "composer.changed", actor: "user", draft: clearDraft ? "Send this" : "A newer draft" }).isPersisted.promise
  await store.dispatch({ type: "conversation.prompt.changed", actor: "user", clearDraft,
    request: { id: "send", owner: "ben", branch: "main", prompt: "Send this", state: "requested" } }).isPersisted.promise
  expect(store.session().sharedPrompts?.[0]?.prompt).toBe("Send this")
  expect(store.session().paletteOpen).toBe(!clearDraft)
  expect(store.session().paletteActionsRef).toBe(clearDraft ? null : "flow:wiki")
  expect(store.session().draft).toBe(clearDraft ? "" : "A newer draft")
  // Later server receipts cannot close a composer opened for the next message.
  await store.dispatch({ type: "palette.toggled", actor: "user", open: true }).isPersisted.promise
  await store.dispatch({ type: "composer.changed", actor: "user", draft: "Next message" }).isPersisted.promise
  await store.dispatch({ type: "conversation.prompt.changed", actor: "system",
    request: { id: "send", owner: "ben", branch: "main", prompt: "Send this", state: "accepted", turnId: "turn" } }).isPersisted.promise
  expect(store.session().paletteOpen).toBe(true)
  expect(store.session().draft).toBe("Next message")
})
