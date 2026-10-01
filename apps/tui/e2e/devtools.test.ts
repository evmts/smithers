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

for (const verdict of ["failed", "cancelled"] as const) {
  it(`inspects an authored ${verdict} flow before and after restart without executing it again`, async () => {
    const root = mkdtempSync(join(tmpdir(), "tui-devtools-status-"))
    const project = join(root, "project")
    const sessions = join(root, "sessions")
    const name = verdict === "failed" ? "refuse" : "wait"
    mkdirSync(join(project, "flows", name), { recursive: true })
    symlinkSync(resolve(import.meta.dir, "../node_modules"), join(project, "node_modules"))
    writeFileSync(
      join(project, "flows", name, "flow.ts"),
      verdict === "failed" ?
        `
import { Flow } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Schema } from "effect"
export default Flow.make("refuse", {
  description: "Fail a recorded flow", capabilities: [],
  effects: { reads: [], writes: [], mode: "expected", onConflict: "serialize", tier: "sealed" },
  payload: {}, success: Schema.String, error: Schema.String,
  body: () => Node.fail("inspection-failure")
})
` :
        `
import { Flow, WaitFor } from "@smthrs/flow"
import { Schema } from "effect"
export const layer = WaitFor.layer
export default Flow.make("wait", {
  description: "Wait for inspection", capabilities: [],
  effects: { reads: [], writes: [], mode: "expected", onConflict: "serialize", tier: "sealed" },
  payload: {}, success: Schema.Json, error: WaitFor.WaitForRequestInvalid,
  body: () => WaitFor.action.call({name:"inspection"})
})
`
    )
    const options = {
      cwd: project,
      rows: 65,
      cols: 110,
      command: `bun ${resolve(import.meta.dir, "../src/main.tsx")}`,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        SMITHERS_TUI_SESSION_DIR: sessions,
        SMITHERS_TUI_REPLAY: resolve(import.meta.dir, "../test/fixtures/pong.jsonl")
      }
    }
    let tui = await Tui.start(options)
    let db: Database | undefined
    const events = (kind: string) =>
      (db!.query("select payload_json from flows_journal_events where event_type=?").all(kind) as Array<
        { payload_json: string }
      >).map((row) => JSON.parse(row.payload_json) as { runId?: string; status?: string })
    const command = async (text: string, expected: string) => {
      await tui.type(text)
      await tui.press(key.enter)
      return tui.until((screen) => screen.includes(expected), 5_000, text)
    }
    try {
      await tui.until((screen) => /↑\S+ ↓\S+/.test(screen), 20_000, "first draw")
      await tui.type(`/flow ${name}`)
      await tui.press(key.enter)
      await tui.until(
        (screen) => screen.includes(`${verdict === "failed" ? "✗" : "⏸"} ${name}`),
        30_000,
        "authored flow receipt"
      )
      const folder = join(
        sessions,
        readdirSync(sessions, { withFileTypes: true }).find((entry) => entry.isDirectory())!.name
      )
      const file = join(folder, readdirSync(folder).find((entry) => entry.endsWith(".jsonl"))!)
      const saved = () => Session.load(file).filter((record) => record.type === "flow").at(-1)
      const initial = saved()
      if (initial?.type !== "flow" || initial.run.runId === undefined) throw new Error("Missing durable flow identity")
      const { id, runId } = initial.run
      db = new Database(join(project, ".flows/control.db"), { readonly: true })
      if (verdict === "cancelled") {
        await tui.until(
          () => events("control.run.parked").some((row) => row.runId === runId),
          5_000,
          "independent durable wait"
        )
        await command(`/devtools ${id} run:${runId}`, `run · run ${runId} · wait · parked`)
        await command("chat while waiting", "pong")
        await tui.until(
          () =>
            Session.load(file).some((record) =>
              record.type === "outcome" && record.prompt === "chat while waiting" && record.outcome._tag === "done"
            ),
          5_000,
          "durable Chat while parked"
        )
        await tui.click("⏸ wait")
        await tui.until((screen) => screen.includes("x Stop"), 5_000, "public Stop action")
        await tui.press("x")
        await tui.until((screen) => screen.includes("stopped") && !screen.includes("x Stop"), 15_000, "Stop settles")
        await tui.click("Chat")
        await tui.until((screen) => screen.includes("Ask Smithers"), 5_000, "Chat focus after Stop")
      }
      await tui.until(
        () => events(`control.run.${verdict}`).some((row) => row.runId === runId),
        5_000,
        "independent terminal verdict"
      )
      expect(events(`control.run.${verdict}`).filter((row) => row.runId === runId)).toHaveLength(1)
      expect(events("control.run.completed").some((row) => row.runId === runId)).toBe(false)
      if (verdict === "failed") {
        const recorded = db.query("select payload_json from flows_journal_events").all() as Array<
          { payload_json: string }
        >
        expect(recorded.some((row) => row.payload_json.includes("inspection-failure"))).toBe(true)
      }
      expect(saved()).toMatchObject({ type: "flow", run: { runId, status: verdict } })
      await command(`/devtools ${id} run:${runId}`, "#0 control.run.accepted")
      if (!tui.screen().includes(`run · run ${runId} · ${name} · ${verdict}`)) await tui.press("\x1b[5~")
      await tui.until(
        (screen) => screen.includes(`run · run ${runId} · ${name} · ${verdict}`),
        5_000,
        "selected terminal verdict"
      )
      await tui.press("\x1b[6~")
      await command(`/devtools ${id} invalid-status-node`, "Unknown node: invalid-status-node")
      await command(`chat after ${verdict}`, "pong")
      await tui.until(
        () =>
          Session.load(file).some((record) =>
            record.type === "outcome" && record.prompt === `chat after ${verdict}` && record.outcome._tag === "done"
          ),
        5_000,
        "durable Chat after verdict"
      )
      await tui.stop()
      tui = await Tui.start({ ...options, command: options.command + " --continue" })
      await tui.until((screen) => /↑\S+ ↓\S+/.test(screen), 20_000, "restored draw")
      await command(`/devtools ${id} invalid-restored-node`, "Unknown node: invalid-restored-node")
      await command(`/devtools ${id} run:${runId}`, "#0 control.run.accepted")
      if (!tui.screen().includes(`run · run ${runId} · ${name} · ${verdict}`)) await tui.press("\x1b[5~")
      await tui.until(
        (screen) => screen.includes(`run · run ${runId} · ${name} · ${verdict}`),
        5_000,
        "selected terminal verdict"
      )
      await tui.press("\x1b[6~")
      expect(events("control.run.accepted").filter((row) => row.runId === runId)).toHaveLength(1)
      expect(events(`control.run.${verdict}`).filter((row) => row.runId === runId)).toHaveLength(1)
      expect(events("control.run.accepted")).toHaveLength(1)
    } finally {
      db?.close()
      await tui.stop()
      rmSync(root, { recursive: true, force: true })
    }
  }, 90_000)
}

