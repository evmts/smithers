import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import { createAppStore } from "../state/AppStore"
import { createAppController } from "../state/AppController"
import { unavailableAgent, waitFor } from "../state/TestFixtures"
import { payloadFor } from "../flows/SlashPayload"
import { afterAll, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { Card } from "../state/AppState"
import { SecretsCardBody } from "./SecretsCard"

const card: Extract<Card, { kind: "secrets" }> = {
  id: "secrets", kind: "secrets", title: "Secrets", status: "active", createdAt: 0, ordinal: 0,
  payload: { repo: "ada/repo", scope: "repository", secrets: [
    { name: "OPEN", mainOnly: false, hosts: [], matchHeaders: [], updatedAt: null },
    { name: "PINNED", mainOnly: true, hosts: ["a.example.com", "b.example.com"], matchHeaders: ["authorization"], updatedAt: null }
  ] }
}
const html = renderToStaticMarkup(SecretsCardBody({ card, onRunCommand: () => undefined }))

test("each row shows its main-only flag and bound host count", () => {
  expect(html).toContain('<tr data-testid="secret-OPEN"><td class="world-card-title">OPEN</td><td>no</td><td>0</td>')
  expect(html).toContain('<tr data-testid="secret-PINNED"><td class="world-card-title">PINNED</td><td>yes</td><td>2</td>')
  expect(html).not.toContain("every session")
})

test("Add secret, and each row's Main only / Every run, Bind, Rotate and Delete address that secret", () => {
  expect(html).toContain("Add secret")
  expect(html).toContain('aria-label="Limit to main OPEN" data-flow="secrets.scope" data-flow-args="OPEN main-only ada/repo"')
  expect(html).toContain('aria-label="Give to every run PINNED" data-flow="secrets.scope" data-flow-args="PINNED all ada/repo"')
  expect(html).toContain('aria-label="Bind OPEN" data-flow="secrets.bind" data-flow-args="{&quot;name&quot;:&quot;OPEN&quot;,&quot;repo&quot;:&quot;ada/repo&quot;}"')
  expect(html).toContain('aria-label="Rotate OPEN" data-flow="secrets.set" data-flow-args="{&quot;name&quot;:&quot;OPEN&quot;,&quot;repo&quot;:&quot;ada/repo&quot;}"')
  expect(html).toContain('aria-label="Delete PINNED" data-flow="secrets.delete" data-flow-args="PINNED ada/repo"')
  expect(html.match(/>Bind</g)).toHaveLength(2)
  expect(html).not.toContain('type="password"')
})

test("no secrets shows only the add button", () => {
  const empty = renderToStaticMarkup(SecretsCardBody({ card: { ...card, payload: { ...card.payload, secrets: [] } }, onRunCommand: () => undefined }))
  expect(empty).toContain("Add secret")
  expect(empty).not.toContain("<table")
})

const httpFetch = globalThis.fetch
const nativeHttp = { fetch: globalThis.fetch, Request: globalThis.Request, Response: globalThis.Response, Headers: globalThis.Headers, AbortController: globalThis.AbortController, AbortSignal: globalThis.AbortSignal }
GlobalRegistrator.register()
// The real HTTP client uses native signals; Happy DOM supplies only the button DOM.
Object.assign(globalThis, nativeHttp)
afterAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 0))
  await GlobalRegistrator.unregister()
})
test("native secret buttons deliver explicit repository inputs to the shared command grammar", () => {
  const host = document.createElement("div")
  const root = createRoot(host)
  const received: unknown[] = []
  try {
    flushSync(() => root.render(<SecretsCardBody card={card} onRunCommand={(name, args) => { received.push([name, payloadFor(name, args)]) }} />))
    for (const label of ["Limit to main OPEN", "Give to every run PINNED", "Bind OPEN"]) {
      const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
      expect(button).not.toBeNull()
      button!.click()
    }
    expect(received).toEqual([
      ["secrets.scope", { payload: { name: "OPEN", scope: "main-only", repo: "ada/repo" } }],
      ["secrets.scope", { payload: { name: "PINNED", scope: "all", repo: "ada/repo" } }],
      ["secrets.bind", { payload: { name: "OPEN", repo: "ada/repo" } }]
    ])
    expect(host.querySelector('input[type="password"]')).toBeNull()
  } finally { flushSync(() => root.unmount()) }
})

test("Bind opens the shared form without mutation and submits to the card repository over HTTP", async () => {
  const requests: Array<{ path: string; body: unknown }> = []
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: async request => {
    if (request.method !== "PATCH") return Response.json({ message: "not found" }, { status: 404 })
    requests.push({ path: new URL(request.url).pathname, body: await request.json() })
    return Response.json({ name: "OPEN", main_only: false })
  } })
  const saved = new Map<string, string>()
  const store = await createAppStore({ kind: "localStorage", storage: {
    getItem: key => saved.get(key) ?? null, setItem: (key, value) => { saved.set(key, value) }, removeItem: key => { saved.delete(key) }
  } })
  const controller = createAppController(store, unavailableAgent, { bootstrap: { apiVersion: 1, host: "cloud", version: "test", buildSha: "test", capabilities: ["agent", "identity", "cloud"], authFlow: "redirect", sandbox: null }, fetchImpl: (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    return httpFetch(new URL(new URL(url, "http://app.test").pathname, server.url).href, init)
  } })
  const host = document.createElement("div")
  const mounted = createRoot(host)
  let operation: ReturnType<typeof controller.commands.run> | undefined
  try {
    await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "ada", admin: false, scopesPlain: null }).isPersisted.promise
    await store.dispatch({ type: "cloud.session.loaded", actor: "system", state: "signed-in", username: "ada", expiresAt: null, scopes: null }).isPersisted.promise
    await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [
      { id: "ada/repo", org: "ada", ownerKind: "user", name: "repo", head: null },
      { id: "will/flows", org: "will", ownerKind: "user", name: "flows", head: null }
    ] }).isPersisted.promise
    await store.dispatch({ type: "repo.selected", actor: "user", id: "will/flows" }).isPersisted.promise
    flushSync(() => mounted.render(<SecretsCardBody card={card} onRunCommand={(name, args) => { operation = controller.commands.run(name, args) }} />))
    host.querySelector<HTMLButtonElement>('button[aria-label="Bind OPEN"]')!.click()
    expect(await operation).toMatchObject({ status: "form", fields: ["hosts", "headers"] })
    expect(requests).toHaveLength(0)
    const form = [...store.collections.cards.values()].find(card => card.kind === "flow-form")
    if (!form || form.kind !== "flow-form") throw new Error("Bind form missing")
    expect(await controller.commands.run("form.set", `${form.id} hosts api.example.com, registry.example.com`)).toMatchObject({ status: "executed" })
    expect(await controller.commands.run("form.set", `${form.id} headers authorization, x-api-key`)).toMatchObject({ status: "executed" })
    const submitted = await controller.commands.run("form.submit", form.id)
    expect(submitted).toMatchObject({ status: "executed" })
    await waitFor(() => requests.length === 1)
    expect(requests).toEqual([{ path: "/api/repos/ada/repo/secrets/OPEN", body: { hosts: ["api.example.com", "registry.example.com"], match_headers: ["authorization", "x-api-key"] } }])
  } finally {
    flushSync(() => { mounted.unmount() })
    await controller.dispose()
    await store.dispose?.()
    await server.stop(true)
  }
})
