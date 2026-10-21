import { FlowRegistry, registry as flowEntries } from "../../flows/registry"
// Your own flows on this device's engine (decision 0014 §2, docs/features/flows.md#your-own-flows): every `flow/*` flow
// runs as the browser's engine worker registers it (src/flows/registrations.ts), on the Node host over the compose
// Postgres, against ChatApi's real handler on this file's schema. The model is the only scripted seam: the endpoint's
// `agent` role answers with cells, which the drafting agent and the agent running a flow write.
import { Effect, Exit, Stream } from "effect"
import { SqlClient } from "effect/sql"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { stop, testFile, usage } from "../../../worker/test/harness.ts"
import { contents } from "../../../worker/test/harness.ts"
import * as Pg from "@effect/sql-pg"
import { PostgresDatabase } from "@smthrs/database"
import { Uuid, WebCrypto } from "@smthrs/crypto"
import { FlowRuntime } from "@smthrs/flow"
import { EngineStore } from "@smthrs/flows"
import { Layer } from "effect"
import * as TestDatabase from "../../../db/TestDatabase.ts"
import * as Catalog from "../../flows/catalog"
import { cell, member, openAgent } from "../../test/agent"
import { FlowAnswer, FlowDelete, FlowList, FlowNew, FlowRead, FlowRun, FlowSave, FlowWrite } from "./flows"
import { DRAFT_ID_NAMESPACE } from "./contract"
import { roundExecutionId, roundOf } from "./round"
import { renderSource, SOURCE_PATH } from "./source"
import { writeOutcome } from "./steps"

const runtime = testFile("flows_ui")

/** A run of the agent takes several sealed model steps; under a loaded machine one test may take a minute. */
const SLOW = 90_000

beforeEach(() =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, (sql) => sql`TRUNCATE flow_drafts, flow_revisions, flows CASCADE`))
)

type Request = Parameters<Parameters<typeof openAgent>[1]>[0]

/** What the model answers a request with: one cell. */
const answer = (source: string) => Stream.make({ type: "text-delta" as const, id: "t", text: cell(source) }, usage, stop)

/** Everything `request` says: its system prompt and its messages. */
const said = (request: Request) => [...request.system.map((part) => part.text), ...contents(request)].join("\n")

/** Whether `request` is the drafting agent's, or the one running a person's flow. */
const drafting = (request: Request) => said(request).includes("You draft a person's own flow")
const running = (request: Request) => said(request).includes("You run one of the person's own flows")

/** A draft the agent answers with. */
const drafted = (overrides: Record<string, unknown> = {}) => ({
  description: "Switch this device to dark mode.",
  instructions: "Set the theme to dark, then say it is done.",
  flows: ["app/theme/set"],
  questions: [{ text: "Which mode?", assumed: "dark", blocking: false }],
  summary: "Sets dark mode.",
  ...overrides,
})

/** A model that drafts `draft` and, running a flow, follows `run`'s cells in turn. */
const scripted = (draft: () => object, run: ReadonlyArray<string> = ['ctx.done("Done.")']) => {
  const requests: Array<Request> = []
  let ran = 0
  const script = (request: Request) => {
    requests.push(request)
    if (drafting(request)) return answer(`ctx.done(${JSON.stringify(draft())})`)
    if (running(request)) return answer(run[Math.min(ran++, run.length - 1)]!)
    return Stream.empty
  }
  return { script, requests }
}

const opened: Array<{ readonly close: () => Promise<void> }> = []
afterEach(async () => {
  for (const each of opened.splice(0)) await each.close()
})

/** ChatApi and this device's engine, with `script` as the model. */
const device = async (script: Parameters<typeof openAgent>[1]) => {
  const agent = await openAgent(runtime, script, { actor: member, partsEvery: "20 millis" })
  const engine = await agent.engine()
  opened.push({ close: engine.kill })
  const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.exit(effect))
  return { agent, engine, run }
}

