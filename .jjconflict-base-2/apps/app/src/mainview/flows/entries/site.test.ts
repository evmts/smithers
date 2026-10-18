import { expect, test } from "bun:test"
import { createAppController } from "../../state/AppController"
import { createAppStore } from "../../state/AppStore"
import { memoryStorage, unavailableAgent } from "../../state/TestFixtures"

test("changing the site action asks for that action's fields in the same persisted form", async () => {
  const storage = memoryStorage()
  const store = await createAppStore({ kind: "localStorage", storage })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "owner", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [{ id: "owner/docs", org: "owner", ownerKind: "user", name: "docs", head: null }] }).isPersisted.promise
  await store.dispatch({ type: "repo.selected", actor: "user", id: "owner/docs" }).isPersisted.promise
  const controller = createAppController(store, unavailableAgent, { bootstrap: {
    apiVersion: 1, host: "cloud", version: "test", buildSha: "test", capabilities: ["identity", "sites"], authFlow: "redirect", sandbox: null
  } })
  try {
    expect((await controller.runCommandForResult("site")).status).toBe("form")
    const form = [...store.collections.cards.values()].find(card => card.kind === "flow-form" && card.payload.flow === "site")!
    const fields = () => {
      const card = store.collections.cards.get(form.id)!
      if (card.kind !== "flow-form") throw new Error("Missing form")
      return card.payload.fields
    }
    expect(fields().map(field => field.name)).toEqual(["action"])
    await controller.setFormField(form.id, "action", "domain.add")
    expect(fields().filter(field => field.required).map(field => field.name)).toEqual(["action", "domain"])
    await controller.setFormField(form.id, "action", "activate")
    expect(fields().filter(field => field.required).map(field => field.name)).toEqual(["action", "version", "expected"])
    await controller.setFormField(form.id, "action", "enable")
    expect(fields().map(field => field.name)).toEqual(["action", "name", "appPrefix"])
    await controller.setFormField(form.id, "action", "status")
    expect(fields().map(field => field.name)).toEqual(["action"])
    await store.settled?.()
    const restored = await createAppStore({ kind: "localStorage", storage })
    const saved = restored.collections.cards.get(form.id)!
    expect(saved.kind === "flow-form" && saved.payload.fields.map(field => field.name)).toEqual(["action"])
  } finally { controller.dispose() }
})
