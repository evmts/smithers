import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, expect, test } from "bun:test"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import { cloudCapabilities } from "@smthrs/rpc/HostCapabilities"
import App from "./App"
import { ControllerTestProvider } from "./ControllerContext"
import { createAppController } from "./state/AppController"
import { createAppStore } from "./state/AppStore"
import { applicationIdentityFromFetch, json, memoryStorage, settled, silentAgent } from "./state/TestFixtures"

GlobalRegistrator.register({ url: "https://smithers.sh/" })
const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => { while (cleanups.length) await cleanups.pop()!() })
afterAll(async () => { await settled(); await GlobalRegistrator.unregister() })
const REPO = "sample/repository"
const INSTALL = "https://github.com/apps/smithers/installations/new"

const fixture = async (installed: boolean, configured: boolean, installUrl: string | null = INSTALL) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "reader", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "cloud.session.loaded", actor: "system", state: "signed-in", username: "reader", expiresAt: null, scopes: null }).isPersisted.promise
  await store.dispatch({ type: "repository.upserted", actor: "system", repository: { id: REPO, org: "sample", name: "repository", ownerKind: "user", head: null, catalog: true } }).isPersisted.promise
  await store.dispatch({ type: "repo.selected", actor: "user", id: REPO }).isPersisted.promise
  const fetchImpl = async (input: string | Request | URL) => String(input).endsWith("/github-app-status")
    ? json(200, { github_app_installed: installed, github_app_configured: configured, install_url: installUrl }) : json(404, {})
  const originalFetch = globalThis.fetch
  globalThis.fetch = Object.assign(async () => json(404, {}), { preconnect: originalFetch.preconnect })
  const controller = createAppController(store, silentAgent, {
    applicationIdentity: applicationIdentityFromFetch(fetchImpl, "https://smithers.sh"),
    bootstrap: { apiVersion: 1, host: "cloud", version: "test", buildSha: "test", capabilities: cloudCapabilities({ identity: true, cloud: true, agent: true, checkout: true, terminal: false }), authFlow: "redirect", sandbox: null },
    fetchImpl
  })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  flushSync(() => root.render(<ControllerTestProvider controller={controller}><App /></ControllerTestProvider>))
  cleanups.push(async () => { flushSync(() => root.unmount()); host.remove(); await settled(); await controller.dispose(); await store.dispose?.(); globalThis.fetch = originalFetch })
  return { store, controller, host }
}

for (const door of ["slash", "form"] as const) test(`GitHub status reaches the person through the ${door} door, beside model data`, async () => {
  const { controller, host } = await fixture(true, true)
  if (door === "form") {
    controller.renderFlowForm({ name: "github", args: undefined, via: "user" })
    await settled()
    const submit = host.querySelector<HTMLButtonElement>('[data-flow-name="github"] button[type="submit"]')
    expect(submit).not.toBeNull()
    flushSync(() => submit!.click())
    for (let tick = 0; tick < 50 && !host.querySelector('[data-testid="transcript"]')?.textContent?.includes("Installed: Yes"); tick++) await settled()
  } else {
    const result = await controller.runCommandForResult("github", JSON.stringify({ operation: "app-status" }))
    expect(result.status).toBe("executed")
    if (result.status === "executed") expect(result.value).toContain("Installed: Yes")
    await settled()
  }
  expect(host.querySelector('[data-testid="transcript"]')?.textContent).toContain("Installed: Yes")
  expect(host.querySelector('[data-testid="transcript"]')?.textContent).toContain("Configured: Yes")
  expect(host.querySelector('[data-testid="transcript"]')?.textContent).not.toContain("see Settings")
  expect(host.querySelector('[data-testid="transcript"]')?.textContent).not.toContain("see Setup")
})

for (const [installed, configured] of [[false, false], [true, false], [false, true]] as const) test(`GitHub's separate statuses and API install link are visible (${installed}, ${configured})`, async () => {
  const { controller, host } = await fixture(installed, configured)
  await controller.runCommandForResult("github", JSON.stringify({ operation: "app-status" }))
  await settled()
  expect(host.querySelector('[data-testid="transcript"]')?.textContent).toContain(`Installed: ${installed ? "Yes" : "No"}`)
  expect(host.querySelector('[data-testid="transcript"]')?.textContent).toContain(`Configured: ${configured ? "Yes" : "No"}`)
  const link = host.querySelector<HTMLAnchorElement>(`a[href="${INSTALL}"]`)
  expect(link).not.toBeNull()
  expect(link?.textContent).toContain(installed ? "Configure" : "Install")
})

for (const url of [null, "https://untrusted.test/install", "javascript:alert(1)", "https://user:password@github.com/apps/smithers/installations/new"]) test(`GitHub status keeps its result when no safe installation link exists (${url})`, async () => {
  const { controller, host } = await fixture(false, false, url)
  await controller.runCommandForResult("github", JSON.stringify({ operation: "app-status" }))
  await settled()
  expect(host.querySelector('[data-testid="transcript"]')?.textContent).toContain("Installed: No")
  expect(host.querySelector('[data-testid="transcript"]')?.textContent).toContain("Configured: No")
  expect(host.querySelector('[data-testid="transcript"]')?.textContent).not.toContain("see Setup")
  expect(host.querySelector('a[href*="untrusted.test"], a[href*="password"], a[href^="javascript:"]')).toBeNull()
})


test("a GitHub installation URL with parentheses stays an actionable single link", async () => {
  const url = "https://github.com/apps/smithers/installations/new?state=(approved)"
  const { controller, host } = await fixture(false, false, url)
  await controller.runCommandForResult("github", JSON.stringify({ operation: "app-status" }))
  await settled()
  const links = [...host.querySelectorAll<HTMLAnchorElement>("a")].filter(link => link.textContent === "Install the Smithers GitHub App")
  expect(links).toHaveLength(1)
  expect(links[0]?.href).toBe("https://github.com/apps/smithers/installations/new?state=%28approved%29")
})
