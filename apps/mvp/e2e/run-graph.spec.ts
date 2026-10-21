import { expect, test } from "./devices"
import { requires, scriptedAgent } from "./target"

// Real durable browser run, model as the existing injected needs-you service. No request interception.
// The graph reads the startup steps too: provider or run-credential refusal remains inspectable. The scripted model is
// a dev build's, and asking needs a Member or above.
requires("scriptedAgent", "member")
test("run graph: follow a multi-step run, replay its journal and inspect a step", {
  annotation: { type: "summary", description: "Live graph, journal replay and step detail share one recorded run." },
}, async ({ devices }) => {
  test.setTimeout(120_000)
  const [device] = await devices.open("Graph")
  const page = device.page
  await test.step("Start a flow", async () => {
    await page.goto(scriptedAgent("needs-you"))
    await device.ready()
    await device.askAndWaitTaken(`Deploy the docs preview, ${devices.word}`)
  })
  const answerId = device.asked.at(-1)!.answerId
  await test.step("Watch the live graph", async () => {
    await page.goto(`/app/runs/${encodeURIComponent(answerId)}`)
    await expect(page.getByRole("group", { name: "Run graph" })).toBeVisible({ timeout: 30_000 })
    await expect.poll(() => page.locator('[data-slot="flow-graph"] [data-node]').count()).toBeGreaterThan(1)
    await page.getByRole("tab", { name: "Journal", exact: true }).click()
    await test.info().attach("run-graph-journal", { body: await page.getByRole("table", { name: "Journal" }).innerText(), contentType: "text/plain" })
    const payloads = await page.getByRole("table", { name: "Journal" }).locator("pre").allTextContents()
    await test.info().attach("run-graph-journal-payloads", { body: JSON.stringify(payloads), contentType: "application/json" })
    await page.getByRole("tab", { name: /^Steps/ }).click()
    await expect(page.locator('[data-slot="flow-graph"] [data-state="current"]').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-slot="journal-scrubber"]')).toHaveAttribute("data-live", "true")
  })
  await test.step("Replay the journal", async () => {
    const slider = page.getByRole("slider", { name: "Journal position" })
    await slider.fill("1")
    await expect(page.locator('[data-slot="journal-scrubber"]')).toHaveAttribute("data-live", "false")
    await expect(page.locator('[data-slot="flow-graph"] [data-node]')).toHaveCount(0)
    await page.getByRole("group", { name: "Run graph" }).focus()
    await page.keyboard.press("]")
    await page.keyboard.press("L")
    await expect.poll(() => page.locator('[data-slot="flow-graph"] [data-node]').count()).toBeGreaterThan(1)
    await expect(page.locator('[data-slot="journal-scrubber"]')).toHaveAttribute("data-live", "true")
  })
  await test.step("Inspect a step with the keyboard", async () => {
    const graph = page.getByRole("group", { name: "Run graph" })
    await graph.focus()
    await page.keyboard.press("ArrowLeft")
    await page.keyboard.press("i")
    await expect(page.locator('[data-slot="step-inspector"]')).toBeVisible()
    await page.locator('[data-slot="step-inspector"]').getByRole("tab", { name: /^Attempts/ }).click()
    await expect(page.locator('[data-slot="run-waterfall"]')).toBeVisible()
  })
  await test.step("Light and dark on desktop and phone", async () => {
    const fills: string[] = []
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 })
      for (const theme of ["light", "dark"]) {
        await page.evaluate((theme) => { document.documentElement.dataset.theme = theme }, theme)
        await expect(page.getByRole("group", { name: "Run graph" })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        if (width === 1280) fills.push(await page.locator('[data-slot="flow-graph"] [data-node] rect').first().evaluate((node) => getComputedStyle(node).fill))
        await test.info().attach(`run-graph-${theme}-${width}`, { body: await page.screenshot(), contentType: "image/png" })
      }
    }
    expect(fills[0]).not.toBe(fills[1])
  })
})
