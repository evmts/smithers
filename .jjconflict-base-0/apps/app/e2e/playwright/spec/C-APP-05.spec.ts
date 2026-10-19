import { expect, test, type Page } from "../browserTest"
import { installCloudFixture } from "../cloudFixture"
import { say } from "./j1-fixtures"

// Browser projection; the packaged-host version runs in TestBranchConversationTabClose.
test("C-APP-05: a host turn replays after its author closes the tab", async ({ page }) => {
  await installCloudFixture(page, { capabilities: ["install", "identity", "agent"] })
  const entries: unknown[] = []
  /*
   * The host admits one turn per idempotency key (chat/prompt.go). A tab that
   * closes before its "accepted" write lands leaves the prompt "requested", and
   * the returning tab re-sends it under the same key; that resend is the
   * designed recovery, so the stub answers it as the host does, with the turn
   * the key already admitted.
   */
  const keys = new Set<string>()
  const context = page.context()
  const mountConversation = async (target: Page) => {
  await target.route("**/api/conversations/main", route => route.fulfill({ json: { id: "main", entries } }))
  await target.route("**/api/conversations/main/view-state", route => route.fulfill({ json: { queue: [] } }))
  await target.route("**/api/conversations/main/prompt", route => {
    const { idempotencyKey } = route.request().postDataJSON() as { readonly idempotencyKey: string }
    if (!keys.has(idempotencyKey)) {
      keys.add(idempotencyKey)
      entries.push({ id: "held", author: 1, authorLogin: "scoped-user", runId: "held-run", prompt: "Summarize the repository", state: "running", frames: [] })
    }
    return route.fulfill({ status: 202, json: { turnId: "held", terminal: false } })
  })
  }
  await mountConversation(page)
  await page.goto("/")
  await say(page, "Summarize the repository")
  await expect(page.locator('[data-shared-turn="held"]')).toBeVisible()
  await page.close()
  entries[0] = { id: "held", author: 1, authorLogin: "scoped-user", runId: "held-run", prompt: "Summarize the repository", state: "completed", frames: [{ runId: "held-run", type: "delta", kind: "text", text: "Repository summary." }, { runId: "held-run", type: "done", reason: "stop" }] }
  const returned = await context.newPage()
  await installCloudFixture(returned, { capabilities: ["install", "identity", "agent"] })
  await mountConversation(returned)
  await returned.goto("/")
  await expect(returned.getByTestId("transcript").getByText("Repository summary.", { exact: true })).toBeVisible()
  // One prompt, one admission: the returning tab never mints a second key.
  expect(keys.size).toBe(1)
  expect(entries).toHaveLength(1)
})
