/**
 * `perf` through the flow API: the real graph, the real layer and a real child
 * process running `run.mjs` or a driver. A passing budget needs the reference
 * install and a second Mac, so this suite proves that an unconfigured run is a
 * typed failure that still retains its skipped evidence.
 */
import * as NodeCrypto from "@effect/platform-node/NodeCrypto"
import { FlowEngine } from "@smthrs/engine"
import { Interpreter } from "@smthrs/flow"
import { Effect, Exit, Layer, Schema } from "effect"
import assert from "node:assert/strict"
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import Perf, { entry, layer, Request } from "./flow.ts"

const run = (payload: typeof Request.Type, executionId: string) =>
  Effect.runPromiseExit(
    Perf.execute(payload, { executionId }).pipe(
      Effect.provide(
        Interpreter.layerWithImplementations(Perf, layer).pipe(
          Layer.provideMerge(FlowEngine.layerMemory),
          Layer.provideMerge(NodeCrypto.layer)
        )
      )
    )
  )

const withArtifactRoot = async (body: (root: string) => Promise<void>) => {
  const root = mkdtempSync(join(tmpdir(), "perf-flow-"))
  const env = { SMITHERS_PERF_ARTIFACT_ROOT: root, SMITHERS_PERF_ORIGIN: "", SMITHERS_PERF_INSTALL_VERSION: "fixture" }
  const previous = Object.keys(env).map((name) => [name, process.env[name]] as const)
  Object.assign(process.env, env)
  try {
    await body(root)
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    rmSync(root, { recursive: true, force: true })
  }
}

test("the payload selects the runner, one budget, or a standalone driver", () => {
  assert.deepEqual(entry({}), { module: "./run.mjs", argv: [] })
  assert.deepEqual(entry({ check: "C-PERF-03" }), { module: "./run.mjs", argv: ["C-PERF-03"] })
  assert.deepEqual(entry({ driver: "agent-first-token" }), { module: "./agent-first-token.mjs", argv: [] })
  assert.deepEqual(entry({ driver: "projection-delta" }), { module: "./projection-delta.mjs", argv: [] })
})

test("a payload naming both a check and a driver is refused", () => {
  const decode = Schema.decodeUnknownExit(Request)
  assert.ok(Exit.isSuccess(decode({ check: "C-PERF-06" })))
  assert.ok(Exit.isFailure(decode({ check: "C-PERF-02", driver: "projection-delta" })))
  assert.ok(Exit.isFailure(decode({ check: "C-PERF-07" })))
})

test("an unconfigured budget is incomplete: a typed failure that retains skipped evidence", async () => {
  await withArtifactRoot(async (root) => {
    const exit = await run({ check: "C-PERF-03" }, "perf-unconfigured")
    assert.ok(Exit.isFailure(exit))
    const failure = JSON.stringify(exit.cause)
    assert.match(failure, /perf\/run\.mjs/)
    assert.match(failure, /"exitCode":2/)
    const [timestamp] = readdirSync(join(root, ".artifacts/perf"))
    const summary = JSON.parse(readFileSync(join(root, ".artifacts/perf", timestamp!, "keystroke.json"), "utf8"))
    assert.equal(summary.status, "incomplete")
    assert.equal(summary.budgets[0].status, "skipped")
    assert.deepEqual(summary.budgets[0].samples, [])
  })
})

test("a driver with no configured origin refuses as a typed failure", async () => {
  await withArtifactRoot(async () => {
    const exit = await run({ driver: "projection-delta" }, "perf-driver-refusal")
    assert.ok(Exit.isFailure(exit))
    assert.match(JSON.stringify(exit.cause), /perf\/projection-delta\.mjs/)
  })
})
