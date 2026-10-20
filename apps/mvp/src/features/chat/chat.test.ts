import { Effect, Exit, type ManagedRuntime, Metric, Schema, Scope } from "effect"
import { afterEach, describe, expect, test, vi } from "vitest"
import * as Collections from "../../lib/collections"
import { openTab, openTestApp, type TabOptions, TestChatApi } from "../../test/chatApi"
import {
  type AskResult,
  ask,
  closeComposer,
  loadEarlier,
  openComposer,
  retrySync,
  setDraft,
  toggleComposer,
} from "./actions"
import {
  askFailures,
  composerOpens,
  firstAnswerText,
  historyLoads,
  questionsAsked,
  syncFailures,
  syncRetries,
} from "./metrics"
import { reconnectOnline } from "./reconnect"
import { CHAT_FAILED, Message, QUESTION_MAX_LENGTH } from "./schema"
import { chatShortcuts } from "./shortcuts"
import { ChatStore } from "./store"

// Chat's state machine, run as the browser runs it (`appLayer` on its own runtime), against ChatApi's real handler
// over the compose Postgres and Electric (src/test/chatApi.ts). Only the model is scripted. Actions run with
// `runSync`, as React runs them.

const runtimes: Array<{ dispose: () => Promise<void> }> = []
afterEach(async () => {
  // Tabs first: they reach Postgres through the ChatApi that closes with the first runtime.
  for (const runtime of runtimes.splice(0).reverse()) await runtime.dispose()
})

const tabOn = async <R, E>(runtime: ManagedRuntime.ManagedRuntime<R | ChatStore, E>) => {
  runtimes.push(runtime)
  const chat = await runtime.runPromise(Effect.service(ChatStore))
  // What React's live queries start on first render.
  await runtime.runPromise(
    Effect.all([chat.conversation, chat.composerState, chat.waiting, chat.syncState, chat.historyState].map(Collections.preload), {
      concurrency: "unbounded",
    }),
  )
  return {
    chat,
    runtime,
    run: <A>(action: Effect.Effect<A, never, ChatStore>) => runtime.runSync(action),
    /** The conversation as a person reads it: role, status and text. */
    shown: () => chat.conversation.toArray.map(({ role, status, text }) => `${role} ${status} ${text}`),
    composer: () => chat.composerState.toArray[0],
    waiting: () => chat.waiting.toArray.length > 0,
    sync: () => chat.syncState.toArray[0],
    history: () => chat.historyState.toArray[0],
    synced: (id: string) => chat.messages.get(id)?.$synced === true,
    count: (metric: Metric.Metric<number, Metric.CounterState<number>>) => runtime.runSync(Metric.value(metric)).count,
  }
}

const openChat = async (options: Parameters<typeof openTestApp>[0] = {}) => {
  const runtime = openTestApp(options)
  const tab = await tabOn(runtime)
  const api = await runtime.runPromise(Effect.service(TestChatApi))
  return { ...tab, api, onApi: <A>(effect: Effect.Effect<A>) => runtime.runPromise(effect) }
}

const asked = (result: AskResult) => {
  if (!result.asked) throw new Error(`the question was refused: ${result.reason}`)
  return result
}

const until = (assertion: () => void | Promise<void>) => vi.waitFor(assertion, { timeout: 4_000, interval: 20 })

