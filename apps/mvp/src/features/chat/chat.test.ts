import { ShapeSource, SyncPolicy } from "@smthrs/effect-electric"
import type { Outbox } from "@smthrs/effect-tanstack-db"
import { Effect, Exit, Fiber, ManagedRuntime, Metric, Option, Scope, Stream } from "effect"
import { afterEach, describe, expect, test, vi } from "vitest"
import { dispatches } from "../../flows/dispatch"
import { TabRequests } from "../../flows/requests"
import {
  type ChatApiOptions,
  failingWorker,
  idleWorker,
  member,
  nodeDevice,
  openFaultyApp,
  openFaultyTab,
  openTab,
  openTestApp,
  type TabOptions,
  TestChatApi,
} from "../../test/chatApi"
import { EngineFaults, type QuestionFault, QuestionFaults } from "../../test/faults"
import { Chat } from "./chat"
import { bindConnectivity } from "./connectivity"
import { COULDNT_ANSWER, MAX_QUESTION_LENGTH } from "./contract"
import {
  askFailures,
  composerOpens,
  connectionDrops,
  firstAnswerText,
  historyLoads,
  questionsAsked,
  syncRetries,
  unsentActions,
} from "./metrics"
import { revisionOf } from "../timeline/identity"
import { chatShortcuts } from "./shortcuts"
import { ChatStore } from "./store"

// Chat's state machine, driven as React drives it: through the chat layer's plain actions, reading its live queries,
// with no React. It runs on the browser's own layer (`appLayer`) over a Node device (src/test/chatApi.ts
// `nodeDevice`: SQLite and the outbox as TanStack DB's browser packages run them), against ChatApi's real handler over
// the compose Postgres and Electric, signed in as a Member. Only the model is scripted. A tab's device runs its agent
// on a real engine leader, as a browser's engine worker does, so an answer stays streaming until the test scripts the
// model's reply; a device made with plain `nodeDevice()` has an engine that never leads. Happy paths use the real ChatApi client and Electric shape source; an unhappy
// path gives the tab their faulty implementations (src/test/faults.ts) and throws their switches.

const runtimes: Array<{ dispose: () => Promise<void> }> = []
afterEach(async () => {
  // Tabs first: they reach Postgres through the ChatApi that closes with the first runtime.
  for (const runtime of runtimes.splice(0).reverse()) await runtime.dispose()
})

const tabOn = async <R, E>(runtime: ManagedRuntime.ManagedRuntime<R | Chat | ChatStore, E>) => {
  runtimes.push(runtime)
  const { queries, actions } = await runtime.runPromise(Effect.service(Chat))
  const store = await runtime.runPromise(Effect.service(ChatStore))
  // What React's live queries start on first render, without waiting for the network: they read the device.
  for (const query of [store.shown, store.queued, store.composerState, store.connectionState, store.historyState]) {
    query.tanstack.startSyncImmediate()
  }
  return {
    queries,
    actions,
    store,
    runtime,
    /** The conversation as a person reads it: role, status and text. */
    shown: () => queries.conversation.toArray.map(({ role, status, text }) => `${role} ${status} ${text}`),
    ids: () => queries.conversation.toArray.map(({ id }) => id),
    composer: () => queries.composer.toArray[0],
    connection: () => queries.connection.toArray[0],
    queued: () => queries.queued.toArray.length,
    history: () => queries.history.toArray[0],
    synced: (id: string) => store.messages.tanstack.has(id),
    count: (metric: Metric.Metric<number, Metric.CounterState<number>>) => runtime.runSync(Metric.value(metric)).count,
    close: () => runtime.dispose(),
  }
}

const openChat = async (options: TabOptions = {}, chatApi: ChatApiOptions = {}) => {
  const runtime = openTestApp(options, chatApi)
  const tab = await tabOn(runtime)
  const api = await runtime.runPromise(Effect.service(TestChatApi))
  return { ...tab, api, onApi: <A>(effect: Effect.Effect<A>) => runtime.runPromise(effect) }
}

/** The faulty ChatApi client and shape source's switches on a tab's runtime. */
const switches = async <R, E>(
  runtime: ManagedRuntime.ManagedRuntime<R | QuestionFaults | ShapeSource.Faults | EngineFaults, E>,
) => {
  const questions = await runtime.runPromise(Effect.service(QuestionFaults))
  const shapes = await runtime.runPromise(Effect.service(ShapeSource.Faults))
  const engine = await runtime.runPromise(Effect.service(EngineFaults))
  return {
    /** Throws a switch of this tab's engine. */
    engine: (fault: (switches: EngineFaults["Service"]) => Effect.Effect<void>) => runtime.runSync(fault(engine)),
    failNext: (fault: QuestionFault) => runtime.runSync(questions.failNext(fault)),
    /** Every question the client was given, in order, sent or not. */
    sentQuestions: () => runtime.runSync(questions.asked),
    /** Throws a switch of the shape source. */
    shapes: (fault: (switches: ShapeSource.Switches) => Effect.Effect<void>) => runtime.runSync(fault(shapes)),
  }
}

/** A tab with the faulty ChatApi client and shape source, and their switches. */
const openFaulty = async (options: TabOptions = {}, start?: (switches: ShapeSource.Switches) => Effect.Effect<void>) => {
  const runtime = openFaultyApp(options, start)
  const tab = await tabOn(runtime)
  const api = await runtime.runPromise(Effect.service(TestChatApi))
  return { ...tab, api, onApi: <A>(effect: Effect.Effect<A>) => runtime.runPromise(effect), ...(await switches(runtime)) }
}

