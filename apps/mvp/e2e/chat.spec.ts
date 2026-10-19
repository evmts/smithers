import { expect, test } from "@playwright/test"

// Real browser, real Worker, real model: no mocks. Runs locally, or against production with BASE_URL.

test("⌘K opens and hides chat, and Esc and the Hide button hide it too", async ({ page }) => {
  await page.goto("/app")
  const composer = page.getByRole("textbox", { name: "Message Smithers" })
  await expect(composer).toBeHidden()

  for (let round = 0; round < 3; round++) {
    await page.keyboard.press("ControlOrMeta+k")
    await expect(composer).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(composer).toBeHidden()
  }

  // The composer frame is the only box: its focused textarea draws no ring of its own.
  await page.keyboard.press("ControlOrMeta+k")
  expect(await composer.evaluate((input) => getComputedStyle(input).boxShadow)).toBe("none")
  await page.keyboard.press("Escape")

  await page.getByRole("button", { name: /Chat/ }).click()
  await expect(composer).toBeFocused()
  await page.keyboard.press("ControlOrMeta+k")
  await expect(composer).toBeHidden()

  await page.keyboard.press("ControlOrMeta+k")
  await page.getByRole("button", { name: /Hide/ }).click()
  await expect(composer).toBeHidden()
})

test("a user asks Smithers and gets a streamed answer", async ({ page }) => {
  await page.goto("/app")
  await page.keyboard.press("ControlOrMeta+k")
  const composer = page.getByRole("textbox", { name: "Message Smithers" })
  await composer.fill("Reply with exactly the word: pong")
  await composer.press("Enter")

  const conversation = page.getByRole("region", { name: "Conversation", exact: true })
  await expect(conversation.getByText("Reply with exactly the word: pong")).toBeVisible()
  await expect(conversation.getByText(/^pong\.?$/i)).toBeVisible({ timeout: 60_000 })
  await expect(conversation).not.toContainText("Smithers couldn't answer")
})
