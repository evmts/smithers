import { InspectionJournal } from "@smthrs/gateway"
// The acts on runs and the run reads (src/features/runs, decision 0014 §2 and §6, docs/features/runs.md#acts), on this
// device's engine as the browser's engine worker registers them, over the compose Postgres, against ChatApi's real
// handler. A person's flow is the run they act on; the model is the only scripted seam.
import { Effect, Exit, Stream } from "effect"
import { SqlClient } from "effect/sql"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { contents, stop, testFile, usage } from "../../../worker/test/harness.ts"
import { cell, member, openAgent } from "../../test/agent"
import { FlowNew, FlowRun, FlowSave } from "../flows-ui/flows"
import { roundExecutionId } from "../flows-ui/round"
import { listed, retriedRunId, retryActId, runPath, settled } from "./contract"
import { retryable } from "./retry"
import { Cancel, Inspect, List, Resume, Retry } from "./flows"
import { versioned } from "./steps"

const runtime = testFile("runs_acts")

beforeEach(() =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, (sql) => sql`TRUNCATE flow_drafts, flow_revisions, flows CASCADE`))
)

/** A run of the agent takes several sealed model steps; under a loaded machine one test may take a minute. */
const SLOW = 240_000

type Request = Parameters<Parameters<typeof openAgent>[1]>[0]

const said = (request: Request) => [...request.system.map((part) => part.text), ...contents(request)].join("\n")
const answer = (source: string) => Stream.make({ type: "text-delta" as const, id: "t", text: cell(source) }, usage, stop)

const drafted = {
  description: "Say hello.",
  instructions: "Say hello.",
  flows: [],
  questions: [],
  summary: "Says hello.",
}

/**
 * A model that drafts a flow that says hello, and runs it: `stall` running calls wait forever (a run that is live),
 * and the rest answer.
 */
const model = (stall = 0) => {
  const running: Array<Request> = []
  const script = (request: Request) => {
    const text = said(request)
    if (text.includes("You draft a person's own flow")) return answer(`ctx.done(${JSON.stringify(drafted)})`)
    if (text.includes("You run one of the person's own flows")) {
      running.push(request)
      return running.length <= stall ? Stream.never : answer('ctx.done("Hello.")')
    }
    return Stream.empty
  }
  return { script, running }
}

const opened: Array<() => Promise<void>> = []
afterEach(async () => {
  // The newest first: a later engine on an earlier one's schema closes before the earlier one drops it.
  for (const close of opened.splice(0).reverse()) await close()
})

/** ChatApi and this device's engine, with a saved flow `hello`. */
const device = async (stall = 0) => {
  const m = model(stall)
  const agent = await openAgent(runtime, m.script, { actor: member, partsEvery: "20 millis" })
  const engine = await agent.engine()
  opened.push(engine.kill)
  const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.exit(effect))
  const draftId = crypto.randomUUID()
  await run(engine.flows.execute(FlowNew, { executionId: roundExecutionId(draftId, 0), payload: { name: "hello", request: "Say hello" } }))
  expect(await run(engine.flows.execute(FlowSave, { executionId: crypto.randomUUID(), payload: { draftId } })))
    .toMatchObject({ _tag: "Success" })
  return { agent, engine, run, model: m }
}

type Device = Awaited<ReturnType<typeof device>>

/** Reads `runId` through `run/inspect`. */
const inspect = async (d: Device, runId: string) => {
  const exit = await d.run(d.engine.flows.execute(Inspect, { executionId: crypto.randomUUID(), payload: { runId } }))
  if (Exit.isFailure(exit)) throw new Error(`inspect failed: ${JSON.stringify(exit)}`)
  return exit.value
}

/** Waits until `check` holds of `runId`, for up to 150 s on a loaded machine: the run as it was when it held. */
const until = async (d: Device, runId: string, check: (run: Awaited<ReturnType<typeof inspect>>) => boolean) => {
  let held: Awaited<ReturnType<typeof inspect>> | undefined
  await vi.waitFor(async () => {
    const run = await inspect(d, runId)
    expect(check(run)).toBe(true)
    held = run
  }, { timeout: 150_000, interval: 100 })
  return held!
}

/** Runs `statement` in the engine's own schema, whose triggers name its tables unqualified. */
const inEngine = <A>(d: Device, statement: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql.withTransaction(Effect.andThen(sql`SET LOCAL search_path TO ${sql(d.engine.schema)}`, statement(sql)))))

/** Starts `hello` as a run of its own and leaves it running. */
const startHello = async (d: Device, runId = crypto.randomUUID()) => {
  await Effect.runPromise(d.engine.flows.execute(FlowRun, { executionId: runId, payload: { name: "hello" }, discard: true }))
  return runId
}

const refusal = (exit: Exit.Exit<unknown, unknown>) => JSON.stringify(exit).match(/"code":"([a-z_]+)"/)?.[1]

