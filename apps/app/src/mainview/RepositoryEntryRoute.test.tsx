import { GlobalRegistrator } from "@happy-dom/global-registrator"
import type { AppBootstrap } from "@smthrs/rpc/AppBootstrap"
import { cloudCapabilities } from "@smthrs/rpc/HostCapabilities"
import { afterAll, afterEach, expect, test } from "bun:test"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import App from "./App"
import { ControllerTestProvider } from "./ControllerContext"
import { openRequestedRepo, requestedRepo } from "./RepoLink"
import type { AppController as AppControllerType } from "./state/AppController"
import { createAppStore } from "./state/AppStore"
import { scopedControllers } from "./state/ControllerTestScope"
import { backend, json, memoryStorage, settled, silentAgent } from "./state/TestFixtures"

const createAppController = scopedControllers()

/*
 * `/owner/repo` is GitHub's path (M-45), so a reader who swaps the domain
 * expects that repository. When Smithers does not have it and the reader IS
 * signed in, the route used to answer with nothing at all: the header cleared
 * to "Repository" and the PREVIOUS repository's cards stayed on screen as if
 * they were this URL's (production 2026-10-15, /roninjin10/release-missing-
 * repository-20261015). These mount the real controller on that URL and pin
 * what it now says and offers (M-46), and that the earlier repository's cards
 * are retained in the store but never presented as this one's.
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

const mount = (controller: AppControllerType): { host: HTMLElement } => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  flushSync(() => root.render(<ControllerTestProvider controller={controller}><App /></ControllerTestProvider>))
  mounted.push(() => { flushSync(() => root.unmount()); host.remove() })
  return { host }
}

/** What the Worker emits for the hosted app. */
const WEB: AppBootstrap = {
  apiVersion: 1,
  host: "cloud",
  version: "test",
  buildSha: "cloud",
  capabilities: cloudCapabilities({ identity: true, cloud: true, agent: true, checkout: true, terminal: false }),
  authFlow: "redirect",
  sandbox: null
}

const INSTALL_URL = "https://github.com/apps/smithers/installations/new"
const REPO = "ada/widgets"

/** A card the LAST repository left in this person's saved conversation. */
const earlierCard = {
  id: "issues-earlier", kind: "issue-list" as const, title: "Issues", status: "active" as const,
  createdAt: 1, ordinal: 1, payload: { repo: "ada/earlier", filter: "open" as const, issues: [] }
}

const openOnMissingRepository = async (installations: Response, extra: Record<string, Response> = {}) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  window.history.replaceState(null, "", `/${REPO}/`)
  /* Mutable on purpose: a test changes what the backend answers after the page opened. */
  const routes: Record<string, Response> = {
    "/api/user": json(200, { id: 1, username: "ada", is_admin: false }),
    "/api/auth/scopes": json(200, { scopes: [] }),
    // Smithers does not have it: the repository document is a 404 (RepoLink.openRequestedRepo).
    [`/api/repos/${REPO}`]: json(404, { status: "error" }),
    "/api/user/github-app/installations": installations,
    ...extra
  }
  const http = backend(routes)
  const controller = createAppController(store, silentAgent, { bootstrap: WEB, repositoryApp: REPO, ...http })
  await store.dispatch({ type: "card.upsert", actor: "user", card: earlierCard }).isPersisted.promise
  await controller.loadSession()
  const refusal = await openRequestedRepo(controller, http.fetchImpl, requestedRepo(window.location)!)
  await settled()
  return { store, controller, refusal, routes, ...mount(controller) }
}

const COVERED = () => json(200, { install_url: INSTALL_URL, repos: [{ fullName: REPO, installationId: 42 }] })
const UNCOVERED = () => json(200, { install_url: INSTALL_URL, repos: [] })
/** What plue answers an import into an organization the caller does not belong to (services/github_import.go). */
const ORG_REFUSAL = "'ada' is an organization on this deployment; join it to import its repositories, or fork 'ada/widgets' into your own namespace"

