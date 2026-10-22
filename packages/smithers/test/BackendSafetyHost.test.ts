import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { once } from "node:events"
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { createServer, type ServerResponse } from "node:http"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import * as Host from "../src/internal/backend/HostService.ts"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
const fixture = (backend = "#!/bin/sh\nprintf receipt") => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "backend-safety-")))
  roots.push(root)
  const bundle = join(root, "bundle")
  mkdirSync(join(bundle, "bin"), { recursive: true })
  const files = ["bin/smithers-server", "bin/smithers-backend", "bin/msb"].map((path) => {
    const content = path === "bin/smithers-backend" ? backend : "#!/bin/sh\nexit 0\n"
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
  return { root, bundle, system, options }
}
const moduleURL = new URL("../src/internal/backend/HostService.ts", import.meta.url).href
const childSource = (f: ReturnType<typeof fixture>) => `
  import * as Host from ${JSON.stringify(moduleURL)};
  import { Effect } from "effect";
  const system = { ...Host.launchd(), agentsDir: ${JSON.stringify(f.system.agentsDir)}, domain: "gui/4294967294" };
`

describe.skipIf(process.platform !== "darwin")("backend service safety with real processes", () => {
  it("writes the verified canonical bundle when install receives a relative path", async () => {
    const f = fixture()
    await expect(Host.install({ ...f.options, bundle: relative(process.cwd(), f.bundle) }, f.system))
      .rejects.toMatchObject({ code: "host_start_failed" })
    expect(Host.installedBundle(f.system)).toBe(f.bundle)
    expect(readFileSync(Host.plistFile(f.system), "utf8")).toContain(`${f.bundle}/bin:/usr/bin`)
  })

  it("releases the service lock on process death so stop and install can enter again", async () => {
    const f = fixture()
    const child = spawn(process.execPath, [
      "--input-type=module",
      "-e",
      childSource(f) + `
      const launch = system.launchctl;
      system.launchctl = (args) => {
        // Fault injection happens after the real lock acquisition, before the
        // real launchctl call. SIGKILL then bypasses every JS finalizer.
        Effect.runSync(Effect.sync(() => {
          process.stdout.write("locked\\n");
          process.kill(process.pid, "SIGSTOP");
        }));
        return launch(args);
      };
      await Host.stop(system);
    `
    ], { stdio: ["ignore", "pipe", "pipe"] })
    const exited = once(child, "exit")
    try {
      await once(child.stdout!, "data")
      await expect(Host.stop(f.system)).rejects.toMatchObject({ code: "host_service_busy" })
    } finally {
      child.kill("SIGKILL")
      await exited
    }
    await expect(Host.stop(f.system)).resolves.toEqual({ state: "stopped" })
    await expect(Host.install(f.options, f.system)).rejects.toMatchObject({ code: "host_start_failed" })
  })

  it("holds the install lock throughout restore after its stopped-state check", async () => {
    let release: ServerResponse | undefined
    let entered!: () => void
    const received = new Promise<void>((resolve) => entered = resolve)
    const barrier = createServer((_request, response) => {
      release = response
      entered()
    })
    await new Promise<void>((resolve) => barrier.listen(0, "127.0.0.1", resolve))
    const { port } = barrier.address() as { port: number }
    const f = fixture(
      `#!${process.execPath}\n` + `
      require("node:http").get("http://127.0.0.1:${port}", (response) => {
        response.resume();
        response.on("end", () => console.log("restored"));
      });
    `
    )
    const child = spawn(process.execPath, [
      "--input-type=module",
      "-e",
      childSource(f) + `
      console.log(Host.maintenance("restore", ${JSON.stringify(f.root)}, system));
    `
    ], { stdio: ["ignore", "pipe", "pipe"] })
    const exited = once(child, "exit")
    try {
      await Promise.race([
        received,
        exited.then(() => {
          throw new Error("Restore exited before its backend receipt")
        })
      ])
      await expect(Host.install(f.options, f.system)).rejects.toMatchObject({ code: "host_service_busy" })
    } finally {
      release?.end()
      if (release === undefined) child.kill("SIGKILL")
      await exited
      barrier.closeAllConnections()
      await new Promise<void>((resolve) => barrier.close(() => resolve()))
    }
    await expect(Host.stop(f.system)).resolves.toEqual({ state: "stopped" })
  })
})