describe("the pure rules", () => {
  test("which flows are retried, listed and settled", () => {
    expect(retryable("flow/run")).toBe(true)
    expect(retryable("chat/Answer")).toBe(false)
    expect(retryable("run/cancel")).toBe(false)
    expect(retryable("flow/run/prompt")).toBe(false)
    expect(retryable("gone/flow")).toBe(false)
    expect(listed("flow/run")).toBe(true)
    expect(listed("run/retry")).toBe(false)
    expect(settled("cancelled")).toBe(true)
    expect(settled("suspended")).toBe(false)
    expect(runPath("retry:a/run")).toBe("/app/runs/retry%3Aa%2Frun")
    expect(retryActId("a", 2)).toBe("retry:a:2")
    expect(retriedRunId("retry:a:2")).toBe("retry:a:2/run")
  })

  test("versioned drops a person's flow's pinned revision for the current one, and keeps everything else", () => {
    expect(versioned("flow/run", { name: "hello", revision: 2 }, "current")).toEqual({ name: "hello" })
    expect(versioned("flow/run", { name: "hello", revision: 2 }, "pinned")).toEqual({ name: "hello", revision: 2 })
    expect(versioned("app/theme/set", { mode: "dark" }, "current")).toEqual({ mode: "dark" })
    expect(versioned("flow/run", null, "current")).toBe(null)
  })
})

describe("run/list and run/inspect", () => {
  test("a finished run lists with its flow and status, and reads with its steps and result; acts aren't listed", async () => {
    const d = await device()
    const runId = crypto.randomUUID()
    expect(await d.run(d.engine.flows.execute(FlowRun, { executionId: runId, payload: { name: "hello" } })))
      .toEqual(Exit.succeed("Hello."))
    const read = await inspect(d, runId)
    expect(read).toMatchObject({ runId, flow: "flow/run", status: "completed", result: JSON.stringify("Hello.") })
    expect(read.steps.map((step) => step.action)).toContain("flow/run/load")
    expect(read.seq).toBeGreaterThan(0)

    const list = await d.run(d.engine.flows.execute(List, { executionId: crypto.randomUUID(), payload: {} }))
    expect(Exit.isSuccess(list)).toBe(true)
    const runs = (list as unknown as Exit.Success<{ runs: ReadonlyArray<{ runId: string; flow: string }> }>).value.runs
    expect(runs.find((run) => run.runId === runId)).toMatchObject({ flow: "flow/run", status: "completed" })
    expect(runs.some((run) => run.flow.startsWith("run/"))).toBe(false)

    expect(refusal(await d.run(d.engine.flows.execute(Inspect, { executionId: crypto.randomUUID(), payload: { runId: "nothing" } }))))
      .toBe("not_found")
  }, SLOW)
})

describe("run/cancel", () => {
  test("Stop on a live run records it, and the run ends cancelled; Stop again answers its final status", async () => {
    const d = await device(1)
    const runId = await startHello(d)
    const live = await until(d, runId, () => d.model.running.length === 1)
    const stop = (seq: number) => d.run(d.engine.flows.execute(Cancel, { executionId: crypto.randomUUID(), payload: { runId, seq } }))

    expect(refusal(await stop(live.seq + 1_000))).toBe("stale")
    expect(await stop(live.seq)).toEqual(Exit.succeed({ outcome: "requested", status: live.status }))
    const ended = await until(d, runId, (run) => run.status === "cancelled")
    expect(await stop(ended.seq)).toEqual(Exit.succeed({ outcome: "settled", status: "cancelled" }))
    expect(refusal(await d.run(d.engine.flows.execute(Cancel, { executionId: crypto.randomUUID(), payload: { runId: "nothing", seq: 0 } }))))
      .toBe("not_found")
  }, SLOW)
})

describe("run/retry", () => {
  test("Retry runs a settled run again as a new run of its own, once per act", async () => {
    const d = await device()
    const runId = crypto.randomUUID()
    await d.run(d.engine.flows.execute(FlowRun, { executionId: runId, payload: { name: "hello" } }))
    const act = retryActId(runId, 1)
    const retried = await d.run(d.engine.flows.execute(Retry, { executionId: act, payload: { runId, version: "pinned" } }))
    expect(retried).toEqual(Exit.succeed({ runId: retriedRunId(act) }))
    // The same act again starts nothing new.
    expect(await d.run(d.engine.flows.execute(Retry, { executionId: act, payload: { runId, version: "pinned" } }))).toEqual(retried)
    expect(await d.run(d.engine.flows.execute(FlowRun, { executionId: retriedRunId(act), payload: { name: "hello" } })))
      .toEqual(Exit.succeed("Hello."))
    const list = await d.run(d.engine.flows.execute(List, { executionId: crypto.randomUUID(), payload: {} }))
    expect(JSON.stringify(list)).toContain(retriedRunId(act))

    const current = await d.run(d.engine.flows.execute(Retry, { executionId: retryActId(runId, 2), payload: { runId, version: "current" } }))
    expect(current).toEqual(Exit.succeed({ runId: retriedRunId(retryActId(runId, 2)) }))
  }, SLOW)

  test("refuses a run that hasn't settled, a flow never retried, an unknown run, and a payload that won't read", async () => {
    const d = await device(1)
    const retry = (runId: string) =>
      d.run(d.engine.flows.execute(Retry, { executionId: crypto.randomUUID(), payload: { runId, version: "pinned" } }))
    const live = await startHello(d)
    await until(d, live, () => d.model.running.length === 1)
    expect(refusal(await retry(live))).toBe("not_settled")

    const act = crypto.randomUUID()
    await d.run(d.engine.flows.execute(List, { executionId: act, payload: {} }))
    // run/list isn't work: an act on runs is never retried.
    expect(refusal(await retry(act))).toBe("not_retryable")
    expect(refusal(await retry("nothing"))).toBe("not_found")

    const done = crypto.randomUUID()
    await d.run(d.engine.flows.execute(Cancel, { executionId: crypto.randomUUID(), payload: { runId: live, seq: (await inspect(d, live)).seq } }))
    await until(d, live, (run) => run.status === "cancelled")
    await inEngine(d, (sql) =>
      sql`UPDATE flows_runs SET state_json = jsonb_set(state_json::jsonb, '{payload}', '{"name": 5}')::text
        WHERE run_id = ${live}`)
    expect(refusal(await retry(live))).toBe("not_retryable")
    expect(done).toBeTruthy()
  }, SLOW)
})

