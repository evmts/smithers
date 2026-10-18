import type { Page } from "@playwright/test"
import type { ShapeSource } from "@smthrs/effect-electric"
import type { Question } from "../src/features/chat/api"
import type { Switches } from "../src/test/e2e"
import type { QuestionFault } from "../src/test/faults"

// The only way an e2e test makes ChatApi or Electric fail (docs/rules.md, test.faults-by-injection): it opens the app
// on its faulty services and throws their switches (src/test/e2e.ts). Nothing intercepts a request. A page at
// `/app?faults` runs the real services behind those switches, healthy until a test throws one; `/app?faults=down`
// opens it with sync already down. Happy paths open `/app`, on the real services alone.

/** The app on its faulty services, healthy, or opened with a shape switch already thrown. */
export const faultyApp = (opening?: "down" | "refuse" | `refuse-${number}` | "stall" | "corrupt") =>
  opening === undefined ? "/app?faults" : `/app?faults=${opening}`

type OnWindow = { readonly faults: Switches }

/** The switches of the app on `page`, which a test opened at `faultyApp()`. Each waits until the app has built them. */
export const faults = (page: Page) => {
  const built = async () => {
    await page.waitForFunction(() => "faults" in window, undefined, { timeout: 30_000 })
  }
  return {
    shapes: {
      /** Shape requests fail on the network and never reach Electric, as when the sync service is down. */
      down: async (requests?: ShapeSource.Requests) => {
        await built()
        await page.evaluate((requests) => (window as unknown as OnWindow).faults.shapes.down(requests), requests)
      },
      /** Back to the real shape source. */
      heal: async () => {
        await built()
        await page.evaluate(() => (window as unknown as OnWindow).faults.shapes.heal())
      },
    },
    questions: {
      /** The next question fails as `fault`; every later one goes through. */
      failNext: async (fault: QuestionFault) => {
        await built()
        await page.evaluate((fault) => (window as unknown as OnWindow).faults.questions.failNext(fault), fault)
      },
      /** Every question the app asked ChatApi's client, in order, including ones a fault kept off the network. */
      asked: async (): Promise<ReadonlyArray<Question>> => {
        await built()
        return page.evaluate(() => (window as unknown as OnWindow).faults.questions.asked())
      },
    },
  }
}
