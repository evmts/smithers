import { Effect, Layer, ManagedRuntime } from "effect"
import { afterEach, expect, test, vi } from "vitest"
import * as TestDatabase from "../../db/TestDatabase.ts"
import type { ChatView } from "../features/chat/chat"
import { nodeDevice, TestChatApi } from "./chatApi"
import { opening, startWithFaults, type Switches } from "./e2e"

// The end-to-end entry's composition: the app on faulty services, with their switches on the window.

const runtimes: Array<{ dispose: () => Promise<void> }> = []
afterEach(async () => {
  for (const runtime of runtimes.splice(0).reverse()) await runtime.dispose()
})

const until = (assertion: () => void) => vi.waitFor(assertion, { timeout: 10_000, interval: 20 })

test("?faults names the switch the shape source opens with, and nothing else opens it faulty", () => {
  for (const search of ["?faults", "?faults=", "?faults=unknown", ""]) expect(opening(search)).toBeUndefined()
  for (const search of ["?faults=down", "?faults=refuse", "?faults=refuse-502", "?faults=stall", "?faults=corrupt"]) {
    expect(opening(search)).toBeInstanceOf(Function)
  }
})

// The faulty services' window switches, on the app as `?faults` opens it: healthy until a test throws one.
const openOnWindow = async (search: string, name: string) => {
  const host = ManagedRuntime.make(TestChatApi.layer.pipe(Layer.provideMerge(TestDatabase.layer(name))))
  runtimes.push(host)
  const api = await host.runPromise(Effect.service(TestChatApi))
  const rendered: Array<ChatView> = []
  const window: { faults?: Switches } = {}
  const { stop } = await startWithFaults(
    {
      origin: api.origin,
      fetch: api.fetch,
      reload: api.reload,
      host: nodeDevice(),
      unreachableAfter: "300 millis",
      target: new EventTarget(),
      startedAt: Date.now(),
      render: (chat) => rendered.push(chat),
    },
    search,
    window,
  )
  return { host, api, chat: rendered[0]!, faults: window.faults!, stop }
}

test("the window's questions switches: the next question fails, and asked lists every question", async () => {
  const { host, api, chat, faults, stop } = await openOnWindow("?faults", "test_e2e_questions")
  await chat.queries.connection.preload()
  expect(faults.questions.asked()).toEqual([])

  faults.questions.failNext("bad_request")
  const lost = chat.actions.ask("  lost  ")
  if (!lost.asked) throw new Error(`the question was refused: ${lost.reason}`)
  await chat.queries.conversation.preload()
  await until(() =>
    expect(chat.queries.conversation.toArray.find(({ id }) => id === lost.questionId)?.status).toBe("unsent"),
  )
  expect(faults.questions.asked()).toEqual([{ id: lost.questionId, answerId: lost.answerId, text: "lost" }])
  expect(await host.runPromise(api.rows)).toEqual([])

  // The fault was for one question: the next goes through to ChatApi, and asked lists both, in order.
  const kept = chat.actions.ask("kept")
  if (!kept.asked) throw new Error(`the question was refused: ${kept.reason}`)
  await until(async () => expect((await host.runPromise(api.rows)).map(({ id }) => id)).toEqual([kept.questionId, kept.answerId]))
  expect(faults.questions.asked().map(({ text }) => text)).toEqual(["lost", "kept"])
  await stop()
})

test.each([
  ["?faults=refuse-502", { status: "offline", retry: true }],
  ["?faults=refuse", { status: "failed", retry: true }],
])("%s opens the app with its sync failing, and the window's switches heal it", async (search, failed) => {
  const host = ManagedRuntime.make(TestChatApi.layer.pipe(Layer.provideMerge(TestDatabase.layer("test_e2e"))))
  runtimes.push(host)
  const api = await host.runPromise(Effect.service(TestChatApi))
  const rendered: Array<ChatView> = []
  const window: { faults?: Switches } = {}
  const { stop } = await startWithFaults(
    {
      origin: api.origin,
      fetch: api.fetch,
      reload: api.reload,
      host: nodeDevice(),
      unreachableAfter: "300 millis",
      target: new EventTarget(),
      startedAt: Date.now(),
      render: (chat) => rendered.push(chat),
    },
    search,
    window,
  )
  const connection = rendered[0]!.queries.connection
  await connection.preload()
  await until(() => expect(connection.toArray[0]).toMatchObject(failed))
  window.faults!.shapes.heal()
  rendered[0]!.actions.retry()
  await until(() => expect(connection.toArray[0]?.status).toBe("up"))
  window.faults!.shapes.refuse(503)
  window.faults!.shapes.down("live")
  window.faults!.shapes.stall("live")
  window.faults!.shapes.corrupt("live")
  window.faults!.questions.failNext("refused")
  window.faults!.engine.refuseResults("chat/Answer", "payload_changed")
  window.faults!.shapes.heal()
  await stop()
})
