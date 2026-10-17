import { expect, test } from "bun:test"
import type { RepositoryHome } from "@smthrs/rpc/RepositoryHome"
import { createAppStore } from "../AppStore"
import type { AppStore } from "../AppStore"
import { createControllerContext } from "../controller/context"
import { json, memoryStorage, settled, unavailableAgent, waitFor } from "../TestFixtures"
import { createRepositoryFlowsSeam } from "./RepositoryFlowsSeam"

const repo = "alice/private"
const identity = (store: AppStore, login: string | null) => store.dispatch({
  type: "identity.session.loaded", actor: "system", state: login === null ? "signed-out" : "signed-in",
  login, admin: false, scopesPlain: null
}).isPersisted.promise
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
const home = (text: string): RepositoryHome => ({ kind: "blocks", blocks: [{ type: "text", text }] })

const harness = async (login: string | null = "alice") => {
  const storage = memoryStorage()
  const store = await createAppStore({ kind: "localStorage", storage })
  await identity(store, login)
  const reads: Array<ReturnType<typeof deferred<Response>>> = []
  const context = createControllerContext(store, unavailableAgent, { fetchImpl: async input => {
    if (String(input).endsWith("/home")) {
      const response = deferred<Response>()
      reads.push(response)
      return response.promise
    }
    return json(404, {})
  } })
  const published: unknown[] = []
  const seam = createRepositoryFlowsSeam({
    store, baseUrl: "https://app.test", http: context.boundedFetch, dispatch: store.dispatch,
    actor: () => "user", nextOrdinal: store.nextOrdinal, isDisposed: () => context.disposed
  }, (_, value) => { published.push(value) })
  seam.subscribe(context.onDispose)
  return { store, storage, reads, published, seam, context, dispose: async () => {
    for (const read of reads) read.resolve(json(404, {}))
    await context.dispose()
    await settled()
    await store.dispose?.()
  } }
}

for (const change of ["sign-out", "replacement", "returning-owner"] as const) {
  test(`a pending private homepage cannot repopulate the store after ${change}`, async () => {
    const t = await harness()
    try {
      const pending = t.seam.load(repo)
      await waitFor(() => t.reads.length === 1)
      await identity(t.store, change === "replacement" ? "bob" : null)
      if (change === "returning-owner") await identity(t.store, "alice")
      t.reads[0]!.resolve(json(200, home("ALICE_PRIVATE_HOMEPAGE")))
      await pending
      expect(t.store.collections.repositoryFlows.has(repo)).toBe(false)
      expect(t.published).toEqual([])
      await t.store.dispose?.()
      const reopened = await createAppStore({ kind: "localStorage", storage: t.storage })
      try { expect(reopened.collections.repositoryFlows.has(repo)).toBe(false) }
      finally { await reopened.dispose?.() }
    } finally { await t.dispose() }
  })
}

test("a same-owner identity refresh keeps a pending homepage current", async () => {
  const t = await harness()
  try {
    const pending = t.seam.load(repo)
    await waitFor(() => t.reads.length === 1)
    await identity(t.store, "alice")
    t.reads[0]!.resolve(json(200, home("Current homepage")))
    await pending
    expect(t.store.collections.repositoryFlows.get(repo)?.home).toEqual(home("Current homepage"))
    expect(t.published).toEqual([home("Current homepage")])
  } finally { await t.dispose() }
})

test("a superseded homepage read cannot replace the newer read", async () => {
  const t = await harness()
  try {
    const older = t.seam.load(repo)
    await waitFor(() => t.reads.length === 1)
    const newer = t.seam.load(repo)
    await waitFor(() => t.reads.length === 2)
    t.reads[1]!.resolve(json(200, home("New homepage")))
    await newer
    t.reads[0]!.resolve(json(200, home("Old homepage")))
    await older
    expect(t.store.collections.repositoryFlows.get(repo)?.home).toEqual(home("New homepage"))
    expect(t.published).toEqual([home("New homepage")])
  } finally { await t.dispose() }
})

test("reading another repository does not retire the first repository's result", async () => {
  const t = await harness()
  try {
    const first = t.seam.load(repo)
    await waitFor(() => t.reads.length === 1)
    const second = t.seam.load("alice/other")
    await waitFor(() => t.reads.length === 2)
    t.reads[1]!.resolve(json(200, home("Other repository")))
    await second
    t.reads[0]!.resolve(json(200, home("First repository")))
    await first
    expect(t.store.collections.repositoryFlows.get(repo)?.home).toEqual(home("First repository"))
    expect(t.store.collections.repositoryFlows.get("alice/other")?.home).toEqual(home("Other repository"))
  } finally { await t.dispose() }
})

