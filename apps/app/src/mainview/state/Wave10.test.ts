import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { BrowserCardBody } from "../cards/ConversationCards"
import { handleBrowserFetch } from "../../bun/BrowserFetch"
import { describe, expect, test } from "bun:test"
import { scopedControllers } from "./ControllerTestScope"
import type { AppServices } from "./AppController"
import { createAppStore } from "./AppStore"
import { addWorldNote, json, memoryStorage, scriptedToolAgent, settled, silentAgent } from "./TestFixtures"

const createAppController = scopedControllers()

/*
 * Wave 10 — the embed law's in-app half, transcript hygiene, /clear's sweep,
 * and the sign-in-is-the-connector truth (§2a′). Controller-level, against
 * honest fetch doubles. (The wave's repo-chooser onboarding was retired with
 * the watch subsystem — lane piper.)
 */

const webStore = () => createAppStore({ kind: "localStorage", storage: memoryStorage() })

const backend = (
  routes: Record<string, Response | ((request: Request) => Response | Promise<Response>)>,
  calls: Array<{ path: string; method: string; body: unknown }> = []
): AppServices => ({
  fetchImpl: async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    const absolute = new URL(url, "https://app.test")
    const path = absolute.pathname + absolute.search
    calls.push({
      path,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined
    })
    for (const [route, answer] of Object.entries(routes)) {
      if (path === route || path.startsWith(`${route}?`)) {
        return typeof answer === "function"
          ? answer(new Request(absolute.toString(), init))
          : answer.clone()
      }
    }
    return json(404, { status: "error", message: `no stub for ${path}` })
  }
})

const signIn = async (store: Awaited<ReturnType<typeof webStore>>): Promise<void> => {
  store.dispatch({
    type: "identity.session.loaded",
    actor: "system",
    state: "signed-in",
    login: "will",
    admin: false,
    scopesPlain: null
  })
  await settled()
}

/** A scripted tool-loop agent (the ToolLoop.test.ts pattern). */
describe("wave 10 — the embed law's in-app half (§2c″)", () => {
  test("'what is in world?' through the tool double: the answer + an embedded card; the surface NEVER changes", async () => {
    const store = await webStore()
    await addWorldNote(store)
    const { agent } = scriptedToolAgent([
      () => [
        {
          type: "tool_call" as const,
          call_id: "call_1",
          name: "commands",
          arguments: JSON.stringify({ action: "execute", name: "world" })
        },
        { type: "done" as const, reason: "tool_call" as const }
      ],
      () => [
        { type: "delta" as const, kind: "text" as const, text: "World holds 1 note: World." },
        { type: "done" as const }
      ]
    ])
    const controller = createAppController(store, agent)
    controller.send("what is in world?")
    await settled()
    await settled()

    // The surface never left the chat — a takeover is structurally unavailable to the agent.
    expect(store.session().surface).toBe("chat")
    // The embedded world card rendered in the transcript.
    const card = store.collections.cards.get("world-embedded")
    expect(card?.kind).toBe("world")
    if (card?.kind === "world") {
      expect(card.payload.documents.map((document) => document.path)).toContain("World.md")
    }
    // The answer text arrived beside it, and the act line is one compact line.
    const texts = [...store.collections.messages.values()].map((message) => message.text)
    expect(texts.some((text) => text.includes("World holds 1 note"))).toBe(true)
    expect(texts).toContain("Smithers ran /world")
  })

  test("the agent's connect invocation renders the embedded connect card, not the pane", async () => {
    const store = await webStore()
    const controller = createAppController(store, silentAgent)
    await signIn(store)
    const result = await controller.commands.executeForAgent({
      name: "commands",
      arguments: JSON.stringify({ action: "execute", name: "connect" })
    })
    expect(result).toBe("executed /connect")
    expect(store.session().surface).toBe("chat")
    const card = store.collections.cards.get("connect-embedded")
    expect(card?.kind).toBe("connect")
    if (card?.kind === "connect") {
      // Sign-in IS the connector (§2a′): the signed-in session reads Connected.
      expect(card.payload.github).toEqual({ connected: true, login: "will" })
    }
  })
})

test("the human connect door embeds the same repository controls without opening a pane", async () => {
  const store = await webStore()
  const controller = createAppController(store, silentAgent)
  await signIn(store)
  expect((await controller.commands.run("connect")).status).toBe("executed")
  expect(store.session().surface).toBe("chat")
  expect(store.collections.cards.get("connect-embedded")?.kind).toBe("connect")
  await controller.dispose()
  await store.dispose?.()
})

