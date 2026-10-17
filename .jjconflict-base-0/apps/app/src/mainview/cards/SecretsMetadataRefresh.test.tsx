/*
 * Secret metadata stays truthful after a mutation and after a reload.
 *
 * Production, 2026-10-16: a hosted repository's owner gave a main-only secret
 * to all branches. The platform stored it (the native metadata GET answered
 * main_only=false), yet the card kept saying "main only" and kept offering
 * "all branches" — through the confirmation, through the wait and through a
 * reload. The scope write never re-read the metadata it had just changed, and
 * a retained card revalidated nothing on the way back up.
 *
 * The rule these pin: rows change only from an authoritative metadata read,
 * one card per repository is the target of that read, a read that failed says
 * so and offers Retry instead of publishing stale rows as current or an empty
 * list nobody read, and a late answer from a retired account publishes
 * nothing.
 */
import { act } from "react"
import { expect, test } from "bun:test"
import { createRoot } from "./views/testDom"
import { ControllerTestProvider } from "../ControllerContext"
import { secretsCardFamily } from "./SecretsCard"
import { createAppController, type AppController, type AppServices } from "../state/AppController"
import { createAppStore, type AppStore } from "../state/AppStore"
import { json, memoryStorage } from "../state/TestFixtures"
import type { AgentPort } from "../runtime/AgentPort"
import type { StorageApi } from "@tanstack/db"

const unavailableAgent: AgentPort = {
  available: false,
  startTurn: async () => ({ status: "error", message: "unavailable" }),
  cancelTurn: async () => {},
  subscribe: () => () => {}
}

const REPO = "will/flows"
type Stored = { name: string; main_only: boolean; hosts: string[]; match_headers: string[]; updated_at: string }

/* The platform: one repository, one secret's stored METADATA, no value on the wire. */
const platform = () => {
  const stored: Stored = { name: "NPM_TOKEN", main_only: true, hosts: ["registry.npmjs.org"],
    match_headers: ["authorization"], updated_at: "2026-10-16T09:58:00.000Z" }
  const reads: string[] = []
  const writes: Array<{ readonly method: string; readonly url: string; readonly body: unknown }> = []
  const control: { readStatus: number; stored: Stored; reads: string[]; writes: typeof writes } =
    { readStatus: 200, stored, reads, writes }
  const services: AppServices = {
    bootstrap: { apiVersion: 1, host: "cloud", version: "test", buildSha: "test",
      capabilities: ["identity", "cloud"], authFlow: "credentials", sandbox: null },
    fetchImpl: async (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      const method = init?.method ?? "GET"
      if (url === `/api/repos/${REPO}`) return json(200, { permission: "owner" })
      if (url === `/api/repos/${REPO}/secrets` && method === "GET") {
        reads.push(url)
        if (control.readStatus !== 200) return json(control.readStatus, { message: "the platform fell over" })
        return json(200, [{ ...stored }])
      }
      /* A replacement carries a value and keeps the stored scope; the answer is metadata. */
      if (url === `/api/repos/${REPO}/secrets` && method === "POST") {
        const body = JSON.parse(String(init?.body)) as { name: string; main_only?: boolean }
        writes.push({ method, url, body: { name: body.name } })
        if (typeof body.main_only === "boolean") stored.main_only = body.main_only
        stored.updated_at = "2026-10-16T10:01:00.000Z"
        return json(200, { ...stored })
      }
      if (url === `/api/repos/${REPO}/secrets/${stored.name}` && method === "PATCH") {
        const body = JSON.parse(String(init?.body)) as { main_only?: boolean; hosts?: string[]; match_headers?: string[] }
        writes.push({ method, url, body })
        if (typeof body.main_only === "boolean") stored.main_only = body.main_only
        if (body.hosts) { stored.hosts = body.hosts; stored.match_headers = body.match_headers ?? [] }
        stored.updated_at = "2026-10-16T09:59:07.000Z"
        return json(200, { ...stored })
      }
      return json(404, { message: `no stub for ${method} ${url}` })
    }
  }
  return Object.assign(control, { services })
}