describe("asking", () => {
  test("shows the question and an empty streaming answer at once, clears the draft, and this tab waits", async () => {
    const tab = await openChat()
    tab.run(setDraft("  hello  "))
    const result = tab.run(ask("  hello  "))
    expect(result).toMatchObject({ asked: true })
    expect(tab.shown()).toEqual(["user done hello", "assistant streaming "])
    expect(tab.composer()?.draft).toBe("")
    expect(tab.waiting()).toBe(true)
    expect(tab.count(questionsAsked)).toBe(1)
  })

  test("swaps in Postgres' rows once Electric delivers them, then merges the answer's changes until it settles", async () => {
    const tab = await openChat()
    const { questionId, answerId } = asked(tab.run(ask("  hello ")))
    await until(() => expect(tab.synced(answerId)).toBe(true))
    expect(tab.chat.conversation.toArray.map(({ id }) => id)).toEqual([questionId, answerId])
    const decoded = () => [questionId, answerId].map((id) => Schema.decodeUnknownSync(Message)(tab.chat.messages.get(id)))
    expect(decoded()).toMatchObject([
      { id: questionId, text: "hello", questionId: null, position: 1 },
      { id: answerId, text: "", status: "streaming", questionId, failure: null, position: 2 },
    ])
    expect(await tab.onApi(tab.api.rows)).toMatchObject([
      { id: questionId, text: "hello", position: 1 },
      { id: answerId, text: "", position: 2 },
    ])

    const reply = await tab.onApi(tab.api.answerTo("hello"))
    reply.say("Hel")
    await until(() => expect(tab.shown()).toEqual(["user done hello", "assistant streaming Hel"]))
    expect(tab.waiting()).toBe(true)
    reply.say("lo there")
    reply.done()
    await until(() => expect(tab.shown()).toEqual(["user done hello", "assistant done Hello there"]))
    expect(tab.waiting()).toBe(false)
    // Electric sends only the columns that changed; the rest of the row stays.
    expect(decoded()[1]).toMatchObject({ questionId, position: 2, modelId: "test-model", outputTokens: 20 })
  })

  test("an answer that fails on the server reads the failure copy, whatever it had streamed", async () => {
    const tab = await openChat()
    const { answerId } = asked(tab.run(ask("hello")))
    const reply = await tab.onApi(tab.api.answerTo("hello"))
    reply.say("partial")
    await until(() => expect(tab.shown()).toEqual(["user done hello", "assistant streaming partial"]))
    reply.fail()
    await until(() => expect(tab.shown()).toEqual(["user done hello", `assistant failed ${CHAT_FAILED}`]))
    expect(tab.chat.messages.get(answerId)?.failure).toBe("model_error")
    expect(tab.waiting()).toBe(false)
  })

  test("orders the conversation by Postgres position, across tabs, with every question before its answer", async () => {
    const a = await openChat()
    const first = asked(a.run(ask("one")))
    await until(() => expect(a.synced(first.answerId)).toBe(true))
    await a.onApi(a.api.askElsewhere("two"))
    const third = asked(a.run(ask("three")))
    await until(() => expect(a.synced(third.answerId)).toBe(true))
    const b = await tabOn(openTab(a.api))
    const expected = [
      "user done one",
      "assistant streaming ",
      "user done two",
      "assistant streaming ",
      "user done three",
      "assistant streaming ",
    ]
    await until(() => expect(a.shown()).toEqual(expected))
    expect(b.shown()).toEqual(expected)
    expect((await a.onApi(a.api.rows)).map(({ position }) => position)).toEqual([1, 2, 3, 4, 5, 6])
  })

  test("another tab sees the question once Electric delivers it, and the answer as it grows", async () => {
    const a = await openChat()
    const b = await tabOn(openTab(a.api))
    asked(a.run(ask("hello")))
    await until(() => expect(b.shown()).toEqual(["user done hello", "assistant streaming "]))
    expect(b.waiting()).toBe(false)
    const reply = await a.onApi(a.api.answerTo("hello"))
    reply.say("Hi")
    reply.done()
    await until(() => expect(b.shown()).toEqual(["user done hello", "assistant done Hi"]))
  })
})

describe("asking refuses", () => {
  test.each([
    ["a blank question", "   \n ", "empty"],
    ["a question over the limit", "x".repeat(QUESTION_MAX_LENGTH + 1), "too_long"],
  ])("%s: nothing is asked and the draft stays", async (_, text, reason) => {
    const tab = await openChat()
    tab.run(setDraft(text))
    expect(tab.run(ask(text))).toEqual({ asked: false, reason })
    expect(tab.shown()).toEqual([])
    expect(tab.composer()?.draft === text).toBe(true)
    expect(tab.count(questionsAsked)).toBe(0)
    expect(await tab.onApi(tab.api.rows)).toEqual([])
  })

  test("nothing at the limit, and asks the trimmed text, as ChatApi stores it", async () => {
    const tab = await openChat()
    const question = "x".repeat(QUESTION_MAX_LENGTH)
    const { questionId, answerId } = asked(tab.run(ask(`  ${question}\n`)))
    expect(tab.chat.messages.get(questionId)?.text === question).toBe(true)
    await until(() => expect(tab.synced(answerId)).toBe(true))
    const [stored] = await tab.onApi(tab.api.rows)
    expect(stored?.id).toBe(questionId)
    expect(stored?.text === question).toBe(true)
  })
})

