import { expect, test } from "./browserTest"
import { installCloudFixture } from "./cloudFixture"
import { fillComposer } from "./composer"
import { SCOPED_TEST_USER } from "./identity"

type Flight = { frames: Keyframe[]; duration: number; left: number; top: number; finished: boolean }
type ObservedWindow = Window & { composerFlights: Flight[]; composerOrigin?: { left: number; top: number } }

for (const door of ["Enter", "Send", "instant admission", "reduced motion"] as const) {
  test(`${door} dismisses Chat and moves the accepted prompt without waiting for admission`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: door === "reduced motion" ? "reduce" : "no-preference" })
    await installCloudFixture(page, { capabilities: ["install", "identity", "agent"] })
    await page.addInitScript(() => {
      const observed = window as unknown as ObservedWindow
      observed.composerFlights = []
      document.addEventListener("submit", event => {
        const input = (event.target as HTMLFormElement).querySelector("[data-testid=composer-input]")
        if (!input) return
        const rect = input.getBoundingClientRect(), style = getComputedStyle(input)
        observed.composerOrigin = { left: rect.left + parseFloat(style.paddingLeft), top: rect.top + parseFloat(style.paddingTop) }
      }, true)
      const animate = Element.prototype.animate
      Element.prototype.animate = function (frames, options) {
        const rect = this.getBoundingClientRect()
        const animation = animate.call(this, frames, options)
        if ((this as HTMLElement).dataset.composerFlight) {
          const flight: Flight = { frames: frames as Keyframe[], duration: Number((options as KeyframeAnimationOptions).duration), left: rect.left, top: rect.top, finished: false }
          observed.composerFlights.push(flight)
          void animation.finished.then(() => { flight.finished = true }, () => {})
        }
        return animation
      }
    })
    const prompt = "Move this message into chat"
    let release!: () => void
    const admission = new Promise<void>(resolve => { release = resolve })
    let calls = 0
    let entries: unknown[] = []
    await page.route("**/api/conversations/main", route => route.fulfill({ json: { id: "main", entries } }))
    await page.route("**/api/conversations/main/view-state", route => route.fulfill({ json: { queue: [] } }))
    await page.route("**/api/conversations/main/prompt", async route => {
      calls++
      expect(route.request().postDataJSON()).toMatchObject({ prompt, idempotencyKey: expect.any(String) })
      await admission
      entries = [{ id: "moving-turn", author: 1, authorLogin: SCOPED_TEST_USER.login, runId: "moving-run", prompt, state: "completed", frames: [] }]
      await route.fulfill({ status: 202, json: { turnId: "moving-turn", terminal: true } })
    })
    try {
      await page.goto("/")
      await fillComposer(page, prompt)
      const input = page.getByTestId("composer-input")
      if (door === "instant admission") release()
      if (door === "Send") await page.getByTestId("composer-send").click()
      else await input.press("Enter")
      await expect(input).toBeHidden()
      await expect(page.getByTestId("composer-overlay")).toBeHidden()
      await expect(page.locator("[data-composer-prompt]")).toContainText(prompt)
      await expect(page.getByRole("button", { name: "Chat", exact: true })).toBeFocused()
      await expect.poll(() => calls).toBe(1)
      if (door !== "reduced motion") {
        await expect.poll(() => page.evaluate(() => (window as unknown as ObservedWindow).composerFlights.length)).toBe(1)
        const flight = await page.evaluate(() => (window as unknown as ObservedWindow).composerFlights[0]!)
        const origin = await page.evaluate(() => (window as unknown as ObservedWindow).composerOrigin!)
        const translation = String(flight.frames[0]!.transform).match(/translate\(([-.\d]+)px, ([-.\d]+)px\)/)!
        expect(flight.left + Number(translation[1])).toBeCloseTo(origin.left, 0)
        expect(flight.top + Number(translation[2])).toBeCloseTo(origin.top, 0)
        expect(flight.frames[1]!.transform).toBe("translate(0px, 0px)")
        expect(flight.duration).toBeGreaterThan(0)
        await expect.poll(() => page.evaluate(() => (window as unknown as ObservedWindow).composerFlights[0]?.finished)).toBe(true)
        await expect(page.locator("[data-composer-flight]")).toHaveCount(0)
      } else expect(await page.evaluate(() => (window as unknown as ObservedWindow).composerFlights)).toEqual([])
      if (door !== "instant admission") {
        // Repeating an unresolved prompt consumes the composer without admitting twice.
        await fillComposer(page, prompt)
        await input.press("Enter")
        await expect(input).toBeHidden()
        expect(calls).toBe(1)
        expect(await page.evaluate(() => (window as unknown as ObservedWindow).composerFlights.length)).toBe(door === "reduced motion" ? 0 : 1)
      }
      // The unresolved request leaves the rest of Chat usable and the next draft intact.
      await fillComposer(page, "Keep my next draft")
      release()
      await expect(page.locator('[data-shared-turn="moving-turn"]')).toContainText(prompt)
      await expect(input).toBeVisible()
      await expect(input).toHaveValue("Keep my next draft")
      expect(calls).toBe(1)
    } finally { release() }
  })
}

test("blank input, multiline editing and IME do not dismiss Chat", async ({ page }) => {
  await installCloudFixture(page, { capabilities: ["install", "identity", "agent"] })
  let calls = 0
  await page.route("**/api/conversations/main/prompt", route => { calls++; return route.fulfill({ status: 503, json: { message: "Unavailable" } }) })
  await page.goto("/")
  await fillComposer(page, "   ")
  const input = page.getByTestId("composer-input")
  await input.press("Enter")
  await expect(input).toBeVisible()
  await input.fill("First line")
  await input.press("Shift+Enter")
  await expect(input).toHaveValue("First line\n")
  await input.evaluate(node => node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", isComposing: true, bubbles: true })))
  await expect(input).toBeVisible()
  expect(calls).toBe(0)
})

test("failed admission keeps the sent prompt visible and Chat can reopen", async ({ page }) => {
  await installCloudFixture(page, { capabilities: ["install", "identity", "agent"] })
  await page.route("**/api/conversations/main/prompt", route => route.fulfill({ status: 503, json: { message: "Admission refused" } }))
  await page.goto("/")
  await fillComposer(page, "Keep this if admission fails")
  await page.getByTestId("composer-input").press("Enter")
  await expect(page.getByTestId("composer-input")).toBeHidden()
  await expect(page.locator("[data-prompt-request]")).toContainText("Keep this if admission fails")
  await expect(page.locator("[data-prompt-request]")).toContainText("Prompt unavailable")
  await fillComposer(page, "Try another prompt")
  await expect(page.getByTestId("composer-input")).toBeFocused()
})
