import { afterEach, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import * as Y from "yjs"
import { WorldCardBody } from "../../cards/ConversationCards"
import { ControllerContext } from "../../ControllerContext"
import { encodeWikiState, wikiDocumentId } from "../../wiki/CloudWiki"
import { createActorBindings } from "../ActorBindings"
import type { AppController } from "../AppController"
import type { Card, WorldDocument } from "../AppState"
import { createAppStore } from "../AppStore"
import { scopedControllers } from "../ControllerTestScope"
import { memoryStorage, silentAgent } from "../TestFixtures"
import { projectWikiCardRows } from "../WikiProjection"
import { createCloudWikiController } from "./cloud-wiki"
import { createControllerContext } from "./context"
import { createWorldController } from "./world"
const createAppController = scopedControllers()
const close: Array<() => void | Promise<void>> = []
afterEach(async () => {
  for (const done of close.splice(0)) await done()
})
const signIn = async (store: Awaited<ReturnType<typeof createAppStore>>, login = "will") => {
  await store.dispatch({
    type: "identity.session.loaded",
    actor: "system",
    state: "signed-in",
    login,
    admin: false,
    scopesPlain: null
  }).isPersisted.promise
}
const until = async (check: () => boolean) => {
  for (let i = 0; i < 100; i++) {
    if (check()) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error("Wiki did not settle")
}
const note = (space: "public" | "private", repo = "owner/repo", login = "will"): WorldDocument => ({
  id: wikiDocumentId(repo, space === "public" ? 1 : 2),
  path: `${repo}/wiki/${space}.md`,
  title: space === "public" ? "Runbook" : "SECRET TITLE",
  body: space === "public" ? "# Different heading" : "SECRET BODY",
  links: [],
  tags: [],
  sources: [],
  confidence: 1,
  revision: 1,
  updatedAt: 1,
  updatedBy: "user",
  cloud: {
    repo,
    pageId: space === "public" ? 1 : 2,
    slug: space,
    visibility: space,
    path: `${space}.md`,
    remoteRevision: 1,
    remoteAuthor: "will",
    remoteUpdatedAt: "now",
    state: "",
    accountLogin: login,
    branchId: "branch-main",
    phase: "cached",
    error: null,
    pending: []
  }
})
const cardFor = (doc: WorldDocument, space: "public" | "private" = "public"): Extract<Card, { kind: "world" }> => ({
  id: "index",
  kind: "world",
  title: "Wiki",
  createdAt: 1,
  ordinal: 1,
  status: "active",
  payload: {
    documents: [{ id: doc.id, path: doc.path, title: doc.title, confidence: 1 }],
    selectedDocumentId: doc.id,
    index: { repo: "owner/repo", space, page: 1, hasNext: false },
    view: "read"
  }
})

test("persisted public cards exclude private body and every private metadata field before any index loads", async () => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  await signIn(store)
  const ctx = createControllerContext(store, silentAgent, { fetchImpl: async () => Response.json({}) })
  close.push(() => ctx.dispose())
  const world = createWorldController(ctx, { nextOrdinal: store.nextOrdinal })
  const secret = note("private")
  await store.dispatch({ type: "world.document.upserted", actor: "user", document: secret, select: false }).isPersisted
    .promise
  const card = cardFor(secret)
  await store.dispatch({ type: "card.upsert", actor: "user", card }).isPersisted.promise
  expect(world.selectWikiCardDocument(card.id, secret.id)).toBe("This Wiki page is not in this card.")
  const projection = {
    store,
    wikiIndexes: { get: () => undefined, subscribe: () => () => {} }
  } as unknown as AppController
  for (const cached of [[secret], []]) {
    const html = renderToStaticMarkup(
      <ControllerContext.Provider value={projection}>
        <WorldCardBody card={card} worldDocuments={cached} onChangeWorldDocument={() => {}} onRunCommand={() => {}} />
      </ControllerContext.Provider>
    )
    for (const privateValue of ["SECRET TITLE", "SECRET BODY", secret.path, secret.id, "private.md"]) {
      expect(html).not.toContain(privateValue)
    }
  }
  expect(projectWikiCardRows(card, [], "will")).toEqual([])
  expect(projectWikiCardRows(cardFor(secret, "private"), [secret], null)).toEqual([])
  expect(projectWikiCardRows(cardFor(secret, "private"), [secret], "other")).toEqual([])
  expect(projectWikiCardRows(cardFor(note("public", "else/repo")), [note("public", "else/repo")], "will")).toEqual([])
  const publicDoc = note("public")
  const valid = cardFor(publicDoc)
  expect(projectWikiCardRows(valid, [publicDoc], "will")[0]?.document?.title).toBe("Runbook")
  await store.dispatch({ type: "world.document.upserted", actor: "user", document: publicDoc, select: false })
    .isPersisted.promise
  await store.dispatch({ type: "card.upsert", actor: "user", card: valid }).isPersisted.promise
  expect(world.selectWikiCardDocument(valid.id, publicDoc.id)).toBeUndefined()
})

test("public and private listings have separate durable cards and scoped cached entries", async () => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  await signIn(store)
  const ctx = createControllerContext(store, silentAgent, {
    fetchImpl: async (input) =>
      String(input).includes("/index?")
        ? Response.json({ pages: [], folders: [], tags: [] })
        : Response.json([{
          id: String(input).includes("visibility=private") ? 2 : 1,
          slug: "home",
          title: "Stored",
          revision: 1,
          author: { id: 1, login: "will" },
          created_at: "now",
          updated_at: "now"
        }])
  })
  close.push(() => ctx.dispose())
  ctx.withToast = async (_key, _title, _done, work) => work()
  const wiki = createCloudWikiController(ctx, store.nextOrdinal)
  await wiki.listCloudWiki("owner/repo", 1, "public")
  await wiki.listCloudWiki("owner/repo", 1, "private")
  for (const space of ["public", "private"] as const) {
    const card = store.collections.cards.get(`wiki-index-owner/repo-${space}`)
    expect(card?.kind).toBe("world")
    if (card?.kind !== "world") throw new Error("missing card")
    expect(card.payload.index?.space).toBe(space)
    expect(card.payload.documents[0]?.cloud).toMatchObject({ visibility: space, accountLogin: "will" })
    expect(projectWikiCardRows(card, [], "will")).toHaveLength(1)
    expect(projectWikiCardRows(card, [], "other")).toHaveLength(0)
  }
})

