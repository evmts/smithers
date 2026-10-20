import type { Page } from "@playwright/test"
import { expect, test } from "./devices"

// Your own flows and their runs, end to end (docs/features/flows.md#your-own-flows, docs/features/runs.md, decision
// 0014's F1 and F7): a real browser, its own durable engine and the real model. A person drafts a prompt flow from the
// Flows page, saves it, runs it, watches its run page to its answer, then stops a live run and retries it. No mocks.
// Each run is a few model calls: Cerebras rate-limits concurrent calls, so the steps go one after another.

/** The run page's state word, in the header's live region. */
const runState = (page: Page) => page.locator('[data-slot="run-header"] [role="status"]')

/** Starts a run of `name` from the Flows page and waits for its run page. */
const run = async (page: Page, name: string) => {
  if (!page.url().endsWith("/app/flows")) await page.goto("/app/flows")
  await page.getByRole("button", { name: `Run ${name}` }).click()
  await expect(page).toHaveURL(/\/app\/runs\/[0-9a-f-]{36}$/, { timeout: 30_000 })
}

test("flows: draft a flow, save it, run it, watch its run page, then stop a run and retry it", async ({ devices }) => {
  test.setTimeout(300_000)
  const [a] = await devices.open("A")
  const page = a.page
  const name = `count-${Date.now().toString(36)}`

  // Draft: the form, then the card, which the drafting agent fills.
  await page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Flows" }).click()
  await expect(page).toHaveURL(/\/app\/flows$/)
  await page.getByRole("link", { name: "New flow" }).click()
  await page.getByLabel("Name").fill(name)
  await page.getByLabel("What it should do").fill(
    "Write the numbers from one to three hundred as English words, separated by commas, and answer with that list.",
  )
  await page.getByRole("button", { name: "Draft" }).click()
  await expect(page).toHaveURL(/\/app\/flows\/drafts\/[0-9a-f-]{36}$/, { timeout: 30_000 })
  const status = page.getByRole("status").filter({ hasText: /Ready|Needs you|Failed|Drafting/ }).first()
  await expect(status).toContainText(/Ready|Needs you/, { timeout: 120_000 })
  // A blocking question the agent asked: take its default and answer, so the next round drafts.
  if ((await status.textContent())?.includes("Needs you")) {
    await page.getByRole("button", { name: "Answer" }).click()
    await expect(status).toContainText("Ready", { timeout: 120_000 })
  }
  await expect(page.getByText("SKILL.md")).toBeVisible()

  // Save: the flow is yours, on the Flows page.
  await page.getByRole("button", { name: "Save" }).click()
  await expect(page).toHaveURL(/\/app\/flows$/, { timeout: 90_000 })
  await expect(page.getByRole("button", { name: `Run ${name}` })).toBeVisible()

  // Run it and watch its run page follow it to its answer: its steps, the step that loaded the flow, and its result.
  await run(page, name)
  await expect(runState(page)).toContainText("Done", { timeout: 120_000 })
  await expect(page.getByRole("listbox", { name: "Steps" })).toContainText("flow/run/load")
  await expect(page.getByText("Result")).toBeVisible()
  await page.getByRole("tab", { name: "Journal" }).click()
  await expect(page.getByRole("table", { name: "Journal" })).toContainText("flows.engine.run-decision")
  await page.getByRole("tab", { name: "Timeline" }).click()

  // Stop a live run: Stopping, then Stopped. The model may answer before the press lands; then run it again.
  let stopped = false
  for (let attempt = 0; attempt < 3 && !stopped; attempt++) {
    await run(page, name)
    const stop = page.getByRole("button", { name: "Stop" })
    await stop.click({ timeout: 10_000 }).catch(() => undefined)
    await expect(runState(page)).toContainText(/Stopped|Done/, { timeout: 120_000 })
    stopped = (await runState(page).textContent())?.includes("Stopped") ?? false
  }
  expect(stopped, "a run stopped while it worked").toBe(true)

  // Retry the stopped run: a new run of the same flow, whose page opens and follows it.
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await expect(page).toHaveURL(/\/app\/runs\/retry%3A.+%2Frun$/, { timeout: 30_000 })
  await expect(runState(page)).toContainText(/Working|Done/, { timeout: 60_000 })
  await expect(runState(page)).toContainText("Done", { timeout: 120_000 })

  // Runs lists every run of the flow, newest first.
  await page.getByRole("link", { name: "Runs" }).first().click()
  await expect(page.getByRole("table", { name: "Runs" })).toContainText("flow/run")
})
