import { expect, type Page } from "@playwright/test"

/** Open the visible Chat or repository Ask surface through its user door. */
export const openComposer = async (page: Page): Promise<void> => {
  const input = page.getByTestId("composer-input")
  const chat = page.getByRole("button", { name: "Chat", exact: true })
  const ask = page.getByRole("button", { name: "Ask", exact: true })
  // A reload may still be restoring the app before either control mounts.
  await expect.poll(async () => await input.isVisible() || await chat.isVisible() || await ask.isVisible() || await page.getByTestId("login").isVisible(), { timeout: 30_000 }).toBe(true)
  if (!await input.isVisible()) {
    if (await chat.isVisible()) await chat.click()
    else if (await ask.isVisible()) await ask.click()
    else await page.keyboard.press("ControlOrMeta+k")
  }
  await expect(input).toBeVisible()
  await expect(input).toBeEditable()
}

export const fillComposer = async (page: Page, text: string): Promise<void> => {
  await openComposer(page)
  await page.getByTestId("composer-input").fill(text)
}

/** Send one composer line and wait for the composer to clear. */
export const say = async (page: Page, text: string): Promise<void> => {
  await fillComposer(page, text)
  await page.getByTestId("composer-input").press("Enter")
  await expect(page.getByTestId("composer-input")).toHaveValue("")
}
