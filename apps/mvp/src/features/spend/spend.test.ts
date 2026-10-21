// Spend alerts on the tab (docs/features/spend-alerts.md), driven as React drives them: through the spend layer's plain
// action, reading its live query, with no React. Each tab runs the browser's own layer (`appLayer`) on a Node device
// (src/test/chatApi.ts) against ChatApi's real handler over the compose Postgres and Electric. The alerts are recorded
// by `ops/SpendAlert`'s own step over ChatApi's schema, as the flow records them once a window ends.
import { Effect, type ManagedRuntime, Metric } from "effect"
import { SqlClient } from "effect/sql"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { Actor } from "../../../worker/Actor.ts"
import * as SpendAlert from "../../../worker/flows/SpendAlert.ts"
import { member, nodeDevice, type NodeDevice, openTab, openTestApp, TestChatApi } from "../../test/chatApi"
import { ALERT_WORD, alertDetail } from "./copy"
import { Spend } from "./spend"
import { hidden, shown, SpendStore } from "./store"

const admin: Actor = { subject: { kind: "person", id: "person-admin" }, role: "admin" }

const runtimes: Array<{ dispose: () => Promise<void> }> = []
afterEach(async () => {
  for (const runtime of runtimes.splice(0).reverse()) await runtime.dispose()
})

const until = (assertion: () => void | Promise<void>, timeout = 30_000) =>
  vi.waitFor(assertion, { timeout, interval: 20 })

/** ChatApi, signed in as `actor` on every request. */
const openApi = async (actor: Actor) => {
  const runtime = openTestApp({ answers: false }, { actor })
  runtimes.push(runtime)
  return runtime.runPromise(Effect.service(TestChatApi))
}

/** A tab on `device` (a reload when the device had one open before), its open alerts syncing. */
const openSpendTab = async (api: TestChatApi["Service"], device: NodeDevice = nodeDevice()) => {
  const runtime: ManagedRuntime.ManagedRuntime<Spend | SpendStore, unknown> = openTab(api, { host: device })
  runtimes.push(runtime)
  const spend = await runtime.runPromise(Effect.service(Spend))
  const store = await runtime.runPromise(Effect.service(SpendStore))
  store.open.tanstack.startSyncImmediate()
  return {
    spend,
    runtime,
    open: () => store.open.tanstack.toArray.map((alert) => alert.id),
    shown: () => runtime.runSync(Metric.value(shown)).count,
    hidden: () => runtime.runSync(Metric.value(hidden)).count,
  }
}

/** One call of `role` spending `tokens`, then the alert of the window that just ended: `ops/SpendAlert`'s own step. */
const alert = async (api: TestChatApi["Service"], id: string, role: string, tokens: number) => {
  const until = Date.now()
  await Effect.runPromise(api.github.run(Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql`
      INSERT INTO model_usage (invocation_id, request_id, role, model_id, input_tokens, output_tokens, day,
        reserved_tokens, charged_tokens, expires_at, settled_at, created_at)
      VALUES (${id}, 'r', ${role}, 'qwen-3.8-27b', ${tokens}, 0, (now() AT TIME ZONE 'UTC')::date, ${tokens},
        ${tokens}, now() + interval '1 hour', now(), now() - interval '1 second')`)))
  const window = { from: until - 60_000, until, budget: 1_000_000 }
  await Effect.runPromise(api.github.run(SpendAlert.record(window)))
  return SpendAlert.executionId(window)
}

describe("an Admin's tab", { timeout: 90_000 }, () => {
  test("shows each alert, newest first; Hide marks it and every earlier one seen, on this device, through a reload", async () => {
    const api = await openApi(admin)
    const device = nodeDevice()
    // One alert before the tab opens, which its first sync brings, and one after, which arrives live.
    const first = await alert(api, "call-1", "agent", 1_000)
    const tab = await openSpendTab(api, device)
    await until(() => expect(tab.open()).toEqual([first]))
    const second = await alert(api, "call-2", "judge", 200)
    await until(() => expect(tab.open()).toEqual([second, first]))
    expect(tab.shown()).toBe(2)

    // Hiding the earlier one leaves the later one; hiding the later one hides both.
    tab.spend.actions.hide(first)
    await until(() => expect(tab.open()).toEqual([second]))
    tab.spend.actions.hide(second)
    await until(() => expect(tab.open()).toEqual([]))
    // Hiding an alert the mark already passed changes nothing.
    tab.spend.actions.hide(first)
    tab.spend.actions.hide("no-such-alert")
    // Both marks are stored on the device.
    await until(() => expect(tab.hidden()).toBe(2))

    // A reload on the same device keeps the mark; a new alert shows.
    await tab.runtime.dispose()
    const reloaded = await openSpendTab(api, device)
    const third = await alert(api, "call-3", "agent", 50)
    await until(() => expect(reloaded.open()).toEqual([third]))
    // Another device has hidden nothing.
    const other = await openSpendTab(api)
    await until(() => expect(other.open()).toEqual([third, second, first]))
  })

  test("a Member's tab syncs no alerts", async () => {
    const api = await openApi(member)
    await alert(api, "call-1", "agent", 1_000)
    const tab = await openSpendTab(api)
    const store = await tab.runtime.runPromise(Effect.service(SpendStore))
    // Synced up to date after the alert was recorded, and it holds nothing.
    await until(() => expect(store.alerts.tanstack.status).toBe("ready"))
    expect(tab.open()).toEqual([])
    expect(tab.shown()).toBe(0)
  })
})

describe("what an alert's toast says", () => {
  const roles = (...list: Array<[string, number, number | null]>) =>
    list.map(([role, tokens, costUsd]) => ({ role, calls: 1, tokens, costUsd }))

  test("one role: the role, its tokens and its cost; several: the totals, then each role's tokens", () => {
    expect(ALERT_WORD).toBe("Model spend")
    expect(alertDetail({ tokens: 12_340, costUsd: 0.0184, roles: roles(["agent", 12_340, 0.0184]) })).toBe(
      "agent · 12,340 tokens · $0.02",
    )
    expect(
      alertDetail({ tokens: 12_340, costUsd: 0.0184, roles: roles(["agent", 12_000, 0.018], ["judge", 340, 0.0004]) }),
    ).toBe("12,340 tokens · $0.02 · agent 12,000 · judge 340")
  })

  test("a cost under a cent reads <$0.01; no cost when a model isn't priced", () => {
    expect(alertDetail({ tokens: 46, costUsd: 0.00006, roles: roles(["agent", 46, 0.00006]) })).toBe(
      "agent · 46 tokens · <$0.01",
    )
    expect(alertDetail({ tokens: 46, costUsd: 0, roles: roles(["agent", 46, 0]) })).toBe("agent · 46 tokens · $0.00")
    expect(alertDetail({ tokens: 46, costUsd: null, roles: roles(["agent", 46, null]) })).toBe("agent · 46 tokens")
  })
})