const asked = (result: ReturnType<Awaited<ReturnType<typeof openChat>>["actions"]["ask"]>) => {
  if (!result.asked) throw new Error(`the question was refused: ${result.reason}`)
  return result
}

const until = (assertion: () => void | Promise<void>, timeout = 6_000) =>
  vi.waitFor(assertion, { timeout, interval: 20 })

/** How long a wait on the device's agent may take: its engine's run, on a loaded machine. */
const agentWithin = 15_000

// A quick deadline and sync policy, so an outage shows in a test's time.
const quick: TabOptions = {
  unreachableAfter: "300 millis",
  confirmWithin: "1 second",
  retry: SyncPolicy.backoff({ initial: "20 millis", max: "50 millis" }),
}

describe("asking", () => {
  test("shows the question at once at the end of the conversation, clears the draft, and Postgres stores it once", async () => {
    const tab = await openChat()
    tab.actions.setDraft("  hello  ")
    const { questionId, answerId } = asked(tab.actions.ask("  hello  "))
    expect(tab.shown()).toEqual(["user queued hello"])
    expect(tab.composer()?.draft).toBe("")
    expect(tab.count(Metric.withAttributes(questionsAsked, { queued: "false" }))).toBe(1)
    // Once Postgres has it, only the synced rows show: the question and its answer, streaming.
    await until(() => expect(tab.shown()).toEqual(["user done hello", "assistant streaming "]))
    expect(tab.ids()).toEqual([questionId, answerId])
    expect(await tab.onApi(tab.api.rows)).toMatchObject([
      { id: questionId, text: "hello" },
      { id: answerId, text: "" },
    ])
    expect(tab.queued()).toBe(0)
  })

  test("an answer that fails reads Couldn't answer, and Retry asks its question again under new ids", async () => {
    const tab = await openChat()
    const first = asked(tab.actions.ask("hello"))
    const reply = await tab.onApi(tab.api.answerTo("hello"))
    reply.say("partial")
    reply.fail()
    await until(() => expect(tab.shown()).toEqual(["user done hello", `assistant failed ${COULDNT_ANSWER}`]), agentWithin)
    tab.actions.retryAnswer(first.answerId)
    await until(() => expect(tab.shown()).toHaveLength(4))
    const rows = await tab.onApi(tab.api.rows)
    expect(rows.filter(({ text }) => text === "hello")).toHaveLength(2)
    expect(rows.map(({ id }) => id)).toContain(first.questionId)
    // A retry of something that isn't a failed answer with its question changes nothing.
    tab.actions.retryAnswer(first.questionId)
    tab.actions.retryAnswer("not-there")
    expect(tab.shown()).toHaveLength(4)
  })

  test("the composer always sends: questions asked while an answer streams reach Postgres in the order asked", async () => {
    const tab = await openChat()
    asked(tab.actions.ask("one"))
    asked(tab.actions.ask("two"))
    asked(tab.actions.ask("three"))
    expect(tab.shown()).toEqual(["user queued one", "user queued two", "user queued three"])
    await until(async () =>
      expect((await tab.onApi(tab.api.rows)).map(({ text }) => text)).toEqual(["one", "", "two", "", "three", ""]),
    )
    await until(() => expect(tab.shown().filter((line) => line.startsWith("user"))).toEqual(["user done one", "user done two", "user done three"]))
  })

  test("orders the conversation by Postgres position, across devices", async () => {
    const a = await openChat()
    const first = asked(a.actions.ask("one"))
    await until(() => expect(a.synced(first.answerId)).toBe(true))
    await a.onApi(a.api.askElsewhere("two"))
    const third = asked(a.actions.ask("three"))
    await until(() => expect(a.synced(third.answerId)).toBe(true))
    const b = await tabOn(openTab(a.api))
    const expected = ["user done one", "assistant streaming ", "user done two", "assistant streaming ", "user done three", "assistant streaming "]
    await until(() => expect(a.shown()).toEqual(expected))
    await until(() => expect(b.shown()).toEqual(expected))
  })

  test("another device sees the question once Postgres has it, never queued", async () => {
    const a = await openChat()
    const b = await tabOn(openTab(a.api))
    asked(a.actions.ask("hello"))
    await until(() => expect(b.shown()).toEqual(["user done hello", "assistant streaming "]))
    expect(b.queued()).toBe(0)
  })
})

