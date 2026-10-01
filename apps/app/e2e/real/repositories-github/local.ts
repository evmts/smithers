import type { Page, TestInfo } from "@playwright/test"
import {
  awaitBoot,
  closeComposer,
  command,
  expect
} from "../support/test"

export const bootRepositoryWorkbench = async (page: Page): Promise<void> => {
  const startedAt = performance.now()
  await page.goto("/smithersai/smithers", { waitUntil: "domcontentloaded" })
  await expect(page).toHaveURL(/\/smithersai\/smithers$/)
  await awaitBoot(page, "navigate", startedAt)
  await expect(page.getByRole("button", { name: "Chat", exact: true })).toBeVisible()
}

export const enableVerboseEvidence = async (page: Page): Promise<void> => {
  // The public scroller's message identity distinguishes the new receipt from
  // retained history without assuming the transcript grows or is unpaginated.
  const receipts = page.getByTestId("transcript").locator("[data-message-id]").filter({
    has: page.getByText(/^Verbose (?:on|off)/)
  })
  const toggle = async () => {
    const before = await receipts.count() === 0 ? null : await receipts.last().getAttribute("data-message-id")
    await command(page, "/verbose")
    await expect.poll(async () => await receipts.count() === 0 ? null : await receipts.last().getAttribute("data-message-id")).not.toBe(before)
    await expect(receipts.last()).toHaveAttribute("data-message-id", /.+/)
    return await receipts.last().innerText()
  }
  if ((await toggle()).startsWith("Verbose off")) await toggle()
  await expect(receipts.last()).toContainText("Verbose on")
}

export const expectFlowOutcome = async (
  page: Page,
  flow: string,
  args: string,
  outcome: "executed" | "failed"
): Promise<void> => {
  const invocation = `You ran /${flow}${args === "" ? "" : ` ${args}`}`
  await expect(page.locator(".tool-act-line").filter({ hasText: invocation }).last()).toContainText(`→ ${outcome}`)
}

export const attachJson = async (testInfo: TestInfo, name: string, value: unknown): Promise<void> => {
  await testInfo.attach(name, {
    body: Buffer.from(JSON.stringify(value, null, 2)),
    contentType: "application/json"
  })
}

export const dismissComposer = closeComposer