describe("when ChatApi doesn't take a question", () => {
  test.each(["refused", "unreachable"] as const)(
    "%s: the rows roll back, and the question and the failure copy stay where they were shown",
    async (failure) => {
      const tab = await openChat()
      const earlier = asked(tab.run(ask("earlier")))
      const reply = await tab.onApi(tab.api.answerTo("earlier"))
      reply.say("Sure")
      reply.done()
      await until(() => expect(tab.waiting()).toBe(false))

      tab.api.failNext(failure)
      const { questionId, answerId } = asked(tab.run(ask("lost")))
      expect(tab.waiting()).toBe(true)
      await until(() => expect(tab.chat.messages.has(questionId)).toBe(false))
      expect(tab.shown()).toEqual([
        "user done earlier",
        "assistant done Sure",
        "user done lost",
        `assistant failed ${CHAT_FAILED}`,
      ])
      expect(tab.chat.conversation.toArray.map(({ id }) => id).slice(2)).toEqual([questionId, answerId])
      expect(tab.waiting()).toBe(false)
      expect(tab.count(Metric.withAttributes(askFailures, { reason: failure }))).toBe(1)
      expect((await tab.onApi(tab.api.rows)).map(({ id }) => id)).toEqual([earlier.questionId, earlier.answerId])

      // Later questions, from anywhere, come after it.
      await tab.onApi(tab.api.askElsewhere("later"))
      await until(() => expect(tab.shown().at(-2)).toBe("user done later"))
      expect(tab.shown().slice(2, 4)).toEqual(["user done lost", `assistant failed ${CHAT_FAILED}`])
    },
  )

  test("failed questions keep the order they were asked in", async () => {
    const tab = await openChat()
    for (const text of ["first", "second"]) {
      tab.api.failNext("refused")
      const { questionId } = asked(tab.run(ask(text)))
      await until(() => expect(tab.chat.messages.has(questionId)).toBe(false))
    }
    expect(tab.shown()).toEqual([
      "user done first",
      `assistant failed ${CHAT_FAILED}`,
      "user done second",
      `assistant failed ${CHAT_FAILED}`,
    ])
  })

  test("a question ChatApi took but Electric didn't deliver in time shows failed, then once, as Postgres has it", async () => {
    const tab = await openChat({ confirmWithin: "500 millis" })
    tab.api.pauseElectric()
    const { questionId, answerId } = asked(tab.run(ask("slow")))
    await until(() => expect(tab.count(Metric.withAttributes(askFailures, { reason: "unconfirmed" }))).toBe(1))
    expect(tab.shown()).toEqual(["user done slow", `assistant failed ${CHAT_FAILED}`])
    tab.api.resumeElectric()
    await until(() => expect(tab.synced(answerId)).toBe(true))
    expect(tab.shown()).toEqual(["user done slow", "assistant streaming "])
    expect(tab.chat.conversation.toArray.map(({ id }) => id)).toEqual([questionId, answerId])
  })
})

