import { controlTabKey, expect, test } from "./browserTest"

test('a missing Command shortcut keyup opens Chat and leaves later mouse controls usable (#3810)', async ({ page }) => {
  await page.goto('/smithersai/smithers/')
  const chat = page.getByRole('button', { name: 'Chat', exact: true })
  const input = page.getByTestId('composer-input')
  await expect(chat).toBeVisible()
  await page.keyboard.down('Meta')
  await page.keyboard.down('k')
  await expect(input).toBeHidden()
  // Reproduce the native macOS trace: the browser never receives KeyK up.
  await page.keyboard.up('Meta')
  await expect(input).toBeVisible()
  await expect(input).toBeFocused()
  await page.keyboard.up('k')
  await expect(input).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(input).toBeHidden()
  await chat.click()
  await expect(input).toBeVisible()
  await expect(input).toBeFocused()
})

for (const path of ["/smithersai/smithers/", "/smithersai/smithers/?tutorial"]) {
  test(`arrow navigation keeps the palette selection visible and Tab leaves the input: ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 })
    await page.goto(path)
    await expect(page.getByRole("button", { name: "Chat", exact: true })).toBeVisible()
    await page.keyboard.press("Meta+k")
    const input = page.getByTestId("composer-input")
    await input.fill("/")
    const palette = page.getByTestId("palette")
    await expect(palette.locator('[role="option"]').nth(10)).toBeAttached()
    for (const key of [...Array(12).fill("ArrowDown"), "ArrowUp"]) {
      await input.press(key)
      await expect(palette.locator('[aria-selected="true"]')).toBeInViewport({ ratio: 1 })
      await expect(input).toBeFocused()
    }
    await input.press(controlTabKey(page))
    await expect(page.getByRole("button", { name: "Queue", exact: true })).toBeFocused()
    await page.keyboard.press(controlTabKey(page))
    await expect(page.getByTestId("composer-send")).toBeFocused()
    await page.keyboard.press(controlTabKey(page, true))
    await page.keyboard.press(controlTabKey(page, true))
    await expect(input).toBeFocused()
  })
}
