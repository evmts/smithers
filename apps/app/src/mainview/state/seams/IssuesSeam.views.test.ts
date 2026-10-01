import type { AppBootstrap } from "@smthrs/rpc/AppBootstrap"
import type { StorageApi } from "@tanstack/db"
import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { createElement } from "react"

import type { AgentPort } from "../../runtime/AgentPort"
import { createAppController } from "../AppController"
import type { AppServices } from "../AppController"
import type { Card } from "../AppState"
import { createAppStore } from "../AppStore"
import { applicationIdentityFromFetch } from "../TestFixtures"
import { flowArgs } from "../../flows/FlowArgs"
import { payloadFor } from "../../flows/SlashPayload"
import { IssueListCardBody } from "../../cards/IssueCards"

/*
 * Saved issue views (#2269): the repository's factory declares them, the
 * issue list offers them as keyboard-reachable toggles, and selecting one
 * lists through GET .../issues?view=<id> with the selection kept in the card.
 */

const memoryStorage = (): StorageApi => {
  const data = new Map<string, string>()
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value), removeItem: (key) => void data.delete(key) }
}

const unavailableAgent: AgentPort = {
  available: false,
  startTurn: async () => ({ status: "error", message: "unavailable" }),
  cancelTurn: async () => {},
  subscribe: () => () => {}
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

type Answer = Response | ((url: URL) => Response)

const backend = (routes: Record<string, Answer>, calls: string[]): AppServices => ({
  fetchImpl: async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url, "https://app.test")
    const method = (init?.method ?? "GET").toUpperCase()
    calls.push(`${method} ${url.pathname}${url.search}`)
    const answer = routes[`${method} ${url.pathname}`]
    if (answer === undefined) return json(404, { status: "error", message: `no stub for ${url.pathname}` })
    return typeof answer === "function" ? answer(url) : answer.clone()
  }
})

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

const controllerFor = async (routes: Record<string, Answer>) => {
  const calls: string[] = []
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const controller = createAppController(store, unavailableAgent, backend(routes, calls))
  store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "will", admin: false, scopesPlain: null })
  store.dispatch({ type: "repositories.loaded", actor: "system", repositories: [{ id: "will/flows", org: "will", ownerKind: "user", name: "flows", head: null }] })
  await settled()
  return { store, controller, calls }
}

const wireIssue = (number: number) => ({
  id: number * 100, number, title: `Issue ${number}`, body: "", state: "open", labels: [{ id: 1, name: "bug", color: "d73a4a", description: "" }],
  assignees: [], author: { id: 3, login: "ana" }, milestone_id: null, comment_count: 0,
  created_at: "2026-08-10T09:00:00Z", updated_at: "2026-08-11T09:00:00Z", closed_at: null
})

const VIEWS = [{ id: "bugs", title: "Open bugs", state: "open", labels: ["bug"] }, { id: "triage", title: "Triage" }]

const listCard = (store: Awaited<ReturnType<typeof controllerFor>>["store"]): Extract<Card, { kind: "issue-list" }> => {
  const card = store.collections.cards.get("issues-will/flows")
  if (card?.kind !== "issue-list") throw new Error(`no issue list: ${card?.kind}`)
  return card
}

