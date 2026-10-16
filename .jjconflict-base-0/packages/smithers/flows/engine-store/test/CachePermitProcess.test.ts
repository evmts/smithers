import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"
import * as PersistentDatabase from "./fixtures/PersistentDatabase.ts"

const fixture = fileURLToPath(new URL("./fixtures/cache-permit-process.mjs", import.meta.url))
const launch = (filename: string, counter: string, runId: string, mode = "hold") => {
  const child = spawn(process.execPath, [fixture, filename, counter, runId, mode], { stdio: ["pipe", "pipe", "pipe"] })
  let stdout = ""
  let stderr = ""
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk)
  })
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk)
  })
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()))
  const wait = async (marker: string) => {
    const deadline = Date.now() + 30_000
    while (!stdout.includes(marker)) {
      if (child.exitCode !== null || child.signalCode !== null || Date.now() > deadline) {
        throw new Error(`Missing ${marker}: ${stdout}\n${stderr}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
  return { child, exited, wait, output: () => stdout }
}

it.each([false, true])("serializes cache bodies across processes (dead owner: %s)", async (crash) => {
  const root = await mkdtemp(join(tmpdir(), "cache-permit-process-"))
  const filename = PersistentDatabase.filename(join(root, "engine.sqlite"))
  const counter = join(root, "bodies")
  await writeFile(counter, "")
  const first = launch(filename, counter, "first", crash ? "crash" : "hold")
  let second: ReturnType<typeof launch> | undefined
  try {
    await first.wait("body-started\n")
    if (crash) {
      first.child.kill("SIGKILL")
      await first.exited
    }
    second = launch(filename, counter, "second")
    // A release sent before a body starts lets an erroneous duplicate finish,
    // making the old implementation observable while the first is held.
    second.child.stdin.write("release\n")
    await second.wait("ready\n")
    if (!crash) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(await readFile(counter, "utf8")).toBe("first\n")
      first.child.stdin.write("release\n")
      await first.wait("result:result\n")
    }
    await second.wait("result:result\n")
    expect(await readFile(counter, "utf8")).toBe(crash ? "first\nsecond\n" : "first\n")
    expect(second.output().includes("body-started\n")).toBe(crash)
  } finally {
    for (const process of [first, second]) {
      if (!process) continue
      if (process.child.exitCode === null && process.child.signalCode === null) process.child.kill("SIGKILL")
      await process.exited
    }
    await PersistentDatabase.remove(filename)
    await rm(root, { recursive: true, force: true })
  }
}, 90_000)
