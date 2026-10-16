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
 * The hosted entry routes, mounted on the real controller (M-45):
 *
 *  - `/` is the launcher. It used to open on the host's initialization
 *    diagnostic, which told a first-time reader nothing about what to do.
 *  - `/owner/repo` opens the repository's default view: its file tree, which
 *    the repository may replace with a view it declares, the tree staying one
 *    press away.
 */

GlobalRegistrator.register({ url: "https://smithers.sh/" })

afterAll(async () => {
  for (let tick = 0; tick < 3; tick += 1) await new Promise(resolve => setTimeout(resolve, 0))
  await GlobalRegistrator.unregister()
})

const mounted: Array<() => void> = []
const restores: Array<() => void> = []
afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.()
  while (restores.length > 0) restores.pop()?.()
  window.history.replaceState(null, "", "/")
})

/** Wait for a seam's answer to reach the mounted page, flushing React between reads. */
const until = async (host: HTMLElement, selector: string): Promise<Element> => {
  for (let tick = 0; tick < 50; tick += 1) {
    const found = host.querySelector(selector)
    if (found !== null) return found
    await settled()
    flushSync(() => {})
  }
  throw new Error(`${selector} never appeared`)
}

const mount = (controller: AppControllerType): { host: HTMLElement } => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  flushSync(() => root.render(<ControllerTestProvider controller={controller}><App /></ControllerTestProvider>))
  mounted.push(() => { flushSync(() => root.unmount()); host.remove() })
  return { host }
}

const WEB: AppBootstrap = {
  apiVersion: 1, host: "cloud", version: "test", buildSha: "cloud",
  capabilities: cloudCapabilities({ identity: true, cloud: true, agent: true, checkout: true, terminal: false }),
  authFlow: "redirect", sandbox: null
}

const RELEASE = {
  name: "Smithers 1.2", tag_name: "1.2.0", published_at: "2026-10-14T10:00:00Z", draft: false,
  html_url: "https://github.com/smithersai/smithers/releases/tag/1.2.0"
}

const CATALOG = { repos: [{ name: "smithersai/smithers", summary: "A durable workflow framework." }] }

/** The public news source, stubbed where the seam reads it: the window's own fetch. */
const stubNews = (answer: () => Promise<Response>) => {
  const asked: Array<[string, RequestInit | undefined]> = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    asked.push([String(input), init])
    return answer()
  }) as typeof globalThis.fetch
  restores.push(() => { globalThis.fetch = original })
  return asked
}

const openLauncher = async (news: () => Promise<Response>, signedIn = true) => {
  const asked = stubNews(news)
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  window.history.replaceState(null, "", "/")
  const http = backend({
    "/api/user": signedIn ? json(200, { id: 1, username: "ada", is_admin: false }) : json(401, { status: "error" }),
    "/api/auth/scopes": json(200, { scopes: [] }),
    "/api/public/repos": json(200, CATALOG),
    "/api/user/repos": json(200, [{ full_name: "ada/widgets", name: "widgets", owner: { login: "ada" }, default_bookmark: "main" }]),
    "/api/user/orgs": json(200, []),
    "/api/user/workspaces": json(200, [])
  })
  const controller = createAppController(store, silentAgent, { bootstrap: WEB, ...http })
  await controller.loadSession()
  await settled()
  const view = mount(controller)
  await settled()
  flushSync(() => {})
  return { store, controller, asked, ...view }
}

test("the launcher at `/` offers repositories to open and explore, and the dated updates it read", async () => {
  const { host, asked } = await openLauncher(async () => json(200, [RELEASE]))
  const launcher = host.querySelector<HTMLElement>("[data-testid=repository-launcher]")!
  expect(launcher).not.toBeNull()
  // The host initialization diagnostic is not what a first-time reader meets here.
  expect(host.textContent).not.toContain("flows registered")
  const explore = launcher.querySelector<HTMLElement>('[data-section="explore"]')!
  expect([...explore.querySelectorAll("a")].map(link => link.getAttribute("href"))).toEqual(["/smithersai/smithers/"])
  await until(host, '[data-section="updates"] time')
  const updates = launcher.querySelector<HTMLElement>('[data-section="updates"]')!
  expect(updates.querySelector("time")!.getAttribute("datetime")).toBe("2026-10-14T10:00:00.000Z")
  expect(updates.querySelector("a")!.getAttribute("href")).toBe(RELEASE.html_url)
  // One public read, with no credential on it.
  expect(asked).toHaveLength(1)
  expect(asked[0]![1]?.credentials).toBe("omit")
})

