// Spend alerts on the tab (docs/features/spend-alerts.md), driven as React drives them: through the spend layer's plain
// action, reading its live query, with no React. Each tab runs the browser's own layer (`appLayer`) on a Node device
// (src/test/chatApi.ts) against ChatApi's real handler over the compose Postgres and Electric. The alerts are recorded
// by `ops/SpendAlert`'s own step over ChatApi's schema, as the flow records them once a window ends.
import { Channels } from "@smthrs/notifications"
import { Effect, type ManagedRuntime, Metric, Redacted } from "effect"
import { SqlClient } from "effect/sql"
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest"
import type { Actor } from "../../../worker/Actor.ts"
import * as SpendAlert from "../../../worker/flows/SpendAlert.ts"
import { type AlertProviders, startAlertProviders } from "../../../worker/test/alertProviders.ts"
import { member, nodeDevice, type NodeDevice, openTab, openTestApp, TestChatApi } from "../../test/chatApi"
import { splitDestinations } from "./contract"
import { ALERT_WORD, alertDetail, alertMessage, receiptText } from "./copy"
import { RECEIPTS_SHOWN } from "./queries"
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
  await Effect.runPromise(api.github.run(Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql`
      INSERT INTO model_usage (invocation_id, request_id, role, model_id, input_tokens, output_tokens, day,
        reserved_tokens, charged_tokens, expires_at, settled_at, created_at)
      VALUES (${id}, 'r', ${role}, 'qwen-3.8-27b', ${tokens}, 0, (now() AT TIME ZONE 'UTC')::date, ${tokens},
        ${tokens}, now() + interval '1 hour', now(), now() - interval '1 second')`)))
  // The window ends once the call is written, so a slow write still lands in it.
  const until = Date.now()
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

// Where alerts go outside the app (docs/features/spend-alerts.md#channels): an Admin's Save runs `alert/channel` on the
// tab's engine against ChatApi's real route, and the setting and the receipts sync back through the compose Electric.

let providers: AlertProviders
beforeAll(async () => {
  providers = await startAlertProviders()
})
afterAll(() => providers.close())

/** A tab whose settings sync, and what it shows. */
const openSettingsTab = async (api: TestChatApi["Service"]) => {
  // Its engine leads, so the flows its Save dispatches run.
  const tab = await openSpendTab(api, nodeDevice({ agent: api }))
  const store = await tab.runtime.runPromise(Effect.service(SpendStore))
  for (const query of [store.channelList, store.receipts, store.pending]) query.tanstack.startSyncImmediate()
  return {
    ...tab,
    store,
    channels: () =>
      Object.fromEntries(store.channelList.tanstack.toArray.map((row) => [row.channel, [...row.destinations]])),
    saves: () => store.pending.tanstack.toArray.map((save) => `${save.channel}:${save.state}`),
    receipts: () => store.receipts.tanstack.toArray.map((receipt) => `${receipt.channel}:${receipt.status}`),
  }
}