const signedIn = async (store: AppStore, login = "will"): Promise<void> => {
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login, admin: false, scopesPlain: null }).isPersisted.promise
}
const ready = async (store: AppStore): Promise<void> => {
  await signedIn(store)
  await store.dispatch({ type: "repositories.loaded", actor: "system",
    repositories: [{ id: REPO, org: "will", ownerKind: "user", name: "flows", head: null }] }).isPersisted.promise
}
/* Let the reads and the renders they cause finish, the way the browser does. */
const settle = async (times = 6): Promise<void> => {
  await act(async () => { for (let i = 0; i < times; i++) await new Promise(resolve => setTimeout(resolve, 1)) })
}
/* The card's own door: the row control carries the repository it names. */
const scopeTo = (controller: AppController, scope: "all_branches" | "main_only") =>
  controller.commands.submit({ name: "secrets", actor: "user", payload: { operation: "scope", name: "NPM_TOKEN", scope, repo: REPO } })

const secretsCard = (store: AppStore, repo = REPO) => {
  const card = store.collections.cards.get(`secrets-${repo}`)
  return card?.kind === "secrets" ? card : undefined
}
const open = async (storage: StorageApi, services: AppServices) => {
  const store = await createAppStore({ kind: "localStorage", storage })
  return { store, controller: createAppController(store, unavailableAgent, services) }
}
/** Mount the real card family over the real controller, as the transcript does. */
const mount = (controller: AppController, store: AppStore) => {
  const host = document.createElement("div")
  const root = createRoot(host)
  const draw = () => act(() => { root.render(<ControllerTestProvider controller={controller}>
    {secretsCardFamily.secrets.render(secretsCard(store)!, { onAction: () => {}, onView: () => {}, gestures: {} } as never)}
  </ControllerTestProvider>) })
  draw()
  return {
    text: () => host.textContent ?? "",
    html: () => host.innerHTML,
    /** The scope each row publishes as current. */
    scopes: () => [...host.querySelectorAll(".secret-scope")].map(node => node.textContent),
    /** Every control the card offers, row controls included. */
    labels: () => [...host.querySelectorAll("button")].map(node => node.textContent),
    draw,
    close: () => act(() => root.unmount())
  }
}

test("a scope change re-reads the stored metadata into the open card", async () => {
  const net = platform()
  const { store, controller } = await open(memoryStorage(), net.services)
  try {
    await ready(store)
    expect(await controller.commands.run("secrets")).toMatchObject({ status: "executed" })
    expect(secretsCard(store)?.payload.secrets).toEqual([{ name: "NPM_TOKEN", mainOnly: true,
      hosts: ["registry.npmjs.org"], matchHeaders: ["authorization"], updatedAt: "2026-10-16T09:58:00.000Z" }])
    const ordinal = secretsCard(store)!.ordinal

    const changed = await scopeTo(controller, "all_branches")
    expect(changed).toMatchObject({ status: "executed", value: "NPM_TOKEN: all branches" })
    await settle()
    expect(net.stored.main_only).toBe(false)
    // The card is the one the read must land on: same id, same place in the transcript.
    expect([...store.collections.cards.values()].filter(card => card.kind === "secrets")).toHaveLength(1)
    expect(secretsCard(store)?.ordinal).toBe(ordinal)
    expect(secretsCard(store)?.payload.secrets).toEqual([{ name: "NPM_TOKEN", mainOnly: false,
      hosts: ["registry.npmjs.org"], matchHeaders: ["authorization"], updatedAt: "2026-10-16T09:59:07.000Z" }])
    expect(net.reads).toHaveLength(2)

    // What the person saw: the row still said main only and still offered the change it had made.
    const view = mount(controller, store)
    try {
      await settle()
      view.draw()
      expect(view.scopes()).toEqual(["all branches"])
      expect(view.labels()).toContain("main only")
      expect(view.labels()).not.toContain("all branches")
    } finally { view.close() }
  } finally { await controller.dispose() }
})

