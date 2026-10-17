import { installConversationFixture } from "./conversationFixture"
import { SCOPED_TEST_USER } from "./identity"
import { expect, test, type Page } from "./browserTest"

/*
 * Chat archive and history (Will, 2026-10-13, #3827) in a real browser, by
 * keyboard: an alias is listed only once it is typed and names its command,
 * `/clear` archives the chat on screen, and `/history` shows archived chats as
 * a tree of repository, branch, chat.
 */
const archive = {
  id: "a1", repository: "smithersai/smithers", branch: "main", title: "say ok", summary: "You asked for an ok. Smithers answered with one.",
  runs: [], entries: 1, first_at: Date.UTC(2026, 9, 13, 11), last_at: Date.UTC(2026, 9, 13, 11, 5), archived_at: Date.UTC(2026, 9, 13, 12), archived_by: SCOPED_TEST_USER.login
}

const SHOTS = process.env.ARCHIVE_SHOTS

const summon = async (page: Page) => {
  const input = page.getByTestId("composer-input")
  if (!(await input.isVisible())) {
    await page.getByRole("button", { name: "Chat", exact: true }).focus()
    await page.keyboard.press("Meta+k")
  }
  await expect(input).toBeVisible()
  return input
}

test("an alias is listed only once typed, /clear archives the chat, and /history shows it in the tree", async ({ page }) => {
  await installConversationFixture(page)
  const archives: Array<typeof archive> = []
  const posted: unknown[] = []
  await page.route("**/api/conversation-archives", route => route.fulfill({ json: { archives } }))
  await page.route("**/api/conversation-archives/a1", route => route.fulfill({ json: { archive, conversation: { id: "archive-a1", entries: [{
    id: "turn-1", author: 1, authorLogin: SCOPED_TEST_USER.login, runId: "turn-1", prompt: "say ok", state: "completed",
    frames: [{ runId: "turn-1", type: "delta", kind: "text", text: "stub: say ok" }, { runId: "turn-1", type: "done", reason: "stop" }]
  }] } } }))
  await page.route("**/api/conversations/main/archive", async route => {
    posted.push(route.request().postDataJSON())
    archives.unshift(archive)
    // The host moved the turns: the branch's conversation is empty from here on.
    await page.route("**/api/conversations/main", next => next.fulfill({ json: { id: "main", entries: [] } }))
    await route.fulfill({ json: { archive } })
  })
  await page.goto("/")

  let input = await summon(page)
  await input.fill("say ok")
  await page.getByTestId("composer-send").click()
  const answer = page.locator(".smithers-chat-message[data-role=\"assistant\"]", { hasText: "stub: say ok" })
  await expect(answer).toBeVisible()

  // A bare slash lists the command and neither alias.
  input = await summon(page)
  await input.fill("/")
  const palette = page.getByTestId("palette")
  await expect(palette.locator('[data-flow="archive"]')).toHaveCount(1)
  await expect(palette.locator('[data-flow="archive"] .slash-menu-name')).toHaveText("/archive")
  await expect(palette.locator('[data-flow="history"] .slash-menu-name')).toHaveText("/history")
  await expect(palette.locator("[data-alias]")).toHaveCount(0)
  // Typing the alias brings its row, naming the command it runs.
  await input.fill("/cl")
  await expect(palette.locator('[data-alias="clear"] .slash-menu-name')).toHaveText("/clear (archive)")
  await expect(palette.locator("[data-alias]")).toHaveCount(1)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/alias-menu.png` })
  await input.fill("/n")
  await expect(palette.locator('[data-alias="new"] .slash-menu-name')).toHaveText("/new (archive)")
  await input.fill("/clear")
  await expect(palette.locator('[data-alias="clear"]')).toHaveAttribute("aria-selected", "true")
  await input.press("Enter")

  // The chat moved into history: one request, and the transcript no longer holds the turn.
  await expect.poll(() => posted.length).toBe(1)
  await expect(answer).toHaveCount(0)
  expect(Object.keys(posted[0] as object).sort()).toEqual(["branch", "repository"])

  input = await summon(page)
  await input.fill("/history")
  await input.press("Enter")
  const card = page.getByRole("article", { name: "History" })
  await expect(card).toBeVisible()
  await expect(card.locator(".tree-name")).toHaveText(["smithersai/smithers", "main", "say ok"])
  // The tree is operable without a pointer: a group closes and opens, and a chat opens its summary and entries.
  const repository = card.locator('[data-history="repository"] > button')
  await repository.focus()
  await page.keyboard.press("Enter")
  await expect(repository).toHaveAttribute("aria-expanded", "false")
  await expect(card.locator(".tree-name")).toHaveText(["smithersai/smithers"])
  await page.keyboard.press("Enter")
  const chat = card.locator('[data-archive="a1"] > button')
  await chat.focus()
  await page.keyboard.press("Enter")
  await expect(chat).toHaveAttribute("aria-expanded", "true")
  await expect(card.locator(".history-summary")).toHaveText("You asked for an ok. Smithers answered with one.")
  await expect(card.locator('[data-archived-turn="turn-1"]')).toContainText("stub: say ok")
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/history-card.png` })
  // Archived entries carry no control.
  await expect(card.locator('[data-archived-entries] button')).toHaveCount(0)
  await chat.focus()
  await page.keyboard.press("Enter")
  await expect(card.locator(".history-chat")).toHaveCount(0)
})
