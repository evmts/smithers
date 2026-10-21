import { type AlertProviders, startAlertProviders } from "../worker/test/alertProviders.ts"
import { expect, test } from "./devices"
import { requires, target } from "./target"

// Spend alerts by email and Telegram, end to end (docs/features/spend-alerts.md#channels): the real app, ChatApi, the
// `ops/SpendAlert` flow on its Durable Object, Postgres and Electric. An Admin (under `alchemy dev`, the local
// developer) sets an email address and a Telegram chat in Settings, asks a question, which spends, and sees each
// channel's receipt once the window ends. The providers are the local stand-in (worker/test/alertProviders.ts) at the
// URL the dev server was started with, so nothing is really sent:
//
//   MODEL_SPEND_ALERTS=true MODEL_SPEND_ALERT_WINDOW='3 seconds' ALERT_EMAIL_API_URL=http://127.0.0.1:1339 \
//   ALERT_TELEGRAM_API_URL=http://127.0.0.1:1339 pnpm dev
//
// The spec reads the same variables (`requires("alertProviders")`, e2e/target.ts), so it runs only against local development.
// The question must be admitted to spend, so the dev database's daily model budget needs room (`429 quota_exceeded`
// spends nothing).

const providersUrl = process.env.ALERT_TELEGRAM_API_URL
const ready = target === "local" && providersUrl !== undefined &&
  providersUrl === process.env.ALERT_EMAIL_API_URL && process.env.MODEL_SPEND_ALERTS === "true"

const ADDRESS = "will@example.com"
const CHAT = "-1001234567890"

/** A window's alert: the window, then the flow's wait, its Durable Object's alarm and Electric's next response. */
const DELIVERED_WITHIN = 90_000

let providers: AlertProviders | undefined
test.beforeAll(async () => {
  if (ready) providers = await startAlertProviders(Number(new URL(providersUrl!).port))
})
test.afterAll(async () => {
  await providers?.close()
})

test("channels: an Admin sets email and Telegram, and each spend alert's delivery shows its receipt", {
  annotation: {
    type: "summary",
    description: "An Admin sets where spend alerts go; the next alert reaches the email address and the Telegram chat.",
  },
}, async ({ devices }) => {
  requires("alertProviders")
  test.setTimeout(240_000)
  const [a] = await devices.open("Admin")
  const page = a.page
  const settings = page.getByRole("region", { name: "Spend alerts" })
  const email = settings.getByRole("form", { name: "Email" })
  const telegram = settings.getByRole("form", { name: "Telegram chat" })

  await test.step("Open Settings from the header", async () => {
    await page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Settings" }).click()
    await expect(page.getByRole("main", { name: "Settings" })).toBeVisible()
  })

  await test.step("Set the email address and the Telegram chat", async () => {
    await email.getByLabel("Email").fill(ADDRESS)
    await email.getByRole("button", { name: "Save" }).click()
    await telegram.getByLabel("Telegram chat").fill(CHAT)
    await telegram.getByRole("button", { name: "Save" }).click()
    // Each field shows the setting once it synced back, and the save stops showing.
    await expect(email.getByLabel("Email")).toHaveValue(ADDRESS, { timeout: 30_000 })
    await expect(telegram.getByLabel("Telegram chat")).toHaveValue(CHAT, { timeout: 30_000 })
    await expect(settings.getByRole("status")).toHaveCount(0, { timeout: 30_000 })
  })

  await test.step("Ask a question, which spends", async () => {
    await page.getByRole("link", { name: "Back to chat" }).click()
    const call = page.waitForResponse((response) => response.url().includes("/api/model/agent"), { timeout: 60_000 })
    await a.ask("What changed on main today?")
    await call
    await page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Settings" }).click()
  })

  await test.step("Each channel's receipt shows: sent", async () => {
    // Every window with spend sends again, so the list may hold several receipts per channel.
    const sent = (channel: string) =>
      settings.getByRole("list", { name: "Deliveries" }).getByRole("listitem").filter({ hasText: channel })
        .filter({ hasText: "Sent" }).first()
    await expect(sent("Email")).toBeVisible({ timeout: DELIVERED_WITHIN })
    await expect(sent("Telegram chat")).toBeVisible({ timeout: DELIVERED_WITHIN })
  })

  // What the providers took: one email to the address, one message to the chat, each the alert's short message.
  const sentEmail = providers!.received.find((request) => request.provider === "email")
  const sentMessage = providers!.received.find((request) => request.provider === "telegram")
  expect(sentEmail!.body).toMatchObject({ to: [ADDRESS], subject: expect.stringMatching(/^Model spend · [\d,]+ tokens/) })
  expect(String(sentEmail!.body.text)).toMatch(/UTC, \d{4}-\d{2}-\d{2}\n[a-z]+ [\d,]+.*\nhttps?:\/\/[^/]+\/app$/u)
  expect(sentMessage!.body).toMatchObject({ chat_id: CHAT, text: expect.stringMatching(/^Model spend · /) })

  await test.step("Clear the Telegram chat: Telegram is off", async () => {
    await telegram.getByLabel("Telegram chat").fill("")
    await telegram.getByRole("button", { name: "Save" }).click()
    await expect(settings.getByRole("status")).toHaveCount(0, { timeout: 30_000 })
    await page.reload()
    await expect(page.getByRole("form", { name: "Telegram chat" }).getByLabel("Telegram chat")).toHaveValue("", {
      timeout: 30_000,
    })
    await expect(page.getByRole("form", { name: "Email" }).getByLabel("Email")).toHaveValue(ADDRESS, {
      timeout: 30_000,
    })
  })
})