describe("the agent", () => {
  test("the asking tab's own agent answers once ChatApi takes the question: the answer streams, then settles", async () => {
    const tab = await openChat()
    const { answerId } = asked(tab.actions.ask("hello"))
    const reply = await tab.onApi(tab.api.answerTo("hello"))
    reply.say("Hel")
    await until(() => expect(tab.shown()).toEqual(["user done hello", "assistant streaming Hel"]), agentWithin)
    reply.say('lo "there"')
    reply.done()
    await until(() => expect(tab.shown()).toEqual(["user done hello", 'assistant done Hello "there"']), agentWithin)
    expect(tab.store.messages.tanstack.get(answerId)).toMatchObject({ outputTokens: 20, failure: null })
    const answered = Metric.withAttributes(dispatches, {
      flow: "chat/Answer",
      door: "composer",
      outcome: "done",
    })
    await until(() => expect(tab.count(answered)).toBe(1), agentWithin)
  })

  test("a question and its answer never leave the conversation as the question syncs and the answer settles", async () => {
    const tab = await openChat()
    // Every change the window the page renders goes through, batch by batch, from before the ask.
    const batches: Array<ReadonlyArray<{ readonly type: string; readonly key: unknown }>> = []
    const watching = tab.runtime.runFork(
      Stream.runForEach(tab.store.shown.changes(), (changes) =>
        Effect.sync(() => void batches.push(changes.map(({ type, key }) => ({ type, key }))))),
    )
    const { questionId, answerId } = asked(tab.actions.ask("hello"))
    const reply = await tab.onApi(tab.api.answerTo("hello"))
    reply.say("Hel")
    reply.say("lo")
    reply.done()
    await until(() => expect(tab.shown()).toEqual(["user done hello", "assistant done Hello"]), agentWithin)
    await Effect.runPromise(Fiber.interrupt(watching))

    // A message the page shows is never deleted from it without coming back in the same batch: no frame without it,
    // so its element is never replaced.
    for (const id of [questionId, answerId]) {
      const gone = batches.filter((batch) =>
        batch.some(({ type, key }) => type === "delete" && key === id) &&
        !batch.some(({ type, key }) => type === "insert" && key === id)
      )
      expect(gone, `${id === questionId ? "the question" : "the answer"} left the window`).toEqual([])
    }
  })

  test("a resend ChatApi answers 200 dispatches the answer again, and the engine runs it once", async () => {
    const tab = await openFaulty({ ...quick, confirmWithin: "200 millis" })
    await until(() => expect(tab.connection()?.status).toBe("up"))
    // Electric holds the question back, so ChatApi takes it, the send fails, and the resend is answered 200.
    tab.shapes((shapes) => shapes.stall())
    asked(tab.actions.ask("hello"))
    await until(() => expect(tab.sentQuestions().length).toBeGreaterThanOrEqual(1))
    tab.actions.retry()
    await until(() => expect(tab.sentQuestions().length).toBeGreaterThanOrEqual(2))
    const reply = await tab.onApi(tab.api.answerTo("hello"))
    reply.say("Once.")
    reply.done()
    tab.shapes((shapes) => shapes.heal)
    tab.actions.retry()
    await until(() => expect(tab.shown()).toEqual(["user done hello", "assistant done Once."]), agentWithin)
    const done = Metric.withAttributes(dispatches, {
      flow: "chat/Answer",
      door: "composer",
      outcome: "done",
    })
    await until(() => expect(tab.count(done)).toBe(tab.sentQuestions().length), agentWithin)
    expect(tab.sentQuestions().length).toBeGreaterThanOrEqual(2)
    expect(tab.api.modelRequests("hello")).toBe(1)
  })

  test("a tab closed after ChatApi took its question, before its engine recorded the run: the next tab sends it again, and its agent answers", async () => {
    const { api, onApi } = await openChat()
    const device = nodeDevice({ agent: api })
    // The first page's engine never leads, as a worker still loading: the answer's start waits for a leader.
    const first = await tabOn(openTab(api, { ...quick, host: { ...device, engineWorker: idleWorker } }))
    const { questionId, answerId } = asked(first.actions.ask("hello"))
    // ChatApi took the question and Electric delivered it, but no run exists to answer it yet. The page closes.
    await until(() => expect(first.synced(answerId)).toBe(true))
    expect(first.shown()).toEqual(["user done hello", "assistant streaming "])
    await first.close()

    // The page opens again, and its engine leads: the outbox still holds the question, sends it again (ChatApi answers
    // 200), and the run starts.
    const second = await tabOn(openTab(api, { ...quick, host: device }))
    const reply = await onApi(api.answerTo("hello"))
    reply.say("Hi")
    reply.done()
    await until(() => expect(second.shown()).toEqual(["user done hello", "assistant done Hi"]), agentWithin)
    expect((await onApi(api.rows)).filter(({ id }) => id === questionId)).toHaveLength(1)
    expect(api.questionStatuses()).toEqual([202, 200])
  })

  test("a tab whose engine failed keeps its question in the outbox: the next page's agent answers it", async () => {
    const { api, onApi } = await openChat()
    const device = nodeDevice({ agent: api })
    const first = await tabOn(openTab(api, { ...quick, host: { ...device, engineWorker: failingWorker } }))
    await until(() => expect(first.connection()).toMatchObject({ status: "stopped" }))
    const { answerId } = asked(first.actions.ask("hello"))
    await until(() => expect(first.synced(answerId)).toBe(true))
    await first.close()

    const second = await tabOn(openTab(api, { ...quick, host: device }))
    const reply = await onApi(api.answerTo("hello"))
    reply.say("Hi")
    reply.done()
    await until(() => expect(second.shown()).toEqual(["user done hello", "assistant done Hi"]), agentWithin)
  })

  test.each(["plan_changed", "payload_changed"] as const)("a run the engine refused because the app changed under it (%s) has its answer closed, failed", async (code) => {
    const tab = await openFaulty(quick)
    // The run's end reads as refused, as a run parked under one build and resumed under the next does: its plan changed,
    // or its recorded payload no longer decodes.
    tab.engine((engine) => engine.refuseResults("chat/Answer", code))
    const { answerId } = asked(tab.actions.ask("hello"))
    await until(() => expect(tab.shown()).toEqual(["user done hello", `assistant failed ${COULDNT_ANSWER}`]), agentWithin)
    expect(tab.store.messages.tanstack.get(answerId)).toMatchObject({ failure: "unfinished" })
    const closed = Metric.withAttributes(dispatches, { flow: "chat/Close", door: "composer", outcome: "done" })
    await until(() => expect(tab.count(closed)).toBe(1), agentWithin)
  })

  test("a run that ends in any other defect leaves its answer to chat/Expire: nothing closes it", async () => {
    const tab = await openFaulty(quick)
    tab.engine((engine) => engine.refuseResults("chat/Answer", "join_mismatch"))
    asked(tab.actions.ask("hello"))
    const refused = Metric.withAttributes(dispatches, { flow: "chat/Answer", door: "composer", outcome: "error" })
    await until(() => expect(tab.count(refused)).toBe(1), agentWithin)
    expect(tab.shown()).toEqual(["user done hello", "assistant streaming "])
    expect(tab.count(Metric.withAttributes(dispatches, { flow: "chat/Close", door: "composer", outcome: "done" }))).toBe(0)
  })

  test.each([
    ["signed out", null, 401],
    ["a Guest", { ...member, role: "guest" as const }, 403],
  ] as const)("asking %s stays on the device, Not sent, and is never sent again", async (_, actor, status) => {
    const tab = await openChat({}, { actor })
    // This case exercises the server's refusal. Before the outbox takes leadership, asking instead exercises the
    // separately tested not-admitted path and never reaches the server (observable under coverage instrumentation).
    await until(async () => {
      const state = Option.getOrThrow(await tab.runtime.runPromise(Stream.runHead(tab.store.outbox.status)))
      expect(state.leader).toBe(true)
    })
    const { questionId } = asked(tab.actions.ask("hello"))
    await until(() => expect(tab.shown()).toEqual(["user unsent hello"]))
    expect(tab.queries.conversation.toArray[0]).toMatchObject({ id: questionId, sendAgain: false })
    expect(tab.store.unsent.tanstack.get(questionId)?.reason).toBe("refused")
    expect(tab.count(Metric.withAttributes(askFailures, { reason: "refused" }))).toBe(1)
    expect(tab.queued()).toBe(0)
    expect(await tab.onApi(tab.api.rows)).toEqual([])
    expect(tab.api.questionStatuses()).toEqual([status])
  })
})

