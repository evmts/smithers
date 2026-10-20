// Your own flows and runs from a tab whose engine refuses what it is asked to start (src/test/faults.ts `EngineFaults`,
// test.faults-by-injection): nothing opens a page for a run that never started, unsent answers stay, a refused Save
// says it couldn't, and a refused act on a run says the engine couldn't be reached. Everything else is the real app.
import { ShapeSource } from "@smthrs/effect-electric"
import { Effect, type ManagedRuntime, Metric } from "effect"
import { afterEach, describe, expect, test, vi } from "vitest"
import { nodeDevice, openFaultyApp, openFaultyTab, type TabOptions, TestChatApi } from "../../test/chatApi"
import { read } from "../../test/otlp"
import { EngineFaults } from "../../test/faults"
import { dispatches } from "../../flows/dispatch"
import { Runs } from "../runs/runs"
import { FLOWS_PATH } from "./contract"
import { FlowsUi } from "./flowsUi"

const runtimes: Array<{ dispose: () => Promise<void> }> = []
afterEach(async () => {
  for (const runtime of runtimes.splice(0).reverse()) await runtime.dispose()
})

const until = (assertion: () => void | Promise<void>, timeout = 60_000) => vi.waitFor(assertion, { timeout, interval: 25 })

const drafted = {
  description: "Say hello.",
  instructions: "Say hello.",
  flows: [],
  questions: [{ text: "Which greeting?", assumed: "Hello", blocking: false }],
  summary: "Says hello.",
}

const open = async (options: TabOptions = {}) => {
  const app = openFaultyApp()
  runtimes.push(app)
  const api = await app.runPromise(Effect.service(TestChatApi))
  const host = nodeDevice({ agent: api })
  const tab: ManagedRuntime.ManagedRuntime<FlowsUi | Runs | EngineFaults | ShapeSource.Faults, unknown> = openFaultyTab(
    api,
    { ...options, host },
  )
  runtimes.push(tab)
  const flows = await tab.runPromise(Effect.service(FlowsUi))
  const runs = await tab.runPromise(Effect.service(Runs))
  const faults = await tab.runPromise(Effect.service(EngineFaults))
  const shapes = await tab.runPromise(Effect.service(ShapeSource.Faults))
  for (const query of [...Object.values(flows.queries), ...Object.values(runs.queries)]) query.startSyncImmediate()
  return {
    api,
    host,
    flows,
    runs,
    shapes: (fault: Effect.Effect<void>) => tab.runPromise(fault),
    stall: shapes.stall("live"),
    heal: shapes.heal,
    /** How many runs of `flow` this tab's engine finished. */
    done: (flow: string) =>
      tab.runSync(Metric.value(Metric.withAttributes(dispatches, { flow, door: "button", outcome: "done" }))).count,
    refuse: (flow: string) => tab.runPromise(faults.refuseStarts(flow)),
    /** How many dispatches of `flow` this tab made that the engine never ran. */
    refused: (flow: string) =>
      tab.runSync(Metric.value(Metric.withAttributes(dispatches, { flow, door: "button", outcome: "error" }))).count,
    reply: async (task: string, source: string) => (await app.runPromise(api.answerTo(task))).cell(source),
  }
}

