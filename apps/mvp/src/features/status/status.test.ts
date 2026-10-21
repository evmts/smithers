// Agent status on the tab, driven as React drives it: through the status layer's plain actions, reading its live
// queries, with no React. Each device runs the browser's own layer (`appLayer`) on a Node device (src/test/chatApi.ts)
// whose engine leads, against ChatApi's real handler over the compose Postgres and Electric. Only the model is
// scripted. Proves decision 0015's first slice: the agent's question reaches the conversation's status, the header's
// queries, the toasts and the title on every device, and an answer from any of them resumes the run.
import { Effect, type ManagedRuntime, Metric } from "effect"
import { afterEach, describe, expect, test, vi } from "vitest"
import { Chat } from "../chat/chat"
import { dispatches } from "../../flows/dispatch"
import { nodeDevice, openTab, openTestApp, TestChatApi } from "../../test/chatApi"
import { Status } from "./status"
import { shown, StatusStore } from "./store"

/** A test that drives devices' engines through model calls and sync: seconds each, more on a loaded machine. */
const ENGINE_WITHIN = 90_000

const runtimes: Array<{ dispose: () => Promise<void> }> = []
afterEach(async () => {
  for (const runtime of runtimes.splice(0).reverse()) await runtime.dispose()
})

const until = (assertion: () => void | Promise<void>, timeout = 60_000) =>
  vi.waitFor(assertion, { timeout, interval: 20 })

/** ChatApi, from a first tab whose engine never leads: the devices below are the ones that answer. */
const openApi = async () => {
  const runtime = openTestApp({ answers: false })
  runtimes.push(runtime)
  return runtime.runPromise(Effect.service(TestChatApi))
}

/** A device whose engine leads, with a tab on it; its title starts as `Smithers` and records every write. */
const openDevice = async (api: TestChatApi["Service"], options: { readonly titled?: boolean } = {}) => {
  const titles: Array<string> = []
  const host = nodeDevice({
    agent: api,
    ...(options.titled === false ? {} : { title: { read: () => "Smithers", write: (title) => void titles.push(title) } }),
  })
  const runtime: ManagedRuntime.ManagedRuntime<Chat | Status | StatusStore, unknown> = openTab(api, { host })
  runtimes.push(runtime)
  const chat = await runtime.runPromise(Effect.service(Chat))
  const status = await runtime.runPromise(Effect.service(Status))
  const store = await runtime.runPromise(Effect.service(StatusStore))
  for (const query of [store.statuses, store.needs, store.latest]) query.tanstack.startSyncImmediate()
  return {
    chat,
    status,
    store,
    titles,
    statusOf: (id: string) => store.statuses.tanstack.toArray.find((row) => row.id === id),
    needs: () => store.needs.tanstack.toArray,
    latest: () => store.latest.tanstack.toArray[0],
    count: (metric: Metric.Metric<number, Metric.CounterState<number>>) => runtime.runSync(Metric.value(metric)).count,
  }
}

const ask = (device: Awaited<ReturnType<typeof openDevice>>, text: string) => {
  const asked = device.chat.actions.ask(text)
  if (!asked.asked) throw new Error(`the question was refused: ${asked.reason}`)
  return asked.answerId
}

const askCell = (need: string) => `const heard = await ctx.call("app/agent/ask", ${need})\nconsole.log(JSON.stringify(heard))`

