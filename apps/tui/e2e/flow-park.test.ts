/** A real attended flow parks, stays visible, leaves chat usable, and stops. */
import { Database } from "bun:sqlite"
import { expect, it } from "bun:test"
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { key, Tui } from "./tmux.ts"

const app = resolve(import.meta.dir, "..")
const retainFailure = async (root: string, tui: Tui | undefined) => {
  if (process.env.TUI_PARK_EVIDENCE_DIR === undefined) return
  const saved = join(process.env.TUI_PARK_EVIDENCE_DIR, String(Date.now()))
  mkdirSync(saved, { recursive: true })
  writeFileSync(join(saved, "screen.txt"), tui?.screen() ?? "No terminal")
  await tui?.stop()
  cpSync(root, join(saved, "state"), { recursive: true })
}
it("parks a canonical file flow and completes its durable wait through a public signal", async () => {
  const root = mkdtempSync(join(tmpdir(), "tui-file-park-"))
  const project = join(root, "project")
  mkdirSync(join(project, "flows/ask"), { recursive: true })
  symlinkSync(resolve(app, "../../node_modules"), join(project, "node_modules"))
  writeFileSync(
    join(project, "flows/ask/flow.ts"),
    `
import { Flow, WaitFor } from "@smthrs/flow"
import { Schema } from "effect"
export const layer = WaitFor.layer
export default Flow.make("ask", {
  description: "Wait for branch", capabilities: [],
  effects: { reads: [], writes: [], mode: "expected", onConflict: "serialize", tier: "sealed" },
  payload: {}, success: Schema.Json, error: WaitFor.WaitForRequestInvalid,
  body: () => WaitFor.action.call({name: "branch"})
})
`
  )
  let tui: Tui | undefined
  try {
    tui = await Tui.start({
      cwd: project,
      command: `bun ${join(app, "e2e/real-flows-fixture.tsx")}`,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        SMITHERS_TUI_SESSION_DIR: join(root, "sessions")
      }
    })
    await tui.until((screen) => /↑\S+ ↓\S+/.test(screen), 20_000, "first draw")
    await tui.type("/flow ask")
    await tui.press(key.enter)
    await tui.until((screen) => screen.includes("⏸ ask"), 30_000, "paused file flow")
    expect(tui.screen()).not.toContain("ask · running")
    const db = new Database(join(project, ".flows/control.db"), { readonly: true })
    let runId: string | undefined
    try {
      await tui.until(
        () => {
          const rows = db.query("select payload_json from flows_journal_events where event_type = 'control.run.parked'")
            .all() as Array<{ payload_json: string }>
          for (const row of rows) runId = JSON.parse(row.payload_json).runId
          return runId !== undefined
        },
        5_000,
        "durable park receipt"
      )
      expect(runId).toBeDefined()
    } finally {
      db.close()
    }
    await tui.type("still usable")
    await tui.press(key.enter)
    await tui.until((screen) => screen.includes("Still here."), 10_000, "chat while parked")
    const script = `
import * as BunControl from "@smthrs/cli/BunControl";
import { Control } from "@smthrs/control";
import { Effect, ManagedRuntime } from "effect";
const runtime = ManagedRuntime.make(BunControl.layerControl({root:process.argv[1], startsRuns:false}));
try { console.log("signal-receipt:" + JSON.stringify(await runtime.runPromise(Effect.flatMap(Control.Control, c => { return c.signal({runId:process.argv[2],signal:{name:"branch",payload:"feature"},idempotencyKey:"branch-answer"}); })))); }
finally { await runtime.dispose(); }
`
    const child = Bun.spawn([process.execPath, "-e", script, project, runId!], {
      cwd: app,
      env: process.env,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10_000
    })
    const [stdout, stderr, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited
    ])
    expect({ exit, stderr }).toEqual({ exit: 0, stderr: "" })
    const receipts = stdout.split("\n").filter((line) => line.startsWith("signal-receipt:"))
    expect(receipts).toHaveLength(1)
    expect(JSON.parse(receipts[0]!.slice("signal-receipt:".length))).toMatchObject({ _tag: "Accepted", runId })
    await tui.until((screen) => /✓ ask.*feature/.test(screen), 15_000, "durable signal completion")
    expect(tui.screen()).not.toContain("⏸ ask")
    const committed = new Database(join(project, ".flows/control.db"), { readonly: true })
    try {
      const completions = () =>
        committed.query(
          "select payload_json from flows_journal_events where event_type = 'control.run.completed'"
        ).all() as Array<{ payload_json: string }>
      await tui.until(
        () => completions().some((row) => JSON.parse(row.payload_json).runId === runId),
        5_000,
        "independent committed completion"
      )
      expect(completions().some((row) => JSON.parse(row.payload_json).runId === runId)).toBe(true)
      if (process.env.TUI_PARK_EVIDENCE_DIR !== undefined) {
        mkdirSync(process.env.TUI_PARK_EVIDENCE_DIR, { recursive: true })
        writeFileSync(
          join(process.env.TUI_PARK_EVIDENCE_DIR, "public-signal.json"),
          JSON.stringify({ stdout, stderr, exit, runId, completions: completions() }, null, 2) + "\n"
        )
      }
    } finally {
      committed.close()
    }
    await tui.type("/flow ask")
    await tui.press(key.enter)
    await tui.until((screen) => screen.includes("⏸ ask"), 30_000, "second durable wait")
    const stoppedStore = new Database(join(project, ".flows/control.db"), { readonly: true })
    try {
      let secondRunId: string | undefined
      const recorded = (kind: string) =>
        (stoppedStore.query(
          "select payload_json from flows_journal_events where event_type = ?"
        ).all(kind) as Array<{ payload_json: string }>).map((row) => JSON.parse(row.payload_json))
      await tui.until(
        () => {
          secondRunId = recorded("control.run.parked").find((event) => event.runId !== runId)?.runId
          return secondRunId !== undefined
        },
        5_000,
        "second committed park identity"
      )
      expect(secondRunId).not.toBe(runId)
      await tui.click("⏸ ask")
      await tui.until((screen) => screen.includes("x Stop"), 5_000, "parked stop action")
      await tui.press("x")
      await tui.until(
        (screen) => screen.includes("stopped") && !screen.includes("x Stop"),
        15_000,
        "cancelled wait receipt"
      )
      await tui.until(
        () =>
          recorded("control.run.cancelled").some((event) =>
            event.runId === secondRunId && event.status === "cancelled"
          ),
        5_000,
        "independent committed cancellation"
      )
      expect(
        recorded("control.run.cancelled").some((event) => event.runId === secondRunId && event.status === "cancelled")
      ).toBe(true)
      expect(tui.screen()).toContain("r Resume")
      await tui.press("r")
      await tui.until(
        (screen) => screen.includes("⏸ ask") && screen.includes("x Stop"),
        30_000,
        "resumed file flow waits again"
      )
      let recoveredRunId: string | undefined
      await tui.until(
        () => {
          recoveredRunId = recorded("control.run.parked").find((event) =>
            event.runId !== runId && event.runId !== secondRunId
          )?.runId
          return recoveredRunId !== undefined
        },
        5_000,
        "recovery has its own durable run"
      )
      expect(recoveredRunId).not.toBe(secondRunId)
      await tui.press("x")
      await tui.until(
        () =>
          recorded("control.run.cancelled").some((event) =>
            event.runId === recoveredRunId && event.status === "cancelled"
          ),
        15_000,
        "recovered run can stop durably"
      )
      if (process.env.TUI_PARK_EVIDENCE_DIR !== undefined) {
        writeFileSync(
          join(process.env.TUI_PARK_EVIDENCE_DIR, "durable-cancellations.json"),
          JSON.stringify(
            { firstRunId: runId, secondRunId, recoveredRunId, cancelled: recorded("control.run.cancelled") },
            null,
            2
          ) + "\n"
        )
      }
    } finally {
      stoppedStore.close()
    }
    expect(tui.screen()).not.toContain("ask · running")
  } catch (error) {
    await retainFailure(root, tui)
    throw error
  } finally {
    await tui?.stop()
    rmSync(root, { recursive: true, force: true })
  }
}, 90_000)

