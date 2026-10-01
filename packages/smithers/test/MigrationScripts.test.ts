/** Migrated script bytes cross a real shell and the public bin before SQL assertions. */
import * as NodeDatabase from "@smthrs/database/node/NodeDatabase"
import { rewriteManifest } from "@smthrs/migrate/flow/Archive"
import { Effect } from "effect"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import { spawn } from "node:child_process"
import { cp, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

const roots: Array<string> = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
const executable = fileURLToPath(new URL("../src/bin.ts", import.meta.url))
const fixture = fileURLToPath(new URL("../migrate/test/fixtures/jsx-single.migrated", import.meta.url))

const execute = (root: string, command: string, input: string) =>
  new Promise<{ code: number | null; signal: string | null; stdout: string; stderr: string }>((resolve, reject) => {
    // Supply the executable lookup and an explicit offline completion judge;
    // command parsing, control, approval and persistence still run as shipped.
    const child = spawn("/bin/sh", [
      "-c",
      "smthrs() { \"$MIGRATION_NODE\" --import \"$MIGRATION_JUDGE\" \"$MIGRATION_BIN\" \"$@\"; }\n" + command
    ], {
      cwd: root,
      env: {
        // Deliberate allowlist: a developer's ambient model credentials,
        // NODE_OPTIONS or remote configuration must not enter this bin test.
        PATH: process.env.PATH,
        TMPDIR: process.env.TMPDIR,
        LANG: "C.UTF-8",
        MIGRATION_NODE: process.execPath,
        MIGRATION_BIN: executable,
        MIGRATION_JUDGE: new URL("./fixtures/scripted-native-host.ts", import.meta.url).href,
        INPUT: input,
        SMITHERS_REMOTE: "",
        SMITHERS_TOKEN: "",
        SMITHERS_BACKEND: "sqlite",
        SMITHERS_WORKSPACE_JJ_EXPORT_BINARY: process.env.SMITHERS_WORKSPACE_JJ_EXPORT_BINARY,
        SMITHERS_AUDIENCE: "human",
        SMITHERS_INSIDE_RUN: "",
        SMITHERS_LIVE_MODEL_TESTS: "0"
      },
      detached: true
    })
    let stdout = ""
    let stderr = ""
    const stop = () => {
      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, "SIGKILL")
        } catch { /* Already closed. */ }
      }
    }
    const timer = setTimeout(stop, 90_000)
    child.stdout.on("data", (data) => {
      stdout += data
      if (stdout.length > 524_288) stop()
    })
    child.stderr.on("data", (data) => {
      stderr += data
      if (stderr.length > 524_288) stop()
    })
    child.once("error", (cause) => {
      clearTimeout(timer)
      reject(cause)
    })
    child.once("close", (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal, stdout, stderr })
    })
    child.stdin.end()
  })

const readRows = async (root: string, database: "control" | "engine") =>
  Effect.runPromise(
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      return {
        plans: database === "control"
          ? yield* sql`SELECT plan_id, card_json, decoded_input_json FROM control_plans`
          : [],
        admitted: database === "control" ? yield* sql`SELECT run_id FROM control_runs` : [],
        executions: yield* sql`SELECT run_id, status, state_json, execution_parent_id FROM flows_runs`
      }
    }).pipe(
      Effect.provide(
        NodeDatabase.layer({ filename: join(root, ".flows", `${database}.db`), sqlite: { readonly: true } })
      )
    )
  )

const migratedCommand = async (root: string, old: string) => {
  const original = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }
  original.scripts = { start: `${old} --json --quiet` }
  const migrated = rewriteManifest(JSON.stringify(original), { remove: [], add: [] })
  expect(migrated.scripts[0]?.unsupported).toBeUndefined()
  await writeFile(join(root, "package.json"), migrated.text)
  return migrated.scripts[0]!.after
}

const ownedFixture = async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "smithers-migrated-cli-")))
  roots.push(root)
  await cp(fixture, root, { recursive: true })
  return root
}