describe("when a question was already there", () => {
  test("a retry ChatApi answers 200 keeps the rows shown until Electric delivers them, however slow", async () => {
    const tab = await openChat()
    tab.api.pauseElectric()
    tab.api.duplicateNext()
    const { questionId, answerId } = asked(tab.run(ask("twice")))
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(tab.shown()).toEqual(["user done twice", "assistant streaming "])
    expect(tab.waiting()).toBe(true)
    expect(tab.synced(answerId)).toBe(false)
    tab.api.resumeElectric()
    await until(() => expect(tab.synced(answerId)).toBe(true))
    expect(tab.shown()).toEqual(["user done twice", "assistant streaming "])
    expect(tab.chat.conversation.toArray.map(({ id }) => id)).toEqual([questionId, answerId])
    expect(tab.count(askFailures)).toBe(0)
    expect((await tab.onApi(tab.api.rows)).map(({ id }) => id)).toEqual([questionId, answerId])
  })

  test("a retry whose rows Electric doesn't deliver in time shows failed, then as Postgres has it", async () => {
    const tab = await openChat({ confirmWithin: "300 millis" })
    tab.api.pauseElectric()
    tab.api.duplicateNext()
    const { answerId } = asked(tab.run(ask("twice")))
    await until(() => expect(tab.count(Metric.withAttributes(askFailures, { reason: "unconfirmed" }))).toBe(1))
    expect(tab.shown()).toEqual(["user done twice", `assistant failed ${CHAT_FAILED}`])
    tab.api.resumeElectric()
    await until(() => expect(tab.synced(answerId)).toBe(true))
    expect(tab.shown()).toEqual(["user done twice", "assistant streaming "])
  })

  test("a question whose id another question has is refused (409), and its answer shows the failure copy", async () => {
    const tab = await openChat()
    tab.api.conflictNext()
    const { questionId, answerId } = asked(tab.run(ask("mine")))
    await until(() => expect(tab.count(Metric.withAttributes(askFailures, { reason: "refused" }))).toBe(1))
    expect(
      tab.api.spans.some(
        (span) => span.name === "chat.question" && span.attributes.get("http.response.status_code") === 409,
      ),
    ).toBe(true)
    await until(() =>
      expect(tab.chat.conversation.toArray.find(({ id }) => id === answerId)).toMatchObject({
        status: "failed",
        text: CHAT_FAILED,
      }),
    )
    const stored = await tab.onApi(tab.api.rows)
    expect(stored.filter(({ id }) => id === questionId).map(({ text }) => text)).toEqual(["another question"])
    expect(stored.some(({ id }) => id === answerId)).toBe(false)
  })
})

describe("ChatApi's answer has one deadline", () => {
  test("a body that stalls after 202 is aborted at the deadline, rolls back, and shows failed until Electric delivers it", async () => {
    const tab = await openChat({ answerWithin: "300 millis" })
    tab.api.pauseElectric()
    const stalled = tab.api.stallNext()
    const { answerId } = asked(tab.run(ask("stalled")))
    await until(() => expect(tab.count(Metric.withAttributes(askFailures, { reason: "unreachable" }))).toBe(1))
    expect(stalled.aborted()).toBe(true)
    expect(tab.shown()).toEqual(["user done stalled", `assistant failed ${CHAT_FAILED}`])
    expect(tab.waiting()).toBe(false)
    // ChatApi had stored it, so Electric's rows replace the failure.
    tab.api.resumeElectric()
    await until(() => expect(tab.synced(answerId)).toBe(true))
    expect(tab.shown()).toEqual(["user done stalled", "assistant streaming "])
  })
})

