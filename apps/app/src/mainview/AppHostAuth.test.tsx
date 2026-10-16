import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, expect, test } from "bun:test"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import App from "./App"
import { ControllerTestProvider } from "./ControllerContext"
import { createAppController } from "./state/AppController"
import { createAppStore } from "./state/AppStore"
import { memoryStorage, silentAgent, waitFor } from "./state/TestFixtures"

GlobalRegistrator.register()
afterAll(async () => { await new Promise(resolve => setTimeout(resolve, 20)); await GlobalRegistrator.unregister() })

test("an unavailable identity is visible with the design fixture off (#3831)", async () => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const controller = createAppController(store, silentAgent, {
    bootstrap: { apiVersion: 1, host: "cloud", version: "test", buildSha: "test", capabilities: [], authFlow: null, sandbox: null },
    fetchImpl: async () => Response.json({}, { status: 404 })
  })
  const host = document.createElement("div"); document.body.append(host)
  const root = createRoot(host)
  try {
    await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "unavailable", login: null, admin: false, scopesPlain: null }).isPersisted.promise
    flushSync(() => root.render(<ControllerTestProvider controller={controller}><App /></ControllerTestProvider>))
    await waitFor(() => host.textContent?.includes("Sign-in is unavailable on this host.") === true)
    expect(host.textContent?.includes("Sign-in is unavailable on this host.")).toBe(true)
  } finally { flushSync(() => root.unmount()); host.remove(); await controller.dispose() }
})
