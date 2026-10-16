import { afterEach, expect, test } from "bun:test"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "./test-child"

/*
 * The CLI runs in a child Bun process with its launchers faked by a preload
 * (run-packaged-mode-matrix.fakes.ts). The fakes are `mock.module` calls,
 * which Bun applies to its whole process for good, so they must never load
 * into the `bun test` process other suites share.
 */
const revision = "a".repeat(40)
const cli = join(import.meta.dir, "run-packaged-mode-matrix.ts")
const fakes = join(import.meta.dir, "run-packaged-mode-matrix.fakes.ts")
const dirs: string[] = []
const modeConfig = (mode: string) => ({
  mode, origin: "http://127.0.0.1:3000", endpoint: "http://127.0.0.1:3000",
  auth: { kind: "owner-session", environment: "MATRIX_TEST_AUTH" }, executionReceipt: "receipt.json"
})

const runCli = (dir: string, args: ReadonlyArray<string>, env: Readonly<Record<string, string>> = {}) => {
  const log = join(dir, "fakes.json")
  const started = Date.now()
  /*
   * Through `./test-child`, not `node:child_process`: Bun's synchronous spawn
   * can miss the exit of a child that already finished, and late in the unit
   * suite on GitHub's runners it waited out the whole deadline instead
   * (#3763, run 38493923562). This child answers in milliseconds, and run
   * 38791098138 spent 50,005 ms in this call — the same shape. The supervisor
   * blocks the event loop too, so the test's own timeout still cannot fire;
   * the deadline below is the one that holds.
   */
  const result = spawnSync(process.execPath, ["--preload", fakes, cli, ...args], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", MATRIX_FAKES_LOG: log, ...env
    },
    timeout: 50_000
  })
  if (result.error !== undefined || !existsSync(log)) {
    /*
     * A child killed before it could write its log leaves only what it
     * printed. Naming the elapsed time, the exit status and the signal
     * separates a child that refused from one the deadline killed, and the
     * CLI's own stage lines on stderr name how far it got.
     */
    throw new Error([
      `matrix CLI child did not finish: ${result.error?.message ?? "no fakes log"}`,
      `after ${Date.now() - started}ms, status ${String(result.status)}, signal ${String(result.signal)}`,
      result.stderr
    ].join("\n"))
  }
  const { acquisitions, closes, revisions, matrixEnvironment } = JSON.parse(readFileSync(log, "utf8")) as { acquisitions: string[]; closes: string[]; revisions: string[]; matrixEnvironment?: Record<string, string> }
  return { status: result.status, stderr: result.stderr, acquisitions, closes, revisions, matrixEnvironment }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

test("duplicate external Plue target is rejected before acquiring owned resources", () => {
  const dir = mkdtempSync(join(tmpdir(), "matrix-conflict-"))
  dirs.push(dir)
  const external = join(dir, "external.json")
  writeFileSync(external, JSON.stringify({ revision, modes: [modeConfig("web-plue")] }))
  const run = runCli(dir, ["audit", "--modes", "web-plue", "--external-config", external, "--output-dir", join(dir, "output")], {
    SMITHERS_MODE_MATRIX_PLUE_URL: "https://plue.example",
    SMITHERS_MODE_MATRIX_PLUE_TOKEN: "test-token"
  })
  expect(run.status).not.toBe(0)
  expect(run.stderr).toContain("external configuration must not duplicate the configured Plue web or local target")
  expect(run.acquisitions).toEqual([])
  expect(run.closes).toEqual([])
  // The conflict is readable from the arguments alone, so the refusal precedes
  // every effect: no working-copy read, no output directory.
  expect(run.revisions).toEqual([])
  expect(existsSync(join(dir, "output"))).toBe(false)
}, 60_000)

test("config write failure closes all acquired sessions once and retains the original error", () => {
  const dir = mkdtempSync(join(tmpdir(), "matrix-write-"))
  dirs.push(dir)
  const output = join(dir, "output")
  mkdirSync(join(output, "config.json"), { recursive: true })
  const run = runCli(dir, ["audit", "--modes", "local-own", "--output-dir", output], { MATRIX_FAKES_FAIL_CLOSE: "1" })
  expect(run.acquisitions).toEqual(["local"])
  expect(run.closes).toEqual(["local"])
  expect(run.stderr).toContain("EISDIR")
  expect(run.stderr).toContain("mode launcher teardown failed")
  expect(run.status).toBe(1)
}, 60_000)

test("local-own forwards its signed-in owner session and install repository to the matrix runner", () => {
  const dir = mkdtempSync(join(tmpdir(), "matrix-signed-in-owner-"))
  dirs.push(dir)
  const run = runCli(dir, ["audit", "--modes", "local-own", "--output-dir", join(dir, "output")])
  expect(run.status).toBe(0)
  expect(run.acquisitions).toEqual(["local"])
  expect(run.closes).toEqual(["local"])
  expect(run.revisions).toEqual(["source"])
  expect(JSON.parse(run.matrixEnvironment!.MATRIX_TEST_AUTH!)).toEqual({
    username: "owner", sessionCookie: "b".repeat(64)
  })
  expect(run.matrixEnvironment!.SMITHERS_LOCAL_INSTALL_REPOSITORY).toBe("owner/demo")
  expect(readFileSync(join(dir, "output", "config.json"), "utf8")).not.toContain("sessionCookie")
}, 60_000)