describe("asking refuses", () => {
  test("a blank question or one over the limit, and keeps the draft", async () => {
    const tab = await openChat()
    tab.actions.setDraft("   ")
    expect(tab.actions.ask("   ")).toEqual({ asked: false, reason: "empty" })
    expect(tab.actions.ask("x".repeat(MAX_QUESTION_LENGTH + 1))).toEqual({ asked: false, reason: "too_long" })
    expect(tab.composer()?.draft).toBe("   ")
    expect(tab.shown()).toEqual([])
  })

  test("nothing at the limit, and asks the trimmed text", async () => {
    const tab = await openChat()
    const text = "x".repeat(MAX_QUESTION_LENGTH)
    const { questionId } = asked(tab.actions.ask(` ${text} `))
    await until(async () => expect((await tab.onApi(tab.api.rows)).find(({ id }) => id === questionId)?.text).toBe(text))
  })
})

describe("sending", () => {
  // Each fault fails the first send; the outbox sends it again (at once, on Retry), with the same ids, and Postgres
  // keeps one question.
  test.each<QuestionFault>(["unreachable", "refused", "invalid_response", "timeout", "duplicate"])(
    "a send that fails as %s is sent again with the same ids, and Postgres stores the question once",
    async (fault) => {
      const tab = await openFaulty(quick)
      tab.failNext(fault)
      const { questionId, answerId } = asked(tab.actions.ask("hello"))
      await until(() => expect(tab.sentQuestions()).toHaveLength(1))
      tab.actions.retry()
      await until(() => expect(tab.shown()).toEqual(["user done hello", "assistant streaming "]))
      const sent = tab.sentQuestions()
      expect(new Set(sent.map(({ id, answerId: answer }) => `${id} ${answer}`))).toEqual(new Set([`${questionId} ${answerId}`]))
      expect((await tab.onApi(tab.api.rows)).filter(({ id }) => id === questionId)).toHaveLength(1)
      expect(tab.count(Metric.withAttributes(syncRetries, { via: "button" }))).toBe(1)
    },
  )

  test("a resend of a question the device already has settles at once, and Postgres keeps one", async () => {
    const tab = await openFaulty(quick)
    tab.failNext("timeout")
    const { questionId } = asked(tab.actions.ask("hello"))
    // ChatApi stored it and Electric delivered it, but the send failed: the outbox still holds it.
    await until(() => expect(tab.synced(questionId)).toBe(true))
    expect(tab.store.asking.tanstack.has(questionId)).toBe(true)
    tab.actions.retry()
    await until(() => expect(tab.store.asking.tanstack.has(questionId)).toBe(false))
    expect(tab.sentQuestions()).toHaveLength(2)
    expect((await tab.onApi(tab.api.rows)).filter(({ id }) => id === questionId)).toHaveLength(1)
  })

  test.each([
    ["bad_request", "refused"],
    ["conflict", "conflict"],
    ["too_large", "too_large"],
  ] as const)("a send refused as %s stays on the device as unsent (%s); Postgres never has it", async (fault, reason) => {
    const tab = await openFaulty(quick)
    tab.failNext(fault)
    const { questionId } = asked(tab.actions.ask("hello"))
    await until(() => expect(tab.shown().at(-1)).toBe("user unsent hello"))
    expect(tab.queries.conversation.toArray.at(-1)).toMatchObject({ id: questionId, sendAgain: false })
    expect(tab.store.unsent.tanstack.get(questionId)?.reason).toBe(reason)
    expect(tab.count(Metric.withAttributes(askFailures, { reason }))).toBe(1)
    expect(tab.queued()).toBe(0)
    const rows = await tab.onApi(tab.api.rows)
    expect(rows.filter(({ id, text }) => id === questionId && text === "hello")).toHaveLength(0)
  })

  test("Edit moves an unsent question's text to the open composer and removes it; Discard removes it", async () => {
    const tab = await openFaulty(quick)
    tab.failNext("bad_request")
    const first = asked(tab.actions.ask("first"))
    await until(() => expect(tab.shown()).toEqual(["user unsent first"]))
    tab.actions.editUnsent(first.questionId)
    expect(tab.composer()).toMatchObject({ open: true, draft: "first" })
    await until(() => expect(tab.shown()).toEqual([]))
    // A conflict: Postgres holds another question under this one's id, which shows as it is, beside this one, unsent.
    tab.failNext("conflict")
    const second = asked(tab.actions.ask("second"))
    await until(() => expect(tab.shown()).toEqual(["user done another question", "assistant streaming ", "user unsent second"]))
    tab.actions.discardUnsent(second.questionId)
    await until(() => expect(tab.shown()).toEqual(["user done another question", "assistant streaming "]))
    // Gone already: nothing more happens.
    tab.actions.discardUnsent(second.questionId)
    tab.actions.editUnsent(second.questionId)
    tab.actions.resendUnsent(second.questionId)
    expect(tab.count(Metric.withAttributes(unsentActions, { action: "edit" }))).toBe(1)
    expect(tab.count(Metric.withAttributes(unsentActions, { action: "discard" }))).toBe(1)
  })

  test("a question Electric doesn't deliver in time is sent again, and shows once Electric delivers it", async () => {
    const tab = await openFaulty({ ...quick, confirmWithin: "200 millis" })
    await until(() => expect(tab.connection()?.status).toBe("up"))
    tab.shapes((shapes) => shapes.stall())
    const { questionId } = asked(tab.actions.ask("hello"))
    await until(() => expect(tab.sentQuestions().length).toBeGreaterThanOrEqual(1))
    tab.actions.retry()
    await until(() => expect(tab.sentQuestions().length).toBeGreaterThanOrEqual(2))
    expect(tab.shown()).toEqual(["user queued hello"])
    tab.shapes((shapes) => shapes.heal)
    tab.actions.retry()
    await until(() => expect(tab.shown()).toEqual(["user done hello", "assistant streaming "]))
    expect((await tab.onApi(tab.api.rows)).filter(({ id }) => id === questionId)).toHaveLength(1)
  })
})

