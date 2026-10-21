import { expect, test } from "./devices"

test("Conversation timeline: scroll, jump by key and receive durable summaries", {
  annotation: { type: "summary", description: "A long conversation stays in sync with its rail; keys jump and summaries arrive without moving rows." },
}, async ({ devices, request }) => {
  test.setTimeout(180_000)
  const [a] = await devices.open("Timeline")
  await a.page.goto("/app?agent=echo")
  await a.ready()
  const word = `rail-${Date.now()}`
  await test.step("Build a long conversation", async () => {
    // Another real API client records the conversation, as in local-first-conflicts.spec.ts.
    // This journey tests rail navigation and summaries independently of the agent-answer journey.
    for (let n = 0; n < 8; n++) {
      const id = crypto.randomUUID()
      const answerId = crypto.randomUUID()
      const question = `Inspect release retry ${n + 1}: ${word}`
      const asked = await request.post("/api/questions", { data: { id, answerId, text: question } })
      expect(asked.status()).toBe(202)
      const answered = await request.post(`/api/answers/${answerId}`, {
        data: { status: "done", text: `Release retry ${n + 1} retained both recorded attempts. The check found a missing projection entry. ${word}` },
      })
      expect(answered.status()).toBe(200)
    }
    await expect(a.conversation.locator('[data-role="assistant"]', { hasText: word })).toHaveCount(8, { timeout: 30_000 })
  })
  const rail = a.page.getByRole("navigation", { name: "Conversation timeline" })
  await expect(rail).toBeVisible()
  const transcriptWidth = (await a.conversation.boundingBox())!.width
  await test.step("Receive navigation summaries", async () => {
    await expect.poll(() => rail.locator('[data-summary="ready"]').count(), { timeout: 90_000 }).toBeGreaterThan(0)
    expect((await a.conversation.boundingBox())!.width).toBe(transcriptWidth)
    expect(await rail.getByRole("button").evaluateAll(buttons => buttons.every(button => button.getBoundingClientRect().height === 34))).toBe(true)
  })
  await test.step("Preview an entry on hover and focus", async () => {
    const first = rail.getByRole("button").first()
    const preview = rail.getByRole("tooltip").first()
    await expect(preview).toBeHidden()
    await first.hover()
    await expect(preview).toBeVisible()
    await expect(preview).toContainText("Person")
    await expect(preview).toContainText("Enter to jump")
    await a.page.mouse.move(1100, 20)
    await expect(preview).toBeHidden()
    await first.focus()
    await expect(preview).toBeVisible()
  })
  await test.step("Jump to the beginning by key", async () => {
    const last = rail.getByRole("button").last()
    await last.focus()
    await last.press("Home")
    const first = rail.getByRole("button").first()
    await expect(first).toBeFocused()
    await expect(first).toHaveAttribute("aria-current", "location")
    await first.press("ArrowDown")
    await expect(rail.getByRole("button").nth(1)).toBeFocused()
  })
  await test.step("Scroll the transcript and follow its band", async () => {
    await a.conversation.locator('[data-slot="message-scroller-viewport"]').evaluate(el => { el.scrollTop = el.scrollHeight })
    await expect(rail.getByRole("button").last()).toHaveAttribute("aria-current", "location")
    await rail.getByRole("button").nth(1).press("End")
    await expect(rail.getByRole("button").last()).toBeFocused()
  })
  await test.step("Keep the transcript usable on a phone", async () => {
    await a.page.setViewportSize({ width: 390, height: 844 })
    await expect(rail).toBeHidden()
    await expect(a.conversation).toBeVisible()
    const toggle = a.page.locator(".sui-timeline-disclosure > summary")
    await expect(toggle).toBeVisible()
    await toggle.click()
    await expect(rail).toBeVisible()
    await rail.getByRole("button").first().focus()
    await expect(rail.getByRole("tooltip").first()).toBeVisible()
    await toggle.focus()
    await toggle.press("Enter")
    await expect(rail).toBeHidden()
    await toggle.press("Enter")
    await expect(rail).toBeVisible()
    await rail.getByRole("button").first().press("Escape")
    await expect(rail).toBeHidden()
    await expect(toggle).toBeFocused()
  })
})