test("a re-listed card keeps one identity, and the refresh lands on it", async () => {
  /*
   * /secrets re-surfaces the one card at the end of the transcript rather
   * than opening a second one, so the write's re-read has exactly one target:
   * `secrets-<repo>`, wherever that card now sits.
   */
  const net = platform()
  const { store, controller } = await open(memoryStorage(), net.services)
  try {
    await ready(store)
    await controller.commands.run("secrets")
    const first = secretsCard(store)!
    await controller.commands.run("secrets")
    const relisted = secretsCard(store)!
    expect(relisted.id).toBe(first.id)
    expect(relisted.ordinal).toBeGreaterThan(first.ordinal)
    expect([...store.collections.cards.values()].filter(card => card.kind === "secrets")).toHaveLength(1)
    await scopeTo(controller, "all_branches")
    await settle()
    expect(secretsCard(store)?.ordinal).toBe(relisted.ordinal)
    expect(secretsCard(store)?.payload.secrets[0]?.mainOnly).toBe(false)
  } finally { await controller.dispose() }
})

test("a binding change re-reads the stored hosts", async () => {
  const net = platform()
  const { store, controller } = await open(memoryStorage(), net.services)
  try {
    await ready(store)
    await controller.commands.run("secrets")
    expect(await controller.commands.submit({ name: "secrets", actor: "user", payload: { operation: "bind",
      name: "NPM_TOKEN", hosts: "npm.example.test", headers: "authorization", repo: REPO } }))
      .toMatchObject({ status: "executed", value: "NPM_TOKEN: npm.example.test" })
    await settle()
    expect(secretsCard(store)?.payload.secrets[0]?.hosts).toEqual(["npm.example.test"])
    expect(net.reads).toHaveLength(2)
  } finally { await controller.dispose() }
})

test("Replace keeps the stored scope on the card", async () => {
  const net = platform()
  const { store, controller } = await open(memoryStorage(), net.services)
  try {
    await ready(store)
    await controller.commands.run("secrets")
    net.stored.main_only = false
    const { writeOnlyGesture } = await import("../flows/CommandGesture")
    expect(await controller.commands.submit({ name: "secrets", actor: "user",
      payload: { operation: "set", name: "NPM_TOKEN", repo: REPO },
      gesture: writeOnlyGesture("secrets", { value: "PRIVATE_REPLACEMENT_BYTES" }) }))
      .toMatchObject({ status: "executed" })
    await settle(10)
    expect(secretsCard(store)?.payload.secrets[0]?.mainOnly).toBe(false)
    expect(JSON.stringify([...store.collections.cards.values()])).not.toContain("PRIVATE_REPLACEMENT_BYTES")
  } finally { await controller.dispose() }
})

test("a retained card revalidates its metadata when it comes back up", async () => {
  const storage = memoryStorage()
  const net = platform()
  const first = await open(storage, net.services)
  await ready(first.store)
  expect(await first.controller.commands.run("secrets")).toMatchObject({ status: "executed" })
  expect(secretsCard(first.store)?.payload.secrets[0]?.mainOnly).toBe(true)
  await first.controller.dispose()
  await first.store.dispose?.()

  // The scope changed while this card was persisted; the reload must not republish the old mark.
  net.stored.main_only = false
  net.stored.updated_at = "2026-10-16T09:59:07.000Z"
  net.reads.length = 0
  const { store, controller } = await open(storage, net.services)
  try {
    expect(secretsCard(store)?.payload.secrets[0]?.mainOnly).toBe(true)
    const view = mount(controller, store)
    try {
      await settle(10)
      expect(net.reads).toEqual([`/api/repos/${REPO}/secrets`])
      expect(secretsCard(store)?.payload.secrets[0]).toMatchObject({ mainOnly: false, updatedAt: "2026-10-16T09:59:07.000Z" })
      view.draw()
      expect(view.scopes()).toEqual(["all branches"])
      expect(view.labels()).toContain("main only")
    } finally { view.close() }
  } finally { await controller.dispose() }
})

test("a failed revalidation says so and offers Retry, never stale rows as current and never a false empty", async () => {
  const storage = memoryStorage()
  const net = platform()
  const first = await open(storage, net.services)
  await ready(first.store)
  await first.controller.commands.run("secrets")
  await first.controller.dispose()
  await first.store.dispose?.()

  net.readStatus = 503
  const { store, controller } = await open(storage, net.services)
  try {
    const view = mount(controller, store)
    try {
      await settle(10)
      view.draw()
      // The rows it holds are the last ones anybody read, and the card says so.
      expect(secretsCard(store)?.payload.secrets).toHaveLength(1)
      expect(view.text()).toContain("NPM_TOKEN")
      expect(view.text()).toContain("Secrets couldn't be re-read.")
      expect(view.text()).toContain("Retry")
      expect(view.text()).not.toContain("No secrets")
      expect(view.text()).not.toContain("the platform fell over")
      const { lintText } = await import("./productWords")
      expect(lintText("Secrets couldn't be re-read.")).toEqual([])

      // Retry reads again through the same door, and a read that answers settles the card.
      net.readStatus = 200
      net.stored.main_only = false
      let retried: unknown
      await act(async () => { retried = await controller.commands.run("secrets") })
      expect(retried).toMatchObject({ status: "executed" })
      await settle()
      view.draw()
      expect(secretsCard(store)?.payload.secrets[0]?.mainOnly).toBe(false)
      expect(view.text()).not.toContain("Secrets couldn't be re-read.")
    } finally { view.close() }
  } finally { await controller.dispose() }
})

