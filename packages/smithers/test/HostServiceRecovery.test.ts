import { Effect, Metric } from "effect"
import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { once } from "node:events"
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import * as Host from "../src/internal/backend/HostService.ts"

const roots: Array<string> = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const fixture = () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "host-recovery-")))
  roots.push(root)
  const bundle = join(root, "custom & bundle")
  mkdirSync(join(bundle, "bin"), { recursive: true })
  const content = "#!/bin/sh\nprintf '%s\\n' \"$0\" \"$@\"\n"
  const files = ["bin/smithers-server", "bin/smithers-backend", "bin/msb"].map((path) => {
    writeFileSync(join(bundle, path), content, { mode: 0o755 })
    return { path, sha256: createHash("sha256").update(content).digest("hex"), stage: "test", mode: 0o755 }
  })
  writeFileSync(
    join(bundle, "manifest.json"),
    JSON.stringify({
      version: 1,
      platform: "darwin-arm64",
      revision: "a".repeat(40),
      files
    })
  )
  // An absent login domain exercises the real launchctl refusal without touching a user's job.
  const system: Host.Launchd = {
    agentsDir: join(root, "LaunchAgents"),
    domain: "gui/4294967294",
    launchctl: (args) => {
      const result = spawnSync("/bin/launchctl", [...args], { encoding: "utf8" })
      return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" }
    }
  }
  const options = { bundle, stateDir: join(root, "state"), home: root }
  mkdirSync(system.agentsDir)
  writeFileSync(Host.plistFile(system), Host.hostPlist(options))
  return { root, bundle, options, system }
}

describe.skipIf(process.platform !== "darwin")("host recovery with real files and processes", () => {
  it("restores with the custom backend after stopping the service twice", async () => {
    const f = fixture()
    const completed = Metric.counter("cli.host.stop.completed")
    const before = Effect.runSync(Metric.value(completed)).count
    await Host.stop(f.system)
    await Host.stop(f.system)
    expect(Host.installedBundle(f.system)).toBe(f.bundle)
    expect(Effect.runSync(Metric.value(completed)).count).toBe(before + 2)
    const receipt = Host.maintenance("restore", join(f.root, "backup"), f.system)
    expect(receipt.split("\n")).toEqual([
      join(f.bundle, "bin/smithers-backend"),
      "host-maintenance",
      "restore",
      join(f.root, "backup")
    ])
    expect(Host.installedBundle(f.system)).toBe(f.bundle)
  })

  it("refuses another process's installation lock before touching the service", async () => {
    const f = fixture(), lock = `${Host.plistFile(f.system)}.lock`
    const child = spawn(process.execPath, [
      "-e",
      `
      require("node:fs").mkdirSync(process.argv[1]);
      console.log("locked");
      process.stdin.resume();
    `,
      lock
    ], { stdio: ["pipe", "pipe", "pipe"] })
    const exited = once(child, "exit")
    try {
      await once(child.stdout!, "data")
      const before = readFileSync(Host.plistFile(f.system), "utf8")
      const failed = Metric.counter("cli.host.install.failed")
      const failures = Effect.runSync(Metric.value(failed)).count
      await expect(Host.install(f.options, f.system)).rejects.toMatchObject({ code: "host_service_busy" })
      expect(Effect.runSync(Metric.value(failed)).count).toBe(failures + 1)
      await expect(Host.stop(f.system)).rejects.toMatchObject({ code: "host_service_busy" })
      expect(readFileSync(Host.plistFile(f.system), "utf8")).toBe(before)
    } finally {
      child.stdin!.end()
      await exited
      rmSync(lock, { recursive: true })
    }
    // A failed bootstrap releases its own lock, so the next operation can enter.
    await expect(Host.install(f.options, f.system)).rejects.toMatchObject({ code: "host_start_failed" })
    await expect(Host.stop(f.system)).resolves.toEqual({ state: "stopped" })
  })

  it("never writes through a shared temporary plist left by another process", async () => {
    const f = fixture(), other = join(f.root, "other-installer")
    writeFileSync(other, "other install's plist")
    symlinkSync(other, `${Host.plistFile(f.system)}.tmp`)
    await expect(Host.install(f.options, f.system)).rejects.toMatchObject({ code: "host_start_failed" })
    expect(readFileSync(other, "utf8")).toBe("other install's plist")
  })
})