describe("sync health", () => {
  // A quick deadline and backoff, so an outage shows in a test's time.
  const quick: TabOptions = { openWithin: "300 millis", backoff: { initial: "20 millis", max: "50 millis" } }
  // A backoff far longer than a test, so only a retry or `online` brings sync back in time.
  const slow: TabOptions = { openWithin: "300 millis", backoff: { initial: "60 seconds", max: "60 seconds" } }

  // Makes the live request in flight return, so the next shape request meets the outage.
  const outage = async (tab: Awaited<ReturnType<typeof openChat>>) => {
    tab.api.cutElectric()
    await tab.onApi(tab.api.askElsewhere("during the outage"))
    await until(() => expect(tab.sync()?.status).toBe("failed"))
  }

  test("is syncing until a shape request succeeds, then ready", async () => {
    const tab = await openChat()
    expect(tab.sync()).toEqual(expect.objectContaining({ status: "ready", reason: null, httpStatus: null }))
  })

  test("fails as unreachable once Electric can't be reached for openWithin, keeps the conversation, and recovers by itself", async () => {
    const tab = await openChat(quick)
    asked(tab.run(ask("before")))
    await until(() => expect(tab.waiting()).toBe(true))
    await until(() => expect(tab.shown()).toEqual(["user done before", "assistant streaming "]))
    await until(() => expect(tab.chat.recent.toArray.length).toBe(2))
    await outage(tab)
    expect(tab.sync()).toEqual(expect.objectContaining({ status: "failed", reason: "unreachable", httpStatus: 502 }))
    expect(tab.count(Metric.withAttributes(syncFailures, { reason: "unreachable" }))).toBe(1)
    expect(tab.shown()).toEqual(["user done before", "assistant streaming "])
    tab.api.healElectric()
    await until(() => expect(tab.sync()?.status).toBe("ready"))
    await until(() => expect(tab.shown().slice(2)).toEqual(["user done during the outage", "assistant streaming "]))
    expect(tab.count(syncRetries)).toBe(0)
  })

  test("Try again syncs at once instead of waiting out the backoff", async () => {
    const tab = await openChat(slow)
    await outage(tab)
    tab.api.healElectric()
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(tab.sync()?.status).toBe("failed")
    tab.run(retrySync("button"))
    expect(tab.sync()?.status).toBe("syncing")
    await until(() => expect(tab.sync()?.status).toBe("ready"))
    await until(() => expect(tab.shown()).toEqual(["user done during the outage", "assistant streaming "]))
    expect(tab.count(Metric.withAttributes(syncRetries, { via: "button" }))).toBe(1)
  })

  test("Try again while Electric is still down fails again after openWithin", async () => {
    const tab = await openChat(quick)
    await outage(tab)
    tab.run(retrySync("button"))
    expect(tab.sync()?.status).toBe("syncing")
    await until(() => expect(tab.sync()?.status).toBe("failed"))
    expect(tab.count(Metric.withAttributes(syncFailures, { reason: "unreachable" }))).toBe(2)
  })

  test("the browser coming back online syncs at once, and stops when its scope closes", async () => {
    const tab = await openChat(slow)
    const target = new EventTarget()
    const scope = await tab.runtime.runPromise(Scope.make())
    await tab.runtime.runPromise(Scope.provide(reconnectOnline(target), scope))
    await outage(tab)
    tab.api.healElectric()
    target.dispatchEvent(new Event("online"))
    await until(() => expect(tab.sync()?.status).toBe("ready"))
    await until(() => expect(tab.shown()).toEqual(["user done during the outage", "assistant streaming "]))
    expect(tab.count(Metric.withAttributes(syncRetries, { via: "online" }))).toBe(1)

    await tab.runtime.runPromise(Scope.close(scope, Exit.void))
    await outage(tab)
    target.dispatchEvent(new Event("online"))
    expect(tab.sync()?.status).toBe("failed")
    expect(tab.count(Metric.withAttributes(syncRetries, { via: "online" }))).toBe(1)
  })

  test("at open, Electric unreachable fails within openWithin, and Try again opens the conversation once it's back", async () => {
    const first = await openChat()
    await first.onApi(first.api.askElsewhere("already there"))
    first.api.cutElectric()
    const runtime = openTab(first.api, slow)
    runtimes.push(runtime)
    const chat = await runtime.runPromise(Effect.service(ChatStore))
    void runtime.runPromise(Collections.preload(chat.conversation))
    await runtime.runPromise(Effect.all([chat.syncState, chat.historyState].map(Collections.preload)))
    await until(() => expect(chat.syncState.toArray[0]?.status).toBe("failed"))
    expect(chat.syncState.toArray[0]).toEqual(expect.objectContaining({ reason: "unreachable", httpStatus: 502 }))
    expect(chat.historyState.toArray[0]?.opened).toBe(false)
    first.api.healElectric()
    runtime.runSync(retrySync("button"))
    await until(() => expect(chat.historyState.toArray[0]?.opened).toBe(true))
    expect(chat.syncState.toArray[0]?.status).toBe("ready")
    expect(chat.conversation.toArray.map(({ text }) => text)).toEqual(["already there", ""])
  })

  test("a shape request refused (4xx) fails as refused and waits for Try again, even once the network is fine", async () => {
    const tab = await openChat(quick)
    tab.api.failShapes("refused")
    await tab.onApi(tab.api.askElsewhere("while refused"))
    await until(() => expect(tab.sync()).toEqual(expect.objectContaining({ status: "failed", reason: "refused", httpStatus: 400 })))
    tab.api.failShapes(undefined)
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(tab.sync()?.status).toBe("failed")
    tab.run(retrySync("button"))
    await until(() => expect(tab.sync()?.status).toBe("ready"))
    await until(() => expect(tab.shown()).toEqual(["user done while refused", "assistant streaming "]))
    expect(tab.count(Metric.withAttributes(syncFailures, { reason: "refused" }))).toBe(1)
  })
})