test("a metadata answer that lands after the account changed publishes nothing", async () => {
  const net = platform()
  const held = Promise.withResolvers<Response>()
  let holding = false
  const services: AppServices = { ...net.services, fetchImpl: async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    if (holding && url === `/api/repos/${REPO}/secrets` && (init?.method ?? "GET") === "GET") { net.reads.push(url); return held.promise }
    return net.services.fetchImpl!(input, init)
  } }
  const { store, controller } = await open(memoryStorage(), services)
  try {
    await ready(store)
    await controller.commands.run("secrets")
    holding = true
    await scopeTo(controller, "all_branches")
    await signedIn(store, "ada")
    held.resolve(json(200, [{ name: "RETIRED_SECRET", main_only: false, hosts: [], match_headers: [], updated_at: null }]))
    await settle(10)
    // The revalidation ran and answered; the answer belonged to the account that asked for it.
    expect(net.reads).toHaveLength(2)
    expect(secretsCard(store)).toBeUndefined()
    const evidence = JSON.stringify({ cards: [...store.collections.cards.values()],
      messages: [...store.collections.messages.values()], journal: (await store.eventHistory()).events })
    expect(evidence).not.toContain("RETIRED_SECRET")
  } finally { await controller.dispose() }
})

test("a slow read answering after a newer one never replaces the newer rows", async () => {
  const net = platform()
  const held = Promise.withResolvers<Response>()
  let holding = false
  const services: AppServices = { ...net.services, fetchImpl: async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    if (holding && url === `/api/repos/${REPO}/secrets` && (init?.method ?? "GET") === "GET") {
      holding = false
      net.reads.push(url)
      return held.promise
    }
    return net.services.fetchImpl!(input, init)
  } }
  const { store, controller } = await open(memoryStorage(), services)
  try {
    await ready(store)
    await controller.commands.run("secrets")
    // The scope change's revalidation is still out when the person lists again.
    holding = true
    await scopeTo(controller, "all_branches")
    expect(await controller.commands.run("secrets")).toMatchObject({ status: "executed" })
    expect(secretsCard(store)?.payload.secrets[0]?.mainOnly).toBe(false)
    held.resolve(json(200, [{ ...net.stored, main_only: true, updated_at: "2026-10-16T09:58:00.000Z" }]))
    await settle(10)
    expect(secretsCard(store)?.payload.secrets[0]).toMatchObject({ mainOnly: false, updatedAt: "2026-10-16T09:59:07.000Z" })
    expect(controller.secretsMetadata?.state(REPO)).toBe("fresh")
  } finally { await controller.dispose() }
})

test("the value field stays masked and never offers a stored credential", async () => {
  /*
   * Arc offered to save a password after a Replace. The field is the one
   * write-only gesture the product has: masked, never prefilled, and marked
   * so no credential manager fills it. Whether a browser still offers to save
   * what was typed is that browser's heuristic, not something this markup
   * decides.
   */
  const net = platform()
  const { store, controller } = await open(memoryStorage(), net.services)
  try {
    await ready(store)
    await controller.commands.run("secrets")
    const view = mount(controller, store)
    try {
      await settle()
      view.draw()
      expect(view.html()).toContain('type="password"')
      expect(view.html()).toContain('autocomplete="new-password"')
      expect(view.html()).not.toContain('autocomplete="current-password"')
      expect(view.html()).not.toContain('type="email"')
      expect(view.html()).not.toContain("username")
    } finally { view.close() }
  } finally { await controller.dispose() }
})