const draftRow = async (draftId: string) => {
  const [row] = await runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql<{
      readonly status: string
      readonly round: number
      readonly name: string
      readonly files: ReadonlyArray<{ path: string; text: string }>
      readonly checks: ReadonlyArray<{ check: string; ok: boolean; code?: string }>
      readonly questions: ReadonlyArray<{ id: string; text: string; assumed: string; blocking: boolean; answer?: string }>
      readonly failure: string | null
      readonly flowId: string | null
    }>`SELECT status, round, name, files, checks, questions, failure, flow_id AS "flowId" FROM flow_drafts WHERE id = ${draftId}`))
  return row
}

describe("roundOf", () => {
  test("reads a draft's round from its execution id, and nothing from any other", () => {
    const draftId = crypto.randomUUID()
    expect(roundOf(roundExecutionId(draftId, 3))).toEqual({ draftId, round: 3 })
    expect(roundOf(`${draftId.toUpperCase()}:0`)).toEqual({ draftId, round: 0 })
    expect(roundOf(draftId)).toBeUndefined()
    expect(roundOf(`${draftId}:01`)).toBeUndefined()
    expect(roundOf("answer/chat/Respond@x:1/call/0.0")).toBeUndefined()
  })
})

describe("flow/new", () => {
  test("one round drafts the flow's source, checks it and writes the draft ready, with its questions", async () => {
    const model = scripted(() => drafted())
    const { engine, run } = await device(model.script)
    const draftId = crypto.randomUUID()

    const exit = await run(engine.flows.execute(FlowNew, {
      executionId: roundExecutionId(draftId, 0),
      payload: { name: "dark-mode", request: "Switch to dark mode" },
    }))

    expect(exit).toEqual(Exit.succeed({ draftId, round: 0, status: "ready", name: "dark-mode" }))
    const row = await draftRow(draftId)
    expect(row).toMatchObject({ status: "ready", round: 0, name: "dark-mode", failure: null, flowId: null })
    expect(row!.files).toEqual([{
      path: SOURCE_PATH,
      text: renderSource({
        name: "dark-mode",
        description: "Switch this device to dark mode.",
        flows: ["app/theme/set"],
        instructions: "Set the theme to dark, then say it is done.",
      }),
    }])
    expect(row!.checks.every((check) => check.ok)).toBe(true)
    expect(row!.questions).toEqual([{ id: "r0q1", text: "Which mode?", assumed: "dark", blocking: false }])
    // The drafting agent was shown the catalog a person's flow may call, and never the authoring acts.
    const prompt = said(model.requests.find(drafting)!)
    expect(prompt).toContain("- app/theme/set:")
    expect(prompt).not.toContain("- flow/new:")
  })
})

/** Drafts `name` to ready and saves it: the saved flow. */
const saveFlow = async (
  d: Awaited<ReturnType<typeof device>>,
  name: string,
) => {
  const draftId = crypto.randomUUID()
  const round = await d.run(d.engine.flows.execute(FlowNew, {
    executionId: roundExecutionId(draftId, 0),
    payload: { name, request: "Switch to dark mode" },
  }))
  expect(round).toMatchObject({ _tag: "Success", value: { status: "ready" } })
  const saved = await d.run(d.engine.flows.execute(FlowSave, { executionId: crypto.randomUUID(), payload: { draftId } }))
  expect(saved).toMatchObject({ _tag: "Success" })
  return { draftId, ...(saved as unknown as Exit.Success<{ flowId: string; revision: number }>).value }
}

/** Writes a draft round straight through ChatApi's route, as the person's own steps would. */
const writeRound = (d: Awaited<ReturnType<typeof device>>, draftId: string, write: object) =>
  d.agent.h.fetch(`/api/flow-drafts/${draftId}`, { method: "POST", body: JSON.stringify(write) })

const readyRound = (name: string, overrides: object = {}) => ({
  scope: "person",
  round: 0,
  request: "Switch to dark mode",
  name,
  status: "ready",
  summary: null,
  files: [{
    path: SOURCE_PATH,
    text: renderSource({ name, description: "Dark.", flows: [], instructions: "Go dark." }),
  }],
  checks: [{ check: "parses", ok: true }],
  questions: [],
  failure: null,
  flowId: null,
  ...overrides,
})