describe("saved issue views in the issue list", () => {
  test("the plain list offers the declared views and keeps GitHub rows", async () => {
    const { store, controller, calls } = await controllerFor({
      "GET /api/repos/will/flows/issues": json(200, [wireIssue(7)]),
      "GET /api/repos/will/flows/issue-views": json(200, [...VIEWS, { id: "", title: "junk" }, "junk"])
    })
    expect((await controller.commands.run("issues.list")).status).toBe("executed")
    await settled()
    const card = listCard(store)
    expect(card.payload.views).toEqual([{ id: "bugs", title: "Open bugs" }, { id: "triage", title: "Triage" }])
    expect(card.payload.view).toBeUndefined()
    expect(calls).toContain("GET /api/repos/will/flows/issues?state=open")
    expect(calls).toContain("GET /api/repos/will/flows/issue-views")
    expect(calls.some((call) => call.startsWith("GET /api/user/github-repos/will/flows/issues"))).toBe(true)
  })

  test("selecting a view lists through it, drops the state and GitHub rows, and keeps the selection in the card", async () => {
    const { store, controller, calls } = await controllerFor({
      "GET /api/repos/will/flows/issues": (url) => json(200, url.searchParams.get("view") === "bugs" ? [wireIssue(9)] : [wireIssue(7), wireIssue(9)]),
      "GET /api/repos/will/flows/issue-views": json(200, VIEWS)
    })
    expect((await controller.commands.run("issues.list", "all --view bugs will/flows")).status).toBe("executed")
    await settled()
    const card = listCard(store)
    expect(card.payload.view).toBe("bugs")
    expect(card.payload.issues.map((issue) => issue.number)).toEqual([9])
    expect(calls).toContain("GET /api/repos/will/flows/issues?view=bugs&limit=100")
    expect(calls.some((call) => call.includes("state="))).toBe(false)
    expect(calls.some((call) => call.startsWith("GET /api/user/github-repos/"))).toBe(false)

    // Leaving the view is the plain list again.
    expect((await controller.commands.run("issues.list", "open will/flows")).status).toBe("executed")
    await settled()
    expect(listCard(store).payload.view).toBeUndefined()
    expect(listCard(store).payload.issues.map((issue) => issue.number)).toEqual([7, 9])
  })

  test("an undeclared view fails visibly instead of falling back to GitHub", async () => {
    const { store, controller, calls } = await controllerFor({
      "GET /api/repos/will/flows/issues": (url) => url.searchParams.has("view")
        ? json(404, { status: "error", code: "not_found", message: 'issue view "gone" not found' })
        : json(200, []),
      "GET /api/repos/will/flows/issue-views": json(200, VIEWS)
    })
    const outcome = await controller.commands.run("issues.list", "--view gone will/flows")
    await settled()
    expect(outcome.status).toBe("failed")
    expect(JSON.stringify(outcome)).toContain('issue view \\"gone\\" not found')
    expect(calls.some((call) => call.startsWith("GET /api/user/github-repos/"))).toBe(false)
    expect(store.collections.cards.get("issues-will/flows")?.status).toBe("error")
  })

  test("without a repository the form keeps the view and kind it was asked for", async () => {
    const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
    const controller = createAppController(store, unavailableAgent, backend({}, []))
    store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "will", admin: false, scopesPlain: null })
    await settled()
    await controller.commands.run("issues.list", "all --kind issue --view bugs")
    await settled()
    const form = [...store.collections.cards.values()].find((row) => JSON.stringify(row).includes("issues.list"))
    expect(JSON.stringify(form)).toContain("bugs")
  })

  test("a failed or unreadable views read offers no views and keeps the list", async () => {
    for (const answer of [json(500, { message: "down" }), json(200, { not: "a list" })]) {
      const { store, controller } = await controllerFor({
        "GET /api/repos/will/flows/issues": json(200, [wireIssue(7)]),
        "GET /api/repos/will/flows/issue-views": answer
      })
      expect((await controller.commands.run("issues.list")).status).toBe("executed")
      await settled()
      expect(listCard(store).payload.views).toBeUndefined()
      expect(listCard(store).payload.issues).toHaveLength(1)
    }
  })

  test("the slash door parses and refuses --view, and the button door writes it", () => {
    expect(payloadFor("issues.list", "--view bugs acme/web")).toMatchObject({ payload: { filter: "open", view: "bugs", repo: "acme/web" } })
    expect(payloadFor("issues.list", "closed --kind issue --view=bugs")).toMatchObject({ payload: { filter: "closed", kind: "issue", view: "bugs" } })
    expect(JSON.stringify(payloadFor("issues.list", "--view Bugs"))).toContain("saved view id")
    const args = flowArgs("issues.list", { filter: "all", repo: "acme/web", view: "bugs" })
    expect(args).toBe("all --view bugs acme/web")
    expect(payloadFor("issues.list", args)).toMatchObject({ payload: { filter: "all", view: "bugs", repo: "acme/web" } })
    expect(flowArgs("issues.list", { repo: "acme/web", view: "" })).toBe("open acme/web")
  })
})