describe("an Admin's alert channels", { timeout: 90_000 }, () => {
  test("Save sets email and Telegram, which sync back; an empty field turns its channel off", async () => {
    const api = await openApi(admin)
    const tab = await openSettingsTab(api)

    tab.spend.actions.setChannel("email", splitDestinations("will@example.com, ops@example.com"))
    tab.spend.actions.setChannel("telegram", ["-1001234567890"])
    // The save shows until it lands.
    expect(tab.saves().sort()).toEqual(["email:saving", "telegram:saving"])
    await until(() =>
      expect(tab.channels()).toEqual({
        email: ["will@example.com", "ops@example.com"],
        telegram: ["-1001234567890"],
      })
    )
    await until(() => expect(tab.saves()).toEqual([]))

    tab.spend.actions.setChannel("telegram", [])
    await until(() => expect(tab.channels()).toEqual({ email: ["will@example.com", "ops@example.com"] }))
  })

  test("a refused save stays Not saved, and a later one saves", async () => {
    const api = await openApi(admin)
    const tab = await openSettingsTab(api)

    // The route refuses an address that isn't one, which the field's own check would have caught.
    tab.spend.actions.setChannel("email", ["will"])
    await until(() => expect(tab.saves()).toEqual(["email:failed"]))
    expect(tab.channels()).toEqual({})

    tab.spend.actions.setChannel("email", ["will@example.com"])
    await until(() => expect(tab.channels()).toEqual({ email: ["will@example.com"] }))
    await until(() => expect(tab.saves()).toEqual([]))
  })

  test("a Member's save is refused, and their tab syncs no setting", async () => {
    const admins = await openApi(admin)
    const set = await openSettingsTab(admins)
    set.spend.actions.setChannel("email", ["will@example.com"])
    await until(() => expect(set.channels()).toEqual({ email: ["will@example.com"] }))

    const tab = await openSettingsTab(await openApi(member))
    tab.spend.actions.setChannel("email", ["member@example.com"])
    await until(() => expect(tab.saves()).toEqual(["email:failed"]))
    await until(() => expect(tab.store.channels.tanstack.status).toBe("ready"))
    expect(tab.channels()).toEqual({})
  })

  test("each delivery's receipt syncs to the Admin, the latest first", async () => {
    const api = await openApi(admin)
    const tab = await openSettingsTab(api)
    tab.spend.actions.setChannel("telegram", ["-1001234567890"])
    await until(() => expect(tab.channels()).toEqual({ telegram: ["-1001234567890"] }))

    // The alert, then its delivery to the local Telegram, as `ops/SpendAlert` runs them.
    const alertId = await alert(api, "call-1", "agent", 1_000)
    const channels = Channels.layer({ telegram: { token: Redacted.make("1:SYNTHETIC"), url: providers.url } })
    const delivered = await Effect.runPromise(
      api.github.run(
        SpendAlert.deliver({ alertId, channel: "telegram", outcome: "recorded" }).pipe(Effect.provide(channels)),
      ),
    )

    expect(delivered).toEqual({ outcome: "sent" })
    await until(() => expect(tab.receipts()).toEqual(["telegram:sent"]))
    // Older receipts beyond the latest few aren't shown.
    await Effect.runPromise(api.github.run(Effect.flatMap(SqlClient.SqlClient, (sql) =>
      sql`
        INSERT INTO alert_deliveries (alert_id, channel, status, code, updated_at)
        SELECT 'older-' || n, 'email', 'refused', 'unconfigured', now() - n * interval '1 minute'
        FROM generate_series(1, ${RECEIPTS_SHOWN}) AS n`)))
    await until(() => expect(tab.receipts()).toHaveLength(RECEIPTS_SHOWN))
    expect(tab.receipts()[0]).toBe("telegram:sent")
  })
})

describe("what an alert's message says", () => {
  // 2026-10-20 15:00 to 15:15 UTC.
  const from = Date.UTC(2026, 9, 20, 15, 0)
  const until = Date.UTC(2026, 9, 20, 15, 15)

  test("the word, tokens and cost; then the window, the roles that spent most, and the link", () => {
    expect(alertMessage({
      from,
      until,
      tokens: 12_340,
      costUsd: 0.0184,
      roles: [
        { role: "judge", tokens: 340 },
        { role: "agent", tokens: 12_000 },
      ],
    }, "https://smithers.test/app")).toEqual({
      subject: "Model spend · 12,340 tokens · $0.02",
      text: "15:00–15:15 UTC, 2026-10-20\nagent 12,000 · judge 340\nhttps://smithers.test/app",
    })
  })

  test("no cost when a model isn't priced; three roles at most; a window over midnight names both days", () => {
    const message = alertMessage({
      from: Date.UTC(2026, 9, 20, 23, 50),
      until: Date.UTC(2026, 9, 21, 0, 5),
      tokens: 100,
      costUsd: null,
      roles: [
        { role: "a", tokens: 10 },
        { role: "b", tokens: 40 },
        { role: "c", tokens: 30 },
        { role: "d", tokens: 20 },
      ],
    }, "https://smithers.test/app")
    expect(message.subject).toBe("Model spend · 100 tokens")
    expect(message.text).toBe("2026-10-20 23:50 – 2026-10-21 00:05 UTC\nb 40 · c 30 · d 20\nhttps://smithers.test/app")
  })

  test("an alert with no roles leaves their line out", () => {
    expect(alertMessage({ from, until, tokens: 0, costUsd: 0, roles: [] }, "https://smithers.test/app").text).toBe(
      "15:00–15:15 UTC, 2026-10-20\nhttps://smithers.test/app",
    )
  })
})

describe("what a receipt and a field say", () => {
  test("sent; refused with the provider's reason, else its code; retrying with its code", () => {
    expect(receiptText({ status: "sent", code: null, reason: null })).toBe("Sent")
    expect(receiptText({ status: "refused", code: "rejected", reason: "Bad Request: chat not found" })).toBe(
      "Refused · Bad Request: chat not found",
    )
    expect(receiptText({ status: "refused", code: "unconfigured", reason: null })).toBe("Refused · unconfigured")
    expect(receiptText({ status: "failed", code: "unavailable", reason: null })).toBe("Retrying · unavailable")
    expect(receiptText({ status: "failed", code: null, reason: null })).toBe("Retrying")
  })

  test("a field's destinations split on commas and spaces", () => {
    expect(splitDestinations(" will@example.com,ops@example.com  a@b.cd ,, ")).toEqual([
      "will@example.com",
      "ops@example.com",
      "a@b.cd",
    ])
    expect(splitDestinations("")).toEqual([])
  })
})