describe("flow/new, more rounds", () => {
  test("any other execution id starts a new draft of its own, named by that execution so a step run again writes the same one", async () => {
    const d = await device(scripted(() => drafted()).script)
    const executionId = `agent-${crypto.randomUUID()}`
    const exit = await d.run(d.engine.flows.execute(FlowNew, {
      executionId,
      payload: { name: "dark-mode", request: "Switch to dark mode" },
    }))
    expect(exit._tag).toBe("Success")
    const { draftId } = (exit as unknown as Exit.Success<{ draftId: string }>).value
    expect(draftId).toBe(await Effect.runPromise(Uuid.v5(DRAFT_ID_NAMESPACE, executionId).pipe(Effect.provide(WebCrypto.layer))))
    expect(await draftRow(draftId)).toMatchObject({ status: "ready", round: 0 })
  }, SLOW)

  test("a blocking question holds the round; the answers start round 1 as a run of its own, which drafts with them", async () => {
    let round = 0
    const model = scripted(() =>
      round++ === 0
        ? drafted({
          questions: [
            { text: "Light or dark?", assumed: "dark", blocking: true },
            { text: "Say it is done?", assumed: "yes", blocking: false },
          ],
        })
        : drafted({ questions: [], summary: "" })
    )
    const d = await device(model.script)
    const draftId = crypto.randomUUID()
    const payload = { name: "dark-mode", request: "Switch the mode" }

    expect(await d.run(d.engine.flows.execute(FlowNew, { executionId: roundExecutionId(draftId, 0), payload })))
      .toEqual(Exit.succeed({ draftId, round: 0, status: "needs_you", name: "dark-mode" }))
    // Save waits for the answer.
    expect(await d.run(d.engine.flows.execute(FlowSave, { executionId: crypto.randomUUID(), payload: { draftId } })))
      .toMatchObject({ _tag: "Failure" })

    const answered = await d.run(d.engine.flows.execute(FlowAnswer, {
      executionId: crypto.randomUUID(),
      payload: { draftId, round: 0, answers: [{ id: "r0q1", value: "light" }] },
    }))
    expect(answered).toEqual(Exit.succeed({ draftId, round: 1 }))
    // The next round runs on its own: joining it reads how it ended.
    expect(await d.run(d.engine.flows.execute(FlowNew, { executionId: roundExecutionId(draftId, 1), payload })))
      .toEqual(Exit.succeed({ draftId, round: 1, status: "ready", name: "dark-mode" }))
    const second = said(model.requests.filter(drafting).at(-1)!)
    expect(second).toContain("The person answered:\n- Light or dark? light")
    expect(second).toContain("The flow so far:")
    expect(await draftRow(draftId)).toMatchObject({ status: "ready", round: 1, questions: [] })

    // Answers to a round that has moved on are refused.
    const stale = await d.run(d.engine.flows.execute(FlowAnswer, {
      executionId: crypto.randomUUID(),
      payload: { draftId, round: 0, answers: [{ id: "r0q1", value: "dark" }] },
    }))
    expect(stale).toMatchObject({ _tag: "Failure" })
    expect(JSON.stringify(stale)).toContain("stale_round")
  }, SLOW)

  test("an agent that never drafts a valid flow fails the round, and the draft says so", async () => {
    const d = await device(scripted(() => ({ nope: true })).script)
    const draftId = crypto.randomUUID()
    expect(await d.run(d.engine.flows.execute(FlowNew, {
      executionId: roundExecutionId(draftId, 0),
      payload: { name: "dark-mode", request: "Switch to dark mode" },
    }))).toEqual(Exit.succeed({ draftId, round: 0, status: "failed", name: "dark-mode" }))
    expect(await draftRow(draftId)).toMatchObject({ status: "failed", failure: "draft", files: [], checks: [] })
    // Answering a failed round drafts again, from no file.
    expect(await d.run(d.engine.flows.execute(FlowAnswer, {
      executionId: crypto.randomUUID(),
      payload: { draftId, round: 0, answers: [{ id: "nothing", value: "Try again" }] },
    }))).toEqual(Exit.succeed({ draftId, round: 1 }))
    expect(await d.run(d.engine.flows.execute(FlowNew, {
      executionId: roundExecutionId(draftId, 1),
      payload: { name: "dark-mode", request: "Switch to dark mode" },
    }))).toEqual(Exit.succeed({ draftId, round: 1, status: "failed", name: "dark-mode" }))
  }, SLOW)

  test("a draft that fails a check is ready with the check named, and won't save", async () => {
    const d = await device(scripted(() => drafted({ flows: ["repo/write"] })).script)
    const draftId = crypto.randomUUID()
    await d.run(d.engine.flows.execute(FlowNew, {
      executionId: roundExecutionId(draftId, 0),
      payload: { name: "dark-mode", request: "Switch to dark mode" },
    }))
    expect((await draftRow(draftId))!.checks).toContainEqual({ check: "calls", ok: false, code: "unknown" })
    const saved = await d.run(d.engine.flows.execute(FlowSave, { executionId: crypto.randomUUID(), payload: { draftId } }))
    expect(JSON.stringify(saved)).toContain('"code":"checks"')
  }, SLOW)

  test("a name you have edits that flow: the round starts from its source, and saving makes revision 2", async () => {
    const model = scripted(() => drafted())
    const d = await device(model.script)
    const first = await saveFlow(d, "dark-mode")
    expect(first.revision).toBe(1)
    const second = await saveFlow(d, "dark-mode")
    expect(second).toMatchObject({ flowId: first.flowId, revision: 2 })
    expect(said(model.requests.filter(drafting).at(-1)!)).toContain(
      "The flow so far:\n// Drafted by Smithers from a prompt.",
    )
    expect(await draftRow(second.draftId)).toMatchObject({ status: "saved", flowId: first.flowId })
  }, SLOW)
})

