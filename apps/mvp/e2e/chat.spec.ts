import { answerTo, expect, test } from "./fixtures"

// Real browser, real Worker, real model: no mocks. Runs locally, or against production with BASE_URL.

test("⌘K opens and hides chat, and Esc and the Hide button hide it too", async ({ page }) => {
  await page.goto("/app")
  await expect(page.getByRole("button", { name: /Chat/ })).toBeVisible({ timeout: 30_000 })
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
  await expect(page.getByRole("button", { name: /Chat/ })).toBeVisible({ timeout: 30_000 })
  await page.keyboard.press("ControlOrMeta+k")
  const composer = page.getByRole("textbox", { name: "Message Smithers" })
  // The conversation is shared and persists, so each run asks for its own word.
  const word = `pong-${Date.now()}`
  await composer.fill(`Reply with exactly the word: ${word}`)
  await composer.press("Enter")

  const conversation = page.getByRole("region", { name: "Conversation", exact: true })
  await expect(conversation.getByText(`Reply with exactly the word: ${word}`)).toBeVisible()
  await expect(answerTo(conversation, `Reply with exactly the word: ${word}`)).toContainText(word, { timeout: 60_000 })
})

test("reloading mid-answer fails that answer and leaves chat usable", async ({ page }) => {
  await page.goto("/app")
  await expect(page.getByRole("button", { name: /Chat/ })).toBeVisible({ timeout: 30_000 })
  await page.keyboard.press("ControlOrMeta+k")
  const composer = page.getByRole("textbox", { name: "Message Smithers" })
  const word = `count-${Date.now()}`
  await composer.fill(`Write ${word}, then count from 1 to 3000 in words, one number per line.`)
  await composer.press("Enter")

  // The page reloads as soon as the answer is underway; a long answer takes seconds to finish.
  const conversation = page.getByRole("region", { name: "Conversation", exact: true })
  const answer = answerTo(conversation, `Write ${word}`)
  await expect(answer).toHaveAttribute("data-role", "assistant")
  await page.reload()

  await expect(answer).toContainText("Smithers couldn't answer. Try again.", { timeout: 30_000 })

  // The composer stays open across the reload, and the next question gets its answer.
  const next = `after-${Date.now()}`
  await expect(composer).toBeVisible()
  await composer.fill(`Reply with exactly the word: ${next}`)
  await composer.press("Enter")
  await expect(answerTo(conversation, `Reply with exactly the word: ${next}`)).toContainText(next, { timeout: 60_000 })
})
