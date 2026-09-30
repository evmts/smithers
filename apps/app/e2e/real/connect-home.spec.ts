import { scenario } from "./coverage/types"
import { awaitBoot, closeComposer, command, expect, openApp, openComposer, reloadApp, test } from "./support/test"

test("Connect opens one embedded card and survives reload and keyboard writer transfer", scenario("connect.embedded-reload-readback", {
  capabilities: [],
  description: "Open the actual Connect door with a keyboard-submitted slash command, verify its repository action, repeat the command without duplicating the card, then read the same durable card after reload and keyboard transfer of the browser writer to a second page and back. No repository import or OAuth action is launched.",
  coverage: ["action:connect", "host:local", "host:production", "path:success", "path:persistence", "path:keyboard", "door:slash", "dimension:reload", "dimension:keyboard", "dimension:duplicate-input", "dimension:shared-browser-context", "dimension:writer-transfer", "evidence:persisted-connect-card-readback"]
}), async ({ page, context }, testInfo) => {
  const startedAt = performance.now()
  await openApp(page)
  await awaitBoot(page, "navigate", startedAt)
  const launches: string[] = []
  page.on("request", request => {
    if (request.method() === "POST" && /\/api\/(?:workflow|repos|auth)\//.test(new URL(request.url()).pathname)) launches.push(new URL(request.url()).pathname)
  })
  await command(page, "/connect")
  await closeComposer(page)
  const card = page.getByTestId("card-connect-embedded")
  await expect(card).toHaveCount(1)
  await expect(card).toBeVisible()
  await expect(card).toHaveAccessibleName("Connect work to Smithers")
  await expect(card.getByText("Smithers Cloud repository", { exact: true })).toBeVisible()
  const importButton = card.locator('button[data-flow="repos.import"]')
  await expect(importButton).toHaveText("Import")
  await importButton.focus()
  await expect(importButton).toBeFocused()
  await expect(page.locator('[data-keyboard-pane="Connectors"]')).toHaveCount(0)
  const before = await card.innerText()

  await command(page, "/connect")
  await closeComposer(page)
  await expect(card).toHaveCount(1)
  await expect(card).toHaveText(before, { useInnerText: true })
  await reloadApp(page)
  await expect(card).toHaveCount(1)
  await expect(card).toHaveText(before, { useInnerText: true })
  await openComposer(page)
  await expect(page.getByTestId("composer-input")).toBeEditable()
  await closeComposer(page)

  expect(launches).toEqual([])
  const reopened = await context.newPage()
  try {
    const reopenedAt = performance.now()
    await openApp(reopened)
    await expect(reopened.getByRole("heading", { name: "Smithers is open in another tab", exact: true })).toBeVisible()
    const takeWriter = reopened.getByRole("button", { name: "Use Smithers here", exact: true })
    await takeWriter.focus()
    await expect(takeWriter).toBeFocused()
    await takeWriter.press("Enter")
    await awaitBoot(reopened, "navigate", reopenedAt)
    await expect(page.getByRole("heading", { name: "Smithers moved to another tab", exact: true })).toBeVisible()
    await expect(reopened.getByTestId("card-connect-embedded")).toHaveCount(1)
    await expect(reopened.getByTestId("card-connect-embedded")).toHaveText(before, { useInnerText: true })
    await expect(reopened.locator('[data-keyboard-pane="Connectors"]')).toHaveCount(0)
    expect(launches).toEqual([])
    await testInfo.attach("connect-reload-readback", { contentType: "application/json", body: Buffer.from(JSON.stringify({ cardId: "connect-embedded", initial: before, reopened: await reopened.getByTestId("card-connect-embedded").innerText(), launches })) })
    await page.getByRole("button", { name: "Use Smithers here", exact: true }).press("Enter")
    await expect(card).toHaveText(before, { useInnerText: true })
    await expect(reopened.getByRole("heading", { name: "Smithers moved to another tab", exact: true })).toBeVisible()
  } finally {
    await reopened.close()
  }
})
