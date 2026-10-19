import { expect, type Page } from "@playwright/test"

/** Open the composer through the repository Ask button, launcher Chat button, or signed-out keyboard door. */
export const fillComposer = async (page: Page, text: string): Promise<void> => {
  const input = page.getByTestId("composer-input")
  const chat = page.getByRole("button", { name: "Chat", exact: true })
  const ask = page.getByRole("button", { name: "Ask", exact: true })
  // Repository admission can briefly show the launcher composer before Ask mounts.
  // Wait for the route’s actual entry control so a send cannot race that transition.
  if (/^\/[^/]+\/[^/]+\/?$/.test(new URL(page.url()).pathname)) {
    await expect(ask).toBeVisible({ timeout: 30_000 })
  }
  // A reload may still be restoring the app before either control mounts.
  await expect.poll(async () => await input.isVisible() || await ask.isVisible() || await chat.isVisible() || await page.getByTestId("login").isVisible(), { timeout: 30_000 }).toBe(true)
  if (!await input.isVisible()) {
    if (await ask.isVisible()) await ask.click()
    else if (await chat.isVisible()) await chat.click()
    else await page.keyboard.press("ControlOrMeta+k")
  }
  await expect(input).toBeVisible()
  await input.fill(text)
}

/** Send one composer line and wait for the composer to clear. */
export const say = async (page: Page, text: string): Promise<void> => {
  await fillComposer(page, text)
  await page.getByTestId("composer-input").press("Enter")
  await expect(page.getByTestId("composer-input")).toHaveValue("")
}