describe("admission", () => {
  // The outbox's storage behind a switch: a write it refuses is a question the outbox couldn't take.
  const refusingDevice = () => {
    const device = nodeDevice()
    const real = device.outbox.storage
    const refusing = { now: false }
    const storage: Outbox.Options<never>["storage"] = {
      get: (key) => real.get(key),
      keys: () => real.keys(),
      delete: (key) => real.delete(key),
      clear: () => real.clear(),
      set: (key, value) => (refusing.now ? Promise.reject(new Error("quota")) : real.set(key, value)),
    }
    return { device: { ...device, outbox: { ...device.outbox, storage } }, refusing }
  }

  test("a question the outbox can't store stays unsent, and Retry sends it once the outbox can", async () => {
    const { device, refusing } = refusingDevice()
    const tab = await openChat({ host: device })
    refusing.now = true
    const { questionId } = asked(tab.actions.ask("hello"))
    await until(() => expect(tab.shown()).toEqual(["user unsent hello"]))
    expect(tab.queries.conversation.toArray[0]).toMatchObject({ sendAgain: true })
    expect(tab.count(Metric.withAttributes(askFailures, { reason: "not_admitted" }))).toBe(1)
    refusing.now = false
    tab.actions.resendUnsent(questionId)
    await until(() => expect(tab.shown()).toEqual(["user done hello", "assistant streaming "]))
    expect(tab.count(Metric.withAttributes(unsentActions, { action: "retry" }))).toBe(1)
  })

  test("a tab that can't take the outbox's lead keeps its question unsent, and Retry keeps it while it still can't", async () => {
    // Another tab holds the outbox's lock and never lets it go, even to a steal.
    const heldElsewhere: Outbox.Lock = { hold: () => Effect.never }
    const tab = await openChat({ host: nodeDevice({ lock: heldElsewhere }) })
    const { questionId } = asked(tab.actions.ask("hello"))
    expect(tab.shown()).toEqual(["user unsent hello"])
    tab.actions.resendUnsent(questionId)
    expect(tab.shown()).toEqual(["user unsent hello"])
    expect(tab.count(Metric.withAttributes(askFailures, { reason: "not_admitted" }))).toBe(2)
  })
})

describe("an unsent question Postgres has", () => {
  test("shows once, as Postgres has it, when its unsent copy outlives the send: a drop the device couldn't store", async () => {
    const tab = await openChat()
    const hello = asked(tab.actions.ask("hello"))
    await until(() => expect(tab.synced(hello.answerId)).toBe(true))
    // Retry took the question again and dropped its unsent copy, but the device couldn't store the drop (TanStack DB
    // fails a write whose coordinator tab closed mid-write), so the copy came back.
    const copy = { id: hello.questionId, answerId: hello.answerId, text: "hello", queuedAt: 1, reason: "not_admitted" } as const
    await tab.runtime.runPromise(Effect.flatMap(tab.store.unsent.insert(copy), (kept) => kept.persisted))
    expect(tab.shown()).toEqual(["user done hello", "assistant streaming "])
    expect(tab.queries.conversation.toArray.filter(({ id }) => id === hello.questionId)).toHaveLength(1)
  })
})

