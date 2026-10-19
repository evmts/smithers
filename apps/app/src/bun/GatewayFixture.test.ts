import { expect, test } from "bun:test"
import { execFileSync, spawn } from "node:child_process"
import { readFile, writeFile, rm, symlink } from "node:fs/promises"
import { once } from "node:events"
import { resolve, join } from "node:path"

test("the HumanTask fixture starts and parks with the source CLI in its disposable project", async () => {
  const repository = resolve(import.meta.dir, "../../../..")
  const root = execFileSync("mktemp", ["-d", join(repository, ".gateway-fixture.XXXXXX")], { encoding: "utf8" }).trim()
  // Node from PATH: the toolchain preload (scripts/require-toolchain.mjs) already requires Node 26 there.
  const node = "node"
  const cli = join(repository, "packages/smithers/bin/smithers.mjs")
  const options = { cwd: repository, env: { ...process.env, SMITHERS_TOKEN: "" } }
  const run = (args: string[]) => execFileSync(node, [cli, ...args, "--root", root], {
    ...options, encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "pipe"]
  })
  let child: ReturnType<typeof spawn> | undefined
  let output = ""
  try {
    await symlink(join(repository, "node_modules"), join(root, "node_modules"), "dir")
    run(["init", "local-gateway-question"])
    await writeFile(join(root, ".smithers/flows/local-gateway-question/flow.ts"), await readFile(join(repository, "apps/app/e2e/gateway/HumanTask.fixture.ts"), "utf8"))
    child = spawn(node, [cli, "flow", "start", "local-gateway-question", "--data", "{}", "--format", "json", "--root", root], { ...options, stdio: ["ignore", "pipe", "pipe"] })
    child.stdout!.on("data", bytes => { output += String(bytes) })
    child.stderr!.on("data", bytes => { output += String(bytes) })
    let approvals = ""
    const until = Date.now() + 20000
    while (Date.now() < until) {
      await Bun.sleep(200)
      approvals = run(["approvals", "list", "--format", "json"])
      if (approvals.includes("gateway/answer")) break
      if (child.exitCode !== null) throw new Error("Fixture failed: " + output)
    }
    expect(approvals).toContain("gateway/answer")
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
}, 60000)
