// Your own flows and this device's runs from a tab (docs/features/flows.md#the-browser, docs/features/runs.md): the
// browser's own layer (`appLayer`) on a Node device whose engine leads, against ChatApi's real handler and the compose
// Postgres and Electric (src/test/chatApi.ts). A person drafts a flow, answers its question, saves it, runs it, watches
// its run page, stops a run and retries one. The model is the only scripted piece: each model call waits for the test's
// answer.
import { Effect, type ManagedRuntime } from "effect"
import { afterEach, describe, expect, test, vi } from "vitest"
import { nodeDevice, openTab, openTestApp, TestChatApi } from "../../test/chatApi"
import { RUNS_PATH } from "../runs/contract"
import type { Inspection } from "../runs/schema"
import { listRows } from "../runs/page"
import { Runs } from "../runs/runs"
import { formReady, savedRefusal } from "./actions"
import { FLOWS_PATH, NEW_FLOW_PATH } from "./contract"
import { FlowsUi } from "./flowsUi"

const runtimes: Array<{ dispose: () => Promise<void> }> = []
afterEach(async () => {
  for (const runtime of runtimes.splice(0).reverse()) await runtime.dispose()
})

/** How long a flow may take on the device's engine, its first start included, on a loaded machine. */
const until = (assertion: () => void | Promise<void>, timeout = 60_000) => vi.waitFor(assertion, { timeout, interval: 25 })

/** A test's budget: several flows, each with model calls, on a fresh device's engine, on a loaded machine. */
const WITHIN = 180_000

const drafted = (overrides: Record<string, unknown> = {}) => ({
  description: "Say hello.",
  instructions: "Say hello to the person.",
  flows: [],
  questions: [],
  summary: "Says hello.",
  ...overrides,
})

/** ChatApi, and a tab on a device whose engine leads, with your flows and runs started as React starts them. */
const open = async () => {
  const app = openTestApp()
  runtimes.push(app)
  const api = await app.runPromise(Effect.service(TestChatApi))
  const host = nodeDevice({ agent: api })
  const tab: ManagedRuntime.ManagedRuntime<FlowsUi | Runs, unknown> = openTab(api, { host })
  runtimes.push(tab)
  const flows = await tab.runPromise(Effect.service(FlowsUi))
  const runs = await tab.runPromise(Effect.service(Runs))
  for (const query of [...Object.values(flows.queries), ...Object.values(runs.queries)]) query.startSyncImmediate()
  /** The last path this tab went to that starts with `prefix`. */
  const went = (prefix: string) => host.navigated.filter((path) => path.startsWith(prefix)).at(-1)
  return {
    api,
    host,
    flows,
    runs,
    went,
    /** Answers the `nth` model call whose task includes `task` with one cell of `source`. */
    reply: async (task: string, source: string, nth?: number) =>
      (await app.runPromise(api.answerTo(task, nth))).cell(source),
    draft: () => flows.queries.draft.toArray[0],
    page: () => runs.queries.page.toArray[0],
    inspection: () => runs.queries.page.toArray[0]?.page.inspection as Inspection | undefined,
  }
}

type Tab = Awaited<ReturnType<typeof open>>

/** Drafts `hello` from the form to ready: the draft's id. */
const draftHello = async (t: Tab, draft = drafted(), nth?: number) => {
  t.flows.actions.setName("hello")
  t.flows.actions.setRequest("Say hello")
  await until(() => expect(t.flows.queries.form.toArray[0]).toMatchObject({ name: "hello", request: "Say hello" }))
  const before = t.went("/app/flows/drafts/")
  t.flows.actions.startDraft()
  await until(() => expect(t.went("/app/flows/drafts/")).not.toBe(before))
  const draftId = t.went("/app/flows/drafts/")!.split("/").at(-1)!
  await t.reply("The flow's name: hello", `ctx.done(${JSON.stringify(draft)})`, nth)
  await t.flows.actions.openDraft(draftId)
  return draftId
}