const index = (id: number) => ({
  pages: [{
    id,
    slug: "home",
    title: "Runbook",
    path: "Runbook.md",
    revision: 1,
    updated_at: "2026-09-01T00:00:00Z",
    created_at: "2026-09-01T00:00:00Z",
    author: { id: 1, login: "will" },
    metadata: { tags: [], aliases: [], headings: [], links: [] },
    backlinks: []
  }],
  folders: [],
  tags: []
})
const page = (id: number, space: string) => {
  const doc = new Y.Doc()
  doc.getText("markdown").insert(0, "# Different heading")
  return {
    page: {
      id,
      slug: "home",
      title: "Runbook",
      body: "# Different heading",
      visibility: space,
      revision: 1,
      author: { id: 1, login: "will" },
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z"
    },
    state: encodeWikiState(Y.encodeStateAsUpdate(doc)),
    state_vector: encodeWikiState(Y.encodeStateVector(doc))
  }
}
const pane = async (fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  await signIn(store)
  await store.dispatch({
    type: "repositories.loaded",
    actor: "system",
    repositories: ["a", "b"].map((name) => ({
      id: `owner/${name}`,
      org: "owner",
      ownerKind: "user" as const,
      name,
      head: null
    }))
  }).isPersisted.promise
  const controller = createAppController(store, silentAgent, { fetchImpl })
  await controller.selectRepo("owner/a")
  return { store, controller }
}

