import { expect, test } from "bun:test"
import { createAppController } from "./AppController"
import { createAppStore } from "./AppStore"
import { memoryStorage, silentAgent, settled } from "./TestFixtures"

const hosted = async () => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const calls: string[] = []
  const controller = createAppController(store, silentAgent, {
    bootstrap: { apiVersion: 1, host: "cloud", version: "test", buildSha: "test", capabilities: ["identity", "cloud"], authFlow: "redirect", sandbox: null },
    fetchImpl: async (input, init) => {
      const path = new URL(String(input), "https://smithers.sh").pathname
      calls.push(`${init?.method ?? "GET"} ${path}`)
      return path === "/api/repos/will/project" ? Response.json({ permission: "owner" })
        : Response.json({ message: "Service unavailable" }, { status: 503 })
    }
  })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "will", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [{ id: "will/project", org: "will", ownerKind: "user", name: "project", head: null }, { id: "other/project", org: "other", ownerKind: "user", name: "project", head: null }] }).isPersisted.promise
  await store.dispatch({ type: "repo.selected", actor: "user", id: "will/project" }).isPersisted.promise
  return { store, controller, calls }
}

test("hosted command authority comes from the repository, and unknown authority grants no role (#3831)", async () => {
  const h = await hosted()
  try {
    await h.controller.secretAuthority!.read("will/project")
    expect(h.controller.commands.state().viewerRole).toBe("owner")
    expect(h.controller.membersRole("other/project")).toBeUndefined()
    await h.store.dispatch({ type: "repo.selected", actor: "user", id: "other/project" }).isPersisted.promise
    expect(h.controller.commands.state().viewerRole).toBeUndefined()
  } finally { await h.controller.dispose() }
})

test("hosted settings, flows, members and secrets keep failed real reads instead of seeded answers (#3831)", async () => {
  const h = await hosted()
  try {
    expect(await h.controller.flowCards("review")).toBeUndefined()
    expect(h.calls).toContain("GET /api/flows")
    const changed = await h.controller.setInstallCapacity(7)
    expect(typeof changed).toBe("string")
    expect(h.controller.installSnapshots.get().error).toBeDefined()
    expect(h.controller.homeView).toBeDefined()
    h.controller.showMembers()
    await settled()
    expect(h.controller.membersRoster.get().error).toBeDefined()
    expect(h.controller.membersRoster.get().model).toBeUndefined()
    await h.controller.listSecrets("will/project")
    await settled()
    expect([...h.store.collections.cards.values()].some(card => card.kind === "secrets")).toBe(false)
  } finally { await h.controller.dispose() }
})
