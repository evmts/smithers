import { Clock, Effect, Metric, Option, Ref } from "effect"
import * as Collections from "../../lib/collections"
import { composerOpens, questionsAsked, syncRetries } from "./metrics"
import { COMPOSER, type Composer, HISTORY, PENDING_POSITION, QUESTION_MAX_LENGTH, SYNC } from "./schema"
import { ChatStore, loadWindow, timeFirstText } from "./store"

// What a person does. Every action is an Effect that finishes synchronously: a frontend runs it with the app
// runtime's `runSync` (the web app through `useApp().run`), so its writes show before the event handler returns.
// Slow work an action starts, asking ChatApi, runs in the messages collection's `onInsert` on the same runtime.

/** How a person reached the composer. */
export type Via = "shortcut" | "button"

const composerNow = Effect.gen(function* () {
  const { composer } = yield* ChatStore
  return Option.getOrThrow(yield* Collections.get(composer, COMPOSER))
})

const changeComposer = (recipe: (composer: Composer) => void) =>
  Effect.gen(function* () {
    const { composer } = yield* ChatStore
    yield* Collections.update(composer, COMPOSER, recipe)
  }).pipe(Effect.orDie)

/** Shows the composer. Counted only when it was hidden. */
export const openComposer = (via: Via) =>
  Effect.gen(function* () {
    if ((yield* composerNow).open) return
    yield* changeComposer((composer) => {
      composer.open = true
    })
    yield* Metric.update(Metric.withAttributes(composerOpens, { via }), 1)
  })

/** Hides the composer. The draft stays. */
export const closeComposer = changeComposer((composer) => {
  composer.open = false
})

export const toggleComposer = (via: Via) =>
  Effect.flatMap(composerNow, ({ open }) => (open ? closeComposer : openComposer(via)))

export const setDraft = (draft: string) =>
  changeComposer((composer) => {
    composer.draft = draft
  })

export type AskResult =
  | { readonly asked: true; readonly questionId: string; readonly answerId: string }
  | { readonly asked: false; readonly reason: "empty" | "too_long" }

/**
 * Asks Smithers `text`, trimmed. The question and an empty streaming answer show at once and the draft clears;
 * ChatApi is asked in the background (store.ts). A blank question or one over `QUESTION_MAX_LENGTH` changes nothing,
 * so the draft stays.
 */
export const ask = (text: string): Effect.Effect<AskResult, never, ChatStore> =>
  Effect.gen(function* () {
    const question = text.trim()
    if (question === "") return { asked: false, reason: "empty" } as const
    if (question.length > QUESTION_MAX_LENGTH) return { asked: false, reason: "too_long" } as const
    const store = yield* ChatStore
    const questionId = crypto.randomUUID()
    const answerId = crypto.randomUUID()
    const position = PENDING_POSITION + 2 * (yield* Ref.getAndUpdate(store.asked, (asked) => asked + 1))
    const askedAt = yield* Clock.currentTimeMillis
    const at = new Date(askedAt).toISOString()
    const unsettled = { failure: null, modelId: null, stopReason: null, inputTokens: null, outputTokens: null, attempts: 0 }
    yield* Collections.insert(store.asks, { id: answerId })
    yield* Collections.insert(store.messages, [
      { ...unsettled, id: questionId, role: "user", text: question, status: "done", questionId: null, position, createdAt: at, updatedAt: at },
      { ...unsettled, id: answerId, role: "assistant", text: "", status: "streaming", questionId, position: position + 1, createdAt: at, updatedAt: at },
    ])
    yield* setDraft("")
    yield* Metric.update(questionsAsked, 1)
    yield* Effect.forkIn(timeFirstText(answerId, askedAt), store.scope, { startImmediately: true })
    yield* Effect.logInfo("question asked").pipe(
      Effect.annotateLogs({ questionId, answerId, "question.length": question.length }),
    )
    return { asked: true, questionId, answerId } as const
  }).pipe(
    Effect.orDie,
    Effect.annotateLogs({ feature: "chat" }),
  )

/**
 * Loads the page of messages before the ones shown: the window grows by a page at once, `history.loading` until the
 * rows arrive (store.ts `loadWindow`). Does nothing while a page is loading or when there may be nothing earlier.
 */
export const loadEarlier = Effect.gen(function* () {
  const store = yield* ChatStore
  const now = Option.getOrThrow(yield* Collections.get(store.history, HISTORY))
  if (!now.earlier || now.loading) return
  const limit = now.limit + store.pageSize
  yield* Collections.update(store.history, HISTORY, (history) => {
    history.limit = limit
    history.loading = true
  })
  yield* Effect.forkIn(loadWindow(limit, now.limit), store.scope, { startImmediately: true })
}).pipe(Effect.orDie)

/** How a person asked to sync again: the Try again button, or the browser coming back online. */
export type RetryVia = "button" | "online"

/**
 * Syncs again now: every shape request waiting out its backoff retries at once. A failed sync becomes `syncing`, with
 * `openWithin` to succeed, and a shape Electric gave up on restarts from where it stopped.
 */
export const retrySync = (via: RetryVia) =>
  Effect.gen(function* () {
    const store = yield* ChatStore
    yield* store.reconnect
    if (Option.getOrThrow(yield* Collections.get(store.sync, SYNC)).status !== "failed") return
    yield* Collections.update(store.sync, SYNC, (sync) => {
      sync.status = "syncing"
      sync.reason = null
      sync.httpStatus = null
    })
    yield* store.watchSync
    yield* store.restart.open
    yield* Metric.update(Metric.withAttributes(syncRetries, { via }), 1)
    yield* Effect.logInfo("chat sync retried").pipe(Effect.annotateLogs({ via }))
  }).pipe(Effect.orDie, Effect.annotateLogs({ feature: "chat" }))