describe("history", () => {
  // Five exchanges, ten rows, stored before the tab opens with a page of four.
  const withHistory = async () => {
    const first = await openChat()
    for (const n of [1, 2, 3, 4, 5]) await first.onApi(first.api.askElsewhere(`q${n}`))
    const tab = await tabOn(openTab(first.api, { pageSize: 4 }))
    return { ...tab, api: first.api }
  }
  const questions = (tab: { shown: () => Array<string> }) =>
    tab.shown().filter((row) => row.startsWith("user")).map((row) => row.slice("user done ".length))

  test("opens on the most recent page only, and Load earlier loads the page before it until there's nothing earlier", async () => {
    const tab = await withHistory()
    await until(() => expect(tab.history()).toEqual(expect.objectContaining({ opened: true, limit: 4, earlier: true })))
    expect(questions(tab)).toEqual(["q4", "q5"])
    // The tab downloaded only the page it shows.
    expect(tab.chat.messages.size).toBe(4)

    tab.run(loadEarlier)
    expect(tab.history()).toEqual(expect.objectContaining({ limit: 8, loading: true }))
    await until(() => expect(tab.history()).toEqual(expect.objectContaining({ loading: false, earlier: true })))
    expect(questions(tab)).toEqual(["q2", "q3", "q4", "q5"])

    tab.run(loadEarlier)
    await until(() => expect(tab.history()).toEqual(expect.objectContaining({ limit: 12, loading: false, earlier: false })))
    expect(questions(tab)).toEqual(["q1", "q2", "q3", "q4", "q5"])
    tab.run(loadEarlier)
    expect(tab.history()?.limit).toBe(12)
    expect(tab.count(Metric.withAttributes(historyLoads, { outcome: "loaded" }))).toBe(2)
  })

  test("asking keeps the window on the most recent page, and the answer this tab waits on is in it", async () => {
    const tab = await withHistory()
    await until(() => expect(tab.history()?.opened).toBe(true))
    asked(tab.run(ask("newest")))
    expect(tab.waiting()).toBe(true)
    expect(questions(tab)).toEqual(["q4", "q5", "newest"])
    await until(() => expect(questions(tab)).toEqual(["q5", "newest"]))
    expect(tab.waiting()).toBe(true)
  })

  test("a Load earlier that can't load keeps the window, and can be tried again", async () => {
    const tab = await withHistory()
    await until(() => expect(tab.history()?.earlier).toBe(true))
    tab.api.failShapes("refused")
    tab.run(loadEarlier)
    await until(() => expect(tab.history()).toEqual(expect.objectContaining({ limit: 4, loading: false, earlier: true })))
    expect(questions(tab)).toEqual(["q4", "q5"])
    expect(tab.count(Metric.withAttributes(historyLoads, { outcome: "failed" }))).toBe(1)
  })
})

describe("the composer", () => {
  test("opens, hides, toggles and keeps its draft", async () => {
    const tab = await openChat()
    expect(tab.composer()).toMatchObject({ open: false, draft: "" })
    tab.run(openComposer("button"))
    tab.run(setDraft("half a thought"))
    expect(tab.composer()).toMatchObject({ open: true, draft: "half a thought" })
    tab.run(closeComposer)
    expect(tab.composer()?.open).toBe(false)
    tab.run(toggleComposer("shortcut"))
    expect(tab.composer()?.open).toBe(true)
    tab.run(toggleComposer("shortcut"))
    expect(tab.composer()).toMatchObject({ open: false, draft: "half a thought" })
  })

  test("counts opens by how, and not an open composer opened again", async () => {
    const tab = await openChat()
    tab.run(openComposer("button"))
    tab.run(openComposer("button"))
    tab.run(toggleComposer("shortcut"))
    tab.run(toggleComposer("shortcut"))
    expect(tab.count(Metric.withAttributes(composerOpens, { via: "button" }))).toBe(1)
    expect(tab.count(Metric.withAttributes(composerOpens, { via: "shortcut" }))).toBe(1)
  })

  test("belongs to one tab", async () => {
    const a = await openChat()
    const b = await tabOn(openTab(a.api))
    a.run(openComposer("button"))
    a.run(setDraft("mine"))
    expect(b.composer()).toMatchObject({ open: false, draft: "" })
  })
})