describe("wave 10 — transcript hygiene (§2b)", () => {
  test("a tool act is one compact line; a raw JSON payload can never reach transcript text", async () => {
    const store = await webStore()
    const { agent } = scriptedToolAgent([
      () => [
        {
          type: "tool_call" as const,
          call_id: "call_1",
          name: "commands",
          arguments: JSON.stringify({ action: "list" })
        },
        { type: "done" as const, reason: "tool_call" as const }
      ],
      () => [
        { type: "delta" as const, kind: "text" as const, text: "Here is what I can do." },
        { type: "done" as const }
      ]
    ])
    const controller = createAppController(store, agent)
    controller.send("what can you do?")
    await settled()
    await settled()

    const texts = [...store.collections.messages.values()].map((message) => message.text)
    expect(texts).toContain("Smithers checked what it can do here")
    for (const text of texts) {
      expect(text).not.toContain("{\"state\"")
      expect(text).not.toContain("\"commands\":[")
    }
    // The act line's actor is smithers, never the user.
    const act = [...store.collections.messages.values()].find((message) => message.act !== undefined)
    expect(act?.role).toBe("smithers")
    // The full-fidelity record lives in the tool-call stream for the admin panel.
    const records = [...store.collections.toolCalls.values()]
    expect(records).toHaveLength(1)
    expect(records[0]?.result).toContain("\"state\"")
  })
})

describe("/chat.clear — optional summaries and atomic local archives", () => {
  test("an explicit summary commits new world notes and the archive together", async () => {
    const store = await webStore()
    const calls: Array<{ path: string; method: string; body: unknown }> = []
    const controller = createAppController(store, silentAgent, {
      ...backend(
        {
          "/api/model/stream": () =>
            new Response(
              `${
                JSON.stringify({
                  runId: "sweep",
                  type: "delta",
                  kind: "text",
                  text:
                    "{\"notes\":[{\"title\":\"Prefers dark mode\",\"body\":\"The user keeps the app in dark mode.\",\"confidence\":0.9}]}"
                })
              }\n${JSON.stringify({ runId: "sweep", type: "done", reason: "stop" })}\n`,
              { status: 200, headers: { "content-type": "application/x-ndjson" } }
            )
        },
        calls
      )
    })
    await signIn(store)
    controller.send("remember that I prefer dark mode")
    await settled()
    // There is a real transcript to sweep. Wave 14 §1 removed the seeded
    // welcome, so this is the user's own turn and nothing else.
    const beforeClear = [...store.collections.messages.values()]
    expect(beforeClear.length).toBeGreaterThan(0)
    expect(beforeClear.some((message) => message.text === "remember that I prefer dark mode")).toBe(true)

    const outcome = await controller.commands.run("chat.clear", "--summarize")
    expect(outcome.status).toBe("executed")
    await settled()

    // The sweep is a model call, so it rode the one metered model route.
    expect(calls.some((call) => call.path === "/api/model/stream" && call.method === "POST")).toBe(true)
    // Notes and clear share one commit, with distinct model provenance.
    const notes = [...store.collections.worldDocuments.values()].filter((document) =>
      document.sources.includes("chat-sweep")
    )
    expect(notes).toHaveLength(1)
    expect(notes[0]?.title).toBe("Prefers dark mode")
    expect(notes[0]?.updatedBy).toBe("smithers")
    expect(notes[0]?.confidence).toBe(0.9)
    const journal = [...store.collections.transitions.values()].sort((a, b) => a.revision - b.revision)
    const clearedRevision = journal.find((record) => record.type === "conversation.cleared")?.revision ?? 0
    expect(notes[0]?.revision).toBe(clearedRevision)
    // The chat is cleared and the one line states what was kept.
    const messages = [...store.collections.messages.values()]
    expect(messages).toHaveLength(1)
    expect(messages[0]?.text).toContain("Saved 1 new note to Wiki")
    expect(messages[0]?.text).toContain("Open the archived conversation")
  })

  test("a failed sweep leaves the chat UNcleared with an honest line", async () => {
    const store = await webStore()
    const reports: string[] = []
    const controller = createAppController(store, silentAgent, {
      ...backend({
        "/api/model/stream": json(500, { status: "error", message: "chat upstream down" })
      }),
      clientErrors: { report: (_kind, error) => { reports.push(String(error)) }, reported: () => reports.length }
    })
    await signIn(store)
    controller.send("some conversation worth keeping")
    await settled()
    const before = [...store.collections.messages.values()].length

    const outcome = await controller.commands.run("chat.clear", "--summarize")
    await settled()

    const messages = [...store.collections.messages.values()]
    expect(messages.length).toBe(before)
    expect(outcome).toMatchObject({ status: "failed", error: expect.stringContaining("nothing was cleared or saved") })
    // The raw cause reaches diagnostics, never the line the person reads.
    expect(reports.some(report => report.includes("\"subject\":\"chat.clear\""))).toBe(true)
    expect([...store.collections.transitions.values()].some((record) => record.type === "conversation.cleared")).toBe(
      false
    )
  })

  test("a transcript with nothing worth keeping clears with the zero-kept line", async () => {
    const store = await webStore()
    const controller = createAppController(store, silentAgent, {
      ...backend({
        "/api/model/stream": () =>
          new Response(
            `${JSON.stringify({ runId: "sweep", type: "delta", kind: "text", text: "{\"notes\":[]}" })}\n${
              JSON.stringify({ runId: "sweep", type: "done", reason: "stop" })
            }\n`,
            { status: 200, headers: { "content-type": "application/x-ndjson" } }
          )
      })
    })
    await signIn(store)
    controller.send("hi")
    await settled()
    await controller.commands.run("chat.clear", "--summarize")
    const messages = [...store.collections.messages.values()]
    expect(messages).toHaveLength(1)
    expect(messages[0]?.text).toContain("Started a new conversation.")
  })
})