test("a covered repository the person has access to offers the import that exists", async () => {
  const { host, store, refusal } = await openOnMissingRepository(
    json(200, { install_url: INSTALL_URL, repos: [{ fullName: REPO, installationId: 42 }] })
  )
  expect(refusal).toBe(`${REPO} is not available publicly.`)
  const notice = host.querySelector('[data-repository-missing] [data-message-id="repository-entry"]')
  expect(notice).not.toBeNull()
  expect(notice?.textContent).toContain(`Smithers doesn't have ${REPO} yet.`)
  const act = notice!.querySelector<HTMLButtonElement>('[data-flow="repos.import"]')
  expect(act).not.toBeNull()
  expect(act?.textContent).toBe("Import")
  expect(act?.disabled).toBe(false)
  // Nothing claims the import happened, and no other repository is presented as this one.
  expect(host.textContent).not.toContain("imported")
  expect(host.querySelector('[data-message-id="issues-earlier"]')).toBeNull()
  // The earlier conversation is retained, not cleared.
  expect(store.collections.cards.get("issues-earlier")).not.toBeUndefined()
})

test("a repository the App does not cover offers its installation page and no import", async () => {
  const { host } = await openOnMissingRepository(json(200, { install_url: INSTALL_URL, repos: [] }))
  const notice = host.querySelector('[data-message-id="repository-entry"]')
  expect(notice?.textContent).toContain("doesn't cover it for your account")
  expect(notice?.querySelector('[data-flow="repos.import"]')).toBeNull()
  const link = notice?.querySelector<HTMLAnchorElement>(`a[href="${INSTALL_URL}"]`)
  expect(link).not.toBeNull()
  expect(link?.textContent).toContain("Install the Smithers GitHub App")
  // GitHub opens in its own tab, so closing it returns the reader here (production 2026-10-18).
  expect(link?.target).toBe("_blank")
  expect(link?.rel.split(" ")).toContain("noopener")
  // The 404 GitHub answers for a repository it has and withholds is the same 404
  // it answers for one it does not have: neither is asserted here.
  expect(notice?.textContent).not.toContain("private")
})

test("an unreadable coverage door says so and its one act re-reads it", async () => {
  const { host } = await openOnMissingRepository(json(403, { code: "forbidden", message: "feature not available" }))
  const notice = host.querySelector('[data-message-id="repository-entry"]')
  expect(notice?.textContent).toContain("couldn't check whether it can import it")
  // Nothing was learnt, so nothing is claimed; the only act re-reads the door that refused.
  expect(notice?.querySelector('[data-flow="repos.import"]')).toBeNull()
  const retry = notice?.querySelector<HTMLButtonElement>('[data-flow="github"]')
  expect(retry?.textContent).toBe("Retry")
  expect(notice?.textContent).not.toContain("forbidden")
  expect(notice?.textContent).not.toContain("feature not available")
})

test("the notice's one act is reachable from the keyboard on a narrow desktop", async () => {
  const { host } = await openOnMissingRepository(
    json(200, { install_url: INSTALL_URL, repos: [{ fullName: REPO, installationId: 42 }] })
  )
  const act = host.querySelector<HTMLButtonElement>('[data-message-id="repository-entry"] [data-flow="repos.import"]')
  expect(act?.tagName).toBe("BUTTON")
  expect(act?.getAttribute("tabindex")).not.toBe("-1")
  act?.focus()
  expect(document.activeElement).toBe(act)
})

/*
 * Production 2026-10-18: an ultrawide reader pressed Import, the refusal went
 * to a corner notice out of view, and they pressed Import three more times.
 * The button that failed says it failed, and why, where they are looking.
 */
