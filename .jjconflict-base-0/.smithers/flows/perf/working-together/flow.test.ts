/**
 * `perf/working-together` through the flow API: the real graph, the real layer
 * and a real child process running `faults.mjs`. The component run spawns a
 * stand-in `cargo` that prints a complete, hooked component log, so the
 * runner's own verdict decides the outcome without compiling the suites.
 */
import * as NodeCrypto from "@effect/platform-node/NodeCrypto"
import { FlowEngine } from "@smthrs/engine"
import { Interpreter } from "@smthrs/flow"
import { Effect, Exit, Layer } from "effect"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import WorkingTogether, { argv, layer, type Request } from "./flow.ts"

const run = (payload: typeof Request.Type, executionId: string) =>
  Effect.runPromiseExit(
    WorkingTogether.execute(payload, { executionId }).pipe(
      Effect.provide(
        Interpreter.layerWithImplementations(WorkingTogether, layer).pipe(
          Layer.provideMerge(FlowEngine.layerMemory),
          Layer.provideMerge(NodeCrypto.layer)
        )
      )
    )
  )

// A committed checkout whose working directory the runner records and writes under.
const inCheckout = async (body: (root: string) => Promise<void>) => {
  const root = mkdtempSync(join(tmpdir(), "working-together-flow-"))
  const previous = { cwd: process.cwd(), path: process.env.PATH }
  execFileSync("git", ["init", "--quiet"], { cwd: root })
  execFileSync("git", [
    "-c",
    "user.name=fixture",
    "-c",
    "user.email=fixture@invalid",
    "commit",
    "--quiet",
    "--allow-empty",
    "-m",
    "fixture"
  ], { cwd: root })
  process.chdir(root)
  try {
    await body(root)
  } finally {
    process.chdir(previous.cwd)
    process.env.PATH = previous.path
    rmSync(root, { recursive: true, force: true })
  }
}

// The component suites `faults.mjs` requires, and the kill-hook tests two of them
// must report exactly once. Every section passes with assertions.
const suites = ["versions", "outbox", "capture", "reconcile", "barrier", "documents", "rebase", "link", "moved_off"]
const componentKillTests: Record<string, ReadonlyArray<string>> = {
  versions: ["k1_k2_process_exit_recovery_ten_runs_each"],
  link: ["authenticated_delivery_killpoints_replay_ten_runs_each"]
}
const componentLog = suites.map((suite) => {
  const kills = componentKillTests[suite] ?? []
  return [
    `     Running tests/${suite}.rs (target/debug/deps/${suite}-0)`,
    ...kills.map((name) => `test ${name} ... ok`),
    `test result: ok. ${kills.length + 1} passed; 0 failed; 0 ignored`
  ].join("\n")
}).join("\n")

test("the payload maps to the campaign's command line", () => {
  assert.deepEqual(argv({}), [])
  assert.deepEqual(argv({ suite: "components-only" }), ["--components-only"])
  assert.deepEqual(argv({ suite: "watcher-host-only", receipt: true }), ["--watcher-host-only", "--receipt"])
})

test("component suites that pass with their kill hooks succeed and record component evidence", async () => {
  await inCheckout(async (root) => {
    const bin = join(root, "bin")
    mkdirSync(bin)
    writeFileSync(
      join(bin, "cargo"),
      `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(componentLog)} + "\\n")\n`
    )
    chmodSync(join(bin, "cargo"), 0o755)
    process.env.PATH = `${bin}:${process.env.PATH}`
    const exit = await run({ suite: "components-only" }, "working-together-components")
    assert.ok(Exit.isSuccess(exit), JSON.stringify(Exit.isFailure(exit) ? exit.cause : undefined))
    const parent = join(root, ".artifacts/checks/C-DUR-04")
    const [directory] = readdirSync(parent)
    const summary = JSON.parse(readFileSync(join(parent, directory!, "summary.json"), "utf8"))
    assert.equal(summary.componentStatus, "component-passed")
    assert.equal(summary.status, "incomplete")
    assert.ok(summary.points.every((point: { status: string }) => point.status === "blocked"))
  })
})

test("a symlinked evidence parent is refused as a typed failure before cargo runs", async () => {
  await inCheckout(async (root) => {
    mkdirSync(join(root, ".artifacts"))
    mkdirSync(join(root, "outside"))
    symlinkSync(join(root, "outside"), join(root, ".artifacts/checks"))
    process.env.PATH = ""
    const exit = await run({ suite: "components-only" }, "working-together-symlink")
    assert.ok(Exit.isFailure(exit))
    assert.match(JSON.stringify(exit.cause), /perf\/working-together\/faults\.mjs/)
    assert.deepEqual(readdirSync(join(root, "outside")), [])
  })
})