test.each(["new selection", "same-page reselect", "selection ABA", "uncached page open", "invalid selection", "agent embedded read", "explicit read superseded"] as const)("a real pending pane read respects %s ordering", async ordering => {
  const requested = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const requests: string[] = []
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const url = new URL(request.url)
    requests.push(url.pathname)
    if (url.pathname.endsWith("/navigation/index")) return Response.json(index(1))
    if (url.pathname.endsWith("/home/document")) {
      requested.resolve()
      await release.promise
      return Response.json(page(1, "public"))
    }
    if (url.pathname.endsWith("/start/document")) {
      const answer = page(2, "public")
      return Response.json({ ...answer, page: { ...answer.page, slug: "start", title: "Start" } })
    }
    return new Response(null, { status: 404 })
  } })
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  await signIn(store)
  await store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [
    { id: "owner/a", org: "owner", ownerKind: "user", name: "a", head: null }
  ] }).isPersisted.promise
  await store.dispatch({ type: "repo.selected", actor: "user", id: "owner/a" }).isPersisted.promise
  await store.dispatch({ type: "surface.changed", actor: "user", surface: "world" }).isPersisted.promise
  const start = { ...note("public", "owner/a"), id: wikiDocumentId("owner/a", 2), title: "Start", path: "Guides/Start.md",
    cloud: { ...note("public", "owner/a").cloud!, pageId: 2, slug: "start", path: "Guides/Start.md" } }
  if (ordering !== "uncached page open") await store.dispatch({ type: "world.document.upserted", actor: "system", document: start, select: ordering !== "new selection" }).isPersisted.promise
  const home = { ...note("public", "owner/a"), title: "Home" }
  await store.dispatch({ type: "world.document.upserted", actor: "system", document: home, select: false }).isPersisted.promise
  const ctx = createControllerContext(store, silentAgent, {
    fetchImpl: (input, init) => fetch(new URL(String(input), server.url), init)
  })
  ctx.withToast = async (_key, _title, _done, work) => work()
  const actors = createActorBindings(ctx.onDispose)
  const wiki = actors.pair(ctx, context => createCloudWikiController(context, store.nextOrdinal))
  const world = createWorldController(ctx, { nextOrdinal: store.nextOrdinal, cloudWiki: wiki })
  let reading: Promise<unknown> | undefined
  try {
    reading = ordering === "explicit read superseded" ? wiki.openCloudWiki("owner/a", "home", 1, "public") : wiki.readWikiForPane()
    await requested.promise
    expect(requests).toEqual(ordering === "explicit read superseded" ? ["/api/repos/owner/a/wiki/home/document"] : ["/api/repos/owner/a/wiki/navigation/index", "/api/repos/owner/a/wiki/home/document"])
    if (ordering === "selection ABA") expect(world.selectWorldDocument(home.id)).toBeUndefined()
    if (ordering === "uncached page open") {
      expect(store.collections.worldDocuments.has(start.id)).toBe(false)
      await wiki.openCloudWiki("owner/a", "start", 2, "public")
    } else if (ordering === "invalid selection") {
      expect(world.selectWorldDocument("missing")).toBe("There is no Wiki note with id missing.")
    } else if (ordering === "agent embedded read") {
      await actors.select(wiki).openCloudWiki("owner/a", "start", 2, "public")
      expect(store.collections.cards.get(`wiki-open-${start.id}`)?.kind).toBe("world")
    } else expect(world.selectWorldDocument(start.id)).toBeUndefined()
    expect(store.session().selectedWorldDocumentId).toBe(start.id)
    release.resolve()
    await reading
    expect(store.session().selectedWorldDocumentId).toBe(ordering === "invalid selection" || ordering === "agent embedded read" ? home.id : start.id)
    expect(store.collections.worldDocuments.get(start.id)?.body).toBe(ordering === "uncached page open" || ordering === "agent embedded read" ? "# Different heading" : start.body)
    expect(requests.filter(path => path.endsWith("/start/document"))).toHaveLength(ordering === "uncached page open" || ordering === "agent embedded read" ? 1 : 0)
  } finally {
    release.resolve()
    await reading?.catch(() => {})
    await ctx.dispose()
    await store.dispose?.()
    await server.stop(true)
  }
})

test("pane opening with an existing repository opens the first page, preserves stored titles and selected space", async () => {
  const { store, controller } = await pane(async (input) => {
    const url = String(input)
    if (url.includes("/index?")) return Response.json(index(1))
    if (url.includes("/document?")) return Response.json(page(1, "private"))
    return new Response("{}", { status: 404 })
  })
  await controller.setWikiSpace("private")
  controller.showWikiPane()
  await until(() => store.session().selectedWorldDocumentId === wikiDocumentId("owner/a", 1))
  expect(store.session().wikiSpace).toBe("private")
  expect(store.collections.worldDocuments.get(wikiDocumentId("owner/a", 1))?.title).toBe("Runbook")
})