describe.skipIf(process.platform === "win32")("migrated scripts through the public CLI", { timeout: 120_000 }, () => {
  it.each([
    { old: "smithers up simple-workflow.jsx --input \"$INPUT\"", detached: false },
    { old: "bunx smthrs up .smithers/workflows/simple-workflow.tsx --input=\"$INPUT\" -d", detached: true },
    { old: "smithers workflow run simple-workflow.jsx -d '{\"topic\":\"legacy data alias\"}'", detached: false }
  ])("admits the right flow/input and execution mode for $old", async ({ detached, old }) => {
    const root = await ownedFixture()
    const input = JSON.stringify({ topic: "quotes ' and Unicode 😀; smithers up must stay data" })
    const expectedInput = old.includes("legacy data alias") ? { topic: "legacy data alias" } : JSON.parse(input)
    const result = await execute(root, await migratedCommand(root, old), input)
    expect({ code: result.code, signal: result.signal }, result.stdout + result.stderr)
      .toEqual({ code: detached ? 0 : 1, signal: null })
    const receipt = JSON.parse(result.stdout) as {
      _tag: string
      runId: string
      receiptId: string
      status?: string
      cause?: string
      detached?: boolean
      logFile?: string
    }
    if (!detached) expect(receipt._tag).toBe("Accepted")
    expect(receipt.runId).toMatch(/^run-/)
    if (!detached) expect(receipt.receiptId).toMatch(/^approve:plan-/)
    expect(receipt.detached === true).toBe(detached)
    if (detached) expect(receipt.logFile).toBe(join(root, ".flows", "logs", `${receipt.runId}.log`))
    else {
      // Admission now reaches the real module executor. This fixture declares
      // an action without an implementation; its settled failure is honest.
      expect(receipt.status).toBe("failed")
      expect(receipt.cause).toContain("Action \"simple-workflow/Research\" has no implementation.")
    }
    let control = await readRows(root, "control")
    for (let attempt = 0; attempt < 400 && control.executions[0]?.status !== "failed"; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 25))
      control = await readRows(root, "control")
    }
    expect(control.plans).toHaveLength(1)
    if (!detached) expect(receipt.receiptId).toBe(`approve:${control.plans[0]!.plan_id}`)
    expect(JSON.parse(String(control.plans[0]!.decoded_input_json))).toEqual(expectedInput)
    expect(JSON.parse(String(control.plans[0]!.card_json)).flowId).toBe("simple-workflow")
    expect(control.admitted).toEqual([{ run_id: receipt.runId }])
    expect(control.executions).toHaveLength(1)
    expect(control.executions[0]).toMatchObject({ run_id: receipt.runId, status: "failed" })
    expect(JSON.parse(String(control.executions[0]!.state_json))).toMatchObject({
      runId: receipt.runId,
      flowId: "simple-workflow",
      planId: String(control.plans[0]!.plan_id),
      status: "failed"
    })
    const engine = await readRows(root, "engine")
    expect(engine.executions).toHaveLength(2)
    const rootExecution = engine.executions.find((row) => row.run_id === receipt.runId)
    expect(rootExecution).toMatchObject({ status: "failed", execution_parent_id: null })
    const moduleExecution = engine.executions.find((row) => row.execution_parent_id === receipt.runId)
    expect(moduleExecution).toMatchObject({ status: "failed" })
    const state = JSON.parse(String(moduleExecution!.state_json))
    expect(state.flowName).toMatch(/\/simple-workflow$/)
    expect(state.payload).toEqual({ input: expectedInput })
    expect(state.result).toMatchObject({ _tag: "Complete", exit: { _tag: "Failure" } })
    expect(JSON.stringify(state.result)).toContain("simple-workflow/Research")
    expect(JSON.stringify(state.result)).toContain("has no implementation")
    if (detached) expect(await readFile(receipt.logFile!, "utf8")).toContain("simple-workflow/Research")
  })

  it("refuses literal empty input before admission instead of launching a detached child", async () => {
    const root = await ownedFixture()
    const old = "bunx smthrs up .smithers/workflows/simple-workflow.tsx --input='{}' -d"
    const result = await execute(root, await migratedCommand(root, old), "unused")
    expect({ code: result.code, signal: result.signal }).toEqual({ code: 1, signal: null })
    const refusal = JSON.parse(result.stdout)
    expect(refusal.code).toBe("InvalidInput")
    expect(refusal.message).toContain("Missing key")
    expect(refusal.message).toContain("[\"topic\"]")
    expect(result.stdout).not.toContain("\"Accepted\"")
    for (const database of ["control", "engine"] as const) {
      const rows = await readRows(root, database)
      expect(rows.plans).toEqual([])
      expect(rows.admitted).toEqual([])
      expect(rows.executions).toEqual([])
    }
  })
})
