import { test as base, type Locator } from "@playwright/test"
import { writeFile } from "node:fs/promises"

const writeLog = async (path: string, log: Array<string>) => {
  await writeFile(path, log.join("\n"))
  return path
}

// Every test keeps the browser's console and page errors; a failing test saves them as browser.log.
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
    },
    { auto: true },
  ],
})

export { expect } from "@playwright/test"

// The answer bubble right after the first message that contains `question`.
export const answerTo = (conversation: Locator, question: string) =>
  conversation.locator(".sui-chat-message", { hasText: question }).first().locator("xpath=following-sibling::*[1]")