describe("the device store", () => {
  // One ChatApi for the test; each tab on `device` is a page load of it, and closing one then opening the next is a
  // reload.
  const faultyTabOn = async (api: TestChatApi["Service"], options: TabOptions) => {
    const runtime = openFaultyTab(api, options)
    return { ...(await tabOn(runtime)), ...(await switches(runtime)) }
  }
  // Whether a tab leads the outbox now.
  const leads = async (tab: { readonly store: ChatStore["Service"]; readonly runtime: ManagedRuntime.ManagedRuntime<never, unknown> }) =>
    Option.getOrThrow(await tab.runtime.runPromise(Stream.runHead(tab.store.outbox.status))).leader

  test("a question asked in a tab that doesn't lead is sent from it at once: it takes the lead, with the other tab open", async () => {
    const { api, onApi } = await openChat()
    const device = nodeDevice({ agent: api })
    const first = await faultyTabOn(api, { ...quick, host: device })
    const second = await tabOn(openTab(api, { ...quick, host: device }))
    await until(async () => expect(await leads(first)).toBe(true))
    first.failNext("unreachable")
    asked(first.actions.ask("handed over"))
    await until(() => expect(first.sentQuestions()).toHaveLength(1))
    // The second tab asks while the first leads: it takes the lead, then sends what the first stored and its own, in
    // the order asked.
    asked(second.actions.ask("from the second tab"))
    asked(second.actions.ask("and again"))
    await until(async () =>
      expect((await onApi(api.rows)).filter(({ text }) => text !== "").map(({ text }) => text)).toEqual([
        "handed over",
        "from the second tab",
        "and again",
      ]), 10_000)
    expect([await leads(first), await leads(second)]).toEqual([false, true])
    await until(() => expect(second.shown().filter((line) => line.startsWith("user unsent"))).toEqual([]))
  })

  test("the tab that gets focus leads the outbox at once, and the one that led leads again once that tab closes", async () => {
    const { api, onApi } = await openChat()
    const device = nodeDevice({ agent: api })
    const first = await tabOn(openTab(api, { ...quick, host: device }))
    const second = await tabOn(openTab(api, { ...quick, host: device }))
    await until(async () => expect(await leads(first)).toBe(true))
    expect(await leads(second)).toBe(false)
    const focus = new EventTarget()
    await second.runtime.runPromise(Scope.provide(bindConnectivity(focus), await second.runtime.runPromise(Scope.make())))

    // Something in the second tab takes focus, such as its composer: it leads, and what it asks is admitted at once.
    focus.dispatchEvent(new Event("focusin"))
    await until(async () => expect([await leads(first), await leads(second)]).toEqual([false, true]))
    const { questionId } = asked(second.actions.ask("hello"))
    await until(() => expect(second.shown()[0]).toMatch(/^user (queued|done) hello$/))
    expect(second.store.unsent.tanstack.has(questionId)).toBe(false)
    await until(async () => expect((await onApi(api.rows)).map(({ id }) => id)).toContain(questionId))
    // Focus again changes nothing; the window's own focus counts too.
    focus.dispatchEvent(new Event("focus"))
    expect(await leads(second)).toBe(true)

    // The second tab closes: the first, waiting for the lock again, leads.
    await second.close()
    await until(async () => expect(await leads(first)).toBe(true))
  })

  test("a reload restores the conversation from the device before Electric answers", async () => {
    const { api } = await openChat()
    const device = nodeDevice()
    const first = await tabOn(openTab(api, { ...quick, host: device }))
    const { answerId } = asked(first.actions.ask("hello"))
    await until(() => expect(first.synced(answerId)).toBe(true))
    await until(() => expect(device.stored("chat-messages")).toBe(2))
    await first.close()
    // The reload finds Electric unreachable: the conversation is there anyway, and the pill says so in time.
    const second = await tabOn(openFaultyTab(api, { ...quick, host: device }, (shapes) => shapes.down()))
    await until(() => expect(second.history()?.opened).toBe(true))
    expect(second.shown()).toEqual(["user done hello", "assistant streaming "])
    await until(() => expect(second.connection()).toMatchObject({ status: "offline", retry: true }))
  })

  test("a question queued on one tab is restored by the next and sent once", async () => {
    const { api, onApi } = await openChat()
    const device = nodeDevice()
    const first = await faultyTabOn(api, { ...quick, host: device })
    first.failNext("unreachable")
    const { questionId } = asked(first.actions.ask("queued"))
    await until(() => expect(first.sentQuestions()).toHaveLength(1))
    await first.close()
    const second = await tabOn(openTab(api, { ...quick, host: device }))
    await until(() => expect(second.shown()).toEqual(["user done queued", "assistant streaming "]))
    expect((await onApi(api.rows)).filter(({ id }) => id === questionId)).toHaveLength(1)
  })

  test("an unsent question survives a reload", async () => {
    const { api } = await openChat()
    const device = nodeDevice()
    const first = await faultyTabOn(api, { ...quick, host: device })
    first.failNext("bad_request")
    asked(first.actions.ask("kept"))
    await until(() => expect(first.shown()).toEqual(["user unsent kept"]))
    await until(() => expect(device.stored("chat-unsent")).toBe(1))
    await first.close()
    const second = await tabOn(openTab(api, { ...quick, host: device }))
    await until(() => expect(second.shown()).toEqual(["user unsent kept"]))
  })

  test("an unsent question Edit took back stays gone after a reload", async () => {
    const { api } = await openChat()
    const device = nodeDevice()
    const first = await faultyTabOn(api, { ...quick, host: device })
    first.failNext("conflict")
    const { questionId } = asked(first.actions.ask("taken"))
    await until(() => expect(first.shown().at(-1)).toBe("user unsent taken"))
    await until(() => expect(device.stored("chat-unsent")).toBe(1))
    first.actions.editUnsent(questionId)
    await until(() => expect(first.shown()).not.toContain("user unsent taken"))
    // Sent again, under a new id.
    const again = asked(first.actions.ask(first.composer()!.draft))
    await until(() => expect(first.synced(again.answerId)).toBe(true))
    await until(() => expect(device.stored("chat-unsent")).toBe(0))
    await first.close()
    const second = await tabOn(openTab(api, { ...quick, host: device }))
    await until(() => expect(second.history()?.opened).toBe(true))
    expect(second.shown()).not.toContain("user unsent taken")
  })
})

