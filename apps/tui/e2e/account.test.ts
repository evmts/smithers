/** Controlled real HTTP proves terminal ordering; live Go/PostgreSQL acceptance is a separate App probe. */
import { expect, it } from "bun:test"
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { key, Tui } from "./tmux"

it("keeps Chat editable and deduplicates Account while its persisted HTTP read is unresolved", async () => {
  const root = mkdtempSync(join(tmpdir(), "tui-account-http-"))
  const sessions = join(root, "sessions")
  const held = Promise.withResolvers<void>()
  let reads = 0
  let failed = false
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname !== "/api/user") return new Response("Unexpected route", { status: 404 })
      reads++
      await held.promise
      return failed
        ? Response.json({ message: "private-http-failure" }, { status: 503 })
        : Response.json({ username: "owned-http-account", token: "private-http-value" })
    }
  })
  let tui: Tui | undefined
  const history = () =>
    readdirSync(sessions, { recursive: true }).filter((file): file is string =>
      typeof file === "string" && file.endsWith(".jsonl")
    )
      .map((file) => readFileSync(join(sessions, file), "utf8")).join("\n")
  const request = async () => {
    await tui!.type("/account.show")
    await tui!.press(key.enter)
  }
  try {
    tui = await Tui.start({
      cwd: root,
      cols: 110,
      rows: 40,
      command: `bun ${resolve(import.meta.dir, "../src/main.tsx")} --model cerebras:qwen-3.8-27b`,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: root,
        XDG_CONFIG_HOME: root,
        SMITHERS_DISABLE_SYSTEM_KEYRING: "1",
        SMITHERS_TUI_SESSION_DIR: sessions,
        SMITHERS_API_ORIGIN: server.url.origin,
        SMITHERS_TOKEN: "owned-http-token"
      }
    })
    await tui.until((screen) => /↑\S+ ↓\S+/.test(screen), 20000, "Account protocol startup")
    await request()
    await tui.until(() => reads === 1, 5000, "held Account HTTP request")
    expect(history()).toContain("\"state\":\"requested\"")
    expect(history()).not.toContain("\"state\":\"complete\"")
    await request()
    await tui.type("owned draft while Account is unresolved")
    await tui.until(
      (screen) => screen.includes("owned draft while Account is unresolved"),
      5000,
      "editable Chat during held read"
    )
    expect(reads).toBe(1)
    expect(history()).not.toContain("\"state\":\"complete\"")
    failed = true
    held.resolve()
    await tui.until((screen) => screen.includes("That command could not run."), 5000, "safe Account failure")
    expect(history()).toContain("\"state\":\"failed\"")
    expect(tui.screen()).not.toContain("private-http-failure")
    // Clear only the unsent editor draft; never submit a model turn.
    await tui.press(key.ctrlA)
    await tui.press(key.ctrlK)
    failed = false
    await request()
    await tui.until((screen) => screen.includes("@owned-http-account"), 5000, "Account retry completion")
    expect(reads).toBe(2)
    expect(history()).toContain("\"state\":\"complete\"")
    for (const marker of ["owned-http-token", "private-http-value", "private-http-failure", "owned-http-account"]) {
      expect(history()).not.toContain(marker)
    }
    expect(history()).not.toContain("\"model-requested\"")
  } finally {
    held.resolve()
    try {
      await tui?.stop()
    } finally {
      try {
        await server.stop(true)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    }
  }
}, 60000)