describe("the issue list card's view toggles", () => {
  const card = (payload: Partial<Extract<Card, { kind: "issue-list" }>["payload"]>): Extract<Card, { kind: "issue-list" }> => ({
    id: "issues-acme/web", kind: "issue-list", title: "Issues · acme/web", status: "active", createdAt: 1, ordinal: 1,
    payload: { repo: "acme/web", filter: "open", issues: [], ...payload }
  })

  test("renders one pressed-state button per declared view, carrying its flow line", () => {
    const html = renderToStaticMarkup(createElement(IssueListCardBody, {
      card: card({ filter: "all", view: "bugs", views: [{ id: "bugs", title: "Open bugs" }, { id: "triage", title: "Triage" }] }),
      onRunCommand: () => {}
    }))
    expect(html).toContain('aria-label="Views"')
    expect(html.match(/<button[^>]*data-flow="issues.list"[^>]*>Open bugs<\/button>/)?.[0]).toContain('aria-pressed="true"')
    expect(html.match(/<button[^>]*data-flow="issues.list"[^>]*>Triage<\/button>/)?.[0]).toContain('aria-pressed="false"')
  })

  test("pressing a view runs issues.list with it, and pressing the selected one leaves it", () => {
    const runs: Array<[string, string | undefined]> = []
    const element = IssueListCardBody({
      card: card({ filter: "all", view: "bugs", views: [{ id: "bugs", title: "Open bugs" }, { id: "triage", title: "Triage" }] }),
      onRunCommand: (name, args) => void runs.push([name, args])
    })
    const buttons: Array<{ props: { children: unknown; onClick?: () => void } }> = []
    const walk = (node: unknown): void => {
      if (node === null || typeof node !== "object") return
      if (Array.isArray(node)) return node.forEach(walk)
      const props = (node as { props?: { children?: unknown; onClick?: () => void } }).props
      if (props === undefined) return
      if ((node as { type?: unknown }).type === "button" && (props.children === "Open bugs" || props.children === "Triage")) buttons.push(node as never)
      walk(props.children)
    }
    walk(element)
    expect(buttons.map((button) => button.props.children)).toEqual(["Open bugs", "Triage"])
    for (const button of buttons) button.props.onClick?.()
    expect(runs).toEqual([["issues.list", "open acme/web"], ["issues.list", "all --view triage acme/web"]])
  })

  test("a kind restriction rides the view toggles, and a selected view rides the kind chips", () => {
    const runs: Array<string | undefined> = []
    const html = renderToStaticMarkup(createElement(IssueListCardBody, {
      card: card({ filter: "all", kind: "issue", view: "bugs", views: [{ id: "bugs", title: "Open bugs" }, { id: "triage", title: "Triage" }] }),
      onRunCommand: (_name, args) => void runs.push(args)
    }))
    expect(html).toContain('data-flow-args="all --kind issue --view triage acme/web"')
    expect(html).toContain('data-flow-args="open --kind issue acme/web"')
    expect(html).toContain('data-flow-args="all --kind conversation --view bugs acme/web"')
  })

  test("no declared views render no toggles", () => {
    const html = renderToStaticMarkup(createElement(IssueListCardBody, { card: card({}), onRunCommand: () => {} }))
    expect(html).not.toContain('aria-label="Views"')
  })
})


const pagedViewBootstrap: AppBootstrap = {
  apiVersion: 1, host: "cloud", version: "test", buildSha: "test", capabilities: ["identity", "cloud"],
  authFlow: "redirect", sandbox: null
}

test.each([100, 105])(
  "a named view reads %i rows through the keyset and persists its repository selection",
  async (total) => {
    const storage = memoryStorage()
    const calls: Array<{ method: string; path: string; query: string }> = []
    const cursor = "MTAw"
    const originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location")
    let frontendReads = 0
    const frontend = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        frontendReads++
        return new Response(null, { status: 404 })
      }
    })
    Object.defineProperty(globalThis, "location", { configurable: true, value: new URL(frontend.url.origin) })
    const rows = Array.from({ length: total }, (_, index) => wireIssue(index + 1))
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        const url = new URL(request.url)
        calls.push({ method: request.method, path: url.pathname, query: url.search })
        if (url.pathname === "/api/user") return Response.json({ id: 1, username: "will", is_admin: false })
        if (url.pathname === "/api/repos/will/flows/issue-views") return Response.json(VIEWS)
        if (url.pathname === "/api/repos/will/flows/issues" && url.searchParams.get("view") === "bugs") {
          if (!url.searchParams.has("cursor")) {
            return new Response((total === 100 ? "\uFEFF" : "") + JSON.stringify(rows.slice(0, 100)), {
              headers: {
                ...(total > 100
                  ? {
                    Link: `<${url.origin}/api/repos/will/flows/issues?view=bugs&cursor=${cursor}&limit=100>; rel="next"`
                  }
                  : {}),
                "content-type": "application/json",
                "X-Total-Count": String(total),
                "X-Per-Page": "100"
              }
            })
          }
          if (url.searchParams.get("cursor") === cursor) {
            return Response.json(rows.slice(100), { headers: { "X-Total-Count": "105" } })
          }
        }
        return new Response(null, { status: 404 })
      }
    })
    const store = await createAppStore({ kind: "localStorage", storage })
    const controller = createAppController(store, unavailableAgent, {
      baseUrl: server.url.origin,
      fetchImpl: fetch,
      bootstrap: pagedViewBootstrap,
      applicationIdentity: applicationIdentityFromFetch(fetch, server.url.origin)
    })
    try {
      await controller.loadSession()
      expect(store.collections.identitySessions.get("identity")?.login).toBe("will")
      expect((await controller.commands.run("issues.list", "all --view bugs will/flows")).status).toBe("executed")
      await store.settled?.()
      const card = listCard(store)
      expect(card.payload.issues.map((issue) => issue.number)).toEqual(rows.map((issue) => issue.number))
      expect(card.payload.view).toBe("bugs")
      expect(card.payload.repo).toBe("will/flows")
      const issueCalls = calls.filter((call) => call.path.endsWith("/issues"))
      expect(issueCalls).toHaveLength(total > 100 ? 2 : 1)
      expect(issueCalls.every((call) => call.method === "GET" && call.path === "/api/repos/will/flows/issues")).toBe(
        true
      )
      expect(issueCalls.map((call) => new URLSearchParams(call.query).get("view"))).toEqual(
        total > 100 ? ["bugs", "bugs"] : ["bugs"]
      )
      expect(issueCalls.map((call) => new URLSearchParams(call.query).get("cursor"))).toEqual(
        total > 100 ? [null, cursor] : [null]
      )
      expect(issueCalls.some((call) => new URLSearchParams(call.query).has("state"))).toBe(false)
      expect(calls.some((call) => call.path.startsWith("/api/user/github-repos/"))).toBe(false)
      expect(frontendReads).toBe(0)
      const html = renderToStaticMarkup(createElement(IssueListCardBody, { card, onRunCommand: () => {} }))
      expect(html).toContain(`${total} Open`)
      expect(html).toContain("aria-pressed=\"true\"")
      await controller.dispose()
      const reloaded = await createAppStore({ kind: "localStorage", storage })
      try {
        expect(listCard(reloaded).payload.view).toBe("bugs")
        expect(listCard(reloaded).payload.repo).toBe("will/flows")
        expect(listCard(reloaded).payload.issues.map((issue) => issue.number)).toEqual(
          rows.map((issue) => issue.number)
        )
      } finally {
        await reloaded.dispose?.()
      }
    } finally {
      if (originalLocation) Object.defineProperty(globalThis, "location", originalLocation)
      else Reflect.deleteProperty(globalThis, "location")
      try {
        await controller.dispose()
      } finally {
        try {
          await store.dispose?.()
        } finally {
          try {
            await server.stop(true)
          } finally {
            await frontend.stop(true)
          }
        }
      }
    }
  }
)