describe("flow/save", () => {
  test("ChatApi's other refusals pass on: an edit of a flow deleted meanwhile is gone", async () => {
    const d = await device(scripted(() => drafted()).script)
    const first = await saveFlow(d, "dark-mode")
    const draftId = crypto.randomUUID()
    await d.run(d.engine.flows.execute(FlowNew, {
      executionId: roundExecutionId(draftId, 0),
      payload: { name: "dark-mode", request: "Switch to dark mode" },
    }))
    expect(await d.run(d.engine.flows.execute(FlowDelete, { executionId: crypto.randomUUID(), payload: { flowId: first.flowId } })))
      .toEqual(Exit.succeed({ deleted: true }))
    const saved = await d.run(d.engine.flows.execute(FlowSave, { executionId: crypto.randomUUID(), payload: { draftId } }))
    expect(JSON.stringify(saved)).toContain('"code":"gone"')
  }, SLOW)

  test("saving again answers the same flow; a name another draft took first is taken", async () => {
    const d = await device(scripted(() => drafted()).script)
    const one = crypto.randomUUID()
    const two = crypto.randomUUID()
    for (const draftId of [one, two]) {
      await d.run(d.engine.flows.execute(FlowNew, {
        executionId: roundExecutionId(draftId, 0),
        payload: { name: "dark-mode", request: "Switch to dark mode" },
      }))
    }
    const saved = await d.run(d.engine.flows.execute(FlowSave, { executionId: crypto.randomUUID(), payload: { draftId: one } }))
    expect(await d.run(d.engine.flows.execute(FlowSave, { executionId: crypto.randomUUID(), payload: { draftId: one } })))
      .toEqual(saved)
    const taken = await d.run(d.engine.flows.execute(FlowSave, { executionId: crypto.randomUUID(), payload: { draftId: two } }))
    expect(JSON.stringify(taken)).toContain("NameTaken")
  }, SLOW)

  test("refuses a draft that isn't ready, has no file, or holds a blocking question; passes other refusals on", async () => {
    const d = await device(scripted(() => drafted()).script)
    const cases: ReadonlyArray<readonly [object, string]> = [
      [{ status: "failed" }, "not_ready"],
      [{ files: [] }, "not_ready"],
      [{ questions: [{ id: "q", text: "Which?", assumed: "a", blocking: true }] }, "needs_you"],
    ]
    for (const [overrides, code] of cases) {
      const draftId = crypto.randomUUID()
      expect((await writeRound(d, draftId, readyRound("dark-mode", overrides))).status).toBe(200)
      const saved = await d.run(d.engine.flows.execute(FlowSave, { executionId: crypto.randomUUID(), payload: { draftId } }))
      expect([code, JSON.stringify(saved).includes(`"code":"${code}"`)]).toEqual([code, true])
    }
    // ChatApi's own refusal, for a draft that isn't the person's.
    const missing = await d.run(d.engine.flows.execute(FlowSave, { executionId: crypto.randomUUID(), payload: { draftId: crypto.randomUUID() } }))
    expect(JSON.stringify(missing)).toContain("not_found")
  }, SLOW)
})

