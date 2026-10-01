/** Public inspection executes a canonical file flow and reads its durable journal. */
import { Database } from "bun:sqlite"
import { expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import * as Session from "../src/session.ts"
import { key, Tui } from "./tmux.ts"

for (const cols of [110, 80]) {
  it(`inspects a canonical file flow through /devtools and keeps Chat usable at ${cols} columns`, async () => {
    const root = mkdtempSync(join(tmpdir(), "tui-devtools-"))
    const project = join(root, "project")
    const sessions = join(root, "sessions")
    mkdirSync(join(project, "flows/echo"), { recursive: true })
    symlinkSync(resolve(import.meta.dir, "../node_modules"), join(project, "node_modules"))
    writeFileSync(
      join(project, "flows/echo/flow.ts"),
      `
import { Flow } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Schema } from "effect"
export default Flow.make("echo", {
  description: "Echo a recorded input", capabilities: [],
  effects: { reads: [], writes: [], mode: "expected", onConflict: "serialize", tier: "sealed" },
  payload: { message: Schema.String }, success: Schema.String,
  body: ({message}) => Node.succeed("recorded-output:" + message)
})
`
    )

    const options = {
      cwd: project,
      cols,
      rows: 50,
      command: `bun ${resolve(import.meta.dir, "../src/main.tsx")}`,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        SMITHERS_TUI_SESSION_DIR: sessions,
        SMITHERS_TUI_REPLAY: resolve(import.meta.dir, "../test/fixtures/pong.jsonl")
      }
    }
    let tui = await Tui.start(options)
    const command = async (text: string, expected: string) => {
      await tui.type(text)
      await tui.press(key.enter)
      return tui.until((screen) => screen.includes(expected), 5_000, text)
    }
    try {
      await tui.until((screen) => /↑\S+ ↓\S+/.test(screen), 20_000, "first draw")
      await command("/devtools", "No run yet")
      await command("/devtools missing", "Unknown tab: missing")
      await command("/devtools one two three", "Usage: /devtools [id] [node]")
      await tui.type("/flow echo {\"message\":\"inspection-input\"}")
      await tui.press(key.enter)
      await tui.until(
        (screen) => screen.includes("✓ echo") && screen.includes("recorded-output:inspection-input"),
        30_000,
        "real flow completion"
      )
      const folders = readdirSync(sessions, { withFileTypes: true }).filter((entry) => entry.isDirectory())
      expect(folders).toHaveLength(1)
      const folder = join(sessions, folders[0]!.name)
      const file = readdirSync(folder).find((entry) => entry.endsWith(".jsonl"))!
      const flow = Session.load(join(folder, file)).filter((record) => record.type === "flow").at(-1)
      expect(flow?.type).toBe("flow")
      if (flow?.type !== "flow") throw new Error("Missing durable flow record")
      expect(flow.run.status).toBe("done")
      expect(flow.run.answer).toContain("recorded-output:inspection-input")
      await command(`/devtools ${flow.run.id}`, "completed")
      await command(`/devtools ${flow.run.id} absent-node`, "Unknown node: absent-node")
      await tui.type(`/devtools ${flow.run.id} run:${flow.run.runId}`)
      await tui.press(key.enter)
      await tui.until(
        (screen) => screen.includes("Frames") && !screen.includes("Unknown node: absent-node"),
        5_000,
        "selected run journal"
      )
      if (!tui.screen().includes(`run · run ${flow.run.runId} · echo · completed`)) await tui.press("\x1b[5~")
      const inspected = await tui.until(
        (screen) => screen.includes(`run · run ${flow.run.runId} · echo · completed`),
        5_000,
        "scroll to selected run status"
      )
      expect(inspected).toContain("Ask Smithers")
      await tui.press("\x1b[6~")
      const db = new Database(join(project, ".flows/control.db"), { readonly: true })
      try {
        const recorded = db.query("select payload_json from flows_journal_events").all() as Array<
          { payload_json: string }
        >
        expect(recorded.some((row) => row.payload_json.includes("inspection-input"))).toBe(true)
        expect(recorded.some((row) => row.payload_json.includes("recorded-output:inspection-input"))).toBe(true)
        const completed = db.query(
          "select payload_json from flows_journal_events where event_type='control.run.completed'"
        ).all() as Array<{ payload_json: string }>
        expect(completed.some((row) => JSON.parse(row.payload_json).runId === flow.run.runId)).toBe(true)
      } finally {
        db.close()
      }
      await command(`/devtools ${flow.run.id} absent-node`, "Unknown node: absent-node")
      await command("still usable", "pong")
      await command("/devtools", "run terminal")
      expect(tui.screen()).not.toContain("Unknown tab: terminal")
      await tui.stop()
      tui = await Tui.start({ ...options, command: options.command + " --continue" })
      await tui.until((screen) => screen.includes("✓ echo") && /↑\S+ ↓\S+/.test(screen), 20_000, "restored flow tab")
      await command(`/devtools ${flow.run.id} absent-after-restart`, "Unknown node: absent-after-restart")
      await tui.type(`/devtools ${flow.run.id} run:${flow.run.runId}`)
      await tui.press(key.enter)
      await tui.until(
        (screen) =>
          screen.includes("#0 control.run.accepted") && !screen.includes("Unknown node: absent-after-restart"),
        5_000,
        "restored journal hydration"
      )
      const reopened = new Database(join(project, ".flows/control.db"), { readonly: true })
      try {
        const completed = reopened.query(
          "select payload_json from flows_journal_events where event_type='control.run.completed'"
        ).all() as Array<{ payload_json: string }>
        expect(completed.filter((row) => JSON.parse(row.payload_json).runId === flow.run.runId)).toHaveLength(1)
      } finally {
        reopened.close()
      }
      await command("after restart", "pong")
      await tui.until(
        () =>
          Session.load(join(folder, file)).some((record) =>
            record.type === "outcome" && record.prompt === "after restart" && record.outcome._tag === "done" &&
            record.outcome.answer === "pong"
          ),
        5_000,
        "durable Chat completion after inspection"
      )
    } finally {
      await tui.stop()
      rmSync(root, { recursive: true, force: true })
    }
  }, 60_000)
}