describe("time to the first answer text", () => {
  test("is recorded once, when the answer first shows text", async () => {
    const tab = await openChat()
    asked(tab.run(ask("hello")))
    const reply = await tab.onApi(tab.api.answerTo("hello"))
    reply.say("H")
    await until(() => expect(tab.runtime.runSync(Metric.value(firstAnswerText)).count).toBe(1))
    reply.say("ello")
    reply.done()
    await until(() => expect(tab.waiting()).toBe(false))
    expect(tab.runtime.runSync(Metric.value(firstAnswerText)).count).toBe(1)
  })

  test("is not recorded for a question that wasn't taken, or an answer that failed before any text", async () => {
    const tab = await openChat()
    tab.api.failNext("refused")
    const lost = asked(tab.run(ask("lost")))
    await until(() => expect(tab.chat.messages.has(lost.questionId)).toBe(false))
    asked(tab.run(ask("hello")))
    ;(await tab.onApi(tab.api.answerTo("hello"))).fail()
    await until(() => expect(tab.shown().at(-1)).toBe(`assistant failed ${CHAT_FAILED}`))
    expect(tab.runtime.runSync(Metric.value(firstAnswerText)).count).toBe(0)
  })
})

describe("telemetry", () => {
  test("exports the ask's span in ChatApi's trace, its logs and metrics, and never what anyone wrote", async () => {
    const tab = await openChat()
    const sentinel = `sentinel-${crypto.randomUUID()}`
    const { answerId } = asked(tab.run(ask(`What is ${sentinel}?`)))
    const reply = await tab.onApi(tab.api.answerTo(`What is ${sentinel}?`))
    reply.say(`It is ${sentinel}.`)
    reply.done()
    await until(() => expect(tab.waiting()).toBe(false))
    tab.api.failNext("refused")
    asked(tab.run(ask(`And ${sentinel} again?`)))
    await until(() => expect(tab.count(Metric.withAttributes(askFailures, { reason: "refused" }))).toBe(1))
    const { telemetry, spans } = tab.api
    for (const runtime of runtimes.splice(0).reverse()) await runtime.dispose()

    const exported = (signal: string) =>
      telemetry.filter(({ path }) => path === `/api/telemetry/v1/${signal}`).map(({ body }) => body)
    const browserSpans = exported("traces")
      .flatMap((body) => JSON.parse(body).resourceSpans)
      .flatMap((resource: { scopeSpans: Array<{ spans: Array<{ name: string; traceId: string }> }> }) => resource.scopeSpans)
      .flatMap((scope: { spans: Array<{ name: string; traceId: string }> }) => scope.spans)
    const ask_ = browserSpans.find(({ name }) => name === "chat.ask")
    expect(exported("traces").join("\n")).toContain(answerId)
    // traceparent on POST /api/questions joins the browser's ask and ChatApi's question into one trace.
    expect(spans.find(({ name }) => name === "chat.question")?.traceId).toBe(ask_?.traceId)
    expect(exported("logs").join("\n")).toContain("question asked")
    expect(exported("logs").join("\n")).toContain("question not taken")
    for (const name of ["smithers_web_questions", "smithers_web_ask_failures", "smithers_web_answer_first_text_ms"]) {
      expect(exported("metrics").join("\n")).toContain(name)
    }
    expect(telemetry.map(({ body }) => body).join("\n")).not.toContain(sentinel)
  })

  test("exports sync and history records, and never what anyone wrote", async () => {
    const tab = await openChat({ pageSize: 2, openWithin: "300 millis", backoff: { initial: "20 millis", max: "50 millis" } })
    const sentinel = `sentinel-${crypto.randomUUID()}`
    asked(tab.run(ask(`What is ${sentinel}?`)))
    await tab.onApi(tab.api.askElsewhere(`Elsewhere ${sentinel}`))
    await until(() => expect(tab.history()?.earlier).toBe(true))
    tab.run(loadEarlier)
    await until(() => expect(tab.count(Metric.withAttributes(historyLoads, { outcome: "loaded" }))).toBe(1))
    tab.api.cutElectric()
    await tab.onApi(tab.api.askElsewhere(`During ${sentinel}`))
    await until(() => expect(tab.sync()?.status).toBe("failed"))
    tab.api.healElectric()
    tab.run(retrySync("button"))
    await until(() => expect(tab.sync()?.status).toBe("ready"))
    const { telemetry } = tab.api
    for (const runtime of runtimes.splice(0).reverse()) await runtime.dispose()

    const exported = (signal: string) =>
      telemetry
        .filter(({ path }) => path === `/api/telemetry/v1/${signal}`)
        .map(({ body }) => body)
        .join("\n")
    for (const message of ["chat sync failed", "chat sync retried", "chat sync up to date", "earlier messages loaded"]) {
      expect(exported("logs")).toContain(message)
    }
    expect(exported("logs")).toContain("unreachable")
    expect(exported("traces")).toContain("chat.history.load")
    for (const name of ["smithers_web_sync_failures", "smithers_web_sync_retries", "smithers_web_history_loads"]) {
      expect(exported("metrics")).toContain(name)
    }
    expect(telemetry.map(({ body }) => body).join("\n")).not.toContain(sentinel)
  })
})

