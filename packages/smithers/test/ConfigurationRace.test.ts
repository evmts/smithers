import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"

const race = (scenario: string) => {
  const root = mkdtempSync(join(tmpdir(), "smithers-config-race-"))
  try {
    const child = spawnSync(process.execPath, [
      "--no-warnings",
      fileURLToPath(new URL("./support/configuration-race.mjs", import.meta.url)),
      scenario,
      root
    ], { encoding: "utf8", timeout: 20_000 })
    expect(child.error).toBeUndefined()
    expect(child.status, child.stderr).toBe(0)
    const result = JSON.parse(child.stdout)
    expect(result.raced).toBe(1)
    return result
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

it("competing stale-lock recoverers admit only one configuration writer", () => {
  const result = race("recover")
  expect(Number(result.peerHeld) + Number(result.result.status === "written")).toBe(1)
  if (result.peerHeld) expect(result.lockSurvived).toBe(true)
})

it("removes the complete temporary configuration when the source changed", () => {
  const result = race("mismatch")
  expect(result.result.status).toBe("failed")
  expect(result.document).toEqual({ theme: "external" })
  expect(result.temporary).toEqual([])
})

// Known broken: no portable filesystem compare-and-swap is available here.
it.fails("preserves an external writer's update after source validation", () => {
  const result = race("overwrite")
  expect(result.document).toEqual({ theme: "external" })
  expect(result.result.status).toBe("failed")
})

it("does not resurrect an unsubscribed entry when another subscription commits", () => {
  const result = race("subscribe")
  expect(result.entries).toEqual([{ runId: "run-b", sessionId: "session-b", updatedAtMs: 1000 }])
})
