// Watching a TODO's run on Cloudflare from a tab (ruling TODO-3, docs/features/runs.md#a-run-on-cloudflare): the
// browser's own layer (`appLayer`) on a Node device, against ChatApi's real handler with its remote runs routes
// (worker/RemoteRuns.ts) and the compose Postgres and Electric (src/test/chatApi.ts). The run is the remote host's
// `probe/Pause`, run under a TODO attempt's id by an engine on a schema of its own, as the Durable Object runs a TODO's
// `todo` run: so what the tab reads, and when it reads it again, is what it does for a TODO's run.
import { Effect } from "effect"
import { afterEach, describe, expect, test, vi } from "vitest"
import type * as Actor from "../../../worker/Actor.ts"
import { asPerson, nodeDevice, openTab, openTestApp, TestChatApi } from "../../test/chatApi"
import { hostOf, missingOf } from "./page"
import { Runs } from "./runs"
import type { Inspection } from "./schema"

const runtimes: Array<{ dispose: () => Promise<void> }> = []
afterEach(async () => {
  for (const runtime of runtimes.splice(0).reverse()) await runtime.dispose()
})

const until = (assertion: () => void | Promise<void>, timeout = 30_000) => vi.waitFor(assertion, { timeout, interval: 25 })

const guest: Actor.Actor = { subject: { kind: "person", id: "person-guest" }, role: "guest", login: "gus" }

/** ChatApi, and a tab of a device of `person` (the Member unless set) showing runs, started as React starts them. */
const open = async (person?: string) => {
  const app = openTestApp({}, { people: { gus: guest } })
  runtimes.push(app)
  const api = await app.runPromise(Effect.service(TestChatApi))
  const as = person === undefined ? api : asPerson(api, person)
  const tab = openTab(as, { host: nodeDevice() })
  runtimes.push(tab)
  const runs = await tab.runPromise(Effect.service(Runs))
  for (const query of Object.values(runs.queries)) query.startSyncImmediate()
  return {
    api,
    runs,
    page: () => runs.queries.page.toArray[0]?.page,
    inspection: () => runs.queries.page.toArray[0]?.page.inspection as Inspection | undefined,
    /** How many times ChatApi read a run for a tab. */
    reads: () => api.spans.filter((span) => span.name === "run.inspect").length,
  }
}

describe("a TODO's run on Cloudflare", () => {
  test("a Member watches it live: Not started, then each step as the run takes it, then done; no polling", async () => {
    const t = await open()
    const runId = await Effect.runPromise(t.api.remote.todoRun("Watch me"))
    await t.runs.actions.openRun(runId)
    expect(t.page()).toMatchObject({ id: runId, state: "not_started" })
    expect(missingOf(t.page()!)).toBe("Not started")

    // The run starts on the engine: its row of the change feed reads the page again, with no request of the tab's own.
    await Effect.runPromise(t.api.remote.start(runId, { label: "watched", pauseMs: 2_000 }))
    await until(() => expect(t.page()?.state).toBe("read"))
    await until(() => {
      const steps = t.inspection()!.steps.filter((step) => step.action === "probe/Mark")
      expect(steps.map((step) => step.status)).toContain("completed")
    })
    // Mid-run, during its durable sleep: one Mark done, the run not settled.
    expect(t.inspection()!.run.status).not.toBe("completed")
    expect(hostOf(t.inspection()!.run.runId)).toBe("Cloud")

    // The second Mark and the settling arrive the same way.
    await until(() => expect(t.inspection()!.run.status).toBe("completed"))
    expect(t.inspection()!.steps.filter((step) => step.action === "probe/Mark").map((step) => step.output?.text)).toEqual([
      "\"watched:before\"",
      "\"watched:after\"",
    ])
    expect(JSON.parse(t.inspection()!.run.result!.text)).toBe("watched:after")

    // Nothing changes now, so nothing reads it again: the tab follows the run, never a clock.
    await until(() => expect(t.page()?.state).toBe("read"))
    const settled = t.reads()
    await Effect.runPromise(Effect.sleep(2_500))
    expect(t.reads()).toBe(settled)
  }, 120_000)

  test("a Guest can't watch it: the page reads Not found, and the run is never read for them", async () => {
    const t = await open("gus")
    const runId = await Effect.runPromise(t.api.remote.todoRun("Not yours"))
    await Effect.runPromise(t.api.remote.start(runId, { label: "private", pauseMs: 0 }))
    await t.runs.actions.openRun(runId)
    expect(t.page()).toMatchObject({ id: runId, state: "not_found", inspection: null })
    expect(missingOf(t.page()!)).toBe("Not found")
  }, 60_000)

  test("a run no TODO started reads Not found", async () => {
    const t = await open()
    const runId = "todo:00000000-0000-4000-8000-000000000000"
    await t.runs.actions.openRun(runId)
    expect(t.page()).toMatchObject({ id: runId, state: "not_found" })
  }, 60_000)
})