test("sign-in rereads a homepage that was inaccessible to the anonymous visitor", async () => {
  const t = await harness(null)
  try {
    await t.store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [
      { id: repo, org: "alice", name: "private", ownerKind: "user", head: null }
    ] }).isPersisted.promise
    await waitFor(() => t.reads.length === 1)
    t.reads[0]!.resolve(json(404, {}))
    await waitFor(() => t.store.collections.repositoryFlows.has(repo))
    expect(t.store.collections.repositoryFlows.get(repo)?.home).toEqual({ kind: "none" })
    await identity(t.store, "alice")
    await waitFor(() => t.reads.length === 2)
    t.reads[1]!.resolve(json(200, home("Authenticated homepage")))
    await waitFor(() => JSON.stringify(t.store.collections.repositoryFlows.get(repo)?.home)?.includes("Authenticated homepage") === true)
    await identity(t.store, "alice")
    await settled()
    expect(t.reads).toHaveLength(2)
  } finally { await t.dispose() }
})

test("disposing a controller retires its pending homepage", async () => {
  const t = await harness()
  try {
    const pending = t.seam.load(repo)
    await waitFor(() => t.reads.length === 1)
    await t.context.dispose()
    t.reads[0]!.resolve(json(200, home("Retired homepage")))
    await pending
    expect(t.store.collections.repositoryFlows.has(repo)).toBe(false)
    expect(t.published).toEqual([])
  } finally { await t.dispose() }
})

/* #4025: a repository names the flow that owns its default view, and the seam draws that flow's declared view. */
const flowRow = (id: string, view?: unknown) => ({
  id, description: `${id} flow`, summary: null, featured: false, kind: "ts", path: `flows/${id}/flow.ts`,
  capabilities: [], model: null, modelInvocable: false, ...(view === undefined ? {} : { view })
})
const loadWithFlowView = async (factory: Response, declared: RepositoryHome) => {
  const storage = memoryStorage()
  const store = await createAppStore({ kind: "localStorage", storage })
  await identity(store, "alice")
  const context = createControllerContext(store, unavailableAgent, { fetchImpl: async input => {
    const path = String(input)
    if (path.endsWith("/home")) return json(200, declared)
    if (path.endsWith("/contents/.smithers/factory.json")) return factory
    return json(404, {})
  } })
  const seam = createRepositoryFlowsSeam({
    store, baseUrl: "https://app.test", http: context.boundedFetch, dispatch: store.dispatch,
    actor: () => "user", nextOrdinal: store.nextOrdinal, isDisposed: () => context.disposed
  })
  await seam.load(repo)
  const home = store.collections.repositoryFlows.get(repo)?.home
  await context.dispose()
  await settled()
  await store.dispose?.()
  return home
}
const projection = (...flows: unknown[]) => json(200, { content: JSON.stringify({ on: [], flows }) })
const namesTriage: RepositoryHome = { kind: "blocks", blocks: [{ type: "text", text: "Above" }, { type: "view", flow: "triage" }] }

test("a home view block draws the named flow's declared view in its place", async () => {
  const view = [{ type: "text", text: "Oldest issues first" }, { type: "app", flow: "triage", title: "Triage", picture: "issue" }] as const
  expect(await loadWithFlowView(projection(flowRow("triage", view)), namesTriage))
    .toEqual({ kind: "blocks", blocks: [{ type: "text", text: "Above" }, ...view] })
})

test.each([
  ["a flow the catalog lacks", () => projection(flowRow("lint")), "The triage view is unavailable: this repository has no flow triage"],
  ["a flow that declares no view", () => projection(flowRow("triage")), "The triage view is unavailable: triage declares no view"],
  ["a view this build cannot draw", () => projection(flowRow("triage", [{ type: "markdown", path: "README.md" }])), "The triage view is invalid"],
  ["an unreadable catalog", () => json(500, {}), "The triage view is unavailable: the flow catalog could not be read"]
] as const)("a view block naming %s fails the homepage with a sentence naming the flow", async (_, factory, message) => {
  expect(await loadWithFlowView(factory(), namesTriage)).toEqual({ kind: "error", message })
})
