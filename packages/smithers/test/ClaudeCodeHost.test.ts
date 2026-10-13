/**
 * Real native host, clean environment, the signed-in Claude Code as the flow's
 * seat, and the completion judge beside it.
 */
import { spawn, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const cli = fileURLToPath(new URL("../src/bin.ts", import.meta.url))
const seat = `claude-code:${process.env.SMITHERS_CLAUDE_CODE_SMOKE_MODEL ?? "sonnet"}`
const marker = "CLAUDE_CODE_OK"

/** A port the system chose, so this host collides with no other host test's fixed one. */
const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer().once("error", reject).listen(0, "127.0.0.1", () => {
      const address = server.address()
      server.close(() =>
        address !== null && typeof address === "object" ? resolve(address.port) : reject(new Error("no port"))
      )
    })
  })

interface Hosted {
  /** The exit status of `flow start`. */
  readonly status: number | null
  /** What `flow start --format json` printed. */
  readonly started: { readonly runId: string; readonly status?: string; readonly cause?: string }
  /** The run's row in each database. */
  readonly runs: ReadonlyArray<{ readonly database: string; readonly status: unknown; readonly finished: unknown }>
  /** The control journal's payloads of one event type. */
  readonly events: (type: string) => ReadonlyArray<any>
}

/**
 * Serves a fixture repository on the real host, starts its one flow through
 * the CLI, and reads what both databases hold.
 *
 * The child environment is an explicit allowlist. `HOME`, `PATH` and `USER`
 * are how Claude Code finds its own login: macOS files it in the Keychain
 * under `USER`. Nothing else of this process is inherited: no provider API
 * key, Codex login, proxy setting, `NODE_OPTIONS` or fixture preload, and none
 * of the `CLAUDECODE` and session variables of a Claude Code this suite runs
 * under. `judged` adds the completion judge's credential and nothing more.
 */
