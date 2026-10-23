import { expect } from "@playwright/test"
import { test } from "./devices"
import { requires, scriptedAgent } from "./target"

for (const width of [390, 768, 1280]) {
  test(`pin at ${width}: stays above a long conversation and follows only its person`, {
    annotation: { type: "summary", description: "Pin, scroll, collapse, sync across devices, and unpin without changing another person's view." },
  }, async ({ devices }) => {
    requires("devPeople", "scriptedAgent")
    test.setTimeout(180_000)
    devices.atWidth(width)
    const [first, second] = await devices.open("First device", "Second device")
    const [other] = await devices.openTeammate("Another person")
    await first!.page.goto(scriptedAgent("pin-message"))
    await first!.ready()
    const question = `${devices.word}: Write 35 numbered lines about a garden, one short sentence per line. Start with GARDEN.`
    await first!.ask(question)
    await first!.expectAnswered(question, "GARDEN")
    const reply = first!.answerTo(question)
    const id = (await reply.getAttribute("data-id"))!
    const pinned = first!.page.getByRole("region", { name: "Pinned message", exact: true })
    await test.step("Pin the agent's reply", async () => {
      await reply.hover()
      await reply.getByRole("button", { name: "Pin message", exact: true }).click()
      await expect(pinned).toHaveAttribute("data-message-id", id)
      if (width === 1280) await expect(first!.page.getByRole("navigation", { name: "Conversation timeline", exact: true })).toBeInViewport()
      await expect(second!.page.getByRole("region", { name: "Pinned message", exact: true })).toHaveAttribute("data-message-id", id)
      await expect(other!.page.getByRole("region", { name: "Pinned message", exact: true })).toHaveCount(0)
    })
    await test.step("Scroll the conversation beneath the pin", async () => {
      const conversation = first!.page.getByRole("region", { name: "Conversation", exact: true })
      const top = async () => {
        const [copy, column] = await Promise.all([pinned.boundingBox(), conversation.boundingBox()])
        return Math.round(copy!.y - column!.y)
      }
      await expect.poll(top).toBe(0)
      const scroll = first!.page.locator('[data-slot="message-scroller-viewport"]')
      expect(await scroll.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true)
      await scroll.evaluate(node => { node.scrollTop = 0 })
      await expect.poll(top).toBe(0)
      await scroll.evaluate(node => { node.scrollTop = node.scrollHeight })
      expect(await scroll.evaluate(node => node.scrollTop)).toBeGreaterThan(0)
      await expect.poll(top).toBe(0)
      await expect(pinned).toBeInViewport()
      const content = pinned.locator(".mvp-pin-content")
      expect(await content.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true)
      expect((await pinned.boundingBox())!.height).toBeLessThan(320)
      await content.evaluate(node => { node.scrollTop = node.scrollHeight })
      await pinned.getByRole("button", { name: "Collapse pinned message" }).click()
      await expect(content).toBeHidden()
      await expect(first!.composer).toBeVisible()
      await pinned.getByRole("button", { name: "Expand pinned message" }).click()
      await expect(content).toBeVisible()
    })
    await test.step("Reload the second device and replace the pin with the person's message", async () => {
      await second!.reload()
      await expect(second!.page.getByRole("region", { name: "Pinned message", exact: true })).toHaveAttribute("data-message-id", id)
      const own = first!.question(question)
      await own.hover()
      await own.getByRole("button", { name: "Pin message", exact: true }).click()
      await expect(pinned).toHaveAttribute("data-message-id", (await own.getAttribute("data-id"))!)
      await expect(other!.page.getByRole("region", { name: "Pinned message", exact: true })).toHaveCount(0)
    })
    await test.step("Unpin from the original, then from the pinned copy", async () => {
      const own = first!.question(question)
      await own.hover()
      await own.getByRole("button", { name: "Unpin message", exact: true }).click()
      await expect(pinned).toHaveCount(0)
      await reply.hover()
      await reply.getByRole("button", { name: "Pin message", exact: true }).click()
      await expect(pinned).toHaveAttribute("data-message-id", id)
      await pinned.getByRole("button", { name: "Unpin message", exact: true }).click()
      await expect(pinned).toHaveCount(0)
      await expect(second!.page.getByRole("region", { name: "Pinned message", exact: true })).toHaveCount(0)
    })
  })
}
