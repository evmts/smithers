import { Clock, Effect, Metric, Option, Ref, type Types } from "effect"
import { MAX_QUESTION_LENGTH } from "./contract"
import { askFailures, composerOpens, historyLoads, questionsAsked, syncRetries, unsentActions } from "./metrics"
import { type Asking, COMPOSER, type Composer, CONNECTION, HISTORY } from "./schema"
import { ChatStore, keepUnsent, timeFirstText } from "./store"

// What a person does, as Effects that finish synchronously. The chat layer (chat.ts) binds each to a plain function
// that frontends call, so an action's writes show before its event handler returns. Sending runs in the outbox, never
// in an action: an action only writes to this device.

/** How a person reached the composer. */
export type Via = "shortcut" | "button"

const composerNow = Effect.gen(function* () {
  const { composer } = yield* ChatStore
  return Option.getOrThrow(yield* composer.get(COMPOSER))
})

const changeComposer = (recipe: (composer: Types.Mutable<Composer>) => void) =>
  Effect.gen(function* () {
    const { composer } = yield* ChatStore
    yield* composer.update(COMPOSER, recipe)
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

// A question the outbox couldn't take stays on the device as unsent, so it is never lost.
const notAdmitted = (row: Asking) =>
  Effect.gen(function* () {
    const store = yield* ChatStore
    yield* keepUnsent(store.unsent, row, "not_admitted")
    yield* Metric.update(Metric.withAttributes(askFailures, { reason: "not_admitted" }), 1)
    yield* Effect.logWarning("question not admitted").pipe(Effect.annotateLogs({ questionId: row.id }))
  })

/**
 * Puts a question into the outbox: its row shows at once, queued until Postgres has it. A question the outbox can't
 * take, now or when it stores it, stays unsent (`not_admitted`). Succeeds with whether the outbox took it now.
 */
const admit = (row: Asking) =>
  Effect.gen(function* () {
    const store = yield* ChatStore
    const write = yield* store.outbox.transact("ask", { idempotencyKey: row.id }, Effect.asVoid(store.asking.insert(row)))
    yield* write.admitted.pipe(Effect.catch(() => notAdmitted(row)), Effect.forkIn(store.scope))
    return true
  }).pipe(
    Effect.catchTag("NotAdmitted", () => Effect.as(notAdmitted(row), false)),
    Effect.orDie,
  )

export type AskResult =
  | { readonly asked: true; readonly questionId: string; readonly answerId: string }
  | { readonly asked: false; readonly reason: "empty" | "too_long" }

/**
 * Asks Smithers `text`, trimmed: the question shows at once at the end of the conversation and the draft clears,
 * online or not, while an answer streams or not. The outbox sends it (store.ts). A blank question or one over
 * `MAX_QUESTION_LENGTH` changes nothing, so the draft stays.
 */
export const ask = (text: string): Effect.Effect<AskResult, never, ChatStore> =>
  Effect.gen(function* () {
    const question = text.trim()
    if (question === "") return { asked: false, reason: "empty" } as const
    if (question.length > MAX_QUESTION_LENGTH) return { asked: false, reason: "too_long" } as const
    const store = yield* ChatStore
    const questionId = crypto.randomUUID()
    const answerId = crypto.randomUUID()
    const askedAt = yield* Clock.currentTimeMillis
    const queuedAt = yield* Ref.updateAndGet(store.lastQueuedAt, (last) => Math.max(askedAt, last + 1))
    const queued = Option.getOrThrow(yield* store.connection.get(CONNECTION)).status !== "up"
    yield* admit({ id: questionId, answerId, text: question, queuedAt, v: 1 }).pipe(
      Effect.withSpan("chat.ask", { attributes: { questionId, answerId, "question.length": question.length } }),
    )
    yield* setDraft("")
    yield* Metric.update(Metric.withAttributes(questionsAsked, { queued: String(queued) }), 1)
    yield* Effect.forkIn(timeFirstText(answerId, askedAt), store.scope, { startImmediately: true })
    yield* Effect.logInfo("question asked").pipe(
      Effect.annotateLogs({ questionId, answerId, "question.length": question.length, queued }),
    )
    return { asked: true, questionId, answerId } as const
  }).pipe(Effect.annotateLogs({ feature: "chat" }))

const unsentRow = (id: string) =>
  Effect.gen(function* () {
    const { unsent } = yield* ChatStore
    return yield* unsent.get(id)
  })

const dropUnsent = (id: string, action: "edit" | "discard" | "retry") =>
  Effect.gen(function* () {
    const { unsent } = yield* ChatStore
    yield* unsent.delete(id).pipe(Effect.orDie)
    yield* Metric.update(Metric.withAttributes(unsentActions, { action }), 1)
    yield* Effect.logInfo("unsent question handled").pipe(Effect.annotateLogs({ questionId: id, action }))
  })

/** Edit on an unsent question: its text goes to the composer, which opens, and the question goes. */
export const editUnsent = (id: string) =>
  Effect.gen(function* () {
    const row = yield* unsentRow(id)
    if (Option.isNone(row)) return
    yield* setDraft(row.value.text)
    yield* openComposer("button")
    yield* dropUnsent(id, "edit")
  }).pipe(Effect.annotateLogs({ feature: "chat" }))

/** Discard on an unsent question: it goes. */
export const discardUnsent = (id: string) =>
  Effect.gen(function* () {
    if (Option.isNone(yield* unsentRow(id))) return
    yield* dropUnsent(id, "discard")
  }).pipe(Effect.annotateLogs({ feature: "chat" }))

/** Retry on a question the outbox couldn't take: the outbox takes it again, under its own ids, where it was. */
export const resendUnsent = (id: string) =>
  Effect.gen(function* () {
    const row = yield* unsentRow(id)
    if (Option.isNone(row)) return
    const { answerId, text, queuedAt } = row.value
    // The unsent row goes only once the outbox has the question again, so it never vanishes in between: until then
    // it hides the queued row.
    if (yield* admit({ id, answerId, text, queuedAt, v: 1 })) yield* dropUnsent(id, "retry")
  }).pipe(Effect.annotateLogs({ feature: "chat" }))

/**
 * Sends every question the outbox couldn't take, in the order asked: what a tab does when it comes to lead the outbox,
 * so a question asked while another tab led is sent once this one leads.
 */
export const resendUnadmitted = Effect.gen(function* () {
  const { unsent } = yield* ChatStore
  const waiting = (yield* unsent.toArray).filter(({ reason }) => reason === "not_admitted")
  const ordered = [...waiting].sort((left, right) => left.queuedAt - right.queuedAt)
  yield* Effect.forEach(ordered, ({ id }) => resendUnsent(id), { discard: true })
})

/** Retry on an answer Smithers couldn't give: asks its question again, under new ids. */
export const retryAnswer = (answerId: string) =>
  Effect.gen(function* () {
    const { messages } = yield* ChatStore
    const answer = yield* messages.get(answerId)
    if (Option.isNone(answer) || answer.value.questionId === null) return
    // Postgres inserts a question and its answer in one statement, and Electric delivers them together.
    const question = Option.getOrThrow(yield* messages.get(answer.value.questionId))
    yield* ask(question.text)
  })

/**
 * Shows the page of messages before the ones shown. The device has them all, so the window moves without the network;
 * TanStack DB applies it a moment later.
 */
export const loadEarlier = Effect.gen(function* () {
  const store = yield* ChatStore
  const now = Option.getOrThrow(yield* store.history.get(HISTORY))
  if (!now.earlier) return
  const limit = now.limit + store.pageSize
  yield* store.latest.setWindow({ limit }).pipe(Effect.orDie, Effect.forkIn(store.scope, { startImmediately: true }))
  yield* store.history.update(HISTORY, (history) => {
    history.limit = limit
    history.earlier = (store.conversation.tanstack.size as number) > limit
  })
  yield* Metric.update(historyLoads, 1)
}).pipe(Effect.orDie)

/** How a person asked to sync and send now: the Retry button, or the browser coming back online. */
export type RetryVia = "button" | "online"

/** Syncs and sends now: every shape request and write waiting out its backoff goes at once. */
export const retry = (via: RetryVia) =>
  Effect.gen(function* () {
    const store = yield* ChatStore
    if (via === "online") yield* store.browserOffline(false)
    yield* store.retryNow
    yield* Metric.update(Metric.withAttributes(syncRetries, { via }), 1)
    yield* Effect.logInfo("chat retried").pipe(Effect.annotateLogs({ via }))
  }).pipe(Effect.annotateLogs({ feature: "chat" }))

/** The browser went offline: the pill says so at once. */
export const wentOffline = Effect.gen(function* () {
  const store = yield* ChatStore
  yield* store.browserOffline(true)
})