test("a failed continuation keeps the previous view intact and a retry reads the complete named view", async () => {
  const calls: string[] = []
  let fail = true
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === "/api/user") return Response.json({ id: 1, username: "will", is_admin: false })
      if (url.pathname === "/api/repos/will/flows/issue-views") return Response.json(VIEWS)
      if (url.pathname === "/api/repos/will/flows/issues") {
        calls.push(`${request.method} ${url.pathname}${url.search}`)
        if (url.searchParams.get("view") === "triage") return Response.json([wireIssue(3)])
        if (url.searchParams.get("view") === "bugs" && !url.searchParams.has("cursor")) {
          return Response.json([wireIssue(7)], {
            headers: {
              Link: `<${url.origin}${url.pathname}?view=bugs&cursor=OA&limit=100>; rel="next"`,
              "X-Total-Count": "2"
            }
          })
        }
        if (url.searchParams.get("view") === "bugs" && url.searchParams.get("cursor") === "OA") {
          return fail
            ? Response.json({ message: "private-upstream-debug-marker" }, { status: 503 })
            : Response.json([wireIssue(8)])
        }
      }
      return new Response(null, { status: 404 })
    }
  })
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const controller = createAppController(store, unavailableAgent, {
    baseUrl: server.url.origin,
    fetchImpl: fetch,
    bootstrap: pagedViewBootstrap,
    applicationIdentity: applicationIdentityFromFetch(fetch, server.url.origin)
  })
  try {
    await controller.loadSession()
    expect(store.collections.identitySessions.get("identity")?.login).toBe("will")
    expect((await controller.commands.run("issues.list", "all --view triage will/flows")).status).toBe("executed")
    const failed = await controller.commands.run("issues.list", "all --view bugs will/flows")
    expect(failed.status).toBe("failed")
    expect(JSON.stringify(failed)).not.toContain("private-upstream-debug-marker")
    expect(store.collections.cards.get("issues-will/flows")?.kind).not.toBe("issue-list")
    expect(store.collections.cards.get("issues-will/flows")?.status).toBe("error")
    expect((await controller.commands.run("card.history.back", "issues-will/flows")).status).toBe("executed")
    expect(listCard(store).payload.view).toBe("triage")
    expect(listCard(store).payload.issues.map((issue) => issue.number)).toEqual([3])
    fail = false
    expect((await controller.commands.run("issues.list", "all --view bugs will/flows")).status).toBe("executed")
    expect(listCard(store).payload.view).toBe("bugs")
    expect(listCard(store).payload.issues.map((issue) => issue.number)).toEqual([7, 8])
    const pages = calls.filter((call) => call.includes("view=bugs"))
    expect(pages).toHaveLength(4)
    expect(pages[0]).toBe(pages[2])
    expect(pages[1]).toBe(pages[3])
    expect(pages.every((call) => call.startsWith("GET /api/repos/will/flows/issues?") && !call.includes("state=")))
      .toBe(true)
  } finally {
    await controller.dispose()
    await store.dispose?.()
    await server.stop(true)
  }
})