describe("shortcuts", () => {
  // A keydown as a browser dispatches it. `key` is absent on some, such as Chrome's autofill.
  const keydown = (init: { key?: string; metaKey?: boolean; ctrlKey?: boolean }) =>
    Object.assign(new Event("keydown", { cancelable: true }), { metaKey: false, ctrlKey: false, ...init })

  const bound = async () => {
    const tab = await openChat()
    const target = new EventTarget()
    const scope = await tab.runtime.runPromise(Scope.make())
    await tab.runtime.runPromise(Scope.provide(chatShortcuts(target), scope))
    const press = (init: Parameters<typeof keydown>[0]) => {
      const event = keydown(init)
      target.dispatchEvent(event)
      return event.defaultPrevented
    }
    return { ...tab, press, unbind: () => tab.runtime.runPromise(Scope.close(scope, Exit.void)) }
  }

  test("⌘K and Ctrl+K toggle the composer, stopping the browser's own shortcut, and count as the shortcut", async () => {
    const tab = await bound()
    expect(tab.press({ key: "k", metaKey: true })).toBe(true)
    expect(tab.composer()?.open).toBe(true)
    expect(tab.press({ key: "K", ctrlKey: true })).toBe(true)
    expect(tab.composer()?.open).toBe(false)
    tab.press({ key: "k", ctrlKey: true })
    expect(tab.count(Metric.withAttributes(composerOpens, { via: "shortcut" }))).toBe(2)
  })

  test("Esc hides the composer and keeps the draft, without stopping the browser", async () => {
    const tab = await bound()
    tab.run(openComposer("button"))
    tab.run(setDraft("kept"))
    expect(tab.press({ key: "Escape" })).toBe(false)
    expect(tab.composer()).toMatchObject({ open: false, draft: "kept" })
  })

  test("other keys, and keydowns with no key, change nothing", async () => {
    const tab = await bound()
    for (const init of [{ key: "k" }, { key: "Enter", metaKey: true }, {}, { metaKey: true }]) {
      expect(tab.press(init)).toBe(false)
    }
    expect(tab.composer()?.open).toBe(false)
  })

  test("are unbound when their scope closes", async () => {
    const tab = await bound()
    await tab.unbind()
    expect(tab.press({ key: "k", metaKey: true })).toBe(false)
    expect(tab.composer()?.open).toBe(false)
  })
})
