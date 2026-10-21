import type { Page } from "@playwright/test"
import { expect, type Tab, test } from "./devices"

// Agent status, end to end (decision 0015, docs/features/agent-status.md): the agent asks the person with
// `app/agent/ask`, and the question shows in the conversation, the header, a toast and the tab's title, on every device
// the person has open; the person answers, and the agent's durable run in the asking browser goes on. The first test
// scripts the agent's model in the asking browser's engine worker (`/app?agent=needs-you`, src/test/scriptedAgent.ts),
// so it runs the same every time; the second asks the real model. Everything else is real: the engine, ChatApi, the runs
// routes, Postgres and Electric.

const PROMPT = "Which branch should I deploy?"

/** How many questions need the person, by the tab's title: `(N) Smithers`, or 0. */
const titleCount = async (page: Page) => Number((await page.title()).match(/^\((\d+)\) /)?.[1] ?? 0)

/** The surfaces that show this answer's question on `tab`. */
const surfaces = (tab: Tab, answerId: string) => ({
  card: tab.page.locator(`[data-slot="needs-you"][data-run="${answerId}"]`),
  toast: tab.page.getByRole("region", { name: "Smithers" }).locator(`[data-slot="toast"][data-run="${answerId}"]`),
  header: tab.page.getByRole("status", { name: "Smithers" }).getByRole("button", { name: /^Smithers needs you/ }),
})

test("needs you: the agent asks, every surface on every device shows it, and an answer from another device resumes the run", async ({ devices }) => {
  test.setTimeout(300_000)
  const word = devices.word
  const [a, b] = await devices.open("A", "B")
  // A's engine worker answers with the scripted agent.
  await a.page.goto("/app?agent=needs-you")
  await a.ready()
  const question = `Deploy the docs preview, ${word}`
  await a.askAndWaitTaken(question)
  const answerId = a.asked.find((asked) => asked.text === question)!.answerId

  for (const tab of [a, b]) {
    const { card, toast, header } = surfaces(tab, answerId)
    await expect(card, `${tab.name}: the question shows in the conversation`).toBeVisible({ timeout: 60_000 })
    await expect(card).toHaveAttribute("role", "group")
    await expect(card).toHaveAccessibleName(PROMPT)
    await expect(card.getByRole("button", { name: "docs-v2" })).toBeVisible()
    await expect(header, `${tab.name}: the header says the agent needs you`).toBeVisible()
    // The toast is the feed's, its own shape (docs/features/notifications.md): under the dev server's HTTP/1.1, a
    // device's live shapes share six connections, so it can arrive a long poll after the card.
    await expect(toast, `${tab.name}: a toast says so, with Answer`).toContainText(`Needs you · ${PROMPT}`, { timeout: 60_000 })
    // Nothing covers it, the open composer included: a trial click finds the button takes the pointer.
    await toast.getByRole("button", { name: "Answer" }).click({ trial: true })
    // Questions an earlier run left open count too.
    await expect.poll(() => titleCount(tab.page), { message: `${tab.name}: the title counts it` }).toBeGreaterThan(0)
  }
  const open = { A: await titleCount(a.page), B: await titleCount(b.page) }

  // On B, the toast's Answer brings the question's field into focus; B answers there.
  await surfaces(b, answerId).toast.getByRole("button", { name: "Answer" }).click()
  const field = surfaces(b, answerId).card.getByRole("textbox", { name: "Your answer" })
  await expect(field).toBeFocused()
  await field.fill("docs-v2")
  await field.press("Enter")

  // A's engine holds the run: it gets the answer through sync, and its agent goes on.
  for (const tab of [a, b]) {
    const { card, toast, header } = surfaces(tab, answerId)
    await tab.expectAnswered(question, "Deploying docs-v2.", 120_000)
    await expect(card, `${tab.name}: the question shows what was answered`).toHaveAttribute("data-state", "answered")
    await expect(card).toContainText("docs-v2")
    await expect(toast).toHaveCount(0, { timeout: 60_000 })
    // Questions an earlier run left open may close meanwhile too, so the count only has to drop.
    await expect.poll(() => titleCount(tab.page), { message: `${tab.name}: the title stops counting it` })
      .toBeLessThan(open[tab.name as "A" | "B"])
    if ((await titleCount(tab.page)) === 0) await expect(header).toHaveCount(0)
  }
})

test("needs you, live: the real model asks with app/agent/ask, and the person's answer reaches it", async ({ devices }) => {
  test.setTimeout(420_000)
  const word = devices.word
  const [a] = await devices.open("A")
  const question =
    `Use app/agent/ask to ask me which colour I want, as a question. Then reply with the colour I chose and the word ${word}.`
  await a.askAndWaitTaken(question)
  const answerId = a.asked.find((asked) => asked.text === question)!.answerId
  const { card } = surfaces(a, answerId)
  // The model endpoint takes up to a minute on a loaded machine.
  await expect(card, "the live agent asked").toBeVisible({ timeout: 180_000 })
  const field = card.getByRole("textbox", { name: "Your answer" })
  await field.fill("teal")
  await field.press("Enter")
  await a.expectAnswered(question, word, 180_000)
  await expect(a.answerTo(question)).toContainText(/teal/i)
})
