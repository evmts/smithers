import { answerTo, expect, test } from "./fixtures"

// Two separate browsers, each with its own local database, sync through the Worker's Durable Object.
test("a message and Smithers' answer sent in one browser appear in another", async ({ browser }, testInfo) => {
  const word = `sync-${Date.now()}`
  // Contexts made by hand don't inherit the config's video setting; record both for the feature's GIF.
  const recordVideo = { dir: testInfo.outputPath("videos") }
  const [alice, bob] = await Promise.all([browser.newContext({ recordVideo }), browser.newContext({ recordVideo })])
  const [alicePage, bobPage] = await Promise.all([alice.newPage(), bob.newPage()])
  await Promise.all([alicePage.goto("/app"), bobPage.goto("/app")])
  for (const page of [alicePage, bobPage]) await expect(page.getByRole("button", { name: /Chat/ })).toBeVisible({ timeout: 30_000 })

  await alicePage.keyboard.press("ControlOrMeta+k")
  const composer = alicePage.getByRole("textbox", { name: "Message Smithers" })
  await composer.fill(`Reply with exactly the word: ${word}`)
  await composer.press("Enter")

  const bobConversation = bobPage.getByRole("region", { name: "Conversation", exact: true })
  await expect(bobConversation.getByText(`Reply with exactly the word: ${word}`)).toBeVisible({ timeout: 15_000 })
  await expect(answerTo(bobConversation, `Reply with exactly the word: ${word}`)).toContainText(word, { timeout: 60_000 })

  await Promise.all([alice.close(), bob.close()])
})