const hostFlow = async (judged: boolean): Promise<Hosted> => {
  const root = mkdtempSync(join(tmpdir(), "smithers-claude-code-host-test-"))
  const env: Record<string, string> = { CI: "1" }
  for (
    const key of [
      "HOME",
      "PATH",
      "USER",
      "CLAUDE_CONFIG_DIR",
      "SMITHERS_WORKSPACE_JJ_EXPORT_BINARY",
      ...(judged ? ["AI_GATEWAY_API_KEY"] : [])
    ]
  ) {
    if (process.env[key] !== undefined) env[key] = process.env[key]!
  }
  const git = (args: ReadonlyArray<string>) =>
    expect(spawnSync("git", args, { cwd: root, env }).status, `git ${args.join(" ")}`).toBe(0)
  try {
    git(["init", "--quiet"])
    mkdirSync(join(root, "flows", "hello"), { recursive: true })
    writeFileSync(
      join(root, "flows", "hello", "flow.mdx"),
      `---
description: Claude Code prompt proof.
model: ${seat}
capabilities: []
---
Reply with the exact text ${marker}. Do not run tools or modify files. This request is complete when your response contains that exact text.
`
    )
    git(["add", "."])
    git(["-c", "user.name=Proof", "-c", "user.email=proof@example.invalid", "commit", "-qm", "fixture"])
    const port = await freePort()
    const host = spawn(process.execPath, ["--no-warnings", cli, "serve", "--port", String(port)], {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    })
    const closed = new Promise<void>((resolve) => host.once("close", () => resolve()))
    try {
      host.stdout.resume()
      host.stderr.resume()
      let ready = false
      for (let attempt = 0; attempt < 240; attempt++) {
        if (host.exitCode !== null) throw new Error(`host exited: ${host.exitCode}`)
        try {
          ready = (await fetch(`http://127.0.0.1:${port}/health`)).ok
        } catch { /* still starting */ }
        if (ready) break
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      expect(ready).toBe(true)
    } finally {
      host.kill("SIGTERM")
      await closed
    }
    const result = spawnSync(process.execPath, ["--no-warnings", cli, "flow", "start", "hello", "--format", "json"], {
      cwd: root,
      env,
      encoding: "utf8",
      // Claude Code retries a connection it cannot open for minutes before it answers.
      timeout: 600_000
    })
    // A launch the host refused prints its reason and no run; one that outlived the timeout prints nothing.
    const started = JSON.parse(result.stdout || "{}")
    expect(started.runId, `${result.error ?? ""}${result.stdout}${result.stderr}`).toEqual(expect.any(String))
    const runs: Array<Hosted["runs"][number]> = []
    const journal: Array<{ readonly type: string; readonly payload: any }> = []
    for (const database of ["control.db", "engine.db"]) {
      const db = new DatabaseSync(join(root, ".flows", database), { readOnly: true })
      try {
        const row = db.prepare("SELECT status, finished_at_ms FROM flows_runs WHERE run_id = ?").get(started.runId)
        runs.push({ database, status: row?.status, finished: row?.finished_at_ms })
        if (database === "control.db") {
          for (const event of db.prepare("SELECT event_type, payload_json FROM flows_journal_events").all()) {
            journal.push({ type: String(event.event_type), payload: JSON.parse(String(event.payload_json)) })
          }
        }
      } finally {
        db.close()
      }
    }
    return {
      status: result.status,
      started,
      runs,
      events: (type) => journal.filter((event) => event.type === type).map((event) => event.payload)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

/** The seat, model and route of every model request the run made. */
const requests = (hosted: Hosted) =>
  hosted.events("control.agent.model-requested").map((event) => ({
    seat: event.seat,
    modelId: event.modelId,
    routeId: event.routeId,
    protocolId: event.protocolId
  }))

/** What the run left behind, printed so a real run's receipt outlives its fixture. */
const evidence = (hosted: Hosted) => ({
  runId: hosted.started.runId,
  exit: hosted.status,
  cause: hosted.started.cause,
  runs: hosted.runs,
  asked: requests(hosted)
})

const claims = (hosted: Hosted) =>
  hosted.events("control.agent.decision-settled").filter((event) => event.classifier === "completion/claim")

// Opt-in: each case spends a turn of the operator's Claude subscription, so
// neither runs by default.
describe.runIf(process.env.SMITHERS_CLAUDE_CODE_SMOKE === "1")("a flow on the installed Claude Code", () => {
  it("completes on the claude-code seat, its completion judged by Jev", { timeout: 900_000 }, async () => {
    // Jev judges every completion, and this host is given no other judge.
    expect(process.env.AI_GATEWAY_API_KEY, "export AI_GATEWAY_API_KEY: Jev judges the completion").toBeTruthy()
    const hosted = await hostFlow(true)
    const asked = requests(hosted)
    const [claim] = claims(hosted)
    process.stderr.write(
      `${JSON.stringify({ ...evidence(hosted), judgedBy: claim?.decidedBy, answers: claim?.answers })}\n`
    )

    expect(hosted.status, JSON.stringify(hosted.started)).toBe(0)
    for (const run of hosted.runs) {
      expect(run.status, run.database).toBe("completed")
      expect(run.finished, run.database).not.toBeNull()
    }
    expect(asked.length).toBeGreaterThan(0)
    for (const request of asked) {
      expect(request).toMatchObject({ seat, routeId: "claude-code", protocolId: "claude-code" })
    }
    expect(JSON.stringify(hosted.events("control.agent.resolved"))).toContain(marker)
    expect(claim).toMatchObject({
      decidedBy: "jev",
      answers: expect.arrayContaining([
        expect.objectContaining({ id: "complete", kind: "boolean", p: expect.any(Number) })
      ])
    })
    expect(claim.answers.find((answer: { id: string }) => answer.id === "complete").p).toBeGreaterThan(0.5)
  })

  it("fails closed, unjudged, where Claude Code is the host's only credential", { timeout: 900_000 }, async () => {
    const hosted = await hostFlow(false)
    const asked = requests(hosted)
    const unjudged = hosted.events("control.agent.decision-unjudged").map((event) => ({
      classifier: event.classifier,
      reason: event.reason
    }))
    const failures = hosted.events("control.run.failed")
    process.stderr.write(`${JSON.stringify({ ...evidence(hosted), unjudged })}\n`)

    // Claude answered on its own route, and nothing could judge the answer.
    expect(asked.length).toBeGreaterThan(0)
    for (const request of asked) {
      expect(request).toMatchObject({ seat, routeId: "claude-code", protocolId: "claude-code" })
    }
    expect(unjudged).toContainEqual(expect.objectContaining({ reason: "unconfigured" }))
    expect(claims(hosted)).toEqual([])
    // So the run fails, names the missing judge, and still quotes the answer.
    expect(hosted.status, JSON.stringify(hosted.started)).toBe(1)
    expect(hosted.started.status).toBe("failed")
    expect(hosted.started.cause).toContain("AI_GATEWAY_API_KEY is not set")
    for (const run of hosted.runs) expect(run.status, run.database).toBe("failed")
    expect(hosted.events("control.agent.resolved")).toEqual([])
    expect(failures).toHaveLength(1)
    expect(failures[0].cause).toContain("A completion no evaluator could judge (unconfigured)")
    expect(failures[0].cause).toContain(marker)
  })
})