describe("the connection pill", () => {
  test("hides while online; shows Offline at once on the browser's offline event, with the questions queued", async () => {
    const tab = await openFaulty(quick)
    const target = new EventTarget()
    await tab.runtime.runPromise(Scope.provide(bindConnectivity(target), await tab.runtime.runPromise(Scope.make())))
    await until(() => expect(tab.connection()).toMatchObject({ status: "up" }))
    target.dispatchEvent(new Event("offline"))
    expect(tab.connection()).toMatchObject({ status: "offline", retry: false })
    expect(tab.count(Metric.withAttributes(connectionDrops, { reason: "offline" }))).toBe(1)
    tab.failNext("unreachable")
    asked(tab.actions.ask("one"))
    expect(tab.count(Metric.withAttributes(questionsAsked, { queued: "true" }))).toBe(1)
    expect(tab.queued()).toBe(1)
    // Back online: chat sends at once, and the pill hides once the question reached Postgres.
    target.dispatchEvent(new Event("online"))
    expect(tab.count(Metric.withAttributes(syncRetries, { via: "online" }))).toBe(1)
    await until(() => expect(tab.connection()).toMatchObject({ status: "up" }))
    expect(tab.queued()).toBe(0)
    expect(tab.shown()).toEqual(["user done one", "assistant streaming "])
  })

  test("opens offline when the browser is offline at boot", async () => {
    const tab = await openChat({ host: nodeDevice({ isOnline: () => false }) })
    expect(tab.connection()).toMatchObject({ status: "offline", retry: false })
  })

  test("an engine worker that fails shows that Smithers can't run here, for good, and counts it", async () => {
    const tab = await openChat({ host: nodeDevice({ engineWorker: failingWorker }) })
    await until(() => expect(tab.connection()).toMatchObject({ status: "stopped", retry: false }))
    expect(tab.count(Metric.withAttributes(connectionDrops, { reason: "engine" }))).toBe(1)
    // Going offline and back changes nothing: only a reload can help.
    tab.actions.retry()
    expect(tab.connection()).toMatchObject({ status: "stopped" })
  })

  test("shape requests failing for unreachableAfter show Offline with Retry, and it hides once they succeed", async () => {
    const tab = await openFaulty(quick)
    await until(() => expect(tab.connection()?.status).toBe("up"))
    // Down from the next request on; a change ends the live request Electric holds, so the next one goes.
    tab.shapes((shapes) => shapes.down())
    await tab.onApi(tab.api.askElsewhere("while down"))
    await until(() => expect(tab.connection()).toMatchObject({ status: "offline", retry: true }))
    expect(tab.count(Metric.withAttributes(connectionDrops, { reason: "unreachable" }))).toBe(1)
    tab.shapes((shapes) => shapes.heal)
    await until(() => expect(tab.connection()?.status).toBe("up"))
  })

  test("sends failing for unreachableAfter show Offline with Retry, and Retry sends at once", async () => {
    const tab = await openFaulty(quick)
    await until(() => expect(tab.connection()?.status).toBe("up"))
    tab.failNext("unreachable")
    asked(tab.actions.ask("hello"))
    await until(() => expect(tab.connection()).toMatchObject({ status: "offline", retry: true }))
    tab.actions.retry()
    await until(() => expect(tab.connection()?.status).toBe("up"))
    expect(tab.shown()).toEqual(["user done hello", "assistant streaming "])
  })

  test.each([
    ["refuse", "refused"],
    ["corrupt", "invalid_response"],
  ] as const)("Electric stopping the shape (%s) shows Sync failed with Retry, which restarts it", async (fault, reason) => {
    const tab = await openFaulty(quick)
    // The device is synced and following Postgres live: a change after this point reaches it as a live response.
    await tab.onApi(tab.api.askElsewhere("before the fault"))
    await until(() => expect(tab.shown()).toContain("user done before the fault"))
    tab.shapes((shapes) => (fault === "refuse" ? shapes.refuse(400, "live") : shapes.corrupt("live")))
    await tab.onApi(tab.api.askElsewhere("wake the shape"))
    await until(() => expect(tab.connection()).toMatchObject({ status: "failed", retry: true }))
    expect(tab.count(Metric.withAttributes(connectionDrops, { reason }))).toBe(1)
    tab.shapes((shapes) => shapes.heal)
    tab.actions.retry()
    await until(() => expect(tab.connection()?.status).toBe("up"))
    // The shape follows Postgres again.
    await tab.onApi(tab.api.askElsewhere("after the restart"))
    await until(() => expect(tab.shown()).toContain("user done after the restart"))
  })
})