test("a page response from the previous repository cannot replace a newer pane selection", async () => {
  const held = Promise.withResolvers<Response>()
  let requested = false
  const { store, controller } = await pane(async (input) => {
    const url = String(input)
    if (url.includes("/index?")) return Response.json(index(url.includes("owner/a") ? 1 : 2))
    if (url.includes("/document?")) {
      if (url.includes("owner/a")) {
        requested = true
        return held.promise
      }
      return Response.json(page(2, "public"))
    }
    return new Response("{}", { status: 404 })
  })
  controller.showWikiPane()
  await until(() => requested)
  await controller.selectRepo("owner/b")
  await until(() => store.session().selectedWorldDocumentId === wikiDocumentId("owner/b", 2))
  held.resolve(Response.json(page(1, "public")))
  await new Promise((r) => setTimeout(r, 50))
  expect(store.session().selectedWorldDocumentId).toBe(wikiDocumentId("owner/b", 2))
  expect(store.collections.worldDocuments.has(wikiDocumentId("owner/a", 1))).toBe(false)
})

test("an explicit same-space choice while an index is pending supersedes the old pane invocation", async () => {
  const held = Promise.withResolvers<Response>()
  let reads = 0
  const { store, controller } = await pane(async (input) => {
    const url = String(input)
    if (url.includes("/index?")) {
      reads++
      return reads === 1 ? held.promise : Response.json({ pages: [], folders: [], tags: [] })
    }
    if (url.includes("/document?")) throw new Error("obsolete page was requested")
    return new Response("{}", { status: 404 })
  })
  controller.showWikiPane()
  await until(() => reads === 1)
  await controller.setWikiSpace("public")
  await until(() => reads === 2)
  held.resolve(Response.json(index(1)))
  await new Promise((r) => setTimeout(r, 50))
  expect(store.session().wikiSpace ?? "public").toBe("public")
  expect(store.session().selectedWorldDocumentId ?? null).toBeNull()
})

for (const title of ["Runbook", "SKILL.md", "public"]) {
  test(`stored title ${title} is preserved despite a different body heading`, () => {
    const document = {
      ...note("public"),
      title,
      body: "---\ntitle: >-\n  Different YAML title\n---\n# Different heading"
    }
    expect(projectWikiCardRows(cardFor(document), [document], "will")[0]?.document?.title).toBe(title)
  })
}
for (const next of ["signed-out", "other"] as const) {
  test(`a pending pane page cannot restore cloud content after ${next}`, async () => {
    const held = Promise.withResolvers<Response>()
    let requested = false
    const { store, controller } = await pane(async (input) => {
      const url = String(input)
      if (url.includes("/index?")) return Response.json(index(1))
      if (url.includes("/document?")) {
        requested = true
        return held.promise
      }
      return new Response("{}", { status: 404 })
    })
    controller.showWikiPane()
    await until(() => requested)
    if (next === "other") await signIn(store, "other")
    else {await store.dispatch({
        type: "identity.session.loaded",
        actor: "system",
        state: "signed-out",
        login: null,
        admin: false,
        scopesPlain: null
      }).isPersisted.promise}
    held.resolve(Response.json(page(1, "public")))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(store.collections.worldDocuments.has(wikiDocumentId("owner/a", 1))).toBe(false)
    expect(store.session().selectedWorldDocumentId ?? null).toBeNull()
  })
}

test("entering the pane opens an initial attachment from its scoped index without requesting a Markdown document", async () => {
  let documentReads = 0
  const { store, controller } = await pane(async (input) => {
    const url = String(input)
    if (url.includes("/index?")) {
      const answer = index(1)
      return Response.json({
        ...answer,
        pages: answer.pages.map((row) => ({
          ...row,
          attachment: { digest: "a".repeat(64), media_type: "image/png", size: 3 }
        }))
      })
    }
    if (url.includes("/document?")) documentReads++
    return new Response("{}", { status: 404 })
  })
  controller.showWikiPane()
  await until(() => store.session().selectedWorldDocumentId === wikiDocumentId("owner/a", 1))
  expect(documentReads).toBe(0)
  expect(controller.wikiIndexes.get("owner/a", "public")?.pages[0]?.attachment?.mediaType).toBe("image/png")
})
