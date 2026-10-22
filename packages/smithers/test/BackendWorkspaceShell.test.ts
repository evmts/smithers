import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Client } from "../src/internal/backend/Client.ts"
import { quote } from "../src/internal/backend/SSH.ts"
import { workspaces } from "../src/internal/backend/Workspaces.ts"

const dirs: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

const fixture = async () => {
  const home = await mkdtemp(join(tmpdir(), "smithers-workspace-shell-"))
  dirs.push(home)
  const exit = vi.fn()
  const c = new Client({
    environment: {
      HOME: home,
      SMITHERS_API_ORIGIN: "https://api.example.test",
      SMITHERS_TOKEN: "synthetic-session",
      SMITHERS_DISABLE_SYSTEM_KEYRING: "1"
    },
    exit
  })
  let result: unknown
  // The unavailable remote command service executes its exact submitted argv
  // locally and returns a durable receipt; the shell/process boundary is real.
  vi.spyOn(c, "request").mockImplementation(async (method, path, body) => {
    if (method === "POST" && path.endsWith("/command-runs")) {
      const args = (body as { args: string[] }).args
      expect(args[0]).toBe("/bin/bash")
      const executed = spawnSync(args[0]!, args.slice(1), { encoding: "utf8", env: c.env, cwd: home })
      result = {
        exit_code: executed.status,
        stdout: executed.stdout,
        stderr: executed.stderr,
        output_truncated: false
      }
      return { operationId: "shell-run" }
    }
    if (method === "GET" && path.endsWith("/command-runs/shell-run")) {
      return { operationId: "shell-run", state: "completed", result }
    }
    throw new Error(`Unexpected ${method} ${path}`)
  })
  return { c, home, exit }
}

describe("workspace shell execution (#1865)", () => {
  it("preserves command exit codes without running login logout hooks (plue#785)", async () => {
    const { c, home, exit } = await fixture()
    const logout = join(home, "logout.log")
    await writeFile(join(home, ".bash_logout"), `printf logout > "$HOME/logout.log"\nfalse\n`)
    const prelude = `set -eu\nexport HOME=${quote(home)}\n`
    // The actual workload's EXIT trap calls exit under errexit. A login shell
    // runs .bash_logout at that point, whose failing console cleanup can
    // replace a successful command's status even after the trap prints zero.
    const trap = `trap 'rc=$?; printf "EXIT=%s\\n" "$rc"; exit "$rc"' EXIT\n`
    const control = spawnSync("/bin/bash", ["-lc", prelude + trap + "true"], { encoding: "utf8", env: c.env })
    expect(control.status).toBe(1)
    expect(control.stdout).toBe("EXIT=0\n")
    expect(await readFile(logout, "utf8")).toBe("logout")
    await rm(logout)

    for (
      const test of [
        { body: "printf done", code: 0, stdout: "done" },
        { body: "exit 0", code: 0, stdout: "" },
        { body: trap + "true", code: 0, stdout: "EXIT=0\n" },
        { body: "exit 23", code: 23, stdout: "" },
        { body: trap + "exit 7", code: 7, stdout: "EXIT=7\n" }
      ]
    ) {
      exit.mockClear()
      const response = await workspaces["workspace exec"]!(c, { id: "box" }, {
        repo: "owner/repo",
        command: prelude + test.body
      })
      expect(response).toMatchObject({ exit_code: test.code, stdout: test.stdout, stderr: "" })
      expect(exit).toHaveBeenCalledExactlyOnceWith(test.code)
      expect(existsSync(logout)).toBe(false)
    }
  })
})