test.each(
  ["repeated", "missing", "malformed", "cross-origin", "foreign-path", "changed-view", "extra-filter"] as const
)("a %s continuation cursor refuses without publishing a partial named view", async (mode) => {
  let reads = 0
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === "/api/user") return Response.json({ id: 1, username: "will", is_admin: false })
      if (url.pathname === "/api/repos/will/flows/issue-views") return Response.json(VIEWS)
      if (url.pathname === "/api/repos/will/flows/issues") {
        reads++
        return Response.json([wireIssue(reads)], {
          headers: {
            Link: mode === "malformed"
              ? "not-a-link"
              : `<${mode === "cross-origin" ? "https://pagination.invalid" : url.origin}${
                mode === "foreign-path" ? "/api/repos/other/repo/issues" : url.pathname
              }?view=${mode === "changed-view" ? "triage" : "bugs"}${mode === "missing" ? "" : "&cursor=OA"}&limit=100${
                mode === "extra-filter" ? "&state=closed" : ""
              }>; rel="next"`
          }
        })
      }
      return new Response(null, { status: 404 })
    }
  })
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const controller = createAppController(store, unavailableAgent, {
    baseUrl: server.url.origin,
    fetchImpl: fetch,
    bootstrap: pagedViewBootstrap,
    applicationIdentity: applicationIdentityFromFetch(fetch, server.url.origin)
  })
  try {
    await controller.loadSession()
    const outcome = await controller.commands.run("issues.list", "all --view bugs will/flows")
    expect(outcome.status).toBe("failed")
    expect(store.collections.cards.get("issues-will/flows")?.kind).not.toBe("issue-list")
    expect(reads).toBe(mode === "repeated" ? 2 : 1)
  } finally {
    await controller.dispose()
    await store.dispose?.()
    await server.stop(true)
  }
})

test.each(["account", "repository"] as const)(
  "a held continuation stops after %s scope replacement",
  async (replacement) => {
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
    let login = "will", reads = 0
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === "/api/user") {
          return Response.json({ id: login === "will" ? 1 : 2, username: login, is_admin: false })
        }
        if (url.pathname === "/api/repos/will/flows/issue-views") {
          return Response.json(VIEWS)
        }
        if (url.pathname === "/api/repos/will/flows/issues") {
          reads++
          if (!url.searchParams.has("cursor")) {
            return Response.json([wireIssue(7)], {
              headers: {
                Link: `<${url.origin}${url.pathname}?view=bugs&cursor=OA&limit=100>; rel="next"`
              }
            })
          }
          if (url.searchParams.get("cursor") === "OQ") return Response.json([wireIssue(9)])
          entered.resolve()
          await release.promise
          return Response.json([wireIssue(8)], {
            headers: {
              Link: `<${url.origin}${url.pathname}?view=bugs&cursor=OQ&limit=100>; rel="next"`
            }
          })
        }
        return new Response(null, { status: 404 })
      }
    })
    const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
    const controller = createAppController(store, unavailableAgent, {
      baseUrl: server.url.origin,
      fetchImpl: fetch,
      bootstrap: pagedViewBootstrap,
      applicationIdentity: applicationIdentityFromFetch(fetch, server.url.origin)
    })
    try {
      await controller.loadSession()
      expect(store.collections.identitySessions.get("identity")?.login).toBe("will")
      const pending = controller.commands.run("issues.list", "all --view bugs will/flows")
      await entered.promise
      expect(store.collections.cards.get("issues-will/flows")?.kind).not.toBe("issue-list")
      if (replacement === "account") {
        login = "other"
        await controller.loadSession()
        expect(store.collections.identitySessions.get("identity")?.login).toBe("other")
      } else {
        await store.dispatch({
          type: "repositories.loaded",
          actor: "system",
          repositories: [{ id: "will/other", org: "will", ownerKind: "user", name: "other", head: null }]
        }).isPersisted.promise
        await store.dispatch({ type: "repo.selected", actor: "user", id: "will/other" }).isPersisted.promise
        expect(store.session().activeRepoKey).toBe("will/other")
      }
      release.resolve()
      await pending
      await store.settled?.()
      expect(reads).toBe(2)
      expect(store.collections.cards.get("issues-will/flows")?.kind).not.toBe("issue-list")
    } finally {
      release.resolve()
      await controller.dispose()
      await store.dispose?.()
      await server.stop(true)
    }
  }
)

