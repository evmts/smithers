import * as NodeCrypto from "@effect/platform-node/NodeCrypto"
import { FlowEngine } from "@smthrs/engine"
import { Action, Graph, Interpreter } from "@smthrs/flow"
import { Effect, Layer, Logger } from "effect"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import Meter from "../benchmark-meter/flow.ts"
import Benchmark, { Finish, implementations, Prepare, RunTrial, Trials } from "../benchmark/flow.ts"
import { command } from "../benchmark/process.ts"
import { planTrials } from "../benchmark/runtime.ts"
import { type Input, type Prepared, type Summary } from "../benchmark/schema.ts"

const input: Input = {
  suite: "noop",
  arms: ["smithers", "codex"],
  tasks: ["a", "b", "c"],
  k: 1,
  concurrency: 2,
  job: "flow-proof"
}
const prepared: Prepared = { root: "/controller", input, trials: planTrials(input.tasks as Array<string>, input) }
const summary = (trial: Prepared["trials"][number]): Summary => ({
  ...trial,
  suite: "noop",
  model: "openai/gpt-6.1-sol",
  start: "2026-10-02T00:00:00Z",
  end: "2026-10-02T00:00:01Z",
  account: null,
  reward: 1,
  wall: 1,
  uncached: 0,
  cached: 0,
  output: 0,
  exception: null,
  commit: "a".repeat(40)
})

test("public benchmark and meter declarations build stable graphs without launching work", () => {
  const graph = Graph.build(Benchmark, input, { callbackIdentity: "stable" })
  assert.deepEqual(graph.diagnostics, [])
  const calls = graph.nodes.filter((node) => node.kind === "ActionCall").map((node) =>
    (node.ast as { action: string }).action
  )
  assert.deepEqual(calls, ["benchmark/prepare", "benchmark/finish"])
  const children = graph.nodes.filter((node) =>
    node.kind === "FlowCall" && (node.ast as { mode?: string }).mode === "boundary"
  )
  assert.equal(children.length, 1)
  assert.equal((children[0]!.ast as { flow: string }).flow, "benchmark/trials")
  assert.deepEqual(Graph.drafts(Graph.build(Benchmark, input, { callbackIdentity: "stable" })), Graph.drafts(graph))
  const meter = Graph.build(Meter, { accounts: ["codex-1"], job: "meter-proof", durationSeconds: 60 }, {
    callbackIdentity: "stable"
  })
  assert.deepEqual(meter.diagnostics, [])
  assert.deepEqual(
    meter.nodes.filter((node) => node.kind === "ActionCall").map((node) => (node.ast as { action: string }).action),
    ["benchmark-meter/measure"]
  )
})

test("the child graph statically bounds trial batches and retains every planned attempt", () => {
  const graph = Graph.build(Trials, prepared, { callbackIdentity: "stable" })
  assert.deepEqual(graph.diagnostics, [])
  assert.equal(graph.nodes.filter((node) => node.kind === "ActionCall").length, 6)
  const batches = graph.nodes.filter((node) => node.kind === "All").map((node) =>
    Object.keys((node.ast as { nodes: Record<string, unknown> }).nodes)
  )
  assert.deepEqual(batches.map((batch) => batch.length), [2, 2, 2])
  assert.deepEqual(batches.flat(), prepared.trials.map((trial) => trial.id))
  assert.deepEqual(Graph.drafts(Graph.build(Trials, prepared, { callbackIdentity: "stable" })), Graph.drafts(graph))
  assert.deepEqual(Graph.build(Trials, { ...prepared, trials: [] }, { callbackIdentity: "stable" }).diagnostics, [])
})

test("real memory engine respects concurrency, journals completions, and replay does not repeat actions", {
  timeout: 20_000
}, async () => {
  const events: Array<string> = []
  let running = 0, maximum = 0, completed = 0
  const actions = Layer.mergeAll(
    Prepare.toLayer(() =>
      Effect.sync(() => {
        events.push("prepare")
        return prepared
      }), { implementationVersion: "benchmark/v1" }),
    RunTrial.toLayer(({ trial }) =>
      Effect.gen(function*() {
        yield* Effect.sync(() => {
          running++
          maximum = Math.max(maximum, running)
          events.push(`start:${trial.id}`)
        })
        yield* Effect.sleep(20)
        return yield* Effect.sync(() => {
          running--
          completed++
          events.push(`complete:${trial.id}`)
          return summary(trial)
        })
      }), { implementationVersion: "benchmark/v1" }),
    Finish.toLayer(({ summaries }) =>
      Effect.sync(() => {
        assert.equal(completed, 6)
        assert.equal(running, 0)
        assert.deepEqual(summaries.map((record) => record.id), prepared.trials.map((trial) => trial.id))
        events.push("finish")
        return {
          job: input.job,
          resultsRepo: "smithers-canary/bench-results",
          trials: summaries.length,
          commit: "a".repeat(40),
          publishable: false
        }
      }), { implementationVersion: "benchmark/v1" }),
    Interpreter.layer(Trials)
  )
  const host = Layer.mergeAll(actions, Interpreter.layer(Benchmark)).pipe(
    Layer.provideMerge(Action.layerImplementations),
    Layer.provideMerge(FlowEngine.layerMemory),
    Layer.provideMerge(NodeCrypto.layer),
    // Scripted actions mutate counters only; filesystem compensation is exercised by the real noop fixture below.
    Layer.provideMerge(Layer.succeed(FlowEngine.SnapshotBoundary, {
      snapshot: () => Effect.succeed(undefined),
      restore: () => Effect.void,
      diff: () => Effect.succeed(undefined)
    }))
  )
  await Effect.runPromise(Effect.scoped(
    Effect.gen(function*() {
      const first = yield* Benchmark.execute(input, { executionId: "memory-benchmark-proof" })
      const count = events.length
      const replayed = yield* Benchmark.execute(input, { executionId: "memory-benchmark-proof" })
      assert.deepEqual(replayed, first)
      assert.equal(events.length, count)
    }).pipe(Effect.provide(host))
  ))
  assert.equal(maximum, 2)
  assert.equal(completed, 6)
  assert.equal(events[0], "prepare")
  assert.equal(events.at(-1), "finish")
  for (let index = 1; index < 3; index++) {
    const nextStart = events.indexOf(`start:${prepared.trials[index * 2]!.id}`)
    assert.ok(nextStart > events.indexOf(`complete:${prepared.trials[index * 2 - 1]!.id}`))
  }
})