describe("flow/run", () => {
  test("runs the latest revision: the agent follows it and calls what it lists, as the person", async () => {
    const model = scripted(() => drafted(), [
      'await ctx.call("app/theme/set", { mode: "dark" })',
      'ctx.done("Dark mode is on.")',
    ])
    const d = await device(model.script)
    await saveFlow(d, "dark-mode")
    const exit = await d.run(d.engine.flows.execute(FlowRun, {
      executionId: crypto.randomUUID(),
      payload: { name: "dark-mode", input: "please" },
    }))
    expect(exit).toEqual(Exit.succeed("Dark mode is on."))
    expect(d.agent.painted).toEqual(["dark"])
    // Asked what the flow's own step asks: its instructions, then its input.
    const prompt = said(model.requests.find(running)!)
    expect(prompt).toContain("Set the theme to dark, then say it is done.\n\nInput: please")
  }, SLOW)

  test("a call outside the flow's list is refused, and the agent sees only its list", async () => {
    const model = scripted(() => drafted({ flows: [] }), [
      'await ctx.call("app/theme/set", { mode: "dark" })',
      'ctx.done("I couldn\'t.")',
    ])
    const d = await device(model.script)
    await saveFlow(d, "dark-mode")
    const exit = await d.run(d.engine.flows.execute(FlowRun, { executionId: crypto.randomUUID(), payload: { name: "dark-mode" } }))
    expect(exit).toEqual(Exit.succeed("I couldn't."))
    expect(d.agent.painted).toEqual([])
    const prompt = said(model.requests.find(running)!)
    expect(prompt).toContain("Set the theme to dark, then say it is done.")
    expect(prompt).not.toContain("Input:")
    expect(prompt).not.toContain("app/navigate")
  }, SLOW)

  test("an agent that never finishes fails the run with a closed code", async () => {
    const d = await device(scripted(() => drafted(), ['console.log("thinking")']).script)
    await saveFlow(d, "dark-mode")
    const exit = await d.run(d.engine.flows.execute(FlowRun, { executionId: crypto.randomUUID(), payload: { name: "dark-mode" } }))
    expect(JSON.stringify(exit)).toContain("@smthrs/mvp/flows/FlowAgentFailed")
  }, SLOW)

  test("a name you don't have isn't found; a revision whose bytes changed, or that fails a check, is invalid", async () => {
    const d = await device(scripted(() => drafted()).script)
    const missing = await d.run(d.engine.flows.execute(FlowRun, { executionId: crypto.randomUUID(), payload: { name: "nothing" } }))
    expect(JSON.stringify(missing)).toContain("FlowNotFound")

    const saved = await saveFlow(d, "dark-mode")
    await runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, (sql) =>
      sql`UPDATE flow_revisions SET source = source || ' ' WHERE flow_id = ${saved.flowId}`))
    const tampered = await d.run(d.engine.flows.execute(FlowRun, { executionId: crypto.randomUUID(), payload: { name: "dark-mode", revision: 1 } }))
    expect(JSON.stringify(tampered)).toContain('"check":"digest"')

    const forbidden = renderSource({ name: "dark-mode", description: "Dark.", flows: ["flow/new"], instructions: "Go." })
    const { digestSync } = await import("@smthrs/crypto")
    await runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, (sql) =>
      sql`UPDATE flow_revisions SET source = ${forbidden}, digest = ${digestSync(forbidden)} WHERE flow_id = ${saved.flowId}`))
    const invalid = await d.run(d.engine.flows.execute(FlowRun, { executionId: crypto.randomUUID(), payload: { name: "dark-mode" } }))
    expect(JSON.stringify(invalid)).toContain('"check":"calls"')
  }, SLOW)
})