test("a later view selection wins over a held named-view continuation", async () => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  const reads: string[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === "/api/user") return Response.json({ id: 1, username: "will", is_admin: false })
      if (url.pathname.endsWith("/issue-views")) return Response.json(VIEWS)
      if (url.pathname === "/api/repos/will/flows/issues") {
        reads.push(url.search)
        if (url.searchParams.get("view") === "triage") return Response.json([wireIssue(3)])
        if (!url.searchParams.has("cursor")) {
          return Response.json([wireIssue(7)], {
            headers: {
              Link: `<${url.origin}${url.pathname}?view=bugs&cursor=OA&limit=100>; rel="next"`
            }
          })
        }
        if (url.searchParams.get("cursor") === "OQ") return Response.json([wireIssue(9)])
        entered.resolve()
        await release.promise
        return Response.json([wireIssue(8)], {
          headers: {
            Link: `<${url.origin}${url.pathname}?view=bugs&cursor=OQ&limit=100>; rel="next"`
          }
        })
      }
      return new Response(null, { status: 404 })
    }
  })
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const controller = createAppController(store, unavailableAgent, {
    baseUrl: server.url.origin,
    fetchImpl: fetch,
    bootstrap: pagedViewBootstrap,
    applicationIdentity: applicationIdentityFromFetch(fetch, server.url.origin)
  })
  try {
    await controller.loadSession()
    const pending = controller.commands.run("issues.list", "all --view bugs will/flows")
    await entered.promise
    expect((await controller.commands.run("issues.list", "all --view triage will/flows")).status).toBe("executed")
    expect(listCard(store).payload.issues.map((issue) => issue.number)).toEqual([3])
    release.resolve()
    await pending
    await store.settled?.()
    expect(listCard(store).payload.view).toBe("triage")
    expect(listCard(store).payload.issues.map((issue) => issue.number)).toEqual([3])
    expect(reads).toEqual(["?view=bugs&limit=100", "?view=bugs&limit=100&cursor=OA", "?view=triage&limit=100"])
  } finally {
    release.resolve()
    await controller.dispose()
    await store.dispose?.()
    await server.stop(true)
  }
})

test.each(["page", "aggregate"] as const)(
  "an oversized %s body refuses without publishing a partial named view",
  async (mode) => {
    let reads = 0
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === "/api/user") return Response.json({ id: 1, username: "will", is_admin: false })
        if (url.pathname.endsWith("/issue-views")) return Response.json(VIEWS)
        if (url.pathname === "/api/repos/will/flows/issues") {
          reads++
          if (!url.searchParams.has("cursor")) {
            return Response.json([{
              ...wireIssue(7),
              padding: mode === "aggregate" ? "x".repeat(2 * 1024 * 1024) : ""
            }], {
              headers: {
                Link: `<${url.origin}${url.pathname}?view=bugs&cursor=OA&limit=100>; rel="next"`
              }
            })
          }
          return Response.json([{ ...wireIssue(8), padding: "x".repeat((mode === "aggregate" ? 2 : 4) * 1024 * 1024) }])
        }
        return new Response(null, { status: 404 })
      }
    })
    const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
    const controller = createAppController(store, unavailableAgent, {
      baseUrl: server.url.origin,
      fetchImpl: fetch,
      bootstrap: pagedViewBootstrap,
      applicationIdentity: applicationIdentityFromFetch(fetch, server.url.origin)
    })
    try {
      await controller.loadSession()
      expect((await controller.commands.run("issues.list", "all --view bugs will/flows")).status).toBe("failed")
      expect(reads).toBe(2)
      expect(store.collections.cards.get("issues-will/flows")?.kind).not.toBe("issue-list")
      expect(store.collections.cards.get("issues-will/flows")?.status).toBe("error")
    } finally {
      await controller.dispose()
      await store.dispose?.()
      await server.stop(true)
    }
  }
)

