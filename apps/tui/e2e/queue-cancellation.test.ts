/** Rapid follow-ups preserve admission order, unfinished drafts and durable cancellation. */
import { expect, it } from "bun:test"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import * as Session from "../src/session.ts"
import { key, Tui } from "./tmux.ts"

const app = resolve(import.meta.dir, "..")
const drawn = (screen: string) => /↑\S+ ↓\S+/.test(screen)

for (const action of ["cancel", "restore"] as const) {
  it(`${action} preserves burst follow-ups ahead of an unfinished draft and records each removal once`, async () => {
    const root = mkdtempSync(join(tmpdir(), "tui-queue-cancel-"))
    const sessions = join(root, "sessions")
    let tui: Tui | undefined
    try {
      tui = await Tui.start({
        cwd: root,
        rows: 40,
        command: `bun ${join(app, "src/main.tsx")} ${root}`,
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
          SMITHERS_WORKSPACE_JJ_EXPORT_BINARY: process.env.SMITHERS_WORKSPACE_JJ_EXPORT_BINARY ?? "",
          SMITHERS_TUI_REPLAY: join(app, "test/fixtures/fix-add.jsonl"),
          SMITHERS_TUI_REPLAY_HOLD_MS: "60000",
          SMITHERS_TUI_SESSION_DIR: sessions
        }
      })
      await tui.until(drawn, 20_000, "production startup")
      await tui.press("slow original request\r")
      await tui.until((screen) => screen.includes("alt+enter to queue"), 10_000, "running turn")
      // All admissions and the draft arrive before a renderer update can intervene.
      await tui.press("first follow-up\x1b\rsecond follow-up\x1b\runfinished draft")
      await tui.until(
        (screen) => screen.includes("Follow-up: second follow-up") && /┃\s+unfinished draft/.test(screen),
        5_000,
        "burst admitted"
      )
      const files = readdirSync(sessions, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      expect(files).toHaveLength(1)
      const file = join(files[0]!.parentPath, files[0]!.name)
      const records = () => Session.load(file)
      expect(Session.restore(records()).queued.map((prompt) => prompt.text)).toEqual([
        "first follow-up",
        "second follow-up"
      ])

      await tui.press(action === "cancel" ? key.escape : "\x1b[1;3A")
      const restored = await tui.until(
        (screen) => screen.includes("Restored 2 queued messages"),
        5_000,
        "restore notification"
      )
      const editor = restored.split("\n").filter((line) => /^\s*┃/.test(line)).join("\n")
      expect(editor).toContain("first follow-up")
      expect(editor).toContain("second follow-up")
      expect(editor).toContain("unfinished draft")
      expect(editor.indexOf("first follow-up")).toBeLessThan(editor.indexOf("second follow-up"))
      expect(editor.indexOf("second follow-up")).toBeLessThan(editor.indexOf("unfinished draft"))
      expect(restored).not.toContain("Follow-up:")
      expect(Session.restore(records()).queued).toEqual([])
      const admissions = records().filter((record) => record.type === "queued")
      const removals = records().filter((record) => record.type === "dequeued")
      expect(removals.map((record) => record.type === "dequeued" && record.reason)).toEqual(["restored", "restored"])
      expect(removals.map((record) => record.type === "dequeued" && record.id))
        .toEqual(admissions.map((record) => record.type === "queued" && record.prompt.id))

      if (action === "restore") {
        expect(restored).toContain("esc Interrupt")
        await tui.press(key.escape)
      }
      await tui.until(
        (screen) => screen.includes("Stopped") && !screen.includes("esc Interrupt"),
        10_000,
        "cancel settled"
      )
      expect(records().filter((record) => record.type === "outcome" && record.outcome._tag === "cancelled"))
        .toHaveLength(1)
      expect(records().filter((record) => record.type === "user")).toHaveLength(1)
      await tui.press(key.ctrlC)
      await tui.press("!printf recovered > recovered.txt\r")
      await tui.until(() => existsSync(join(root, "recovered.txt")), 10_000, "shell after cancellation")
      expect(readFileSync(join(root, "recovered.txt"), "utf8")).toBe("recovered")
      expect(records().filter((record) => record.type === "dequeued")).toHaveLength(2)
    } finally {
      await tui?.stop()
      rmSync(root, { recursive: true, force: true })
    }
  }, 60_000)
}
