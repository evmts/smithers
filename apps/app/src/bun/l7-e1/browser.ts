// Run with Bun; actual browser, no network interception or preseeded app state.
import { chromium, expect } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
const root = '/tmp/ops-l7-e1-evidence'
const { origin } = JSON.parse(await readFile(`${root}/host.json`, 'utf8'))
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext()
context.setDefaultTimeout(30000)
await context.addInitScript('globalThis.__name = (value) => value')
const page = await context.newPage()
const requests: unknown[] = [], errors: unknown[] = []
page.on('response', r => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/')) requests.push({ method: r.request().method(), url: r.url(), status: r.status(), ...(r.url().includes('/workflow/rpc') ? { body: r.request().postDataJSON() } : {}) }) })
page.on('request', r => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/') && !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) errors.push({ nonLoopback: r.url() }) })
page.on('console', message => { if (message.type() === 'error') errors.push({ console: message.text() }) })
page.on('websocket', socket => { if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(socket.url()).hostname)) errors.push({ nonLoopbackSocket: socket.url() }) })
page.on('pageerror', e => errors.push({ pageerror: String(e) }))
const send = async (text: string) => {
  const input = page.getByTestId('composer-input')
  if (!await input.isVisible()) await page.keyboard.press('Control+k')
  await expect(input).toBeVisible({ timeout: 30000 }); await input.fill(text); await expect(input).toHaveValue(text); console.log('filled', await input.inputValue()); await input.press('Enter'); console.log('sent', text)
}
try {
  await page.goto(`${origin}/local/spike`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 60000 })
  await send('/runs.list ' + JSON.stringify({ repo: 'local/spike' }))
  await expect(page.getByTestId('runs-inbox-needs-you')).toContainText('ops-l7-e1', { timeout: 30000 })
  const runId = (await page.getByTestId('runs-inbox-needs-you').locator('[data-testid^=runs-answer-]').first().getAttribute('data-testid'))!.replace('runs-answer-', '')
  await send('/runs ' + JSON.stringify({ operation: 'approval-list', repo: 'local/spike' }))
  await expect(page.getByTestId('approval-answer-text')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('[data-kind="approvals-inbox"]')).toContainText('Which gateway answered?')
  await page.screenshot({ path: `${root}/parked.png` })
  await page.getByTestId('approval-answer-text').fill('{"choice":"loopback"}')
  await page.getByTestId('approval-answer-send').click()
  await expect(page.getByTestId('approvals-inbox-count')).toHaveText('0 approvals pending', { timeout: 30000 })
  await expect.poll(async () => {
    await page.locator('[data-kind="run-list"]').first().getByRole('button', { name: 'Refresh', exact: true }).click()
    return await page.getByTestId('runs-inbox-done').getByTestId(`runs-open-${runId}`).count()
  }, { timeout: 30000 }).toBe(1)
  await page.screenshot({ path: `${root}/completed.png` })
  await writeFile(`${root}/e1a.json`, JSON.stringify({ status: 'PASS', origin, runId, extraFakes: [] }, null, 2))
} catch (e) {
  await writeFile(`${root}/e1a.json`, JSON.stringify({ status: 'INCOMPLETE', error: String(e), text: await page.locator('body').innerText() }, null, 2))
  await page.screenshot({ path: `${root}/failure.png` }); throw e
} finally {
  await writeFile(`${root}/requests.json`, JSON.stringify(requests, null, 2))
  await writeFile(`${root}/api-problems.json`, JSON.stringify([...errors, ...requests.filter((r: any) => r.status < 200 || r.status >= 300)], null, 2))
  await browser.close()
}
