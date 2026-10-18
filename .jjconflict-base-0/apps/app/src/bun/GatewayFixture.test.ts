import { expect, test } from "bun:test"
import { execFile, execFileSync, spawn } from "node:child_process"
import { readFile, writeFile, rm, symlink } from "node:fs/promises"
import { once } from "node:events"
import { resolve, join } from "node:path"
import { tmpdir } from "node:os"
import { promisify } from "node:util"

// Each CLI call is a cold start of the source CLI: about 3 s on an idle lane VM and 7-20 s when the full
// //apps/app:unitTests run shares the machine, so one deadline bounds the whole test instead of each call (#4297).
const deadlineMs = 120000

test("the HumanTask fixture starts and parks with the source CLI in its disposable project", async () => {
  const repository = resolve(import.meta.dir, "../../../..")
  // Outside the checkout, like the journey: an interrupted run must not leave a project for jj to track.
  const root = execFileSync("mktemp", ["-d", join(tmpdir(), "smithers-gateway-fixture.XXXXXX")], { encoding: "utf8" }).trim()
  // Node from PATH: the toolchain preload (scripts/require-toolchain.mjs) already requires Node 26 there.
  const node = "node"
  const cli = join(repository, "packages/smithers/bin/smithers.mjs")
  const options = { cwd: repository, env: { ...process.env, SMITHERS_TOKEN: "" } }
  const until = Date.now() + deadlineMs
  // Asynchronous, so the event loop keeps draining the fixture's output while a call runs.
  const run = async (args: string[]) => (await promisify(execFile)(node, [cli, ...args, "--root", root], {
    ...options, encoding: "utf8", timeout: Math.max(1, until - Date.now())
  })).stdout
  let child: ReturnType<typeof spawn> | undefined
  let output = ""
  try {
    await symlink(join(repository, "node_modules"), join(root, "node_modules"), "dir")
    await run(["init", "local-gateway-question"])
    await writeFile(join(root, ".smithers/flows/local-gateway-question/flow.ts"), await readFile(join(repository, "apps/app/e2e/gateway/HumanTask.fixture.ts"), "utf8"))
    child = spawn(node, [cli, "flow", "start", "local-gateway-question", "--data", "{}", "--format", "json", "--root", root], { ...options, stdio: ["ignore", "pipe", "pipe"] })
    child.stdout!.on("data", bytes => { output += String(bytes) })
    child.stderr!.on("data", bytes => { output += String(bytes) })
    let approvals = ""
    while (Date.now() < until) {
      await Bun.sleep(200)
      // `flow start` creates .flows/control.db and engine.db in several commits, and a list between them is refused
      // as store_schema_older (smithersai/smithers#4391). This child is the store's only writer: retry while it runs.
      approvals = await run(["approvals", "list", "--format", "json"]).catch((error: { stdout?: string }) => {
        if (child!.exitCode === null && error.stdout?.includes("store_schema_older")) return ""
        throw error
      })
      if (approvals.includes("gateway/answer")) break
      if (child.exitCode !== null) throw new Error("Fixture failed: " + output)
    }
    if (!approvals.includes("gateway/answer")) throw new Error(`Fixture did not park within ${deadlineMs} ms; flow start output: ${output}`)
    expect(output).not.toContain("ERR_MODULE_NOT_FOUND")
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const parent = Number(execFileSync("ps", ["-o", "ppid=", "-p", String(child.pid)], { encoding: "utf8" }).trim())
      if (parent !== process.pid) throw new Error("Refusing to stop another session's process")
      const exited = once(child, "exit")
      child.kill("SIGTERM")
      await exited
    }
    await rm(root, { recursive: true, force: true })
  }
}, deadlineMs + 30000)
