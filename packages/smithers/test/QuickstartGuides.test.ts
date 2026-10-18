/** Linked quickstart examples execute against the project the reader just created. */
import { execFile } from "node:child_process"
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { expect, it } from "vitest"

const run = promisify(execFile)
const bin = fileURLToPath(new URL("../src/bin.ts", import.meta.url))
const preload = fileURLToPath(new URL("./fixtures/init-native-host.ts", import.meta.url))

it("plans and launches the linked guide examples after init hello", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "smithers-guide-cli-")))
  const env = {
    PATH: process.env.PATH,
    TMPDIR: process.env.TMPDIR,
    HOME: root,
    XDG_CONFIG_HOME: join(root, "config"),
    XDG_DATA_HOME: join(root, "data"),
    SMITHERS_WORKSPACE_JJ_EXPORT_BINARY: process.env.SMITHERS_WORKSPACE_JJ_EXPORT_BINARY,
    OPENAI_API_KEY: "fixture-never-sent",
    SMITHERS_BACKEND: "sqlite",
    NODE_OPTIONS: `--import=${preload}`
  }
  const cli = async (...args: Array<string>) =>
    JSON.parse(
      (await run(process.execPath, ["--no-warnings", "--import", preload, bin, ...args, "--json"], {
        cwd: root,
        env,
        timeout: 60_000,
        maxBuffer: 4 * 1024 * 1024
      })).stdout
    )
  const example = async (name: string) => {
    const doc = await readFile(new URL(`../docs/guides/${name}.md`, import.meta.url), "utf8")
    const command = /```bash\n([\s\S]*?)\n```/.exec(doc)![1]
    return run("/bin/bash", [
      "-eu",
      "-o",
      "pipefail",
      "-c",
      [
        "smthrs() { \"$GUIDE_NODE\" --no-warnings --import \"$GUIDE_PRELOAD\" \"$GUIDE_BIN\" \"$@\"; }",
        command,
        name === "script-the-cli" ? "printf \"%s\" \"$approval\"" : ""
      ].join("\n")
    ], {
      cwd: root,
      env: { ...env, GUIDE_NODE: process.execPath, GUIDE_PRELOAD: preload, GUIDE_BIN: bin },
      timeout: 60_000,
      maxBuffer: 4 * 1024 * 1024
    })
  }
  try {
    await cli("init", "hello")
    const planned = await example("script-the-cli")
    expect(JSON.parse(planned.stdout)).toMatchObject({ target: { _tag: "Plan" }, scope: "run" })
    const launched = JSON.parse((await example("launch-a-detached-run")).stdout)
    expect(launched).toMatchObject({ detached: true, runId: expect.any(String), logFile: expect.any(String) })
    const page = await cli("runs", "list")
    expect(page.items.some((item: { runId: string }) => item.runId === launched.runId)).toBe(true)
  } finally {
    await cli("runs", "cancel-all")
    await rm(root, { recursive: true, force: true })
  }
}, 120_000)
