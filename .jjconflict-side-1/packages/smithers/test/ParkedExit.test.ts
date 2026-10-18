/** An unapproved plan must preserve its receipt and signal a park to shell scripts. */
import { execFile } from "node:child_process"
import { mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { expect, it } from "vitest"

const run = promisify(execFile)
const bin = fileURLToPath(new URL("../src/bin.ts", import.meta.url))
const preload = fileURLToPath(new URL("./fixtures/init-native-host.ts", import.meta.url))
it("returns 3 for parked flow execute, then 0 after approval", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "smithers-park-exit-")))
  const cli = async (...args: string[]) => {
    try {
      return {
        ...await run(process.execPath, ["--no-warnings", "--import", preload, bin, ...args, "--json"], {
          cwd: root,
          env: {
            PATH: process.env.PATH,
            TMPDIR: process.env.TMPDIR,
            HOME: root,
            XDG_CONFIG_HOME: join(root, "config"),
            XDG_DATA_HOME: join(root, "data"),
            SMITHERS_WORKSPACE_JJ_EXPORT_BINARY: process.env.SMITHERS_WORKSPACE_JJ_EXPORT_BINARY,
            OPENAI_API_KEY: "fixture-never-sent",
            SMITHERS_BACKEND: "sqlite"
          },
          timeout: 60_000
        }),
        code: 0
      }
    } catch (error) {
      return error as { code: number; stdout: string; stderr: string }
    }
  }
  try {
    expect((await cli("init", "hello")).code).toBe(0)
    const plan = await cli("flow", "plan", "hello")
    expect(plan.code, plan.stdout + plan.stderr).toBe(0)
    const approval = JSON.stringify(JSON.parse(plan.stdout).approval)
    const parked = await cli("flow", "execute", approval)
    expect(JSON.parse(parked.stdout)).toMatchObject({ _tag: "Parked" })
    expect(parked.code, parked.stdout + parked.stderr).toBe(3)
    expect((await cli("approvals", "approve", approval)).code).toBe(0)
    const completed = await cli("flow", "execute", approval)
    expect(completed.code, completed.stdout + completed.stderr).toBe(0)
    expect(JSON.parse(completed.stdout)).toMatchObject({ _tag: "Accepted" })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 180_000)
