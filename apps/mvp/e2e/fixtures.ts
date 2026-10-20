import { test as base, type Locator, type TestInfo } from "@playwright/test"
import { writeFile } from "node:fs/promises"
import { basename } from "node:path"

// The failure copy an answer shows when Smithers couldn't answer (src/features/chat/schema.ts).
export const CHAT_FAILED = "Smithers couldn't answer. Try again."

// What the app says while sync has failed (src/features/chat/schema.ts), with Try again beside it.
export const SYNC_LOST = "Smithers lost its connection."

// How many messages the conversation shows before Load earlier (src/features/chat/schema.ts PAGE_SIZE).
export const PAGE_SIZE = 50

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
      const log: Array<string> = []
      page.on("console", (message) => log.push(`${message.type()}: ${message.text()}`))
      page.on("pageerror", (error) => log.push(`pageerror: ${error.message}`))
      await use(log)
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

export { expect } from "@playwright/test"

// The answer bubble right after the first message that contains `question`.
export const answerTo = (conversation: Locator, question: string) =>
  conversation.locator(".sui-chat-message", { hasText: question }).first().locator("xpath=following-sibling::*[1]")