for (const result of ["success", "failure"] as const) {
  it(
    `inspects an actually executed agent call's ${result} and restores it without replaying the call`,
    async () => {
      const root = mkdtempSync(join(tmpdir(), "tui-devtools-agent-"))
      const sessions = join(root, "sessions")
      if (result === "success") writeFileSync(join(root, "receipt.txt"), "independent-agent-readback")
      const replay = join(root, "turn.jsonl")
      const cells = [
        "const read = await ctx.call(\"read\", {path:\"receipt.txt\"}); console.log(read.content)",
        "ctx.done(\"inspection-complete\")"
      ]
      writeFileSync(
        replay,
        cells.flatMap((cell) => [
          { at: 0, event: { _tag: "model-requested" } },
          { at: 0, event: { _tag: "model-delta", delta: { type: "text-start", id: "cell" } } },
          {
            at: 0,
            event: {
              _tag: "model-delta",
              delta: { type: "text-delta", id: "cell", text: `\`\`\`cell\n${cell}\n\`\`\`` }
            }
          },
          { at: 0, event: { _tag: "model-delta", delta: { type: "text-end", id: "cell" } } },
          { at: 0, event: { _tag: "model-settled", message: { stopReason: "stop" } } }
        ]).map((record) => JSON.stringify(record)).join("\n")
      )
      const options = {
        cwd: root,
        cols: 110,
        rows: 65,
        command: `bun ${resolve(import.meta.dir, "../src/main.tsx")}`,
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
          SMITHERS_TUI_SESSION_DIR: sessions,
          SMITHERS_TUI_REPLAY: replay
        }
      }
      let tui = await Tui.start(options)
      try {
        await tui.until((screen) => /↑\S+ ↓\S+/.test(screen), 20_000, "first draw")
        await tui.type("read the receipt")
        await tui.press(key.enter)
        const folder = () =>
          join(sessions, readdirSync(sessions, { withFileTypes: true }).find((entry) => entry.isDirectory())!.name)
        const file = () => join(folder(), readdirSync(folder()).find((entry) => entry.endsWith(".jsonl"))!)
        const records = () => Session.load(file())
        await tui.until(
          () =>
            records().some((record) =>
              record.type === "outcome" && record.prompt === "read the receipt" && record.outcome._tag === "done" &&
              record.outcome.answer === "inspection-complete"
            ),
          30_000,
          "actual agent completion"
        )
        const calls = () =>
          records().filter((record) => record.type === "event" && record.event._tag === "cell-call-settled")
        expect(calls()).toHaveLength(1)
        expect(JSON.stringify(calls())).toContain(result === "success" ? "independent-agent-readback" : "failure")
        await tui.type("/devtools call-1")
        await tui.press(key.enter)
        const inspected = await tui.until(
          (screen) =>
            screen.includes("Input") &&
            (result === "success"
              ? screen.includes("Output") && screen.includes("independent-agent-readback")
              : screen.includes("Failure")),
          5_000,
          "selected actual agent call"
        )
        expect(inspected).toContain("receipt.txt")
        expect(inspected).toContain(result === "success" ? "completed" : "failed")
        await tui.type("/devtools absent-agent-node")
        await tui.press(key.enter)
        await tui.until(
          (screen) => screen.includes("Unknown tab: absent-agent-node"),
          5_000,
          "unknown own node refusal"
        )
        await tui.stop()
        tui = await Tui.start({ ...options, command: options.command + " --continue" })
        await tui.until((screen) => /↑\S+ ↓\S+/.test(screen), 20_000, "restored own run")
        await tui.type("/devtools call-1")
        await tui.press(key.enter)
        await tui.until(
          (screen) =>
            screen.includes("Input") &&
            (result === "success"
              ? screen.includes("Output") && screen.includes("independent-agent-readback")
              : screen.includes("Failure")),
          5_000,
          "restored selected agent call"
        )
        expect(calls()).toHaveLength(1)
        expect(records().filter((record) => record.type === "outcome")).toHaveLength(1)
        await tui.type("unsubmitted draft after inspection")
        await tui.until(
          (screen) => screen.includes("unsubmitted draft after inspection"),
          5_000,
          "composer remains usable"
        )
        expect(calls()).toHaveLength(1)
      } finally {
        await tui.stop()
        rmSync(root, { recursive: true, force: true })
      }
    },
    60_000
  )
}
