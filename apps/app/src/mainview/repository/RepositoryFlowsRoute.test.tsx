import { GlobalRegistrator } from "@happy-dom/global-registrator"
import type { AppBootstrap } from "@smthrs/rpc/AppBootstrap"
import { cloudCapabilities } from "@smthrs/rpc/HostCapabilities"
import { afterAll, afterEach, expect, test } from "bun:test"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import App from "../App"
import { ControllerTestProvider } from "../ControllerContext"
import { beginRepositoryEntry, openRequestedRepo, requestedTarget } from "../RepoLink"
import { openRequestedSubject } from "../RepositorySubjectEntry"
import type { AppController as AppControllerType } from "../state/AppController"
import { createAppStore } from "../state/AppStore"
import { scopedControllers } from "../state/ControllerTestScope"
import { json, memoryStorage, silentAgent } from "../state/TestFixtures"
import { flowReadKey, repositoryFlowReads } from "./RepositoryFlowRead"

/*
 * The flows and settings routes through the real admission and route reader:
 * /owner/repo/flows reads `.smithers/flows` at the document's default bookmark
 * after the repository is admitted, and the frame mounts the view with the
 * Flows tab current; Settings is a member's (the document's can_write) and
 * words GitHub sync from the same document the header chip reads.
 */

GlobalRegistrator.register({ url: "https://smithers.sh/" })
afterAll(async () => {
  for (let tick = 0; tick < 3; tick += 1) await new Promise(resolve => setTimeout(resolve, 0))
  await GlobalRegistrator.unregister()
})
const mounted: Array<() => void> = []
afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.()
  window.history.replaceState(null, "", "/")
})
const createAppController = scopedControllers()
const WEB: AppBootstrap = {
  apiVersion: 1, host: "cloud", version: "test", buildSha: "cloud",
  capabilities: cloudCapabilities({ identity: true, cloud: true, agent: true, checkout: true, terminal: false }),
  authFlow: "redirect", sandbox: null
}
const REPO = "roninjin10/e2e-verify"
const ROOT = `/api/repos/${REPO}`
const settled = async (ticks = 8) => { for (let tick = 0; tick < ticks; tick += 1) await new Promise(resolve => setTimeout(resolve, 0)) }
const lastSync = new Date(Date.now() - 3 * 3600_000).toISOString()

const backend = (document: Record<string, unknown>, extra: Record<string, Response> = {}) => {
  const seen: string[] = []
  const routes: Record<string, Response> = {
    "/api/user": json(200, { id: 1, username: "roninjin10", is_admin: false }),
    "/api/auth/scopes": json(200, { scopes: [] }),
    "/api/public/repos": json(200, { repos: [] }),
    "/api/user/repos": json(200, { repos: [{ owner: "roninjin10", name: "e2e-verify", full_name: REPO, default_bookmark: "main" }] }),
    "/api/user/orgs": json(200, { orgs: [] }),
    "/api/notifications/list": json(200, []),
    [ROOT]: json(200, { full_name: REPO, default_bookmark: "main", is_public: false, ...document }),
    [`${ROOT}/contents/.smithers/flows`]: json(200, [{ name: "review", type: "dir" }, { name: "notes", type: "dir" }, { name: "README.md", type: "file" }]),
    [`${ROOT}/contents/.smithers/flows/review`]: json(200, [{ name: "flow.ts", type: "file" }]),
    [`${ROOT}/contents/.smithers/flows/notes`]: json(200, [{ name: "notes.ts", type: "file" }]),
    [`${ROOT}/contents/.smithers/flows/review/flow.ts`]: json(200, { type: "file", encoding: "utf-8", content: 'export default Flow.make("review", { description: "Review changes" })\n', size: 70 }),
    ...extra
  }
  const fetchImpl = async (input: unknown): Promise<Response> => {
    const absolute = new URL(typeof input === "string" ? input : String(input), "https://smithers.sh")
    seen.push(absolute.pathname + absolute.search)
    return routes[absolute.pathname]?.clone() ?? json(404, { status: "error", code: "not_found" })
  }
  return { seen, fetchImpl }
}

const enter = async (pathname: string, wire: ReturnType<typeof backend>, signedIn = true) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  window.history.replaceState(null, "", pathname)
  const target = requestedTarget(window.location)!
  const fetchImpl = signedIn ? wire.fetchImpl : async (input: unknown) => new URL(String(input), "https://smithers.sh").pathname === "/api/user"
    ? json(401, { code: "unauthorized", message: "authentication required" }) : wire.fetchImpl(input)
  const controller = createAppController(store, silentAgent, { bootstrap: WEB, repositoryApp: target.repo, fetchImpl })
  await controller.loadSession()
  const requestId = beginRepositoryEntry(store, target.repo)
  await openRequestedRepo(controller, fetchImpl, target.repo, requestId)
  await openRequestedSubject(controller, target.repo, target.subject, { requestId })
  await settled()
  return { store, controller, requestId }
}

const mount = (controller: AppControllerType) => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  flushSync(() => root.render(<ControllerTestProvider controller={controller}><App /></ControllerTestProvider>))
  mounted.push(() => { flushSync(() => root.unmount()); host.remove() })
  return host
}
const tabs = (host: HTMLElement) => [...host.querySelectorAll('nav[aria-label="Repository"] a')].map(tab => [tab.textContent, tab.getAttribute("aria-current")])

