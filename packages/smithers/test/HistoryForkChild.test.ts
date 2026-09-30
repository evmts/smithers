import * as ScriptedJudge from "@smthrs/agent/ScriptedJudge"
import { Control, ControlRuntime } from "@smthrs/control"
import type { RunId } from "@smthrs/control/ControlSchema"
import { Action, Flow, HumanTask, Interpreter } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import * as Executable from "@smthrs/registry/Executable"
import { Effect, Layer, Schema } from "effect"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterEach, expect, it } from "vitest"
import * as CoreFlow from "../flows/core/src/Flow.ts"
import * as History from "../src/history/History.ts"
import * as NodeControl from "../src/NodeControl.ts"

const moduleSource = `import * as Flow from "@smthrs/core/Flow"
import { Schema } from "effect"
export default Flow.make({name:"steps",description:"Steps",input:Schema.Unknown,output:Schema.Json,capabilities:[],flows:["test/Steps"]})
`
const ran: Array<string> = []
const step = (name: string) =>
  Action.make(name, { payload: {}, success: Schema.String, tier: "irreversible", idempotencyKey: name })
const First = step("fork/first")
const Second = step("fork/second")

const modules = () => {
  const Steps = Flow.make("test/Steps", {
    payload: Executable.Invocation,
    success: Schema.Json,
    error: HumanTask.HumanTaskFailed,
    body: () =>
      First.call({}).pipe(
        Node.bindPlanned(() => Second.call({})),
        Node.bindPlanned(() => HumanTask.action.call({ name: "probe", kind: "ask", prompt: "Go?", maxAttempts: 3 }))
      )
  })
  const implement = (action: typeof First) =>
    action.toLayer(() => Effect.sync(() => { ran.push(action.name); return action.name }))
  return Executable.layer({
    delegates: [Steps],
    load: () => Effect.succeed({ default: CoreFlow.make({ name: "steps", description: "Steps", input: Schema.Unknown, output: Schema.Json, capabilities: [], flows: ["test/Steps"] }) })
  }).pipe(
    Layer.provideMerge(Layer.mergeAll(Interpreter.layer(Steps), HumanTask.layer, implement(First), implement(Second)).pipe(Layer.provideMerge(Action.layerImplementations))),
    Layer.orDie
  )
}

import { appendFileSync } from "node:fs"
const log = (...a: Array<unknown>) => appendFileSync("/private/tmp/claude-501/-Users-williamcory-smithers/ae401ad3-ba4e-43bc-b6c8-e85e320dcf11/scratchpad/s194/fork/log.txt", a.map(String).join(" ") + "\n")
const roots: Array<string> = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); ran.length = 0 })

const drive = <A>(root: string, body: Effect.Effect<A, unknown, Control.Control | ControlRuntime.ControlRuntime>, executionRoot?: string) => {
  const registry = NodeControl.layerRegistry(root)
  const engine = NodeControl.engineDurable(root, registry)
  return Effect.runPromise(body.pipe(
    Effect.provide(Layer.merge(NodeControl.layerControl({ root, evaluator: ScriptedJudge.layer, ...(executionRoot === undefined ? {} : { executionRoot }) }, registry, engine, modules()), Layer.merge(engine.runtime, registry))),
    Effect.scoped, Effect.timeout("60 seconds")) as Effect.Effect<A>)
}
const parked = (runId: string, since = 0) => Effect.gen(function*() {
  const runtime = yield* ControlRuntime.ControlRuntime
  for (let attempt = 0; attempt < 1_000; attempt++) {
    const run = yield* runtime.getRun(runId as RunId)
    if (run.status === "parked" && run.updatedAt > since) return run
    yield* Effect.sleep("10 millis")
  }
  return yield* Effect.die("never parked")
})

it("explore", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "smithers-forkchild-")))
  roots.push(root)
  execFileSync("jj", ["git", "init", root], { stdio: "ignore" })
  mkdirSync(join(root, "flows", "steps"), { recursive: true })
  writeFileSync(join(root, "flows", "steps", "flow.ts"), moduleSource)
  const runId = await drive(root, Effect.gen(function*() {
    const control = yield* Control.Control
    const card = yield* control.plan({ flowId: "steps", input: {} })
    yield* control.approve(card.approval)
    const launched = yield* control.run({ _tag: "Plan", planId: card.planId, digest: card.digest, envelope: card.envelope, idempotencyKey: "start" })
    if (launched._tag !== "Accepted" || launched.runId === undefined) return yield* Effect.die("not accepted")
    yield* parked(launched.runId)
    return launched.runId
  }))
  const dump = () => {
    const db = new DatabaseSync(join(root, ".flows", "engine.db"), { readOnly: true })
    log(JSON.stringify(db.prepare("SELECT run_id,status,parent_run_id,state_json FROM flows_runs").all(), null, 1))
    log(JSON.stringify(db.prepare("SELECT run_id,step_key_digest,attempt,state,outcome_json FROM flows_attempts").all(), null, 1))
    log(JSON.stringify(db.prepare("SELECT * FROM flows_run_parents").all(), null, 1))
    if (process.env.JDUMP) for (const r of db.prepare("SELECT run_id,seq,emitted_at_ms,event_type,substr(payload_json,1,160) p,meta_json FROM flows_journal_events ORDER BY rowid").all()) log("J", JSON.stringify(r))
    db.close()
  }
  dump()
  const fork = await History.mutate(root, runId, {}, "fork")
  log("FORK", JSON.stringify(fork))
  const { executionRoot } = await History.prepare(root, fork.runId)
  const { canExecute } = await import("../src/history/Workspace.ts")
  log("CANEXEC", await canExecute(root, executionRoot, fork.runId), executionRoot)
  const before = Date.now()
  ran.length = 0
  await drive(root, Effect.gen(function*() {
    const rt = yield* ControlRuntime.ControlRuntime
    log("BEFORE", JSON.stringify(yield* rt.getRun(fork.runId as RunId)))
    yield* Effect.sleep("500 millis")
    log("BEFORE2", JSON.stringify(yield* rt.getRun(fork.runId as RunId)))
    const receipt = yield* (yield* Control.Control).resume({ runId: fork.runId as RunId, idempotencyKey: "resume-fork" }).pipe(Effect.catchCause((c) => Effect.sync(() => log("CAUSE", String(c)))))
    log("RECEIPT", JSON.stringify(receipt))
    yield* Effect.sleep("35 seconds")
    log("AFTER", JSON.stringify(yield* rt.getRun(fork.runId as RunId)))
  }), executionRoot)
  log("RAN", ran)
  dump()
}, 120_000)