describe("an engine that refuses a start", () => {
  test("nothing opens, answers stay, Save says it couldn't, and an act on a run says the same", async () => {
    const t = await open()
    // No draft shown: Answer and Save do nothing.
    t.flows.actions.answer()
    t.flows.actions.save()

    // A draft, then each act refused.
    t.flows.actions.setName("hello")
    t.flows.actions.setRequest("Say hello")
    await until(() => expect(t.flows.queries.form.toArray[0]).toMatchObject({ name: "hello" }))
    t.flows.actions.startDraft()
    await until(() => expect(t.host.navigated.some((path) => path.startsWith("/app/flows/drafts/"))).toBe(true))
    const draftId = t.host.navigated.find((path) => path.startsWith("/app/flows/drafts/"))!.split("/").at(-1)!
    await t.reply("The flow's name: hello", `ctx.done(${JSON.stringify(drafted)})`)
    await t.flows.actions.openDraft(draftId)
    await until(() => expect(t.flows.queries.draft.toArray[0]?.draft.status).toBe("ready"))

    await t.refuse("flow/answer")
    t.flows.actions.setAnswer(draftId, "r0q1", "Hi")
    await until(() => expect(t.flows.queries.answers.toArray).toHaveLength(1))
    t.flows.actions.answer()
    await until(() => expect(t.refused("flow/answer")).toBe(1))
    expect(t.flows.queries.answers.toArray).toHaveLength(1)

    await t.refuse("flow/save")
    t.flows.actions.save()
    await until(() => expect(t.flows.queries.draft.toArray[0]?.shown).toMatchObject({ busy: false, refusal: "unavailable" }))

    await t.refuse("flow/new")
    const before = t.host.navigated.length
    t.flows.actions.setName("again")
    t.flows.actions.setRequest("Say hello again")
    await until(() => expect(t.flows.queries.form.toArray[0]).toMatchObject({ name: "again" }))
    t.flows.actions.startDraft()
    await t.refuse("flow/run")
    t.flows.actions.run("hello", 1)
    await until(() => expect([t.refused("flow/new"), t.refused("flow/run")]).toEqual([1, 1]))
    expect(t.host.navigated).toHaveLength(before)
  }, 180_000)

  test("Save's own refusal reads by its code", async () => {
    const t = await open()
    t.flows.actions.setName("hello")
    t.flows.actions.setRequest("Say hello")
    await until(() => expect(t.flows.queries.form.toArray[0]).toMatchObject({ name: "hello" }))
    t.flows.actions.startDraft()
    await until(() => expect(t.host.navigated.some((path) => path.startsWith("/app/flows/drafts/"))).toBe(true))
    const draftId = t.host.navigated.find((path) => path.startsWith("/app/flows/drafts/"))!.split("/").at(-1)!
    // The agent's draft lists a flow nobody may call: the checks fail, and Save is refused `checks`.
    await t.reply("The flow's name: hello", `ctx.done(${JSON.stringify({ ...drafted, flows: ["repo/write"] })})`)
    await t.flows.actions.openDraft(draftId)
    await until(() => expect(t.flows.queries.draft.toArray[0]?.draft.status).toBe("ready"))
    t.flows.actions.save()
    await until(() => expect(t.flows.queries.draft.toArray[0]?.shown).toMatchObject({ busy: false, refusal: "checks" }))
  }, 180_000)

  test("an act on a run the engine won't start says the engine couldn't be reached", async () => {
    const t = await open()
    t.flows.actions.setName("hello")
    t.flows.actions.setRequest("Say hello")
    await until(() => expect(t.flows.queries.form.toArray[0]).toMatchObject({ name: "hello" }))
    t.flows.actions.startDraft()
    await until(() => expect(t.host.navigated.some((path) => path.startsWith("/app/flows/drafts/"))).toBe(true))
    const draftId = t.host.navigated.find((path) => path.startsWith("/app/flows/drafts/"))!.split("/").at(-1)!
    await t.reply("The flow's name: hello", `ctx.done(${JSON.stringify(drafted)})`)
    // The draft's round is a run of this device: its page reads it, and Stop on it is refused at the start.
    await t.runs.actions.openRun(`${draftId}:0`)
    await until(() => expect(t.runs.queries.page.toArray[0]?.page.state).toBe("read"))
    await t.refuse("run/retry")
    t.runs.actions.retry("pinned")
    await until(() => expect(t.runs.queries.page.toArray[0]?.view).toMatchObject({ acting: null, refusal: "unavailable" }))
  }, 180_000)
})

/** Drafts `hello` from the form to ready, and shows it. */
const readyDraft = async (t: Awaited<ReturnType<typeof open>>) => {
  t.flows.actions.setName("hello")
  t.flows.actions.setRequest("Say hello")
  await until(() => expect(t.flows.queries.form.toArray[0]).toMatchObject({ name: "hello" }))
  t.flows.actions.startDraft()
  await until(() => expect(t.host.navigated.some((path) => path.startsWith("/app/flows/drafts/"))).toBe(true))
  const draftId = t.host.navigated.find((path) => path.startsWith("/app/flows/drafts/"))!.split("/").at(-1)!
  await t.reply("The flow's name: hello", `ctx.done(${JSON.stringify(drafted)})`)
  await t.flows.actions.openDraft(draftId)
  await until(() => expect(t.flows.queries.draft.toArray[0]?.draft.status).toBe("ready"))
}

describe("Electric slow to deliver the saved flow", () => {
  test("Save opens the list only once this device has the flow", async () => {
    const t = await open()
    await readyDraft(t)
    await t.shapes(t.stall)
    t.flows.actions.save()
    // Saved, and still busy: the list waits for the flow.
    await until(() => expect(t.done("flow/save")).toBe(1))
    expect(t.flows.queries.draft.toArray[0]?.shown).toMatchObject({ busy: true, refusal: null })
    expect(t.host.navigated).not.toContain(FLOWS_PATH)
    await t.shapes(t.heal)
    await until(() => expect(t.host.navigated).toContain(FLOWS_PATH))
    expect(t.flows.queries.flows.toArray.map((flow) => flow.name)).toEqual(["hello"])
  }, 180_000)

  test("past confirmWithin the list opens anyway, and the save is logged unconfirmed", async () => {
    const t = await open({ confirmWithin: "1 second" })
    await readyDraft(t)
    await t.shapes(t.stall)
    t.flows.actions.save()
    await until(() => expect(t.host.navigated).toContain(FLOWS_PATH))
    expect(t.flows.queries.flows.toArray).toEqual([])
    expect(t.flows.queries.draft.toArray[0]?.shown).toMatchObject({ busy: false, refusal: null })
    for (const each of runtimes.splice(0).reverse()) await each.dispose()
    expect(read(t.api.telemetry).log("flow.save.unconfirmed")).toContainEqual(
      expect.objectContaining({ severity: "Warn", attributes: expect.objectContaining({ feature: "flows" }) }),
    )
  }, 180_000)
})
