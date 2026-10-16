import { expect, test } from "bun:test"
import { scopedControllers } from "../../state/ControllerTestScope"
import { createAppStore } from "../../state/AppStore"
import { memoryStorage, silentAgent } from "../../state/TestFixtures"

const createAppController = scopedControllers()

/*
 * `issues.create` on an install opens its repository's GitHub issue through
 * the install's canonical durable create — the same writer `/issue.new`
 * uses. It used to answer "Use /issue.new on this install." at every door,
 * because the Cloud create addressed a Smithers tracker the install has
 * none of. One seam now decides the tracker and one writer performs it.
 */
test("install creates its repository's GitHub issue through the durable create door", async () => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "will", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [{ id: "owner/repo", org: "owner", ownerKind: "user", name: "repo", head: null }] }).isPersisted.promise
  await store.dispatch({ type: "repo.selected", actor: "user", id: "owner/repo" }).isPersisted.promise
  const writes: string[] = []
  const controller = createAppController(store, silentAgent, {
    bootstrap: { apiVersion: 1, host: "cloud", version: "test", buildSha: "test", capabilities: ["install", "identity", "cloud"], authFlow: "credentials", sandbox: null },
    fetchImpl: async (input, init) => {
      const url = new URL(String(input), "https://app.test")
      if (init?.method === "POST") writes.push(url.pathname)
      if (url.pathname === "/api/issues" && init?.method === "POST") return Response.json({ kind: "requested", operationId: "op-1" }, { status: 202 })
      if (url.pathname === "/api/issues/requests/op-1") return Response.json({ state: "accepted" })
      return Response.json({}, { status: 404 })
    }
  })
  try {
    expect(await controller.commands.run("issues.create", "Legacy issue owner/repo")).toMatchObject({ status: "executed" })
    expect(await controller.commands.submit({ name: "issues.create", payload: { title: "Button issue", repo: "owner/repo" }, actor: "user" })).toMatchObject({ status: "executed" })
    // The Cloud tracker is a different tracker: no write may address it.
    expect(writes).toEqual(["/api/issues", "/api/issues"])
    expect(writes.some(path => path.startsWith("/api/repos/"))).toBe(false)

    // An agent still performs none of it: the person is asked, nothing is sent.
    writes.length = 0
    const asked = await controller.commands.submit({ name: "issues.create", payload: { title: "Agent issue", repo: "owner/repo" }, actor: "agent" })
    expect(asked).toMatchObject({ status: "executed" })
    expect(asked.status === "executed" && asked.value).toContain("nothing has happened yet")
    expect(writes).toEqual([])
  } finally { controller.dispose() }
})

/*
 * THE FORM LAW on an install too: the door runs here now, so a bare
 * `/issues.create` asks for the title it is missing instead of naming
 * another door. It used to answer `unavailable` before the form.
 */
test("install asks for the title issues.create is missing", async () => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "will", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [{ id: "owner/repo", org: "owner", ownerKind: "user", name: "repo", head: null }] }).isPersisted.promise
  await store.dispatch({ type: "repo.selected", actor: "user", id: "owner/repo" }).isPersisted.promise
  const writes: string[] = []
  const controller = createAppController(store, silentAgent, {
    bootstrap: { apiVersion: 1, host: "cloud", version: "test", buildSha: "test", capabilities: ["install", "identity", "cloud"], authFlow: "credentials", sandbox: null },
    fetchImpl: async (input, init) => {
      if (init?.method === "POST") writes.push(String(input))
      return Response.json({}, { status: 404 })
    }
  })
  try {
    expect(await controller.commands.run("issues.create")).toMatchObject({ status: "form", flow: "issues.create" })
    expect(writes).toEqual([])
  } finally { controller.dispose() }
})

test("a Cloud origin's issues.create still asks for the title it is missing", async () => {
  /* THE FORM LAW, unchanged where the door runs: no `install` row, so no refusal. */
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "will", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [{ id: "owner/repo", org: "owner", ownerKind: "user", name: "repo", head: null }] }).isPersisted.promise
  await store.dispatch({ type: "repo.selected", actor: "user", id: "owner/repo" }).isPersisted.promise
  const controller = createAppController(store, silentAgent, {
    bootstrap: { apiVersion: 1, host: "cloud", version: "test", buildSha: "test", capabilities: ["identity", "cloud"], authFlow: "redirect", sandbox: null },
    fetchImpl: async () => Response.json({}, { status: 404 })
  })
  try {
    expect(await controller.commands.run("issues.create")).toMatchObject({ status: "form", flow: "issues.create" })
    expect([...store.collections.cards.values()].some(row => row.kind === "flow-form")).toBe(true)
  } finally { controller.dispose() }
})
