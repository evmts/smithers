import { expect, test } from "bun:test"
import { createAppStore } from "../AppStore"
import { memoryStorage, waitFor } from "../TestFixtures"
import { createRepositorySiteSeam } from "./RepositorySiteSeam"
import type { SeamFetch } from "./SeamContext"

const boot = async (http: SeamFetch, storage = memoryStorage()) => {
  const store = await createAppStore({ kind: "localStorage", storage })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "owner", admin: false, scopesPlain: null }).isPersisted.promise
  const settled: string[] = []
  const seam = createRepositorySiteSeam({ store, dispatch: store.dispatch, http, baseUrl: "", actor: () => "user", nextOrdinal: () => store.nextOrdinal() },
    async (id, _title, _done, work) => { const result = await work(); settled.push(id); return result })
  return { store, storage, seam, settled }
}

test("site requests persist before acknowledgment, join duplicates and settle only after HTTP completion", async () => {
  let release!: (value: Response) => void
  const writes: string[] = []
  const h = await boot(async (path, init) => {
    expect(path).toBe("/api/repos/owner/docs/site")
    expect(JSON.parse(String(init?.body))).toEqual({ action: "domain.add", domain: "docs.example.test" })
    writes.push(new Headers(init?.headers).get("Idempotency-Key")!)
    return new Promise(resolve => { release = resolve })
  })
  try {
    const input = { action: "domain.add", domain: "docs.example.test" }
    expect(await Promise.all([h.seam.request("owner/docs", input), h.seam.request("owner/docs", input)])).toEqual([{ value: "Requested" }, { value: "Requested" }])
    expect(h.store.session().repositorySiteRequests).toHaveLength(1)
    expect(h.store.session().repositorySiteRequests![0]!.state).toBe("requested")
    expect(writes).toHaveLength(1)
    expect(h.settled).toHaveLength(0)
    await h.store.dispatch({ type: "message.appended", actor: "user", text: "Chat remains usable" }).isPersisted.promise
    release(Response.json({ hostname: "docs.example.test", verified: false, bound: false, records: [{ type: "TXT", name: "_smithers.docs.example.test", value: "ownership-proof" }] }))
    await waitFor(() => h.store.session().repositorySiteRequests?.[0]?.state === "completed" && h.settled.length === 1)
    expect([...h.store.collections.messages.values()].some(row => row.text.includes("ownership-proof"))).toBe(true)
    expect([...h.store.collections.messages.values()].some(row => row.text === "Chat remains usable")).toBe(true)
  } finally { h.seam.dispose() }
})

test("reload retries the persisted request with its original key, and an HTTP failure stays retryable", async () => {
  const first = await boot(async () => new Promise<Response>(() => {}))
  await first.seam.request("owner/docs", { action: "enable" })
  const id = first.store.session().repositorySiteRequests![0]!.id
  first.seam.dispose()
  const keys: string[] = []
  let fail = true
  const second = await boot(async (_path, init) => {
    keys.push(new Headers(init?.headers).get("Idempotency-Key")!)
    return fail ? Response.json({ code: "site_name_unavailable", message: "Name unavailable" }, { status: 409 }) : Response.json({ enabled: true, url: "https://docs.smithers.sh" })
  }, first.storage)
  try {
    second.seam.resume()
    await waitFor(() => second.store.session().repositorySiteRequests?.[0]?.state === "failed")
    expect(keys).toEqual([id])
    fail = false
    await second.seam.request("owner/docs", { action: "enable" })
    await waitFor(() => second.store.session().repositorySiteRequests?.some(row => row.state === "completed") === true)
    expect(keys).toHaveLength(2)
    expect(keys[1]).not.toBe(id)
  } finally { second.seam.dispose() }
})

test("an account change discards the previous owner's response", async () => {
  let release!: (value: Response) => void
  const h = await boot(async () => new Promise(resolve => { release = resolve }))
  try {
    await h.seam.request("owner/docs", { action: "status" })
    await h.store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "different", admin: false, scopesPlain: null }).isPersisted.promise
    release(Response.json({ enabled: true, url: "https://private-result.example" }))
    await waitFor(() => h.settled.length === 1)
    expect([...h.store.collections.messages.values()].some(row => row.text.includes("private-result"))).toBe(false)
  } finally { h.seam.dispose() }
})