test("an unreachable news source is absent and retryable, never an empty updates frame", async () => {
  const { host } = await openLauncher(async () => { throw new TypeError("ECONNRESET socket-detail") })
  await until(host, "[data-testid=repository-launcher-updates-unreadable]")
  const updates = host.querySelector<HTMLElement>('[data-section="updates"]')!
  expect(updates.querySelector("[data-testid=repository-launcher-updates-unreadable]")).not.toBeNull()
  expect(updates.querySelectorAll("li")).toHaveLength(0)
  expect(updates.textContent).not.toContain("socket-detail")
  expect(updates.querySelector('[data-flow="app.updates"]')).not.toBeNull()
})

test("signed out the launcher still reads the public shelf and signs nobody in", async () => {
  const { host } = await openLauncher(async () => json(200, [RELEASE]), false)
  const launcher = host.querySelector<HTMLElement>("[data-testid=repository-launcher]")!
  expect(launcher).not.toBeNull()
  // The page's own sign-in doors stay exactly where they were.
  expect(host.querySelector("[data-login]")).not.toBeNull()
  expect(launcher.querySelector('[data-section="create"] form')).toBeNull()
  expect(launcher.querySelector<HTMLAnchorElement>('[data-section="explore"] a')!.getAttribute("href")).toBe("/smithersai/smithers/")
})

/* The repository route: the tree by default, a declared view in its place. */
const openRepository = async (home: Response, repo = "smithersai/smithers") => {
  stubNews(async () => json(200, []))
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  window.history.replaceState(null, "", `/${repo}/`)
  const [owner = "", name = ""] = repo.split("/")
  const http = backend({
    "/api/user": json(200, { id: 1, username: "ada", is_admin: false }),
    "/api/auth/scopes": json(200, { scopes: [] }),
    "/api/public/repos": json(200, { repos: [{ name: repo }] }),
    "/api/user/repos": json(200, []),
    "/api/user/orgs": json(200, []),
    "/api/user/workspaces": json(200, []),
    [`/api/repos/${owner}/${name}`]: json(200, { default_bookmark: "main" }),
    [`/api/repos/${owner}/${name}/home`]: home,
    [`/api/repos/${owner}/${name}/contents`]: json(200, [{ name: "README.md", path: "README.md", type: "file" }])
  })
  const controller = createAppController(store, silentAgent, { bootstrap: WEB, repositoryApp: repo, ...http })
  await controller.loadSession()
  await openRequestedRepo(controller, http.fetchImpl, requestedRepo(window.location)!)
  await settled()
  const view = mount(controller)
  await settled()
  flushSync(() => {})
  return { store, controller, ...view }
}

test("a repository that declares a view opens on it, with the tree one press away", async () => {
  const { host, store } = await openRepository(json(200, { kind: "blocks", blocks: [{ type: "text", title: "Widgets", text: "The widget factory." }] }))
  const view = host.querySelector<HTMLElement>("[data-testid=repository-home]")
  expect(view?.textContent).toContain("The widget factory.")
  expect(view?.querySelector(".repository-home-files")).not.toBeNull()
  // The tree is the default view and still opened for this arrival.
  expect(store.collections.repoTree.get("shared:smithersai/smithers#")).not.toBeUndefined()
})

test("a repository that declares none keeps the tree as its view, with no empty frame in its place", async () => {
  const { host, store } = await openRepository(json(404, { status: "error" }))
  expect(host.querySelector("[data-testid=repository-home]")).toBeNull()
  expect(store.collections.repoTree.get("shared:smithersai/smithers#")).not.toBeUndefined()
})

test("a declaration that cannot be read falls back to the tree and says what failed", async () => {
  const { host } = await openRepository(json(503, { status: "error" }))
  const view = host.querySelector<HTMLElement>("[data-testid=repository-home]")!
  expect(view.dataset.home).toBe("error")
  expect(view.textContent).toContain("Homepage unavailable")
  expect(view.querySelector(".repository-home-files")).not.toBeNull()
})
