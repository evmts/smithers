/** The project's Cloud home may load slowly without trapping the production composer. */
import { expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { key, Tui } from "./tmux.ts"

it("leaves Cloud home during an unresolved read and keeps the chat draft usable", async () => {
  const root = mkdtempSync(join(tmpdir(), "tui-factory-production-"))
  const app = resolve(import.meta.dir, "..")
  let finish!: (response: Response) => void
  const response = new Promise<Response>((resolve) => {
    finish = resolve
  })
  const seen: Array<{ path: string; authorization: string | null }> = []
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      const path = new URL(request.url).pathname
      if (path !== "/api/repos/o/r/mythical") return new Response("{}", { status: 404 })
      seen.push({ path, authorization: request.headers.get("authorization") })
      return response
    }
  })
  let tui: Tui | undefined
  try {
    tui = await Tui.start({
      cwd: root,
      command: `bun ${join(app, "src/main.tsx")} ${root}`,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: root,
        XDG_CONFIG_HOME: root,
        SMITHERS_TUI_REPLAY: join(app, "test/fixtures/fix-add.jsonl"),
        SMITHERS_TUI_SESSION_DIR: join(root, "sessions"),
        SMITHERS_WORKSPACE_JJ_EXPORT_BINARY: process.env.SMITHERS_WORKSPACE_JJ_EXPORT_BINARY ?? "",
        SMITHERS_API_ORIGIN: `http://127.0.0.1:${server.port}`,
        SMITHERS_TOKEN: "tok_e2e",
        SMITHERS_REPO: "o/r"
      }
    })
    await tui.until((screen) => /↑\S+ ↓\S+/.test(screen), 20_000, "production startup")
    await tui.press("/smithers\r")
    await tui.until(() => seen.length === 1, 10_000, "Cloud read pending")
    expect(seen).toEqual([{ path: "/api/repos/o/r/mythical", authorization: "token tok_e2e" }])
    // Leave through the advertised key while HTTP is deliberately unresolved.
    await tui.until((screen) => screen.includes("esc Chat"), 5_000, "Cloud home focused")
    await tui.press(key.escape)
    await tui.type("keep project draft")
    await tui.until((screen) => /┃\s+keep project draft/.test(screen), 5_000, "chat usable before Cloud returns")
    finish(Response.json({
      repository: "o/r",
      state: "active",
      generation: 1,
      mainBehind: false,
      changes: [],
      items: [],
      lanes: [],
      limits: { maxParallel: 3 }
    }))
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(tui.screen()).toMatch(/┃\s+keep project draft/)
    await tui.press(key.ctrlC)
    await tui.press("!printf project-chat-usable\r")
    await tui.until(
      (screen) => screen.split("project-chat-usable").length >= 3,
      10_000,
      "chat shell after leaving Cloud home"
    )
    expect(seen).toHaveLength(1)
  } finally {
    finish(new Response("{}", { status: 503 }))
    await tui?.stop()
    server.stop(true)
    rmSync(root, { recursive: true, force: true })
  }
}, 60_000)
