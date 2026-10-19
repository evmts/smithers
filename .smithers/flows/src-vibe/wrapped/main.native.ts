// A-2/E-4, E-7: wrapped/main.ts's CLI preamble and process I/O. Parsing argv, the usage exit, the
// top-level `await realpath`, the environment, stdout and the SIGHUP handler are process and
// platform work that a .vibe module does not run; this module does it in the TypeScript's order,
// when main.vibe imports it, and main.vibe builds and runs the programs.
import { Schema } from "effect"
import { realpath } from "node:fs/promises"
import { resolve } from "node:path"
import { parseArgs } from "node:util"
import { Harness, Permission } from "./prompt.vibe"

const { values } = parseArgs({
  options: {
    harness: { type: "string", default: "claude-code" },
    cwd: { type: "string" },
    task: { type: "string" },
    session: { type: "string" },
    permission: { type: "string" },
    "dry-run": { type: "boolean" }
  }
})
export const print = (fact: Record<string, unknown>) => process.stdout.write(`${JSON.stringify(fact)}\n`)

if (values.task === undefined || values.cwd === undefined) {
  process.stderr.write(
    "usage: node --experimental-strip-types .smithers/flows/wrapped/main.ts --harness claude-code|codex --cwd <dir> --task <text> [--session <id>] [--permission plan|acceptEdits] [--dry-run]\n"
  )
  process.exit(2)
}
export const harness = Schema.decodeUnknownSync(Harness)(values.harness)
export const cwd = await realpath(resolve(values.cwd))
export const task = values.task
export const session = values.session
export const permission = values.permission === undefined ? undefined : Schema.decodeUnknownSync(Permission)(values.permission)
export const dryRun = values["dry-run"]

/** The environment the TypeScript reads at module scope. */
export const environment = process.env
export const processId = (): number => process.pid

// runMain interrupts on SIGINT and SIGTERM, so the launch's finalizer kills
// the harness's process group before the host exits. The harness runs in its
// own group, so a closed terminal's SIGHUP reaches only the host: turn it into
// the same interrupt.
export const forwardHangup = (): void => {
  process.on("SIGHUP", () => process.kill(process.pid, "SIGTERM"))
}