describe("the window", () => {
  test("shows the most recent messages; Load earlier shows the page before them at once, until the device has no more", async () => {
    const tab = await openChat({ pageSize: 2 })
    for (const text of ["one", "two"]) {
      const { answerId } = asked(tab.actions.ask(text))
      await until(() => expect(tab.synced(answerId)).toBe(true))
    }
    await until(() => expect(tab.history()).toMatchObject({ opened: true, earlier: true, limit: 2 }))
    expect(tab.shown()).toEqual(["user done two", "assistant streaming "])
    tab.actions.loadEarlier()
    expect(tab.history()).toMatchObject({ earlier: false, limit: 4 })
    await until(() =>
      expect(tab.shown()).toEqual(["user done one", "assistant streaming ", "user done two", "assistant streaming "]),
    )
    // Nothing earlier: nothing changes.
    tab.actions.loadEarlier()
    expect(tab.history()).toMatchObject({ limit: 4 })
    expect(tab.count(historyLoads)).toBe(1)
  })

  // The rail summarizes what the window shows. Before, a device that opened a long conversation started one
  // `timeline/summarize` run per message it held, in turn, which kept its engine and store busy for minutes and starved
  // its other tabs' sync (docs/work/local-first-conflicts.md, "stale tab").
  test("a device opening a long conversation summarizes only the messages its window shows", async () => {
    const first = await openChat()
    const asked: Array<{ readonly id: string; readonly text: string }> = []
    for (const text of ["one", "two", "three"]) {
      const { questionId } = await first.onApi(first.api.askElsewhere(text))
      asked.push({ id: questionId, text })
    }
    await until(() => expect(first.synced(asked[2]!.id)).toBe(true))
    // Another device opens it, its window two messages: the last question and its answer.
    const runtime = openTab(first.api, { pageSize: 2 })
    const second = await tabOn(runtime)
    await until(() => expect(second.shown()).toEqual(["user done three", "assistant streaming "]))
    const requests = await runtime.runPromise(Effect.service(TabRequests))
    const summarized = ({ id, text }: { readonly id: string; readonly text: string }) =>
      Option.isSome(runtime.runSync(requests.doorOf(`timeline-${revisionOf({ id, role: "user", text })}`)))
    await until(() => expect(summarized(asked[2]!)).toBe(true), agentWithin)
    expect(asked.map(summarized)).toEqual([false, false, true])
  })
})

describe("the composer", () => {
  test("opens, hides and keeps its draft", async () => {
    const tab = await openChat()
    expect(tab.composer()).toMatchObject({ open: false, draft: "" })
    tab.actions.openComposer("button")
    tab.actions.setDraft("half a thought")
    expect(tab.composer()).toMatchObject({ open: true, draft: "half a thought" })
    tab.actions.closeComposer()
    expect(tab.composer()).toMatchObject({ open: false, draft: "half a thought" })
  })

  test("counts opens by how, and not an open composer opened again", async () => {
    const tab = await openChat()
    tab.actions.openComposer("button")
    tab.actions.openComposer("button")
    expect(tab.count(Metric.withAttributes(composerOpens, { via: "button" }))).toBe(1)
  })

  test("belongs to one tab", async () => {
    const a = await openChat()
    const b = await tabOn(openTab(a.api))
    a.actions.openComposer("button")
    a.actions.setDraft("mine")
    expect(b.composer()).toMatchObject({ open: false, draft: "" })
  })
})

describe("time to the first answer text", () => {
  test("is recorded once, when the answer first shows text", async () => {
    const tab = await openChat()
    asked(tab.actions.ask("hello"))
    const reply = await tab.onApi(tab.api.answerTo("hello"))
    reply.say("H")
    await until(() => expect(tab.runtime.runSync(Metric.value(firstAnswerText)).count).toBe(1), agentWithin)
    reply.say("ello")
    reply.done()
    await until(() => expect(tab.shown().at(-1)).toBe("assistant done Hello"), agentWithin)
    expect(tab.runtime.runSync(Metric.value(firstAnswerText)).count).toBe(1)
  })

  test("is not recorded for an answer that failed before any text", async () => {
    const tab = await openChat()
    asked(tab.actions.ask("hello"))
    ;(await tab.onApi(tab.api.answerTo("hello"))).fail()
    await until(() => expect(tab.shown().at(-1)).toBe(`assistant failed ${COULDNT_ANSWER}`), agentWithin)
    expect(tab.runtime.runSync(Metric.value(firstAnswerText)).count).toBe(0)
  })
})

describe("the page", () => {
  test("a page restored from the back/forward cache reloads; an ordinary pageshow doesn't", async () => {
    const tab = await openChat()
    const target = new EventTarget()
    const scope = await tab.runtime.runPromise(Scope.make())
    await tab.runtime.runPromise(Scope.provide(bindConnectivity(target), scope))
    target.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: false }))
    expect(tab.api.reloads()).toBe(0)
    target.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }))
    expect(tab.api.reloads()).toBe(1)
    await tab.runtime.runPromise(Scope.close(scope, Exit.void))
    target.dispatchEvent(new Event("offline"))
    expect(tab.connection()?.status).toBe("up")
  })

  test("reload asks the page to reload", async () => {
    const tab = await openChat()
    tab.actions.reload()
    expect(tab.api.reloads()).toBe(1)
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
    // `handled`: the element the key was pressed in already handled it, as the command menu does with Esc.
    const press = (init: Parameters<typeof keydown>[0], handled = false) => {
      const event = keydown(init)
      if (handled) event.preventDefault()
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
    tab.actions.openComposer("button")
    tab.actions.setDraft("kept")
    expect(tab.press({ key: "Escape" })).toBe(false)
    expect(tab.composer()).toMatchObject({ open: false, draft: "kept" })
  })

  test("an Esc something inside already handled, such as the command menu closing, keeps the composer open", async () => {
    const tab = await bound()
    tab.actions.openComposer("button")
    tab.press({ key: "Escape" }, true)
    expect(tab.composer()?.open).toBe(true)
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
