import { expect, test } from "./devices"
import { field, local, type LogRecord, LogTail } from "./logs"

// Flow usage, end to end (docs/observability.md#flow-usage, docs/features/runs.md#flows): the real app, its engine
// worker and ChatApi, no model and no sign-in. The theme button runs `app/theme/set` on the device's durable engine,
// which records the run's start and settlement (`@smthrs/flow` `RunMetrics`) with its door, actor kind and placement;
// ChatApi's relay keeps them; and the Runs page's flows summary counts the run. No mocks.

/** The engine worker's `message` lines for `flow`, as ChatApi relayed them, with the usage fields. */
const usage = (records: Array<LogRecord>, message: string, flow: string) =>
  records
    .filter((record) => record.message === message && field(record, "flow") === flow)
    .map((record) => ({
      door: field(record, "door"),
      actor: field(record, "actor"),
      placement: field(record, "placement"),
      outcome: field(record, "outcome"),
      code: field(record, "code"),
      timed: typeof field(record, "durationMs") === "number",
    }))

test("flow usage: a button's run is counted by flow, door, actor and placement, and the Runs page sums it", {
  annotation: { type: "summary", description: "Each run records how it started and ended; Runs shows runs, success and p95 per flow." },
}, async ({ devices }) => {
  const logs = local ? await LogTail.start() : undefined
  const [a] = await devices.open("A")
  const page = a.page
  await expect(page.getByRole("button", { name: "Switch to dark mode" })).toBeVisible({ timeout: 30_000 })

  await test.step("Switch to dark mode", async () => {
    await page.getByRole("button", { name: "Switch to dark mode" }).click()
    await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible({ timeout: 30_000 })
  })

  if (logs !== undefined) {
    await test.step("The engine recorded the run's start and end", async () => {
      await expect
        .poll(async () => usage((await logs.records()).browser, "flow.run.settled", "app/theme/set"), { timeout: 30_000 })
        .toContainEqual({ door: "button", actor: "person", placement: "browser", outcome: "succeeded", code: "none", timed: true })
      expect(usage((await logs.records()).browser, "flow.run.started", "app/theme/set")).toContainEqual(
        { door: "button", actor: "person", placement: "browser", outcome: undefined, code: undefined, timed: false },
      )
    })
  }

  await test.step("Runs sums the flow's runs", async () => {
    await page.goto("/app/runs")
    const flows = page.getByRole("table", { name: "Flows" })
    await expect(flows).toBeVisible({ timeout: 30_000 })
    const row = flows.getByRole("row").filter({ hasText: "app/theme/set" })
    await expect(row).toContainText("100%")
    await expect(row.getByRole("cell").nth(1)).toHaveText(/^[1-9]\d*$/)
    await expect(row.getByRole("cell").nth(3)).toHaveText(/\d/)
  })
})