test("a refused import turns its button red and states the reason under it", async () => {
  const { host } = await openOnMissingRepository(COVERED(), {
    "/api/github/import": json(403, { code: "org_membership_required", message: ORG_REFUSAL })
  })
  host.querySelector<HTMLButtonElement>('[data-message-id="repository-entry"] [data-flow="repos.import"]')!.click()
  await settled()
  const notice = host.querySelector('[data-message-id="repository-entry"]')!
  const act = notice.querySelector<HTMLButtonElement>('[data-flow="repos.import"]')!
  expect(act.textContent).toBe("Retry import")
  expect(act.className).toContain("sui-button-destructive")
  expect(act.disabled).toBe(false)
  const failure = notice.querySelector('[role="alert"]')
  expect(failure?.textContent).toContain("is an organization on this deployment")
  expect(act.getAttribute("aria-describedby")).toBe(failure?.id ?? "")
})

test("an import in flight disables its button so it is not pressed again", async () => {
  const { host } = await openOnMissingRepository(COVERED(), {
    "/api/github/import": json(202, { importJobId: "job-1", status: "cloning", stage: "cloning_github" }),
    "/api/github/import/job-1": json(200, { importJobId: "job-1", status: "cloning", stage: "cloning_github" })
  })
  host.querySelector<HTMLButtonElement>('[data-message-id="repository-entry"] [data-flow="repos.import"]')!.click()
  await settled()
  const notice = host.querySelector('[data-message-id="repository-entry"]')!
  const act = notice.querySelector<HTMLButtonElement>('[data-flow="repos.import"]')!
  expect(act.textContent).toBe("Importing…")
  expect(act.disabled).toBe(true)
  expect(notice.querySelector('[role="status"]')?.textContent).toBe("Downloading from GitHub…")
})

/*
 * Production 2026-10-18: "after installing the GH app on a repo I'd love for
 * that repo to also be auto pulled in as that's what I want to view."
 */
test("returning from GitHub with the App now covering the repository imports it", async () => {
  const { host, routes, store } = await openOnMissingRepository(UNCOVERED(), {
    "/api/github/import": json(202, { importJobId: "job-1", status: "cloning", stage: "cloning_github" }),
    "/api/github/import/job-1": json(200, { importJobId: "job-1", status: "cloning", stage: "cloning_github" })
  })
  expect(host.querySelector('[data-message-id="repository-entry"] [data-flow="repos.import"]')).toBeNull()
  // The person installs the App in the other tab, closes it, and this tab gets focus back.
  routes["/api/user/github-app/installations"] = COVERED()
  window.dispatchEvent(new Event("focus"))
  await settled()
  expect(store.session().repositoryImports?.find(row => row.payload.repo === REPO)?.payload.phase).toBe("running")
  const act = host.querySelector<HTMLButtonElement>('[data-message-id="repository-entry"] [data-flow="repos.import"]')
  expect(act?.textContent).toBe("Importing…")
})

test("returning without installing imports nothing", async () => {
  const { store } = await openOnMissingRepository(UNCOVERED())
  window.dispatchEvent(new Event("focus"))
  await settled()
  expect(store.session().repositoryImports ?? []).toEqual([])
})

test("a covered repository is never imported just because the tab got focus", async () => {
  const { store } = await openOnMissingRepository(COVERED())
  window.dispatchEvent(new Event("focus"))
  await settled()
  expect(store.session().repositoryImports ?? []).toEqual([])
})

test("a finished import opens the repository it imported", async () => {
  const { host, routes, store } = await openOnMissingRepository(COVERED(), {
    "/api/github/import": json(202, { importJobId: "job-1", status: "ready" })
  })
  // Once imported, Smithers has it: the document reads and the inventory lists it.
  routes[`/api/repos/${REPO}`] = json(200, { full_name: REPO, is_public: false })
  routes["/api/user/repos"] = json(200, [{ full_name: REPO, name: "widgets", owner: { login: "ada" }, default_bookmark: "main" }])
  host.querySelector<HTMLButtonElement>('[data-message-id="repository-entry"] [data-flow="repos.import"]')!.click()
  await settled()
  expect(store.session().repositoryEntry?.phase).toBe("ready")
  expect(store.session().activeRepoKey).toBe(REPO)
  expect(host.querySelector('[data-message-id="repository-entry"]')).toBeNull()
})