test.each(["none", "repositories", "identity", "changed-account", "head", "provider"] as const)(
  "named-view preload ownership across a %s transition",
  async (transition) => {
    let login = "will"
    let issueNumber = 7
    const reads: string[] = []
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === "/api/user") {
          return Response.json({ id: login === "will" ? 1 : 2, username: login, is_admin: false })
        }
        if (url.pathname.endsWith("/issue-views")) return Response.json(VIEWS)
        if (url.pathname === "/api/repos/will/flows/issues") {
          if (url.searchParams.get("view") === "bugs") reads.push(url.search)
          return Response.json([wireIssue(issueNumber)])
        }
        return new Response(null, { status: 404 })
      }
    })
    const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
    const controller = createAppController(store, unavailableAgent, {
      baseUrl: server.url.origin,
      fetchImpl: fetch,
      bootstrap: pagedViewBootstrap,
      applicationIdentity: applicationIdentityFromFetch(fetch, server.url.origin)
    })
    const repositories = [{ id: "will/flows", org: "will", ownerKind: "user" as const, name: "flows", head: null }]
    const owner = () => {
      const identity = store.collections.identitySessions.get("identity")
      return {
        login: identity?.login,
        ownerRevision: identity?.ownerRevision,
        repo: store.session().activeRepoKey,
        workspace: store.session().activeWorkspaceId,
        branch: store.session().activeBranchId
      }
    }
    try {
      await controller.loadSession()
      if (transition === "provider") {
        await store.dispatch({
          type: "identity.session.loaded",
          actor: "system",
          state: "signed-in",
          login: "will",
          admin: false,
          provider: "local",
          scopesPlain: null
        }).isPersisted.promise
      }
      await store.dispatch({ type: "repositories.loaded", actor: "system", repositories }).isPersisted.promise
      expect((await controller.commands.run("issues.list", "all will/flows")).status).toBe("executed")
      await store.settled?.()
      const before = owner()
      expect(before.login).toBe("will")
      await controller.commands.preload?.("issues.list", "all --view bugs will/flows")
      expect(reads).toEqual(["?view=bugs&limit=100"])
      if (transition === "repositories") {
        await store.dispatch({ type: "repositories.loaded", actor: "system", repositories }).isPersisted.promise
      } else if (transition === "identity") {
        await store.dispatch({
          type: "identity.session.loaded",
          actor: "system",
          state: "signed-in",
          login: "will",
          admin: false,
          scopesPlain: null
        }).isPersisted.promise
      } else if (transition === "changed-account") {
        login = "other"
        issueNumber = 9
        await controller.loadSession()
        expect(owner().login).toBe("other")
        expect(owner().ownerRevision).not.toBe(before.ownerRevision)
      } else if (transition === "head") {
        issueNumber = 9
        const head = { bookmark: "main", changeId: "updated-change", commitId: "a".repeat(40) }
        await store.dispatch({
          type: "repositories.loaded",
          actor: "system",
          repositories: [{ ...repositories[0]!, head }]
        }).isPersisted.promise
        expect(store.collections.repositories.get("will/flows")?.head).toEqual(head)
      } else if (transition === "provider") {
        issueNumber = 9
        await store.dispatch({
          type: "identity.session.loaded",
          actor: "system",
          state: "signed-in",
          login: "will",
          admin: false,
          provider: "github",
          scopesPlain: null
        }).isPersisted.promise
        expect(store.collections.identitySessions.get("identity")?.provider).toBe("github")
        expect(owner().ownerRevision).not.toBe(before.ownerRevision)
      }
      const material = transition === "changed-account" || transition === "head" || transition === "provider"
      if (transition !== "changed-account" && transition !== "provider") expect(owner()).toEqual(before)
      expect((await controller.commands.run("issues.list", "all --view bugs will/flows")).status).toBe("executed")
      await store.settled?.()
      const card = listCard(store)
      expect(card.payload.view).toBe("bugs")
      expect(card.payload.repo).toBe("will/flows")
      expect(card.payload.issues.map((issue) => issue.number)).toEqual([material ? 9 : 7])
      expect(reads).toEqual(
        material
          ? ["?view=bugs&limit=100", "?view=bugs&limit=100"]
          : ["?view=bugs&limit=100"]
      )
    } finally {
      await controller.dispose()
      await store.dispose?.()
      await server.stop(true)
    }
  }
)

test.each(["preload", "activation"] as const)(
  "an unchanged observation preserves a named read held during %s",
  async (phase) => {
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
    let reads = 0
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === "/api/user") return Response.json({ id: 1, username: "will", is_admin: false })
        if (url.pathname.endsWith("/issue-views")) return Response.json(VIEWS)
        if (url.pathname === "/api/repos/will/flows/issues") {
          if (url.searchParams.get("view") === "bugs") {
            reads++
            entered.resolve()
            await release.promise
          }
          return Response.json([wireIssue(7)])
        }
        return new Response(null, { status: 404 })
      }
    })
    const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
    const controller = createAppController(store, unavailableAgent, {
      baseUrl: server.url.origin,
      fetchImpl: fetch,
      bootstrap: pagedViewBootstrap,
      applicationIdentity: applicationIdentityFromFetch(fetch, server.url.origin)
    })
    const repositories = [{ id: "will/flows", org: "will", ownerKind: "user" as const, name: "flows", head: null }]
    const activated = Promise.withResolvers<void>()
    let unsubscribe: (() => void) | undefined
    let preload: ReturnType<NonNullable<typeof controller.commands.preload>> | undefined
    let pending: ReturnType<typeof controller.commands.run> | undefined
    try {
      await controller.loadSession()
      await store.dispatch({ type: "repositories.loaded", actor: "system", repositories }).isPersisted.promise
      expect((await controller.commands.run("issues.list", "all will/flows")).status).toBe("executed")
      await store.settled?.()
      const identity = store.collections.identitySessions.get("identity")!
      preload = controller.commands.preload?.("issues.list", "all --view bugs will/flows")
      await entered.promise
      const subscription = store.collections.cards.subscribeChanges(() => {
        const card = store.collections.cards.get("issues-will/flows")
        if (card?.loading && card.viewKey?.includes("\"bugs\"")) activated.resolve()
      })
      unsubscribe = () => subscription.unsubscribe()
      if (phase === "activation") {
        pending = controller.commands.run("issues.list", "all --view bugs will/flows")
        await activated.promise
      }
      await store.dispatch({ type: "repositories.loaded", actor: "system", repositories }).isPersisted.promise
      expect(store.collections.identitySessions.get("identity")?.ownerRevision).toBe(identity.ownerRevision)
      if (phase === "preload") pending = controller.commands.run("issues.list", "all --view bugs will/flows")
      release.resolve()
      await preload
      expect((await pending)!.status).toBe("executed")
      await store.settled?.()
      expect(reads).toBe(1)
      expect(listCard(store).payload.view).toBe("bugs")
      expect(listCard(store).payload.issues.map((issue) => issue.number)).toEqual([7])
    } finally {
      release.resolve()
      unsubscribe?.()
      try {
        await controller.dispose()
      } finally {
        await Promise.allSettled([preload, pending])
        try {
          await store.dispose?.()
        } finally {
          await server.stop(true)
        }
      }
    }
  }
)

