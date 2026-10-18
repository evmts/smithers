/**
 * Real native host, clean environment, and the Codex subscription as the
 * flow's seat. With no gateway key the host selects GPT-6 Luna on the same
 * subscription as its judge; a flow that arms no claim judge (#3993) is not
 * read by it, so the run completes on the seat alone.
 * `SubscriptionJudgeCalibration.test.ts` gates that judge's readings.
 */
import { spawn, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"

it.skipIf(process.env.SMITHERS_LIVE_MODEL_TESTS !== "1")(
  "runs a prompt on the Codex subscription with no provider keys",
  { timeout: 900_000 },
  async () => {
    const root = mkdtempSync(join(tmpdir(), "smithers-subscription-test-"))
    const cli = fileURLToPath(new URL("../src/bin.ts", import.meta.url))
    // Explicit allowlist: no API keys, proxy settings, NODE_OPTIONS or fixture preload.
    const env: Record<string, string> = { CI: "1", SMITHERS_OPENAI_AUTH: "chatgpt" }
    for (const key of ["HOME", "PATH", "CODEX_HOME", "SMITHERS_WORKSPACE_JJ_EXPORT_BINARY"]) {
      if (process.env[key] !== undefined) env[key] = process.env[key]!
    }
    const run = (args: string[]) =>
      spawnSync(process.execPath, ["--no-warnings", cli, ...args], {
        cwd: root,
        env,
        encoding: "utf8",
        timeout: 600_000
      })
    try {
      expect(spawnSync("git", ["init", "--quiet"], { cwd: root, env }).status).toBe(0)
      mkdirSync(join(root, ".smithers", "flows", "hello"), { recursive: true })
      writeFileSync(
        join(root, ".smithers", "flows", "hello", "flow.mdx"),
        `---
description: Subscription prompt proof.
model: openai:gpt-6.1-sol
capabilities: []
---
Reply with the exact text SUBSCRIPTION_OK. Do not run tools or modify files. This request is complete when your response contains that exact text.
`
      )
      expect(spawnSync("git", ["add", "."], { cwd: root, env }).status).toBe(0)
      expect(
        spawnSync("git", [
          "-c",
          "user.name=Proof",
          "-c",
          "user.email=proof@example.invalid",
          "commit",
          "-qm",
          "fixture"
        ], { cwd: root, env }).status
      ).toBe(0)
      const host = spawn(process.execPath, ["--no-warnings", cli, "serve", "--port", "5310"], {
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
            ready = (await fetch("http://127.0.0.1:5310/health")).ok
          } catch { /* still starting */ }
          if (ready) break
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
        expect(ready).toBe(true)
      } finally {
        host.kill("SIGTERM")
        await closed
      }
      const result = run(["flow", "start", "hello", "--format", "json"])
      expect(result.status, result.stdout + result.stderr).toBe(0)
      const runId = JSON.parse(result.stdout).runId
      for (const name of ["control.db", "engine.db"]) {
        const db = new DatabaseSync(join(root, ".flows", name), { readOnly: true })
        try {
          const row = db.prepare("SELECT status, finished_at_ms FROM flows_runs WHERE run_id = ?").get(runId)
          expect(row?.status, name).toBe("completed")
          expect(row?.finished_at_ms).not.toBeNull()
          if (name === "control.db") {
            const payloads = (type: string) =>
              db.prepare("SELECT payload_json FROM flows_journal_events WHERE event_type = ?").all(type).map((event) =>
                JSON.parse(String(event.payload_json))
              )
            expect(payloads("control.agent.model-requested").some((event) => event.modelId === "gpt-6.1-sol")).toBe(
              true
            )
            expect(JSON.stringify(payloads("control.agent.resolved"))).toContain("SUBSCRIPTION_OK")
            // What the run left behind, printed so a real run's receipt outlives its fixture.
            process.stderr.write(`${JSON.stringify({ runId })}\n`)
            // The flow armed no claim judge, so no model read its completion (#3993).
            expect(payloads("control.agent.claim-demanded")).toEqual([])
            expect(
              payloads("control.agent.decision-settled").filter((event) => event.classifier === "completion/claim")
            ).toEqual([])
          }
        } finally {
          db.close()
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
)
