/**
 * An agent flow in the browser engine, in real Chromium, over real OPFS.
 *
 * `browser-test/Ask` runs an `AgentAction` from `@smthrs/agent`'s root on
 * `BrowserRuntime` in a dedicated worker. Its seat is a scripted model, and
 * the agent's cell loop makes each call to it as a sealed `ModelStep`. Each
 * case reads which model calls ran, and in which worker, from the log the
 * scripted model posts to.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import * as Harness from "./Harness.ts"

type Harnessed = {
  readonly harness: {
    readonly start: (executionId: string, question: string) => Promise<void>
    readonly result: (executionId: string) => Promise<unknown>
  }
}

const question = "Which city is the capital of France, and how many people live there?"
const city = { name: "Paris", population: 2102650 }

let server: Awaited<ReturnType<typeof Harness.serve>>

beforeAll(async () => {
  server = await Harness.serve({ agent: true })
})

afterAll(() => server?.close())

const labels = (logged: ReadonlyArray<Harness.Logged>) => logged.map((entry) => entry.label)

describe("an agent flow in the browser engine", () => {
  it("runs the agent's cell loop in the engine worker and settles with the model's answer, decoded", async () => {
    const profile = Harness.profile()
    const context = await Harness.launch(profile.directory)
    try {
      const page = await Harness.open(context, server.origin, "finish", "/agent")
      await page.evaluate(
        (question) => (globalThis as unknown as Harnessed).harness.start("ask-1", question),
        question
      )
      const result = await page.evaluate(() => (globalThis as unknown as Harnessed).harness.result("ask-1"))
      expect(result).toEqual({ ok: true, value: city })
      // Two frames: a cell that prints, then a cell that answers from it.
      expect(labels(await Harness.logged(page))).toEqual(["model:first", "model:second"])
    } finally {
      await context.close()
      profile.remove()
    }
  })

  it("resumes a killed agent after its sealed model call, and never asks the model for that call again", async () => {
    const profile = Harness.profile()
    try {
      const first = await Harness.launch(profile.directory)
      const a = await Harness.open(first, server.origin, "block", "/agent")
      await a.evaluate(
        (question) => (globalThis as unknown as Harnessed).harness.start("ask-2", question),
        question
      )
      await Harness.waitForStep(a, "model:second")
      expect(labels(await Harness.logged(a))).toEqual(["model:first", "model:second"])
      Harness.kill(profile.directory)
      await first.close().catch(() => undefined)

      const second = await Harness.launch(profile.directory)
      try {
        const b = await Harness.open(second, server.origin, "finish", "/agent")
        const result = await b.evaluate(() => (globalThis as unknown as Harnessed).harness.result("ask-2"))
        expect(result).toEqual({ ok: true, value: city })
        // The first call was sealed before the kill and replays from the run's
        // record; the second was cut off, and runs again.
        expect(labels(await Harness.logged(b))).toEqual(["model:second"])
      } finally {
        await second.close()
      }
    } finally {
      profile.remove()
    }
  })
})