describe("the form", () => {
  test("Draft needs a name a flow of yours may take and something it should do", () => {
    expect(formReady({ name: "hello", request: "Say hello" })).toBe(true)
    expect(formReady({ name: "hello", request: "  " })).toBe(false)
    expect(formReady({ name: "Hello", request: "Say hello" })).toBe(false)
    expect(formReady({ name: "theme", request: "Say hello" })).toBe(false)
    expect(formReady({ name: "hello", request: "x".repeat(4097) })).toBe(false)
  })

  test("a refused Save reads by its code", () => {
    expect(savedRefusal({ _tag: "@smthrs/mvp/flows/NameTaken" })).toBe("name_taken")
    expect(savedRefusal({ _tag: "@smthrs/mvp/flows/DraftNotReady", code: "checks" })).toBe("checks")
    expect(savedRefusal({ _tag: "@smthrs/mvp/flows/FlowsUnavailable" })).toBe("unavailable")
  })
})

describe("a flow of your own, from a tab", () => {
  test("Draft, Save, Run: the run page follows the run to its answer, and Retry opens a new run", async () => {
    const t = await open()
    // An empty form drafts nothing.
    t.flows.actions.startDraft()
    const draftId = await draftHello(t)
    await until(() => expect(t.draft()?.draft).toMatchObject({ id: draftId, status: "ready", name: "hello" }))
    expect(host(t).navigated.filter((path) => path.startsWith("/app/flows/drafts/"))).toHaveLength(1)

    t.flows.actions.save()
    await until(() => expect(t.went(FLOWS_PATH)).toBe(FLOWS_PATH))
    await until(() => expect(t.flows.queries.flows.toArray.map((flow) => flow.name)).toEqual(["hello"]))
    // A saved draft leaves the drafts list.
    await until(() => expect(t.flows.queries.drafts.toArray).toEqual([]))
    const flow = t.flows.queries.flows.toArray[0]!

    t.flows.actions.run(flow.name, flow.revision)
    await until(() => expect(t.went(`${RUNS_PATH}/`)).toBeDefined())
    const runId = decodeURIComponent(t.went(`${RUNS_PATH}/`)!.slice(RUNS_PATH.length + 1))
    await t.runs.actions.openRun(runId)
    await t.reply("The flow hello says:", 'ctx.done("Hello.")')
    await until(() => expect(t.inspection()?.run).toMatchObject({ status: "completed", result: { text: '"Hello."' } }))

    // The steps tab, a step, the timeline, and the journal with More.
    t.runs.actions.showTab("journal")
    await until(() => expect(t.page()?.view.tab).toBe("journal"))
    t.runs.actions.more()
    const step = t.inspection()!.steps.find((each) => each.action === "flow/run/load")!
    t.runs.actions.select(`step:${step.nodeId}`)
    await until(() => expect(t.page()?.view.selected).toBe(`step:${step.nodeId}`))

    t.runs.actions.retry("pinned")
    await until(() => expect(t.went(`${RUNS_PATH}/retry%3A`)).toBeDefined())
    await t.reply("The flow hello says:", 'ctx.done("Hello again.")', 1)
    const retried = decodeURIComponent(t.went(`${RUNS_PATH}/retry%3A`)!.slice(RUNS_PATH.length + 1))
    expect(retried).toBe(`retry:${runId}:1/run`)
    await t.runs.actions.openRun(retried)
    await until(() => expect(t.inspection()?.run).toMatchObject({ status: "completed", result: { text: '"Hello again."' } }))
    // Retry the first run again: the second retry, a run of its own.
    await t.runs.actions.openRun(runId)
    await until(() => expect(t.inspection()?.run.runId).toBe(runId))
    t.runs.actions.retry("current")
    await until(() => expect(t.went(`${RUNS_PATH}/retry%3A${encodeURIComponent(runId)}%3A2`)).toBeDefined())
    await t.reply("The flow hello says:", 'ctx.done("Hello a third time.")', 2)

    // The list: both runs of hello, newest first, and no act on a run.
    await t.runs.actions.openList()
    await until(() => expect(listRows(t.runs.queries.runs.toArray).map((row) => row.id)).toEqual(expect.arrayContaining([runId, retried])))
    expect(listRows(t.runs.queries.runs.toArray).some((row) => row.flow.startsWith("run/"))).toBe(false)

    // Edit opens a new draft of it; Delete removes it.
    t.flows.actions.edit("hello")
    await until(() => expect(t.went(NEW_FLOW_PATH)).toBe(`${NEW_FLOW_PATH}?name=hello`))
    await t.flows.actions.openNew("hello")
    await until(() => expect(t.flows.queries.form.toArray[0]).toMatchObject({ name: "hello", request: "" }))
    await t.flows.actions.openNew(undefined)
    await until(() => expect(t.flows.queries.form.toArray[0]).toMatchObject({ name: "" }))
    t.flows.actions.remove(flow.id)
    await until(() => expect(t.flows.queries.flows.toArray).toEqual([]))
  }, WITHIN)

  test("a question the draft asked: the person's answer starts the next round", async () => {
    const t = await open()
    const draftId = await draftHello(t, drafted({
      questions: [{ text: "Which greeting?", assumed: "Hello", blocking: true }],
    }))
    await until(() => expect(t.draft()?.draft.status).toBe("needs_you"))
    // Nothing changed: Answer sends nothing.
    t.flows.actions.answer()
    t.flows.actions.setAnswer(draftId, "r0q1", "Hi")
    t.flows.actions.setAnswer(draftId, "r0q1", "Howdy")
    await until(() =>
      expect(t.flows.queries.answers.toArray.map(({ id, questionId, value }) => ({ id, questionId, value }))).toEqual([
        { id: `${draftId}:r0q1`, questionId: "r0q1", value: "Howdy" },
      ])
    )
    t.flows.actions.answer()
    await t.reply("The flow's name: hello", `ctx.done(${JSON.stringify(drafted())})`, 1)
    await until(() => expect(t.draft()?.draft).toMatchObject({ status: "ready", round: 1 }))
    await until(() => expect(t.flows.queries.answers.toArray).toEqual([]))
  }, WITHIN)

  test("Save refuses a name another of your flows took meanwhile", async () => {
    const t = await open()
    const first = await draftHello(t)
    await until(() => expect(t.draft()?.draft).toMatchObject({ id: first, status: "ready" }))
    const second = await draftHello(t, drafted(), 1)
    await until(() => expect(t.draft()?.draft).toMatchObject({ id: second, status: "ready" }))
    await t.flows.actions.openDraft(first)
    t.flows.actions.save()
    await until(() => expect(t.flows.queries.flows.toArray).toHaveLength(1))
    await t.flows.actions.openDraft(second)
    t.flows.actions.save()
    await until(() => expect(t.draft()?.shown).toMatchObject({ refusal: "name_taken", busy: false }))
  }, WITHIN)

  test("Stop on a live run: it ends cancelled, and Resume on it is refused, settled", async () => {
    const t = await open()
    // No run open: the acts and More do nothing.
    t.runs.actions.stop()
    t.runs.actions.more()
    await draftHello(t)
    await until(() => expect(t.draft()?.draft.status).toBe("ready"))
    t.flows.actions.save()
    await until(() => expect(t.flows.queries.flows.toArray).toHaveLength(1))
    const flow = t.flows.queries.flows.toArray[0]!
    t.flows.actions.run(flow.name, flow.revision)
    await until(() => expect(t.went(`${RUNS_PATH}/`)).toBeDefined())
    const runId = decodeURIComponent(t.went(`${RUNS_PATH}/`)!.slice(RUNS_PATH.length + 1))
    await t.runs.actions.openRun(runId)
    // The model call is in flight and never answered: the run is live.
    await until(() => expect(t.api.modelRequests("The flow hello says:")).toBe(1))
    await until(() => expect(t.inspection()?.run.status).toBe("running"))
    // A live run has nothing to retry yet.
    t.runs.actions.retry("pinned")
    await until(() => expect(t.page()?.view).toMatchObject({ acting: null, refusal: "not_settled" }))
    t.runs.actions.stop()
    await until(() => expect(t.inspection()?.run.status).toBe("cancelled"))
    expect(t.page()?.view).toMatchObject({ acting: null, refusal: null })
    t.runs.actions.resume()
    await until(() => expect(t.page()?.view.refusal).toBe("settled"))
    // A run this device's engine never held reads as on another device.
    await t.runs.actions.openRun("nothing-here")
    await until(() => expect(t.page()?.page.state).toBe("not_found"))
    // Nothing read of it: no act on it.
    t.runs.actions.stop()
    expect(t.page()?.view).toMatchObject({ acting: null, refusal: null })
  }, WITHIN)
})

/** The tab's device. */
const host = (t: Tab) => t.host
