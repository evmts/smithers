import type { Page } from "@playwright/test"
import { expect, test } from "./devices"
import { requires } from "./target"

// Your own flows and their runs, end to end (docs/features/flows.md#your-own-flows, docs/features/runs.md, decision
// 0014's F1 and F7): a real browser, its own durable engine and the real model. A person drafts a flow from a prompt on
// the Flows page, saves it, runs it, watches its run page to its answer, then stops a live run and retries it; and opens
// a flow's code, runs it, relabels its step and sees Run refused until a sandbox can run that code. No mocks. Each run
// is a few model calls: Cerebras rate-limits concurrent calls, so the steps go one after another. Drafting asks the
// agent, a Member's (worker/PersonalFlows.ts `canAsk`).

requires("member")

/** The run page's state word, in the header's live region. */
const runState = (page: Page) => page.locator('[data-slot="run-header"] [role="status"]')

/** Drafts `name` from `request` on the Flows page and saves it: the person's flow, back on the Flows page. */
const draftAndSave = async (page: Page, name: string, request: string) => {
  await page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Flows" }).click()
  await expect(page).toHaveURL(/\/app\/flows$/)
  await page.getByRole("link", { name: "New flow" }).click()
  await page.getByLabel("Name").fill(name)
  await page.getByLabel("What it should do").fill(request)
  await page.getByRole("button", { name: "Draft" }).click()
  await expect(page).toHaveURL(/\/app\/flows\/drafts\/[0-9a-f-]{36}$/, { timeout: 30_000 })
  const status = page.getByRole("status").filter({ hasText: /Ready|Needs you|Failed|Drafting/ }).first()
  await expect(status).toContainText(/Ready|Needs you/, { timeout: 120_000 })
  // A blocking question the agent asked: take its default and answer, so the next round drafts.
  if ((await status.textContent())?.includes("Needs you")) {
    await page.getByRole("button", { name: "Answer" }).click()
    await expect(status).toContainText("Ready", { timeout: 120_000 })
  }
  // The draft is flow source: one flow.ts module.
  await expect(page.getByText("flow.ts")).toBeVisible()
  await page.getByRole("button", { name: "Save" }).click()
  await expect(page).toHaveURL(/\/app\/flows$/, { timeout: 90_000 })
  await expect(page.getByRole("button", { name: `Run ${name}` })).toBeVisible()
}

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

  // Draft: the form, then the card, which the drafting agent fills; Save: the flow is yours, on the Flows page.
  await draftAndSave(
    page,
    name,
    "Write the numbers from one to three hundred as English words, separated by commas, and answer with that list.",
  )

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

test("flows: draft a flow from a prompt, open its code, run it, relabel its step, and Run is refused: it needs a sandbox", async ({ devices }) => {
  test.setTimeout(300_000)
  const [a] = await devices.open("A")
  const page = a.page
  const name = `ready-${Date.now().toString(36)}`
  await draftAndSave(page, name, "Answer with the single word ready.")

  // Code: the flow is a typed Flow.make module named for it, with one agent step.
  await page.getByRole("link", { name: `Code ${name}` }).click()
  await expect(page).toHaveURL(new RegExp(`/app/flows/code/${name}$`))
  const code = page.getByRole("textbox", { name: "Code" })
  await expect(code).toHaveValue(new RegExp(`export default Flow\\.make\\("${name}"`), { timeout: 30_000 })
  await expect(code).toHaveValue(new RegExp(`AgentAction\\.make\\("${name}/agent"`))
  // The module's own comment says other code needs a sandbox; the page's line says so only once it is other code.
  await expect(page.getByText("Needs a sandbox", { exact: true })).toHaveCount(0)

  // Run it as drafted: its run page follows it to its answer.
  await page.getByRole("link", { name: "Flows" }).first().click()
  await run(page, name)
  await expect(runState(page)).toContainText("Done", { timeout: 120_000 })
  await expect(page.getByRole("listbox", { name: "Steps" })).toContainText("flow/run/load")

  // Relabel its step in code: the page says it needs a sandbox, and Save keeps it as the next revision.
  await page.goto("/app/flows")
  await page.getByRole("link", { name: `Code ${name}` }).click()
  await expect(code).toHaveValue(new RegExp(`"${name}/agent"`), { timeout: 30_000 })
  await code.fill((await code.inputValue()).replace(`"${name}/agent"`, `"${name}/answer"`))
  await expect(page.getByRole("status").filter({ hasText: "Needs a sandbox" })).toBeVisible()
  await page.getByRole("button", { name: "Save" }).click()
  await expect(page).toHaveURL(/\/app\/flows$/, { timeout: 90_000 })

  // Run again: refused, with the reason, until a sandbox can run code the person wrote.
  await expect(page.getByRole("button", { name: `Run ${name}` })).toBeDisabled({ timeout: 30_000 })
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText("Needs a sandbox")
  await page.getByRole("link", { name: `Code ${name}` }).click()
  await expect(code).toHaveValue(new RegExp(`"${name}/answer"`), { timeout: 30_000 })
})