describe("run/resume", () => {
  test("Resume drives a run no host drives again; a settled or moved run is refused", async () => {
    const d = await device(1)
    const runId = await startHello(d)
    await until(d, runId, () => d.model.running.length === 1)
    // The engine dies with the run in flight, as a closed tab's does; the next one holds it, undriven.
    await d.engine.crash()
    const next = await d.agent.engine(d.engine.schema)
    opened.push(next.kill)
    const d2 = { ...d, engine: next }
    const stuck = await inspect(d2, runId)
    expect(settled(stuck.status)).toBe(false)
    const resume = (seq: number) => d2.run(next.flows.execute(Resume, { executionId: crypto.randomUUID(), payload: { runId, seq } }))

    expect(refusal(await resume(stuck.seq - 1))).toBe("stale")
    expect(await resume(stuck.seq)).toEqual(Exit.succeed({ resumed: true }))
    const done = await until(d2, runId, (run) => run.status === "completed")
    expect(done.result).toBe(JSON.stringify("Hello."))
    expect(refusal(await resume(done.seq))).toBe("settled")
    expect(refusal(await d2.run(next.flows.execute(Resume, { executionId: crypto.randomUUID(), payload: { runId: "nothing", seq: 0 } }))))
      .toBe("not_found")
  }, SLOW)

  test("a run of a flow this engine doesn't run is not here", async () => {
    const d = await device()
    const runId = crypto.randomUUID()
    await d.run(d.engine.flows.execute(FlowRun, { executionId: runId, payload: { name: "hello" } }))
    await inEngine(d, (sql) =>
      sql`UPDATE flows_runs SET state_json = jsonb_set(state_json::jsonb, '{flowName}', '"gone/flow"')::text
        WHERE run_id = ${runId}`)
    expect(refusal(await d.run(d.engine.flows.execute(Retry, { executionId: crypto.randomUUID(), payload: { runId, version: "pinned" } }))))
      .toBe("not_retryable")
    await inEngine(d, (sql) =>
      sql`UPDATE flows_runs SET status = 'suspended', finished_at_ms = NULL WHERE run_id = ${runId}`)
    const seq = (await inspect(d, runId)).seq
    expect(refusal(await d.run(d.engine.flows.execute(Cancel, { executionId: crypto.randomUUID(), payload: { runId, seq } }))))
      .toBe("not_here")
    expect(refusal(await d.run(d.engine.flows.execute(Resume, { executionId: crypto.randomUUID(), payload: { runId, seq } }))))
      .toBe("not_here")
  }, SLOW)
})

test("a real completed personal flow journal lights its graph as completed", async () => {
  const d = await device()
  const runId = crypto.randomUUID()
  expect(await d.run(d.engine.flows.execute(FlowRun, { executionId: runId, payload: { name: "hello" } }))).toEqual(Exit.succeed("Hello."))
  const events = await inEngine(d, (sql) => sql<{ seq: number; event_type: string; emitted_at_ms: string; payload_json: string }>`SELECT seq, event_type, emitted_at_ms, payload_json FROM flows_journal_events WHERE run_id = ${runId} ORDER BY seq`)
  const journal = events.map((event) => ({ seq: Number(event.seq), eventType: event.event_type, emittedAtMs: Number(event.emitted_at_ms), payload: { text: event.payload_json, bytes: new TextEncoder().encode(event.payload_json).length, clipped: false } }))
  const monitor = InspectionJournal.monitorFromInspection({ runId, flowId: "hello", status: "completed" }, journal)
  const nodes = monitor.attempts[0]!.graph
  const settlements = journal.filter((e) => e.eventType.endsWith("node-settled")).map((e) => JSON.parse(e.payload.text))
  expect(nodes.length).toBeGreaterThan(0)
  expect(nodes.map((node) => node.state), JSON.stringify(settlements)).toEqual(nodes.map(() => "done"))
}, SLOW)
