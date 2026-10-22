import type { Page } from "@playwright/test"
import { step } from "./fixtures"
import { expect, test } from "./devices"
import { requires, scriptedAgent } from "./target"

// The agent asks with a form (docs/features/views.md#forms, decision 0004 §3), end to end: the real app, ChatApi and
// Postgres, with the agent's model the only scripted seam (`/app?agent=form`, src/test/scriptedAgent.ts), so it asks
// the same way every time. The agent calls `ui/form`; the form shows in the conversation on every device; the person
// fills it and presses its button; the submission is their next question, with the values; and the agent's next answer
// reads them. The form stays answered on every device and after a reload.

/** The latest form in the conversation on `page`. */
const latestForm = (page: Page) => page.locator('.conversation-view[data-template="form"]').last()

test("ask with a form: the agent asks with a form, the person submits it, and the agent goes on with the values", {
  annotation: {
    type: "summary",
    description: "The agent asks which repository with a form; the person fills and sends it; the agent answers with what they sent.",
  },
}, async ({ devices }) => {
  requires("scriptedAgent", "member", "ownConversation")
  test.setTimeout(240_000)
  const word = devices.word
  const [a, b] = await devices.open("A", "B")
  await a.page.goto(scriptedAgent("form"))
  await a.ready()

  const question = `Clone a repository for me, ${word}`
  await a.askAndWaitTaken(question)
  // The agent asks with a form, not in prose: it shows in the conversation on both devices.
  for (const tab of [a, b]) {
    await expect(latestForm(tab.page), `${tab.name}: the agent's form shows`).toContainText("Which repository?", {
      timeout: 60_000,
    })
  }
  await a.expectAnswered(question, "Which repository")

  const url = `https://github.com/octocat/${word}`
  await step("A: fill the form and send it", async () => {
    const form = latestForm(a.page)
    await form.getByLabel("Repository URL").fill(url)
    await form.getByRole("button", { name: "Clone" }).click()
  })
  // The submission is A's next question, and the agent's next answer goes on with what A sent.
  await expect(a.page.getByText(`Got it. I'll clone ${url}.`), "A: the agent answers with the URL").toBeVisible({
    timeout: 60_000,
  })
  await expect(b.page.getByText(`Got it. I'll clone ${url}.`), "B: the answer syncs").toBeVisible({ timeout: 30_000 })

  // The form is answered everywhere: the value shows, and there is nothing left to send.
  for (const tab of [a, b]) {
    const form = latestForm(tab.page)
    await expect(form.getByLabel("Repository URL"), `${tab.name}: the form shows what was sent`).toHaveValue(url, {
      timeout: 30_000,
    })
    await expect(form.getByLabel("Repository URL")).toBeDisabled()
    await expect(form.getByRole("button", { name: "Clone" }), `${tab.name}: no second send`).toHaveCount(0)
  }
  await a.reload()
  await expect(latestForm(a.page).getByLabel("Repository URL"), "A: still answered after a reload").toHaveValue(url, {
    timeout: 30_000,
  })
})
