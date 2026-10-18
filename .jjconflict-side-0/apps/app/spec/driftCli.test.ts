import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

test("drift CLI writes an atomic feed and detects a regression in the next cycle", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "spec-drift-"))
  const run = (mode: string, ok: boolean) => ({ journey: "default/test", mode, revision: "r", startedAt: "2026-10-18T10:00:00Z", state: "stale", steps: [{ caption: "Read", spec: "D1", status: ok ? "passed" : "failed", assertions: [{ kind: "see", ok, expected: true, actual: ok }], screenshot: "1.png", ms: 1 }] })
  try {
    await writeFile(resolve(root, "manifest.json"), JSON.stringify({ journeys: [{ id: "default/test" }], ahead: {}, builtAt: "2026-10-18T09:48:00Z", now: Date.parse("2026-10-18T10:00:00Z"), aheadMaxDays: 14, productionCapabilities: [], capabilities: ["cloud"], captures: [
      { schema: "FileCard", response: {} },
      { schema: "GET /api/bootstrap", response: { apiVersion: 1, host: "cloud", version: "v", buildSha: "r", capabilities: [], authFlow: "none", sandbox: null, unexpected: "do-not-copy" } }
    ] }))
    const cycle = async (ok: boolean) => {
      await writeFile(resolve(root, "runs.json"), JSON.stringify([run("mock", true), run("live", ok)]))
      const child = Bun.spawn([process.execPath, resolve(import.meta.dirname, "driftCli.ts"), resolve(root, "manifest.json"), root, resolve(root, "runs.json")], { stdout: "pipe", stderr: "pipe" })
      const stderr = await new Response(child.stderr).text()
      expect(await child.exited, stderr).toBe(0)
      return JSON.parse(await readFile(resolve(root, "drift.json"), "utf8"))
    }
    const first = await cycle(true)
    expect(first.rows[0].state).toBe("shipped")
    expect(first.capability).toEqual([{ capability: "cloud", state: "drift", reason: "No open owning issue" }])
    expect(first.wire).toHaveLength(2)
    expect(first.wire[1].reason).toBe("Unknown fields in capture")
    expect(JSON.stringify(first)).not.toContain("do-not-copy")
    expect(await cycle(false)).toMatchObject({ builtMinutes: 12, ahead: 0, regressed: 1 })
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)