describe("wave 10 — the browser tool (§2d)", () => {
  test("the agent's browser call returns the extracted text and renders the embedded card", async () => {
    const store = await webStore()
    const controller = createAppController(store, silentAgent, {
      ...backend({
        "/api/tools/browser-fetch": json(200, {
          status: 200,
          finalUrl: "https://example.com/",
          contentType: "text/html",
          text: "Example Domain — for use in examples.",
          frameable: true,
          blockReason: null
        })
      })
    })
    await signIn(store)
    const result = await controller.commands.executeForAgent({
      name: "commands",
      arguments: JSON.stringify({ action: "execute", name: "browser.open", args: "https://example.com/" })
    })
    expect(result).toContain("Example Domain")
    const card = store.collections.cards.get("browser-https://example.com/")
    expect(card?.kind).toBe("browser")
    if (card?.kind === "browser") {
      expect(card.payload.frameable).toBe(true)
      expect(card.payload.status).toBe(200)
    }
  })

  test("a site that refuses framing lands the honest blocked state on the card", async () => {
    const store = await webStore()
    const controller = createAppController(store, silentAgent, {
      ...backend({
        "/api/tools/browser-fetch": json(200, {
          status: 200,
          finalUrl: "https://x.com/",
          contentType: "text/html",
          text: "",
          frameable: false,
          blockReason: "The site refuses embedding (X-Frame-Options: DENY)."
        })
      })
    })
    await signIn(store)
    await controller.commands.run("browser.open", "https://x.com/")
    const card = store.collections.cards.get("browser-https://x.com/")
    expect(card?.kind).toBe("browser")
    if (card?.kind === "browser") {
      expect(card.payload.frameable).toBe(false)
      expect(card.payload.blockReason).toContain("X-Frame-Options")
    }
  })

  test("the browser act line names the host, never the payload", async () => {
    const store = await webStore()
    const { agent } = scriptedToolAgent([
      () => [
        {
          type: "tool_call" as const,
          call_id: "call_1",
          name: "commands",
          arguments: JSON.stringify({ action: "execute", name: "browser.open", args: "https://example.com/" })
        },
        { type: "done" as const, reason: "tool_call" as const }
      ],
      () => [
        { type: "delta" as const, kind: "text" as const, text: "The page says: Example Domain." },
        { type: "done" as const }
      ]
    ])
    const controller = createAppController(store, agent, {
      ...backend({
        "/api/tools/browser-fetch": json(200, {
          status: 200,
          finalUrl: "https://example.com/",
          contentType: "text/html",
          text: "Example Domain",
          frameable: true,
          blockReason: null
        })
      })
    })
    controller.send("read https://example.com for me")
    await settled()
    await settled()
    await settled()

    const texts = [...store.collections.messages.values()].map((message) => message.text)
    expect(texts).toContain("Smithers read example.com")
    for (const text of texts) {
      expect(text).not.toContain("Example Domain —")
    }
  })
})