describe("a flow's code", () => {
  /** The saved flow's source with its step relabelled: code the system didn't write. */
  const relabelled = (source: string) => source.replace(`"dark-mode/agent"`, `"dark-mode/answer"`)

  test("flow/read reads a revision's code and where it runs; a name you don't have isn't found", async () => {
    const d = await device(scripted(() => drafted()).script)
    const saved = await saveFlow(d, "dark-mode")
    const read = await d.run(d.engine.flows.execute(FlowRead, { executionId: crypto.randomUUID(), payload: { name: "dark-mode" } }))
    expect(read).toEqual(Exit.succeed({
      flowId: saved.flowId,
      name: "dark-mode",
      revision: 1,
      source: renderSource({
        name: "dark-mode",
        description: "Switch this device to dark mode.",
        flows: ["app/theme/set"],
        instructions: "Set the theme to dark, then say it is done.",
      }),
      placement: "client",
    }))
    const missing = await d.run(d.engine.flows.execute(FlowRead, { executionId: crypto.randomUUID(), payload: { name: "nothing" } }))
    expect(JSON.stringify(missing)).toContain("FlowNotFound")
  }, SLOW)

  test("code written by hand saves as the next revision and needs a sandbox: its run fails before the agent runs", async () => {
    const model = scripted(() => drafted(), ['ctx.done("Ran.")'])
    const d = await device(model.script)
    await saveFlow(d, "dark-mode")
    const { source } = (await d.run(d.engine.flows.execute(FlowRead, {
      executionId: crypto.randomUUID(),
      payload: { name: "dark-mode" },
    })) as unknown as Exit.Success<{ source: string }>).value

    const written = await d.run(d.engine.flows.execute(FlowWrite, {
      executionId: crypto.randomUUID(),
      payload: { name: "dark-mode", revision: 1, source: relabelled(source) },
    }))
    expect(written).toMatchObject({ _tag: "Success", value: { name: "dark-mode", revision: 2, placement: "sandbox" } })
    const refused = await d.run(d.engine.flows.execute(FlowRun, { executionId: crypto.randomUUID(), payload: { name: "dark-mode" } }))
    expect(JSON.stringify(refused)).toContain("@smthrs/mvp/flows/FlowNeedsSandbox")
    expect(model.requests.filter(running)).toEqual([])

    // The drafted code again: it runs here, as revision 3.
    expect(await d.run(d.engine.flows.execute(FlowWrite, {
      executionId: crypto.randomUUID(),
      payload: { name: "dark-mode", revision: 2, source },
    }))).toMatchObject({ _tag: "Success", value: { revision: 3, placement: "client" } })
    expect(await d.run(d.engine.flows.execute(FlowRun, { executionId: crypto.randomUUID(), payload: { name: "dark-mode" } })))
      .toEqual(Exit.succeed("Ran."))
  }, SLOW)

  test("a write that fails a check, or from a revision another followed, is refused before or by ChatApi; one again isn't", async () => {
    const d = await device(scripted(() => drafted()).script)
    await saveFlow(d, "dark-mode")
    const write = (revision: number, source: string, name = "dark-mode") =>
      d.run(d.engine.flows.execute(FlowWrite, { executionId: crypto.randomUUID(), payload: { name, revision, source } }))
    const good = renderSource({ name: "dark-mode", description: "Dark.", flows: [], instructions: "Go dark." })

    expect(JSON.stringify(await write(1, good.replace(`Flow.make("dark-mode"`, `Flow.make("light-mode"`))))
      .toContain('"check":"name"')
    expect(JSON.stringify(await write(1, renderSource({ name: "dark-mode", description: "D.", flows: ["flow/new"], instructions: "Go." }))))
      .toContain('"check":"calls"')
    expect(await write(1, good)).toMatchObject({ _tag: "Success", value: { revision: 2 } })
    // The same write again, as a step tried again: the revision it made. Other bytes from that revision: stale.
    expect(await write(1, good)).toMatchObject({ _tag: "Success", value: { revision: 2 } })
    expect(JSON.stringify(await write(1, good.replace("Go dark.", "Go darker.")))).toContain('"code":"stale"')
    expect(JSON.stringify(await write(1, renderSource({ name: "other", description: "D.", flows: [], instructions: "Go." }), "other")))
      .toContain("FlowNotFound")
    // ChatApi saw only the writes the checks admitted.
    expect(d.agent.h.line("flow.route").filter((line) => line.annotations.route === "write").map((line) => line.annotations.status))
      .toEqual([200, 200, 409, 404])
  }, SLOW)

  test("a refused write is recorded by ChatApi's code, not_found, or unavailable", () => {
    expect(writeOutcome({ _tag: "@smthrs/mvp/flows/FlowsRefused", code: "stale" })).toBe("stale")
    expect(writeOutcome({ _tag: "@smthrs/mvp/flows/FlowNotFound" })).toBe("not_found")
    expect(writeOutcome({ _tag: "@smthrs/mvp/flows/FlowsUnavailable" })).toBe("unavailable")
  })
})