test.each(["unreadable", "cycle", "page-limit", "item-limit"] as const)(
  "a %s named collection refuses safely and recovers on a fresh read",
  async (mode) => {
    let recover = false
    const queries: string[] = []
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === "/api/user") return Response.json({ id: 1, username: "will", is_admin: false })
      if (url.pathname.endsWith("/issue-views")) return Response.json(VIEWS)
      if (url.pathname !== "/api/repos/will/flows/issues") return new Response(null, { status: 404 })
      queries.push(url.search)
      if (recover) return Response.json([wireIssue(91)])
      if (mode === "item-limit") return Response.json(Array.from({ length: 10_001 }, () => ({
        id: 1, number: 1, title: "Bounded row", state: "open", labels: [], assignees: [],
        author: { id: 3, login: "ana" }, comment_count: 0,
        created_at: "2026-08-10T09:00:00Z", updated_at: "2026-08-11T09:00:00Z"
      })))
      if (mode === "unreadable" && url.searchParams.has("cursor")) return Response.json({ private: "private-pagination-marker" })
      const cursor = mode === "page-limit" ? `page${queries.length}` : "repeat"
      return Response.json([wireIssue(queries.length)], {
        headers: { Link: `<${url.origin}${url.pathname}?view=bugs&limit=100&cursor=${cursor}>; rel="next"` }
      })
    } })
    const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
    const controller = createAppController(store, unavailableAgent, {
      baseUrl: server.url.origin, fetchImpl: fetch, bootstrap: pagedViewBootstrap,
      applicationIdentity: applicationIdentityFromFetch(fetch, server.url.origin)
    })
    try {
      await controller.loadSession()
      const outcome = await controller.commands.run("issues.list", "all --view bugs will/flows")
      expect(outcome.status).toBe("failed")
      expect(outcome).toEqual({ status: "failed", error: "Could not reach the backend to list issues for will/flows. Nothing answered at all — that's the connection, not something you did. Try it again." })
      for (const raw of ["private-pagination-marker", "CloudAnswerUnusable", "completed issue view pagination", "issue view within the collection limit", "issue view page"]) {
        expect(JSON.stringify(outcome)).not.toContain(raw)
        expect(JSON.stringify(store.collections.cards.get("issues-will/flows"))).not.toContain(raw)
      }
      expect(store.collections.cards.get("issues-will/flows")?.status).toBe("error")
      expect(store.collections.cards.get("issues-will/flows")?.kind).not.toBe("issue-list")
      expect(queries).toHaveLength(mode === "page-limit" ? 100 : mode === "item-limit" ? 1 : 2)
      expect(queries.every((query) => {
        const parameters = new URLSearchParams(query)
        return parameters.get("view") === "bugs" && parameters.get("limit") === "100" && !parameters.has("state")
      })).toBe(true)
      recover = true
      expect((await controller.commands.run("issues.list", "all --view bugs will/flows")).status).toBe("executed")
      expect(queries.at(-1)).toBe(queries[0])
      expect(listCard(store).payload.view).toBe("bugs")
      expect(listCard(store).payload.issues.map((issue) => issue.number)).toEqual([91])
      expect(listCard(store).status).not.toBe("error")
    } finally {
      try {
        await controller.dispose()
      } finally {
        try {
          await store.dispose?.()
        } finally {
          await server.stop(true)
        }
      }
    }
  }
)
