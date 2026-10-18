import { test as base, expect, type Locator, type TestInfo } from "@playwright/test"
import { writeFile } from "node:fs/promises"
import { basename } from "node:path"

// The status copy (docs/decisions/0002-local-first.md §2) and how many messages show before Load earlier: chat's
// contract, which the app and these tests share.
export { COULDNT_ANSWER, NOT_SENT, OFFLINE, PAGE_SIZE, QUEUED, SYNC_FAILED } from "../src/features/chat/contract"

/**
 * The no-spinner observer (0002 §7), an init script: it records every loading marker the page ever shows, `aria-busy`
 * true or a progress bar, on `window.__busy`. The only animation the app may show is a streaming answer's dots,
 * inside `[data-answer=streaming]`. The app has no Suspense boundary, so no fallback can show.
 */
export const watchForSpinners = () => {
  const seen: Array<string> = []
  Object.assign(window, { __busy: seen })
  const busy = '[aria-busy="true"], [role="progressbar"]'
  const check = (root: ParentNode) => {
    for (const element of root.querySelectorAll(busy)) {
      if (element.closest("[data-answer=streaming]")) continue
      seen.push(element.outerHTML.slice(0, 160))
    }
  }
  addEventListener("DOMContentLoaded", () => {
    check(document)
    new MutationObserver(() => check(document)).observe(document, { subtree: true, childList: true, attributes: true })
  })
}

/** What the observer saw on `page`: empty when it never showed a loading state. */
export const spinnersSeen = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as { __busy?: Array<string> }).__busy ?? []).catch(() => [])

// A flow's name, for its GIF: the spec file and the test title up to its colon, e.g. `chat-reload-mid-answer`.
export const flowName = (testInfo: TestInfo) => {
  const file = basename(testInfo.file).replace(/\.spec\.ts$/, "")
  const title = testInfo.title.split(":")[0]!
  return `${file}-${title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
}

const writeLog = async (path: string, log: Array<string>) => {
  await writeFile(path, log.join("\n"))
  return path
}

// Every test keeps the browser's console and page errors; a failing test saves them as browser.log. Every test also
// writes flow.json beside its video, so e2e/gifs.mjs makes one GIF per flow.
export const test = base.extend<{ browserLog: Array<string> }>({
  browserLog: [
    async ({ page }, use, testInfo) => {
      await page.addInitScript(watchForSpinners)
      const log: Array<string> = []
      page.on("console", (message) => log.push(`${message.type()}: ${message.text()}`))
      page.on("pageerror", (error) => log.push(`pageerror: ${error.message}`))
      await use(log)
      if (!page.isClosed()) expect(await spinnersSeen(page), "the page never showed a loading state").toEqual([])
      if (testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach("browser-log", { path: await writeLog(testInfo.outputPath("browser.log"), log), contentType: "text/plain" })
      }
      // Playwright saves the page's video as video.webm beside it once the test ends.
      await writeFile(
        testInfo.outputPath("flow.json"),
        JSON.stringify({ flow: flowName(testInfo), title: testInfo.title, status: testInfo.status, videos: [{ name: "", video: "video.webm", openedAt: 0 }] }, null, 2),
      )
    },
    { auto: true },
  ],
})

export { expect }

// The answer bubble right after the first message that contains `question`.
export const answerTo = (conversation: Locator, question: string) =>
  conversation.locator(".sui-chat-message", { hasText: question }).first().locator("xpath=following-sibling::*[1]")