describe("flow/list and flow/delete", () => {
  test("lists your flows; deleting one removes it, and deleting it again deletes nothing", async () => {
    const d = await device(scripted(() => drafted()).script)
    const saved = await saveFlow(d, "dark-mode")
    expect(await d.run(d.engine.flows.execute(FlowList, { executionId: crypto.randomUUID(), payload: {} })))
      .toEqual(Exit.succeed({
        flows: [{ name: "dark-mode", description: "Switch this device to dark mode.", revision: 1, placement: "client" }],
      }))
    expect(await d.run(d.engine.flows.execute(FlowDelete, { executionId: crypto.randomUUID(), payload: { flowId: saved.flowId } })))
      .toEqual(Exit.succeed({ deleted: true }))
    expect(await d.run(d.engine.flows.execute(FlowDelete, { executionId: crypto.randomUUID(), payload: { flowId: saved.flowId } })))
      .toEqual(Exit.succeed({ deleted: false }))
    expect(await d.run(d.engine.flows.execute(FlowList, { executionId: crypto.randomUUID(), payload: {} })))
      .toEqual(Exit.succeed({ flows: [] }))
  }, SLOW)
})

describe("the agent's catalog", () => {
  test("outside any run, no agent asks: the whole catalog", async () => {
    const d = await device(scripted(() => drafted()).script)
    const url = await Effect.runPromise(TestDatabase.serverUrl)
    const store = PostgresDatabase.layer({ url: url.toString(), driver: Pg, schema: d.engine.schema })
    const names = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const source = yield* Catalog.source
      return (yield* source.bindings()).map((binding) => binding.descriptor.name)
    })).pipe(
      Effect.provideService(FlowRuntime.FlowRuntime, d.engine.flows),
      Effect.provide(FlowRegistry.layer),
      Effect.provide(EngineStore.RunInspection.layer.pipe(Layer.provide(store))),
    ))
    expect(names).toEqual(Catalog.agentFlows)
    const scoped = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const source = yield* Catalog.source
      return (yield* source.bindings()).map((binding) => binding.descriptor)
    })).pipe(
      Effect.provideService(FlowRuntime.FlowRuntime, d.engine.flows),
      Effect.provideService(FlowRegistry, { entries: flowEntries, names: ["app/theme/set"], entryOf: (name) => ({ ...flowEntries[name], changes: "updates this test's theme" }) }),
      Effect.provide(EngineStore.RunInspection.layer.pipe(Layer.provide(store))),
    ))
    expect(scoped.map((flow) => flow.name)).toEqual(["app/theme/set"])
    expect(scoped[0]!.description).toContain("Side effect: updates this test's theme")

  }, SLOW)
})
