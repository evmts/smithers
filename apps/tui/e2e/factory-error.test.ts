/** Factory failure presentation through the production terminal and real HTTP. */
import { expect, it } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { key, Tui } from "./tmux.ts"

it(
  "keeps Chat usable during TODO filing and retries only uncertain requests without showing transport errors",
  async () => {
    const root = mkdtempSync(join(tmpdir(), "tui-factory-error-"))
    const app = resolve(import.meta.dir, "..")
    const responses: Array<(response: Response) => void> = []
    const requests: Array<{ title: string; request: string }> = []
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      async fetch(request) {
        if (new URL(request.url).pathname !== "/api/repos/o/r/mythical/todos") {
          return new Response("{}", { status: 404 })
        }
        expect(request.headers.get("authorization")).toBe("token tok_e2e")
        requests.push(await request.json() as { title: string; request: string })
        return new Promise<Response>((resolve) => responses.push(resolve))
      }
    })
    let tui: Tui | undefined
    try {
      tui = await Tui.start({
        cwd: root,
        cols: 110,
        rows: 30,
        command: `bun ${join(app, "src/main.tsx")} ${root}`,
        env: {
          PATH: process.env.PATH ?? "",
          HOME: root,
          XDG_CONFIG_HOME: root,
          SMITHERS_TUI_REPLAY: join(app, "test/fixtures/fix-add.jsonl"),
          SMITHERS_TUI_SESSION_DIR: join(root, "sessions"),
          SMITHERS_REPO: "o/r",
          SMITHERS_API_ORIGIN: `http://127.0.0.1:${server.port}`,
          SMITHERS_TOKEN: "tok_e2e",
          SMITHERS_WORKSPACE_JJ_EXPORT_BINARY: process.env.SMITHERS_WORKSPACE_JJ_EXPORT_BINARY ?? ""
        }
      })
      await tui.until((screen) => /↑\S+ ↓\S+/.test(screen), 20_000, "startup")
      await tui.press("/todo Repair widgets\r")
      await tui.until((screen) => screen.includes("TODO requested") && requests.length === 1, 5_000, "filing pending")
      await tui.press("/todo Repair widgets\r")
      await tui.type("draft during pending filing")
      await tui.until((screen) => /┃\s+draft during pending filing/.test(screen), 5_000, "composer usable")
      expect(requests).toHaveLength(1)
      responses.shift()!(new Response("factory-regression-response-marker", { status: 503 }))
      await tui.until(
        (screen) =>
          screen.includes("TODO not filed.") && screen.includes("Details: /conversation") &&
          screen.includes("/todo retries."),
        5_000,
        "uncertain failure"
      )
      expect(tui.screen()).not.toContain("HTTP 503")
      expect(tui.screen()).not.toContain("mythical/todos")
      expect(tui.screen()).toMatch(/┃\s+draft during pending filing/)
      expect(readFileSync(join(root, "sessions/tui.log"), "utf8")).toContain("HTTP 503")
      await tui.press(key.ctrlC)
      await tui.press("/todo Repair widgets\r")
      await tui.until(() => requests.length === 2, 5_000, "same request retried")
      expect(requests[1]).toEqual(requests[0])
      responses.shift()!(new Response("refused", { status: 403 }))
      await tui.until(
        (screen) =>
          screen.includes("TODO not filed.") && screen.includes("Details: /conversation") &&
          !screen.includes("/todo retries."),
        5_000,
        "final refusal"
      )
      expect(tui.screen()).not.toContain("HTTP 403")
      await tui.press("/todo Repair widgets\r")
      await tui.until(() => requests.length === 3, 5_000, "fresh filing after refusal")
      expect(requests[2]!.request).not.toBe(requests[1]!.request)
      responses.shift()!(new Response("{}", { status: 500 }))
      await tui.until(
        (screen) =>
          screen.includes("TODO not filed.") && screen.includes("Details: /conversation") &&
          screen.includes("/todo retries."),
        5_000,
        "final uncertain failure"
      )
      await tui.press("/todo Repair widgets\r")
      await tui.until(() => requests.length === 4, 5_000, "recover uncertain filing")
      expect(requests[3]).toEqual(requests[2])
      responses.shift()!(
        Response.json({
          id: "41",
          state: "queued",
          attempt: 1,
          runs: {},
          dependsOn: [],
          updatedAt: "2026-09-30T13:00:00Z",
          issue: { number: 41, title: "Repair widgets", url: "https://github.com/o/r/issues/41" }
        })
      )
      await tui.until(
        (screen) => screen.includes("TODO #41 queued") && !screen.includes("TODO not filed."),
        5_000,
        "accepted recovery receipt"
      )
    } finally {
      for (const finish of responses) finish(new Response("{}", { status: 503 }))
      await tui?.stop()
      server.stop(true)
      rmSync(root, { recursive: true, force: true })
    }
  },
  60_000
)