describe("wave 10 — sign-in IS the GitHub connector (§2a′)", () => {
  test("a signed-in session means connected: the snapshot and the agent context derive it", async () => {
    const store = await webStore()
    const controller = createAppController(store, silentAgent)
    expect(controller.commands.state().hasConnectors).toBe(false)
    await signIn(store)
    expect(controller.commands.state().hasConnectors).toBe(true)
  })

  test("the agent answering from the debug reads (admin) — snapshot/events contracts", async () => {
    const store = await webStore()
    const controller = createAppController(store, silentAgent)
    store.dispatch({
      type: "identity.session.loaded",
      actor: "system",
      state: "signed-in",
      login: "will",
      admin: true,
      scopesPlain: null
    })
    await settled()
    const snapshot = await controller.commands.executeForAgent({
      name: "commands",
      arguments: JSON.stringify({ action: "execute", name: "debug.snapshot" })
    })
    const parsed = JSON.parse(snapshot) as { surface: string; identity: { login: string } }
    expect(parsed.surface).toBe("chat")
    expect(parsed.identity.login).toBe("will")
    const events = await controller.commands.executeForAgent({
      name: "commands",
      arguments: JSON.stringify({ action: "execute", name: "debug.events" })
    })
    expect(JSON.parse(events)).toBeInstanceOf(Array)
  })
})