test(
  "the actual noop flow executes through the shared engine and publishes real Git/LFS receipts",
  { timeout: 60_000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "smithers-benchmark-flow-test-"))
    t.after(() => rm(root, { recursive: true, force: true }))
    const remote = join(root, "results.git")
    await command(["git", "init", "--bare", "--initial-branch=main", remote])
    const controller = join(root, "controller")
    const snapshots = join(root, "snapshots")
    await mkdir(snapshots)
    let captured = 0
    const boundary = Layer.succeed(FlowEngine.SnapshotBoundary, {
      snapshot: () =>
        Effect.promise(async () => {
          const path = join(snapshots, String(captured++))
          const present = await stat(controller).then(() => true, () => false)
          if (present) await cp(controller, path, { recursive: true })
          return { path, present }
        }),
      restore: (saved: unknown) =>
        Effect.promise(async () => {
          const checkpoint = saved as { path: string; present: boolean }
          await rm(controller, { recursive: true, force: true })
          if (checkpoint.present) await cp(checkpoint.path, controller, { recursive: true })
        }),
      diff: () => Effect.promise(() => readdir(controller))
    })
    const payload: Input = { suite: "noop", arms: ["smithers"], tasks: ["noop"], job: "engine-noop" }
    const logLines: Array<Record<string, unknown>> = []
    const trialId = planTrials(["noop"], payload)[0]!.id
    const logger = Logger.make((entry) => {
      for (const message of Array.isArray(entry.message) ? entry.message : [entry.message]) {
        if (typeof message !== "string" || !message.startsWith("{")) continue
        const record = JSON.parse(message) as Record<string, unknown>
        if (typeof record.commit !== "string" || !record.tokens) continue
        assert.equal(message.includes("\n"), false)
        assert.equal(message.includes("test-token-never-published"), false)
        // This marker is written only after the sink's real remote push receipt exists.
        const exported = JSON.parse(
          readFileSync(join(controller, ".flows", "benchmarks", payload.job, "raw", trialId, ".exported.json"), "utf8")
        )
        assert.equal(exported.commit, record.commit)
        logLines.push(record)
      }
    })
    const host = Layer.mergeAll(
      implementations({
        checkout: controller,
        resultsRemote: remote,
        environment: {
          ...process.env,
          BENCHMARK_SMITHERS_TOKEN: "test-token-never-published",
          BENCHMARK_TOKEN_EXPIRES_AT: new Date(Date.now() + 3_600_000).toISOString()
        }
      }),
      Interpreter.layer(Benchmark)
    ).pipe(
      Layer.provideMerge(Action.layerImplementations),
      Layer.provideMerge(FlowEngine.layerMemory),
      Layer.provideMerge(NodeCrypto.layer),
      Layer.provideMerge(boundary)
    )
    const receipt = await Effect.runPromise(
      Effect.scoped(
        Benchmark.execute(payload, { executionId: "real-noop-proof" }).pipe(
          Effect.provide(host),
          Effect.provide(Logger.layer([logger]))
        )
      )
    )
    assert.equal(receipt.trials, 1)
    assert.equal(receipt.publishable, false)
    assert.equal(captured, 1)
    assert.equal(await command(["git", "--git-dir", remote, "rev-parse", "main"]), receipt.commit)
    const summaries = JSON.parse(
      await command(["git", "--git-dir", remote, "show", `main:jobs/${payload.job}/trials.json`])
    ) as Array<Summary>
    assert.equal(summaries.length, 1)
    assert.deepEqual(logLines, [{
      task: "noop",
      arm: "smithers",
      reward: 1,
      wall: 0,
      tokens: { uncached: 0, cached: 0, output: 0 },
      account: null,
      exception: null,
      commit: summaries[0]!.commit
    }])
    assert.match(summaries[0]!.commit, /^[0-9a-f]{40}$/)
    const pointer = await command([
      "git",
      "--git-dir",
      remote,
      "show",
      `main:jobs/${payload.job}/${summaries[0]!.id}.tar.zst`
    ])
    assert.match(pointer, /^version https:\/\/git-lfs.github.com\/spec\/v1/)
    assert.equal(
      (await readFile(
        join(controller, ".flows", "benchmarks", payload.job, "results", "jobs", payload.job, "report.md"),
        "utf8"
      )).includes("Model calls: 0"),
      true
    )
    assert.equal(JSON.stringify(summaries).includes("test-token-never-published"), false)
  }
)
