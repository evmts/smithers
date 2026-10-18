import { expect, test } from "bun:test"
import { spawn, type ChildProcess } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { waitForNativeChromiumPort } from "./NativeChromiumPort"

const fixture = async (body: (profile: string) => Promise<void>) => {
  const profile = await mkdtemp(join(tmpdir(), "smithers-chromium-port-"))
  try { await body(profile) } finally { await rm(profile, { recursive: true, force: true }) }
}

const stop = async (child: ChildProcess) => {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise<void>(resolve => child.once("exit", () => resolve()))
  child.kill()
  await exited
}

for (const initial of ["", "43"]) test(`waits for the complete port line after an initial ${JSON.stringify(initial)} write`, () => fixture(async profile => {
  await writeFile(join(profile, "DevToolsActivePort"), initial)
  const child = spawn(process.execPath, ["-e", `
    setTimeout(() => require('node:fs').writeFileSync(process.argv[1] + '/DevToolsActivePort', '43210\\n/devtools/browser/fixture'), 100)
    setInterval(() => {}, 1000)
  `, profile], { stdio: ["ignore", "ignore", "pipe"] })
  try { expect(await waitForNativeChromiumPort(child, profile)).toBe("43210") }
  finally { await stop(child) }
}))

test("reports Chromium's exit and stderr rather than hiding a failed launch", () => fixture(async profile => {
  const child = spawn(process.execPath, ["-e", "process.stderr.write('native startup failed'); process.exit(23)"], { stdio: ["ignore", "ignore", "pipe"] })
  const started = Date.now()
  await expect(waitForNativeChromiumPort(child, profile)).rejects.toThrow(/exit=23.*native startup failed/s)
  expect(Date.now() - started).toBeLessThan(4000)
}), 10_000)

test("reports spawn failure without an unhandled child error", () => fixture(async profile => {
  const child = spawn(join(profile, "missing-chromium"), [], { stdio: ["ignore", "ignore", "pipe"] })
  await expect(waitForNativeChromiumPort(child, profile)).rejects.toThrow(/ENOENT/)
}))

test("ignores incomplete and invalid ports until Chromium writes a usable endpoint", () => fixture(async profile => {
  const child = spawn(process.execPath, ["-e", `
    const fs = require('node:fs'), file = process.argv[1] + '/DevToolsActivePort'
    const ports = ['0', '65536', 'not-a-port', '43211\\n/devtools/browser/fixture']
    setInterval(() => { if (ports.length) fs.writeFileSync(file, ports.shift()) }, 80)
  `, profile], { stdio: ["ignore", "ignore", "pipe"] })
  try { expect(await waitForNativeChromiumPort(child, profile)).toBe("43211") }
  finally { await stop(child) }
}))

test("retains the five-second readiness deadline and stderr for a live stalled child", () => fixture(async profile => {
  const child = spawn(process.execPath, ["-e", "process.stderr.write('waiting for native startup'); setInterval(() => {}, 1000)"], { stdio: ["ignore", "ignore", "pipe"] })
  try {
    const started = Date.now()
    await expect(waitForNativeChromiumPort(child, profile)).rejects.toThrow(/exit=null.*waiting for native startup/s)
    expect(Date.now() - started).toBeGreaterThanOrEqual(5000)
  } finally { await stop(child) }
}), 10_000)
