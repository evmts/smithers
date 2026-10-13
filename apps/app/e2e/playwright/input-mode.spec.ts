import { controlTabKey, expect,test } from './browserTest'
import { installConversationFixture } from './conversationFixture'

test.use({ contextOptions: { reducedMotion: 'reduce' }, actionTimeout: 3_000, navigationTimeout: 10_000 })
test.setTimeout(30_000)

test('Chat Tab reaches Send and footer controls without trapping focus', async ({ page }) => {
  await installConversationFixture(page)
  await page.goto('/')
  const chat = page.getByRole('button', { name: 'Chat', exact: true })
  await chat.click()
  const input = page.getByTestId('composer-input')
  const queue = page.getByRole('button', { name: 'Queue', exact: true })
  const send = page.getByTestId('composer-send')
  const mode = page.getByRole('button', { name: 'Mode: Normal', exact: true })
  await input.fill('An earlier answer')
  await input.press('Enter')
  await expect(page.getByTestId('transcript')).toContainText('stub: An earlier answer')
  // An accepted prompt dismisses Chat (#3819); the walk continues in the reopened composer.
  await expect(input).toBeHidden()
  await chat.click()
  await input.fill('hello there')
  await page.keyboard.press(controlTabKey(page))
  await expect(queue).toBeFocused()
  await page.keyboard.press(controlTabKey(page))
  await expect(send).toBeFocused()
  await page.keyboard.press(controlTabKey(page))
  await expect(chat).toBeFocused()
  await page.keyboard.press(controlTabKey(page))
  await expect(mode).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menuitemradio', { name: 'Normal' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(mode).toBeFocused()
  await page.keyboard.press(controlTabKey(page, true))
  await expect(chat).toBeFocused()
  await page.keyboard.press(controlTabKey(page, true))
  await expect(send).toBeFocused()
  await page.keyboard.press(controlTabKey(page, true))
  await expect(queue).toBeFocused()
  await page.keyboard.press(controlTabKey(page, true))
  await expect(input).toBeFocused()
  await page.keyboard.press(controlTabKey(page, true))
  const copy = page.locator('.smithers-transcript').getByRole('button', { name: 'Copy message' }).last()
  // The activity rail and toast stack also participate in document order.
  for (let step = 0; step < 20 && !await copy.evaluate(node => node === document.activeElement); step++) {
    await page.keyboard.press(controlTabKey(page, true))
  }
  await expect(copy).toBeFocused()
})

for (const speechSupported of [false, true]) test(`only Normal and Vim are offered when speech recognition is ${speechSupported ? 'available' : 'unavailable'}`, async ({ page }) => {
  await page.addInitScript(supported => {
    const host = window as any
    delete host.SpeechRecognition
    delete host.webkitSpeechRecognition
    host.speechStarts = 0
    if (supported) host.SpeechRecognition = class { start() { host.speechStarts++ } }
  }, speechSupported)
  await page.goto('/')
  const mode = page.getByRole('button', { name: 'Mode: Normal', exact: true })
  await mode.click()
  await expect(page.getByRole('menuitemradio')).toHaveText(['Normal', 'Vim'])
  await expect(page.getByRole('menuitemradio', { name: 'Dictation', exact: true })).toHaveCount(0)
  await page.keyboard.press('End')
  await expect(page.getByRole('menuitemradio', { name: 'Vim', exact: true })).toBeFocused()
  await page.keyboard.press('Home')
  await expect(page.getByRole('menuitemradio', { name: 'Normal', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Meta+k')
  const input = page.getByTestId('composer-input')
  await expect(input).toBeFocused()
  await input.fill('keep my typed draft')
  await input.press('Escape')
  await expect(input).toBeHidden()
  await page.keyboard.press('Meta+k')
  await expect(input).toHaveValue('keep my typed draft')
  expect(await page.evaluate(() => (window as any).speechStarts)).toBe(0)
})

test('Vim roves into Chat in normal mode, inserts explicitly, and leaves on j or a second Escape', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Mode: Normal', exact: true }).click()
  await page.getByRole('menuitemradio', { name: 'Vim', exact: true }).click()
  await page.keyboard.press('Meta+k')
  const input = page.getByTestId('composer-input')
  const queue = page.getByRole('button', { name: 'Queue', exact: true })
  await input.fill('draft')
  await input.press(controlTabKey(page))
  await expect(queue).toBeFocused()
  await page.keyboard.press('k')
  await expect(input).toBeFocused()
  await expect(input).toHaveAttribute('data-vim-mode', 'normal')
  await page.keyboard.press('j')
  await expect(queue).toBeFocused()
  await expect(input).toHaveValue('draft')
  await page.keyboard.press('h')
  await page.keyboard.press('i')
  await expect(input).toHaveAttribute('data-vim-mode', 'insert')
  await input.press('End')
  await page.keyboard.type(' hjkl')
  await expect(input).toHaveValue('draft hjkl')
  await page.keyboard.press('Escape')
  await expect(input).toBeFocused()
  await expect(input).toHaveAttribute('data-vim-mode', 'normal')
  await page.keyboard.press('Enter')
  await expect(input).toHaveAttribute('data-vim-mode', 'insert')
  await expect(input).toHaveValue('draft hjkl')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(input).not.toBeFocused()
  await expect(page.getByTestId('composer-overlay')).toBeVisible()
  await page.keyboard.press('j')
  await expect(input).toBeFocused()
  await expect(input).toHaveAttribute('data-vim-mode', 'normal')
})

test('selecting Vim enables keyboard navigation while SQLite commit is held', async ({ page }) => {
  await page.addInitScript(() => {
    const nativePost = Worker.prototype.postMessage
    const held: Array<() => void> = []
    const probe = { armed: false, commits: 0, release: () => {
      probe.armed = false
      for (const send of held.splice(0)) send()
    } }
    ;(window as any).modeCommitProbe = probe
    Worker.prototype.postMessage = function(message: unknown, options?: StructuredSerializeOptions | Transferable[]) {
      const send = () => Reflect.apply(nativePost, this, [message, options])
      if (probe.armed && typeof message === 'object' && message !== null && 'sql' in message &&
        typeof message.sql === 'string' && /^\s*COMMIT\b/i.test(message.sql)) {
        probe.commits++
        held.push(send)
      } else send()
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Mode: Normal', exact: true }).click()
  await page.evaluate(() => { (window as any).modeCommitProbe.armed = true })
  try {
    await page.getByRole('menuitemradio', { name: 'Vim', exact: true }).click()
    await expect.poll(() => page.evaluate(() => (window as any).modeCommitProbe.commits)).toBeGreaterThan(0)
    await page.keyboard.press('Meta+k')
    const input = page.getByTestId('composer-input')
    const queue = page.getByRole('button', { name: 'Queue', exact: true })
    await input.fill('draft while saving')
    await input.press(controlTabKey(page))
    await expect(queue).toBeFocused()
    await page.keyboard.press('k')
    await expect(input).toBeFocused()
    await expect(input).toHaveAttribute('data-vim-mode', 'normal')
    await expect(page.getByRole('button', { name: 'Mode: Vim', exact: true })).toBeVisible()
    await page.keyboard.press('j')
    await expect(queue).toBeFocused()
    await expect(input).toHaveValue('draft while saving')
  } finally {
    await page.evaluate(() => (window as any).modeCommitProbe.release())
  }
})