describe("a question from the agent", { timeout: ENGINE_WITHIN }, () => {
  test("shows on every device and in the title; an answer from another device resumes the run, and every view settles", async () => {
    const api = await openApi()
    const a = await openDevice(api)
    const b = await openDevice(api)
    const answerId = ask(a, "Deploy the docs preview")
    const first = await Effect.runPromise(api.answerTo("Deploy the docs preview"))
    // Working first: the answer streams.
    await until(() => expect(a.statusOf(answerId)?.state).toBe("working"))
    expect(a.latest()).toMatchObject({ id: answerId, state: "working" })
    first.cell(askCell(`{ kind: "question", prompt: "Which branch should I deploy?", options: ["main", "docs-v2"] }`))

    for (const device of [a, b]) {
      await until(() => expect(device.statusOf(answerId)?.state).toBe("needs_you"))
      expect(device.statusOf(answerId)).toMatchObject({
        version: 1,
        wait: { kind: "question", prompt: "Which branch should I deploy?", options: ["main", "docs-v2"] },
        answer: null,
        sending: false,
        draft: "",
        focus: 0,
      })
      expect(device.needs()).toEqual([expect.objectContaining({ id: answerId, version: 1 })])
    }
    await until(() => expect(a.titles.at(-1)).toBe("(1) Smithers"))
    expect(a.count(Metric.withAttributes(shown, { surface: "conversation" }))).toBe(1)

    // This tab's own rows: a draft and Answer's focus, neither of which another tab or device sees.
    a.status.actions.setDraft(answerId, "docs")
    a.status.actions.focus(answerId)
    a.status.actions.focus(answerId)
    expect(a.statusOf(answerId)).toMatchObject({ draft: "docs", focus: 2 })
    expect(b.statusOf(answerId)).toMatchObject({ draft: "", focus: 0 })
    expect(b.needs()).toEqual([expect.objectContaining({ id: answerId })])

    // The other device answers. Its engine doesn't hold the run; the device that does delivers it.
    b.status.actions.answer(answerId, "docs-v2")
    expect(b.statusOf(answerId)?.sending).toBe(true)
    const second = await Effect.runPromise(api.answerTo("Deploy the docs preview", 1))
    second.cell(`ctx.done("Deploying docs-v2.")`)

    for (const device of [a, b]) {
      await until(() => expect(device.statusOf(answerId)?.state).toBe("done"))
      expect(device.statusOf(answerId)?.answer).toEqual({ value: "docs-v2" })
      expect(device.needs()).toEqual([])
    }
    await until(() => expect(a.titles.at(-1)).toBe("Smithers"))
    expect(a.latest()).toMatchObject({ id: answerId, state: "done" })
    const delivered = Metric.withAttributes(dispatches, { flow: "run/deliver", door: "sync", outcome: "done" })
    await until(() => expect(a.count(delivered)).toBe(1))
    await until(() => expect(b.statusOf(answerId)?.sending).toBe(false))
  })

  test("an approval answered on the same device resumes the run; nothing acts on a question that isn't open", async () => {
    const api = await openApi()
    const a = await openDevice(api, { titled: false })
    const answerId = ask(a, "Clean up old previews")
    // Nothing is open yet: every action is a no-op.
    a.status.actions.answer(answerId, true)
    a.status.actions.setDraft(answerId, "x")
    a.status.actions.focus(answerId)
    const first = await Effect.runPromise(api.answerTo("Clean up old previews"))
    first.cell(askCell(`{ kind: "approval", prompt: "Delete the stale preview docs-v1?" }`))
    await until(() => expect(a.statusOf(answerId)?.state).toBe("needs_you"))
    expect(a.statusOf(answerId)).toMatchObject({ draft: "", focus: 0, wait: { kind: "approval", options: [] } })
    expect(a.store.local.tanstack.toArray).toEqual([])

    a.status.actions.answer(answerId, true)
    const second = await Effect.runPromise(api.answerTo("Clean up old previews", 1))
    second.cell(`ctx.done("Deleted docs-v1.")`)
    await until(() => expect(a.statusOf(answerId)).toMatchObject({ state: "done", answer: { value: true } }))
  })

  test("a second question waits its turn behind one that needs the person, and the latest answer says so", async () => {
    const api = await openApi()
    const a = await openDevice(api)
    const first = ask(a, "First, deploy")
    const reply = await Effect.runPromise(api.answerTo("First, deploy"))
    reply.cell(askCell(`{ kind: "question", prompt: "Which branch?" }`))
    await until(() => expect(a.statusOf(first)?.state).toBe("needs_you"))
    const second = ask(a, "Then bump the version")
    await until(() => expect(a.statusOf(second)?.state).toBe("waiting"))
    expect(a.latest()).toMatchObject({ id: second, state: "waiting" })
    expect(a.needs().map((need) => need.id)).toEqual([first])

    a.status.actions.answer(first, "main")
    ;(await Effect.runPromise(api.answerTo("First, deploy", 1))).cell(`ctx.done("Deployed main.")`)
    ;(await Effect.runPromise(api.answerTo("Then bump the version"))).cell(`ctx.done("Bumped.")`)
    await until(() => expect(a.latest()).toMatchObject({ id: second, state: "done" }))
    expect(a.statusOf(first)?.state).toBe("done")
  })

  test("a failed answer is failed, whatever its run's row says", async () => {
    const api = await openApi()
    const a = await openDevice(api)
    const answerId = ask(a, "Fail, please")
    ;(await Effect.runPromise(api.answerTo("Fail, please"))).fail()
    await until(() => expect(a.statusOf(answerId)?.state).toBe("failed"))
    expect(a.latest()).toMatchObject({ id: answerId, state: "failed" })
  })
})