test("/flows lists the directories that declare a flow, at the default bookmark, inside the frame", async () => {
  const wire = backend({})
  const { controller, requestId } = await enter(`/${REPO}/flows`, wire)
  expect(repositoryFlowReads.get(flowReadKey(REPO, undefined, requestId))?.value).toEqual({
    kind: "list", ref: "main", read: { state: "ready", value: [{ name: "review", path: ".smithers/flows/review/flow.ts" }] }
  })
  expect(wire.seen).toContain(`${ROOT}/contents/.smithers/flows?ref=main`)
  const host = mount(controller)
  await settled()
  expect(tabs(host)).toEqual([["Code", null], ["Issues", null], ["Pull requests", null], ["Flows", "page"]])
  expect(host.querySelector('a[href="/roninjin10/e2e-verify/flows/review"]')?.textContent).toBe("review")
  expect(host.querySelector('a[href="/roninjin10/e2e-verify/blob/main/.smithers/flows/review/flow.ts"]')).not.toBeNull()
  expect(host.textContent).not.toContain("notes")
  expect(host.querySelector('[data-message-id="home"]')).toBeNull()
})

test("/flows/<name> opens the source as text; an unknown name is not found; a superseded admission writes nothing", async () => {
  const { controller } = await enter(`/${REPO}/flows/review`, backend({}))
  const host = mount(controller)
  await settled()
  expect(host.querySelector("#repo-content h1")?.textContent).toBe("review")
  expect(host.textContent).toContain("Review changes")
  expect(host.querySelector('[role="region"][aria-label=".smithers/flows/review/flow.ts"]')?.textContent).toContain("Flow.make")
  expect(host.querySelector("button")?.textContent).not.toMatch(/^Run/)

  const missing = await enter(`/${REPO}/flows/notes`, backend({}))
  const missingHost = mount(missing.controller)
  await settled()
  expect(missingHost.querySelector("#repo-content h2")?.textContent).toBe("Flow not found.")

  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  window.history.replaceState(null, "", `/${REPO}/flows`)
  const wire = backend({})
  const stale = createAppController(store, silentAgent, { bootstrap: WEB, repositoryApp: REPO, fetchImpl: wire.fetchImpl })
  await stale.loadSession()
  const old = beginRepositoryEntry(store, REPO)
  await openRequestedRepo(stale, wire.fetchImpl, REPO, beginRepositoryEntry(store, REPO))
  await openRequestedSubject(stale, REPO, { kind: "flows" }, { requestId: old })
  await settled()
  expect(repositoryFlowReads.get(flowReadKey(REPO, undefined, old))).toBeUndefined()
})

test("Settings is a member's: can_write shows the tab, and GitHub sync reads the admission's document", async () => {
  const member = await enter(`/${REPO}/settings/sync`, backend({ can_write: true, mirror_status: "behind", behind_refs: 2, failed_refs: 0, last_mirror_at: lastSync }))
  expect(member.store.session().repositoryEntry).toMatchObject({ canWrite: true, githubSync: { status: "behind", behindRefs: 2, lastMirrorAt: lastSync } })
  const host = mount(member.controller)
  await settled()
  expect(tabs(host).map(([label, current]) => [label, current])).toEqual([["Code", null], ["Issues", null], ["Pull requests", null], ["Flows", null], ["Settings", "page"]])
  expect(host.querySelector("#repo-content h1")?.textContent).toBe("GitHub sync")
  expect(host.querySelector(".repo-settings-sync-state")?.textContent).toBe("Synced 3 h ago")

  const unsynced = await enter(`/${REPO}/settings/sync`, backend({ can_write: true, mirror_status: "behind", behind_refs: 9, last_mirror_at: null }))
  const unsyncedHost = mount(unsynced.controller)
  await settled()
  expect(unsyncedHost.querySelector("#repo-content h2")?.textContent).toBe("No sync history.")

  const reader = await enter(`/${REPO}/settings`, backend({ can_write: false, mirror_status: "failed", last_mirror_at: lastSync, last_mirror_error: "private" }))
  const readerHost = mount(reader.controller)
  await settled()
  expect(tabs(readerHost).map(([label]) => label)).not.toContain("Settings")
  expect(readerHost.querySelector("#repo-content h2")?.textContent).toBe("Page not found.")
  expect(readerHost.textContent).not.toContain("private")
})

test("signed out, a public repository's Settings is the sign-in state and its flows stay readable", async () => {
  const wire = backend({ is_public: true, can_write: false })
  const visitor = await enter(`/${REPO}/settings`, wire, false)
  const host = mount(visitor.controller)
  await settled()
  expect(host.querySelector("#repo-content h2")?.textContent).toBe("Sign in to open repository settings.")
  expect(tabs(host).map(([label]) => label)).toEqual(["Code", "Issues", "Pull requests", "Flows"])
  const flows = await enter(`/${REPO}/flows`, backend({ is_public: true }), false)
  expect(repositoryFlowReads.get(flowReadKey(REPO, undefined, flows.requestId))?.value.read.state).toBe("ready")
})