it("answers an actual custom agent's ask while coordinator Chat remains usable", async () => {
  const root = mkdtempSync(join(tmpdir(), "tui-agent-ask-"))
  mkdirSync(join(root, "flows/ask"), { recursive: true })
  writeFileSync(
    join(root, "flows/ask/flow.mdx"),
    "---\ndescription: Ask a question\nmodel: openai:gpt-6-sol\n---\nAsk which branch to use.\n"
  )
  let tui: Tui | undefined
  try {
    tui = await Tui.start({
      cwd: root,
      command: `bun ${join(app, "e2e/real-flows-fixture.tsx")}`,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        SMITHERS_TUI_SESSION_DIR: join(root, "sessions"),
        TUI_FLOW_CELL:
          "const reply = await ctx.call(\"ask\", {question:\"Which branch?\",options:[\"main\",\"feature\"]}); ctx.done(\"Using: \" + reply.answer)"
      }
    })
    await tui.until((screen) => /↑\S+ ↓\S+/.test(screen), 20_000, "first draw")
    await tui.type("/flow ask")
    await tui.press(key.enter)
    await tui.until((screen) => screen.includes("Which branch?"), 30_000, "actual agent question")
    await tui.type("still usable")
    await tui.press(key.enter)
    await tui.until((screen) => screen.includes("Still here."), 10_000, "chat while agent waits")
    await tui.press(key.ctrlS)
    await tui.until((screen) => screen.includes("Needs you 1"), 5_000, "needs you")
    await tui.press("a")
    await tui.until((screen) => /Answer\s+main/.test(screen), 5_000, "answer form")
    await tui.press("\x1b[C")
    await tui.press(key.enter)
    await tui.until((screen) => screen.includes("Done 1") && !screen.includes("Needs you"), 5_000, "answered")
    await tui.press(" ")
    await tui.until((screen) => screen.includes("Using: feature"), 5_000, "actual agent received answer")
  } catch (error) {
    await retainFailure(root, tui)
    throw error
  } finally {
    await tui?.stop()
    rmSync(root, { recursive: true, force: true })
  }
}, 90_000)
