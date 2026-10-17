/*
 * Slash aliases (Will, 2026-10-13, #3827): `/new` and `/clear` run `/archive`.
 * An alias is never listed for a bare `/`. Its row appears once the person
 * starts typing the alias, and names the flow it runs in parentheses.
 */
import { describe, expect, test } from "bun:test"
import type { StorageApi } from "@tanstack/db"
import type { AgentPort } from "../runtime/AgentPort"
import { createAppController } from "../state/AppController"
import { createAppStore } from "../state/AppStore"
import { aliasOwner, parseSubmit, slashTree, type CatalogItem, type CommandState } from "./registry"

const state: CommandState = { surface: "chat", typing: false, hasConnectors: false, admin: false, signedOut: false }
const commands: ReadonlyArray<CatalogItem> = [
  { name: "archive", summary: "Archive this chat and start a new one", visibility: "core", aliases: ["new", "clear"] },
  { name: "history", summary: "Archived chats", visibility: "core" },
  { name: "compact", summary: "Compact", visibility: "core" },
  { name: "name", summary: "Name", visibility: "core" },
  { name: "secret", summary: "Hidden door", visibility: "hidden", aliases: ["shh"] }
]
/** Each row as the menu labels it. */
const labels = (needle: string, list: ReadonlyArray<CatalogItem> = commands) => slashTree(state, needle, list)
  .flatMap(row => row.kind === "flow" ? [row.alias === undefined ? `/${row.flow.name}` : `/${row.alias} (${row.flow.name})`] : [])

describe("slash aliases", () => {
  test("a bare / lists commands and no alias", () => {
    expect(labels("")).toEqual(["/archive", "/history", "/compact", "/name"])
  })

  test("an alias appears only once its own spelling is being typed", () => {
    const aliases = (needle: string) => labels(needle).filter(label => label.includes(" ("))
    // The alias row leads; the rows after it are the menu's usual name and summary matches.
    expect(labels("c").slice(0, 2)).toEqual(["/clear (archive)", "/compact"])
    expect(aliases("c")).toEqual(["/clear (archive)"])
    expect(labels("cl")).toEqual(["/clear (archive)"])
    expect(labels("clear")).toEqual(["/clear (archive)"])
    expect(labels("n").slice(0, 2)).toEqual(["/new (archive)", "/name"])
    expect(aliases("n")).toEqual(["/new (archive)"])
    expect(labels("ne")).toEqual(["/new (archive)", "/archive"])
    // The alias's letters inside another word do not summon it: the typed text must begin it.
    expect(labels("lear")).toEqual([])
    expect(aliases("ew")).toEqual([])
    expect(labels("arch")).toEqual(["/archive", "/history"])
    expect(labels("clearx")).toEqual([])
  })

  test("the whole alias sorts first, so Enter runs what was typed", () => {
    const rows = slashTree(state, "new", commands)
    expect(rows[0]).toEqual({ kind: "flow", flow: commands[0]!, recommended: false, alias: "new" })
    // Both aliases of one flow begin with the typed text: the exact one leads.
    const twins: ReadonlyArray<CatalogItem> = [{ name: "archive", summary: "Archive", visibility: "core", aliases: ["news", "new"] }]
    expect(labels("new", twins)).toEqual(["/new (archive)", "/news (archive)"])
  })

  test("a registered flow wins over an alias of the same name", () => {
    const shadowed: ReadonlyArray<CatalogItem> = [...commands, { name: "clear", summary: "This repository's clear", visibility: "core" }]
    expect(labels("clear", shadowed)).toEqual(["/clear"])
    expect(aliasOwner(shadowed, "clear")).toBeUndefined()
    expect(aliasOwner(shadowed, "new")?.name).toBe("archive")
    expect(parseSubmit("/clear", shadowed)).toEqual({ kind: "command", name: "clear" })
  })

  test("a flow that is not listed lends no alias row, and a signed-out listing offers none it cannot run", () => {
    expect(labels("sh")).toEqual([])
    expect(aliasOwner(commands, "shh")?.name).toBe("secret")
    const gated: ReadonlyArray<CatalogItem> = [{ name: "archive", summary: "Archive", visibility: "core", aliases: ["new"], requires: ["signed-in"] }]
    expect(slashTree({ ...state, signedOut: true }, "new", gated)).toEqual([])
    expect(labels("new", gated)).toEqual(["/new (archive)"])
  })

  test("a typed alias submits the flow it names", () => {
    expect(parseSubmit("/clear", commands)).toEqual({ kind: "command", name: "archive" })
    expect(parseSubmit("  /new  ", commands)).toEqual({ kind: "command", name: "archive" })
    expect(parseSubmit("/archive", commands)).toEqual({ kind: "command", name: "archive" })
    // Archive takes no input: text after either spelling is a prompt, never a silent run.
    expect(parseSubmit("/new idea for the parser", commands)).toEqual({ kind: "prompt", text: "/new idea for the parser" })
    expect(parseSubmit("/archive now", commands)).toEqual({ kind: "prompt", text: "/archive now" })
    const taking: ReadonlyArray<CatalogItem> = [{ name: "history", summary: "Archived chats", acceptsArgs: true, aliases: ["resume"] }]
    expect(parseSubmit("/resume abc", taking)).toEqual({ kind: "command", name: "history", args: "abc" })
    expect(parseSubmit("/clera", commands)).toEqual({ kind: "unknown-command", name: "clera" })
    expect(aliasOwner(commands, "archive")).toBeUndefined()
    expect(aliasOwner(commands, "missing")).toBeUndefined()
  })
})

const memoryStorage = (): StorageApi => {
  const values = new Map<string, string>()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } }
}
const agent: AgentPort = { available: false, startTurn: async () => ({ status: "error", message: "unavailable" }), cancelTurn: async () => {}, subscribe: () => () => {} }

describe("the registered archive flow", () => {
  test("/new and /clear resolve to archive through every lookup, and the catalog lists neither", async () => {
    const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
    const controller = createAppController(store, agent, { fetchImpl: async () => Response.json({}, { status: 404 }) })
    try {
      const archive = controller.commands.find("archive")
      expect(archive).toBeDefined()
      expect(controller.commands.find("new")).toBe(archive)
      expect(controller.commands.find("clear")).toBe(archive)
      expect(controller.commands.find("clea")).toBeUndefined()
      const all = controller.commands.all()
      expect(all.find(item => item.name === "archive")?.aliases).toEqual(["new", "clear"])
      expect(all.some(item => item.name === "new" || item.name === "clear")).toBe(false)
      expect(parseSubmit("/clear", all)).toEqual({ kind: "command", name: "archive" })
      expect(parseSubmit("/new", all)).toEqual({ kind: "command", name: "archive" })
      expect(parseSubmit("/history 0b1c", all)).toEqual({ kind: "command", name: "history", args: "0b1c" })
      const row = (needle: string) => controller.slashTree(needle).flatMap(each => each.kind === "flow" && each.alias !== undefined ? [`/${each.alias} (${each.flow.name})`] : [])
      expect(row("")).toEqual([])
      expect(row("cl")).toEqual(["/clear (archive)"])
      expect(row("new")).toEqual(["/new (archive)"])
      expect(row("arch")).toEqual([])
      // With no host conversation there is nothing to archive: the act refuses and sends nothing.
      expect(controller.archiveChat()).toBe("Archive unavailable")
    } finally { await controller.dispose() }
  })
})
