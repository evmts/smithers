/**
 * `perf/github-freshness` through the flow API: the real graph, the real layer
 * and a real child process running `github-freshness.mjs`. The phase
 * comparison is the deterministic path; a phase run writes a real canary
 * repository and is covered by `github-freshness.test.mjs` against a stub.
 */
import * as NodeCrypto from "@effect/platform-node/NodeCrypto"
import { FlowEngine } from "@smthrs/engine"
import { Interpreter } from "@smthrs/flow"
import { Effect, Exit, Layer, Schema } from "effect"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import Freshness, { argv, layer, Request } from "./flow.ts"

const run = (payload: typeof Request.Type, executionId: string) =>
  Effect.runPromiseExit(
    Freshness.execute(payload, { executionId }).pipe(
      Effect.provide(
        Interpreter.layerWithImplementations(Freshness, layer).pipe(
          Layer.provideMerge(FlowEngine.layerMemory),
          Layer.provideMerge(NodeCrypto.layer)
        )
      )
    )
  )

const phase = (name: string, p95: number) => ({
  phase: name,
  metrics: Object.fromEntries(["main", "pr", "checks", "issue"].map((kind) => [kind, { passed: true, n: 100, p95 }]))
})

const withPhases = async (dropped: unknown, body: (inactive: string, dropped: string) => Promise<void>) => {
  const directory = mkdtempSync(join(tmpdir(), "github-freshness-flow-"))
  try {
    writeFileSync(join(directory, "inactive.json"), JSON.stringify(phase("inactive", 2000)))
    writeFileSync(join(directory, "dropped.json"), JSON.stringify(dropped))
    await body(join(directory, "inactive.json"), join(directory, "dropped.json"))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test("the payload maps to the runner's command line", () => {
  assert.deepEqual(argv({ compare: { inactive: "a.json", dropped: "b.json" } }), ["--compare", "a.json", "b.json"])
  assert.deepEqual(argv({ config: "canary.json", directory: "evidence" }), ["canary.json", "evidence"])
})

test("the payload is a run or a comparison, never both or half of one", () => {
  const decode = Schema.decodeUnknownExit(Request)
  assert.ok(Exit.isSuccess(decode({ config: "c.json", directory: "d" })))
  assert.ok(Exit.isSuccess(decode({ compare: { inactive: "a.json", dropped: "b.json" } })))
  for (const invalid of [{}, { config: "c.json" }, { config: "c.json", directory: "d", compare: { inactive: "a", dropped: "b" } }]) {
    assert.ok(Exit.isFailure(decode(invalid)), JSON.stringify(invalid))
  }
})

test("a dropped phase within five seconds of the inactive one compares as passed", async () => {
  await withPhases(phase("dropped", 7000), async (inactive, dropped) => {
    const exit = await run({ compare: { inactive, dropped } }, "freshness-compare-pass")
    assert.ok(Exit.isSuccess(exit), JSON.stringify(Exit.isFailure(exit) ? exit.cause : undefined))
  })
})

test("a slower dropped phase is a typed failure", async () => {
  await withPhases(phase("dropped", 7001), async (inactive, dropped) => {
    const exit = await run({ compare: { inactive, dropped } }, "freshness-compare-fail")
    assert.ok(Exit.isFailure(exit))
    assert.match(JSON.stringify(exit.cause), /perf\/github-freshness\/github-freshness\.mjs/)
  })
})
