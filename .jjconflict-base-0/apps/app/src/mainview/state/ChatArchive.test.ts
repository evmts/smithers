/*
 * /archive and /history through the real controller on a hosted, signed-in
 * session (#3827): typed commands, their aliases, the History card's saved
 * selection, and the host calls behind them.
 */
import { describe, expect, test } from "bun:test"
import type { StorageApi } from "@tanstack/db"
import type { AgentPort } from "../runtime/AgentPort"
import { createAppStore } from "./AppStore"
import { scopedControllers } from "./ControllerTestScope"

const createAppController = scopedControllers()

const memoryStorage = (): StorageApi => {
  const values = new Map<string, string>()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } }
}
const agent: AgentPort = { available: false, startTurn: async () => ({ status: "error", message: "unavailable" }), cancelTurn: async () => {}, subscribe: () => () => {} }
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(done => setTimeout(done, 0)) }
const archived = { id: "a1", repository: null, branch: null, title: "Fix Safari login", summary: null, runs: [], entries: 2, first_at: 1, last_at: 2, archived_at: 3, archived_by: "maya" }

const harness = async () => {
  const calls: Array<{ method: string; path: string; body: unknown }> = []
  let live: unknown[] = [{ id: "t1", author: 1, authorLogin: "maya", runId: "r1", prompt: "Why does login fail?", state: "completed", title: "Why does login fail?", tone: "quiet", sequence: 1, frames: [] }]
  let archives: unknown[] = []
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const controller = createAppController(store, agent, {
    bootstrap: { apiVersion: 1 as const, host: "cloud" as const, version: "test", buildSha: "test", capabilities: ["agent" as const, "chat.archive" as const], authFlow: "none" as const, sandbox: { platform: "darwin" as const, mode: "trusted-only" as const } },
    fetchImpl: async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "https://host.test")
      const method = init?.method ?? "GET"
      if (url.pathname.startsWith("/api/conversation")) calls.push({ method, path: url.pathname, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined })
      if (url.pathname === "/api/conversations/main" && method === "GET") return Response.json({ id: "account-1-main", entries: live })
      if (url.pathname === "/api/conversations/main/view-state") return Response.json({ toasts_hidden: false })
      if (url.pathname === "/api/conversations/main/archive" && method === "POST") {
        if (live.length === 0) return Response.json({ archive: null })
        live = []; archives = [archived]
        return Response.json({ archive: archived })
      }
      if (url.pathname === "/api/conversation-archives") return Response.json({ archives })
      if (url.pathname === "/api/conversation-archives/a1") return Response.json({ archive: archived, conversation: { id: "archive-a1", entries: [] } })
      return Response.json({ code: "unknown", class: "infra", message: "Not available" }, { status: 404 })
    }
  })
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "maya", admin: false, scopesPlain: null }).isPersisted.promise
  await settle()
  return { store, controller, calls }
}

describe("chat archive through the controller", () => {
  test("/clear archives the chat on screen, the live chat rereads empty, and /history lists it", async () => {
    const { store, controller, calls } = await harness()
    try {
      expect(controller.sharedConversation?.get().conversation?.entries).toHaveLength(1)
      const outcome = await controller.commands.run("clear")
      expect(outcome.status).toBe("executed")
      await settle()
      expect(calls.filter(call => call.method === "POST")).toEqual([{ method: "POST", path: "/api/conversations/main/archive", body: { repository: "", branch: "" } }])
      expect(controller.sharedConversation?.get().conversation?.entries).toEqual([])
      expect(controller.chatArchives.get().archives?.map(row => row.id)).toEqual(["a1"])

      // /history opens one card; a second ask reuses it instead of stacking another.
      expect((await controller.commands.run("history")).status).toBe("executed")
      expect((await controller.commands.run("history")).status).toBe("executed")
      await settle()
      const cards = store.collections.cards.toArray.filter(card => card.kind === "archives")
      expect(cards.map(card => [card.id, card.title, card.payload])).toEqual([["archived-chats", "History", {}]])
      expect(calls.some(call => call.method === "GET" && call.path === "/api/conversation-archives")).toBe(true)

      // `/history <id>` opens that chat in the card; asking for the open chat again closes it; the list ask keeps the selection.
      expect((await controller.commands.run("history", "a1")).status).toBe("executed")
      expect(store.collections.cards.get("archived-chats")?.payload).toEqual({ selected: "a1" })
      expect(controller.chatArchives.get().opened.a1).toEqual({ id: "archive-a1", entries: [] })
      expect(await controller.showHistory()).toBeUndefined()
      expect(store.collections.cards.get("archived-chats")?.payload).toEqual({ selected: "a1" })
      expect(await controller.showHistory("a1")).toBeUndefined()
      expect(store.collections.cards.get("archived-chats")?.payload).toEqual({})
      // A chat the host no longer has is named, and the card still records what was asked for.
      expect(await controller.showHistory("gone")).toBe("Archived chat unavailable")
      expect(store.collections.cards.get("archived-chats")?.payload).toEqual({ selected: "gone" })
    } finally { await controller.dispose() }
  })

  test("the app agent cannot archive, by either name, and can open history", async () => {
    const { controller, calls } = await harness()
    try {
      for (const name of ["archive", "new", "clear"]) {
        const refused = await controller.commands.executeForAgent({ name: "commands", arguments: JSON.stringify({ action: "execute", name }) })
        expect(JSON.stringify(refused)).not.toContain("Archive requested")
      }
      await settle()
      expect(calls.filter(call => call.method === "POST")).toEqual([])
      expect(controller.sharedConversation?.get().conversation?.entries).toHaveLength(1)
    } finally { await controller.dispose() }
  })
})
