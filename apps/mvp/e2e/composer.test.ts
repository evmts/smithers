import { chromium, type Browser, type Page } from "@playwright/test"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { openComposer } from "./composer"

// Browser fixtures for the test helper's two controls. No server or app is replaced:
// these tests exercise Playwright's actual visibility and auto-waiting behavior.
let browser: Browser
let page: Page
let controlWait: (() => void) | undefined
beforeAll(async () => { browser = await chromium.launch() })
beforeEach(async () => {
  page = await browser.newPage({
    logger: {
      isEnabled: (name) => name === "api",
      log: (_name, _severity, message) => {
        if (message === "=> locator.waitFor started" || message === "=> locator.click started") controlWait?.()
      },
    },
  })
  page.setDefaultTimeout(1_000)
})
afterEach(async () => { controlWait = undefined; await page.close() })
afterAll(async () => { await browser.close() })

const input = '<textarea aria-label="Message Smithers"></textarea>'
// Mount only after the real helper starts waiting. The original helper reaches click
// after seeing no input; the fixed one reaches waitFor. Neither fixture uses a sleep.
const mountWhileWaiting = async (html: string) => {
  const waiting = new Promise<void>((resolve) => { controlWait = resolve })
  const opening = openComposer(page)
  await waiting
  controlWait = undefined
  await page.evaluate((html) => { document.body.innerHTML = html }, html)
  return opening
}

const closed = `<button onclick='document.body.innerHTML = ${JSON.stringify(input)}'>Chat ⌘K</button>`

test("waits for an open composer that mounts after the helper starts, without a Chat button", async () => {
  const composer = await mountWhileWaiting(input)
  await composer.fill("/navigate /octocat/Spoon-Knife/tree/test-branch")
  expect(await composer.inputValue()).toContain("/tree/test-branch")
})

test("waits for the closed layout, opens Chat, and returns the input", async () => {
  const composer = await mountWhileWaiting(closed)
  await composer.fill("/web https://example.com/")
  expect(await composer.inputValue()).toBe("/web https://example.com/")
})

test("keeps an already open composer and ignores a hidden Chat button", async () => {
  await page.setContent(`<button hidden>Chat ⌘K</button>${input}`)
  const composer = await openComposer(page)
  await composer.fill("kept")
  expect(await composer.inputValue()).toBe("kept")
})
