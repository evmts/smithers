import type { Page } from "@playwright/test"

/** Opens the composer once either control has mounted, including during branch navigation. */
export const openComposer = async (page: Page) => {
  const composer = page.getByRole("textbox", { name: "Message Smithers", exact: true })
  const chat = page.getByRole("button", { name: /^Chat\b/ })
  await composer.or(chat).filter({ visible: true }).first().waitFor({ state: "visible", timeout: 30_000 })
  if (await chat.isVisible()) await chat.click()
  return composer
}
