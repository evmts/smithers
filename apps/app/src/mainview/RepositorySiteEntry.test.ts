import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test"
import { repositorySite, requestedTarget, signInReturnTo, openRequestedRepo } from "./RepoLink"
import { createAppStore } from "./state/AppStore"
import { createTabsController } from "./state/controller/tabs"
import type { ControllerContext } from "./state/controller/context"
import { memoryStorage } from "./state/TestFixtures"

beforeAll(() => GlobalRegistrator.register({ url: "https://docs.smithers.sh" }))
afterAll(() => GlobalRegistrator.unregister())

const meta = (repository = "owner/docs", appPrefix = "/repo/") => {
  const element = document.createElement("meta")
  element.name = "smithers-repository-site"
  element.content = JSON.stringify({ repository, appPrefix })
  document.head.append(element)
  return element
}
afterEach(() => { document.querySelector('meta[name="smithers-repository-site"]')?.remove() })

test("site entry selects its bound repository at the root, prefix, subject and fallback paths", () => {
  meta()
  for (const pathname of ["/", "/repo/", "/unclaimed", "/other/repo"]) expect(requestedTarget({ pathname, search: "?repo=victim/private" })?.repo).toBe("owner/docs")
  expect(requestedTarget({ pathname: "/repo/issues/7", search: "" })).toEqual(requestedTarget({ pathname: "/owner/docs/issues/7", search: "" }))
  expect(signInReturnTo({ pathname: "/repo/", search: "?auth=old&tab=home" })).toBe("/repo/?tab=home")
  const element = document.querySelector('meta[name="smithers-repository-site"]')!
  element.setAttribute("content", '{"repository":"victim/../secret","appPrefix":"/repo/"}')
  expect(repositorySite()).toBeUndefined()
})

test("the site reads its repository directly rather than relying on the public catalog", async () => {
  meta()
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const tabs = createTabsController({ store, services: {}, commandActor: "user", repositories: { available: false } } as unknown as ControllerContext)
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "owner", admin: false, scopesPlain: null }).isPersisted.promise
  const reads: string[] = []
  const controller = { store, selectRepo: tabs.selectRepo, loadRepositories: async () => {}, runCommand: () => true }
  await openRequestedRepo(controller, async path => { reads.push(String(path)); return Response.json({ name: "docs", is_public: false, default_bookmark: "main" }) }, "owner/docs")
  expect(reads).toEqual(["/api/repos/owner/docs", "/api/repos/owner/docs"])
  expect(store.session().repositoryEntry?.phase).toBe("ready")
  expect(store.session().activeRepoKey).toContain("owner/docs")
  await openRequestedRepo(controller, async () => Response.json({ message: "Not found" }, { status: 404 }), "owner/docs")
  expect(store.session().repositoryEntry?.phase).toBe("failed")
})