describe("browser refusal through real HTTP and persisted cards", () => {
  test.each(["human", "agent"] as const)("%s receives guarded input refusal after reload and can recover", async actor => {
    const storage = memoryStorage()
    let store = await createAppStore({ kind: "localStorage", storage })
    let controller: ReturnType<typeof createAppController> | undefined
    let targetReads = 0
    const target = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => { targetReads++; return new Response("must not be read") } })
    const url = `https://127.0.0.1:${target.port}/`
    let recovery = false
    const requests: string[] = []
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
      const path = new URL(request.url).pathname
      requests.push(path)
      if (path === "/api/user") return Response.json({ id: 1, username: "will", is_admin: false })
      if (path === "/api/tools/browser-fetch") {
        if (recovery && (await request.clone().json()).url === "https://example.com/") return Response.json({ status: 200, finalUrl: "https://example.com/", text: "Recovered readable text", frameable: false, blockReason: "Embedding refused" })
        return handleBrowserFetch(request)
      }
      return new Response(null, { status: 404 })
    } })
    try {
      controller = createAppController(store, silentAgent, { baseUrl: server.url.origin, fetchImpl: fetch })
      await signIn(store)
      const result = actor === "agent"
        ? await controller.commands.executeForAgent({ name: "commands", arguments: JSON.stringify({ action: "execute", name: "browser.open", args: url }) })
        : await controller.commands.run("browser.open", url)
      expect(JSON.stringify(result)).toContain("Smithers can't do that as asked.")
      expect(targetReads).toBe(0)
      if (!store.settled) throw new Error("Fixture has no persistence barrier")
      await store.settled()
      const id = `browser-${url}`
      const before = store.collections.cards.get(id)
      if (before?.kind !== "browser") throw new Error("Missing guarded refusal card")
      expect(before.payload.refusal).toMatchObject({ status: 400, code: "request_invalid", fault: "user", origin: "local" })
      const html = renderToStaticMarkup(createElement(BrowserCardBody, { card: before }))
      expect(html).toContain('data-fault="user"')
      expect(html).not.toContain("Details")
      expect(html).not.toContain("private host")
      await controller.dispose()
      controller = undefined
      store = await createAppStore({ kind: "localStorage", storage })
      const restored = store.collections.cards.get(id)
      expect(restored).toEqual(before)
      if (restored?.kind !== "browser") throw new Error("Missing durable refusal after reload")
      expect(renderToStaticMarkup(createElement(BrowserCardBody, { card: restored }))).toEqual(html)
      recovery = true
      controller = createAppController(store, silentAgent, { baseUrl: server.url.origin, fetchImpl: fetch })
      await signIn(store)
      const recovered = await controller.commands.executeForAgent({ name: "commands", arguments: JSON.stringify({ action: "execute", name: "browser.open", args: "https://example.com/" }) })
      expect(recovered).toContain("Recovered readable text")
      if (!store.settled) throw new Error("Fixture has no persistence barrier")
      await store.settled()
      expect(store.collections.cards.get(id)).toEqual(before)
      const card = store.collections.cards.get("browser-https://example.com/")
      expect(card?.kind === "browser" && card.payload.error).toBeUndefined()
      expect(card?.kind === "browser" && card.payload.refusal).toBeUndefined()
      expect([...store.collections.cards.values()].filter(card => card.id === "browser-https://example.com/")).toHaveLength(1)
      expect(targetReads).toBe(0)
      expect(requests.filter(path => path === "/api/tools/browser-fetch")).toHaveLength(2)
    } finally {
      try { await controller?.dispose(); await store.dispose?.() }
      finally { await server.stop(true); await target.stop(true) }
    }
  })

  test.each([
    { name: "unknown", status: 400, body: { status: "error", code: "future_browser_code", message: "RAW_PRIVATE_MARKER" } },
    { name: "status mismatch", status: 503, body: { status: "error", code: "request_invalid", message: "RAW_PRIVATE_MARKER" } },
    { name: "malformed", status: 400, body: "RAW_PRIVATE_MARKER" }
  ])("$name response remains opaque in agent result and persisted card", async ({ status, body }) => {
    // Future/malformed bodies are this compatibility boundary. The decisive
    // input fault above uses the actual maintained guarded HTTP handler.
    let recover = false
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
      const path = new URL(request.url).pathname
      if (path === "/api/user") return Response.json({ id: 1, username: "will", is_admin: false })
      if (path === "/api/tools/browser-fetch" && recover) return Response.json({ status: 200, finalUrl: "https://example.com/", text: "Recovered compatibility response", frameable: false, blockReason: "Embedding refused" })
      if (path === "/api/tools/browser-fetch") return typeof body === "string" ? new Response(body, { status }) : Response.json(body, { status })
      return new Response(null, { status: 404 })
    } })
    const store = await webStore()
    const controller = createAppController(store, silentAgent, { baseUrl: server.url.origin, fetchImpl: fetch })
    try {
      await signIn(store)
      const result = await controller.commands.executeForAgent({ name: "commands", arguments: JSON.stringify({ action: "execute", name: "browser.open", args: "https://example.com/" }) })
      expect(result).not.toContain("RAW_PRIVATE_MARKER")
      expect(result).toContain("That page couldn't be read. Not your fault.")
      if (!store.settled) throw new Error("Fixture has no persistence barrier")
      await store.settled()
      const card = store.collections.cards.get("browser-https://example.com/")
      expect(JSON.stringify(card)).not.toContain("RAW_PRIVATE_MARKER")
      if (card?.kind !== "browser") throw new Error("Missing compatibility failure card")
      const html = renderToStaticMarkup(createElement(BrowserCardBody, { card }))
      expect(html).toContain('data-fault="infra"')
      expect(html).not.toContain("RAW_PRIVATE_MARKER")
      recover = true
      const recovered = await controller.commands.executeForAgent({ name: "commands", arguments: JSON.stringify({ action: "execute", name: "browser.open", args: "https://example.com/" }) })
      expect(recovered).toContain("Recovered compatibility response")
      if (!store.settled) throw new Error("Fixture has no persistence barrier")
      await store.settled()
      const replaced = store.collections.cards.get(card.id)
      expect(replaced?.kind === "browser" && replaced.payload.error).toBeUndefined()
      expect(replaced?.kind === "browser" && replaced.payload.refusal).toBeUndefined()
      expect([...store.collections.cards.values()].filter(row => row.id === card.id)).toHaveLength(1)
    } finally { try { await controller.dispose() } finally { await server.stop(true) } }
  })
})


test("a closed real browser service produces an opaque transport failure card", async () => {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(null, { status: 404 }) })
  const origin = server.url.origin
  await server.stop(true)
  const store = await webStore()
  const controller = createAppController(store, silentAgent, { baseUrl: origin, fetchImpl: fetch })
  try {
    await signIn(store)
    const result = await controller.commands.executeForAgent({ name: "commands", arguments: JSON.stringify({ action: "execute", name: "browser.open", args: "https://example.com/" }) })
    expect(result).not.toContain("ECONNREFUSED")
    const card = store.collections.cards.get("browser-https://example.com/")
    if (card?.kind !== "browser") throw new Error("Missing transport failure card")
    expect(card.payload.refusal).toBeUndefined()
    const html = renderToStaticMarkup(createElement(BrowserCardBody, { card }))
    expect(html).toContain('data-fault="infra"')
    expect(html).not.toContain("ECONNREFUSED")
  } finally { await controller.dispose() }
})
