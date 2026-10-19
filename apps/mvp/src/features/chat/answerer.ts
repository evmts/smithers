import { Clock, Effect, Stream } from "effect"
import { AppStore } from "../../livestore/AppStore"
import { streamAnswer, type ChatTurn } from "./api"
import { awaiting$, conversation$ } from "./queries"
import { events } from "./schema"

const PROGRESS_EVERY = "150 millis"
// What the model sees is bounded by what ChatApi accepts: 40 messages of at most 32,000 characters, in 512 KB.
const MAX_EXCHANGES = 19
const MAX_MESSAGE_LENGTH = 32_000
const MAX_HISTORY_LENGTH = 100_000

// What the model sees: the most recent finished exchanges before this answer that fit the limits, then the
// question it answers. A question whose answer failed is left out, or the model would answer it instead; an
// exchange too long to send is left out whole.
export const turnsBefore = (
  conversation: ReadonlyArray<{ id: string; role: "user" | "assistant"; text: string; status: string }>,
  answerId: string,
): Array<ChatTurn> => {
  const exchanges: Array<readonly [string, string]> = []
  for (let index = 0; index < conversation.length; index++) {
    const question = conversation[index]
    const reply = conversation[index + 1]
    if (question?.role !== "user" || reply?.role !== "assistant") continue
    if (reply.id === answerId) {
      const kept: Array<ChatTurn> = []
      let length = question.text.length
      for (const [asked, answered] of exchanges.reverse()) {
        if (kept.length / 2 === MAX_EXCHANGES || length + asked.length + answered.length > MAX_HISTORY_LENGTH) break
        if (asked.length > MAX_MESSAGE_LENGTH || answered.length > MAX_MESSAGE_LENGTH) continue
        length += asked.length + answered.length
        kept.unshift({ role: "user", content: asked }, { role: "assistant", content: answered })
      }
      return [...kept, { role: "user", content: question.text }]
    }
    if (reply.status === "done") exchanges.push([question.text, reply.text])
  }
  return []
}

// Streams one answer into the store: what arrived, a few commits a second, then completed. Any failure fails it.
const answer = (chatUrl: string, answerId: string) =>
  Effect.gen(function* () {
    const history = turnsBefore(yield* AppStore.query(conversation$), answerId)
    yield* Effect.logInfo("answer started")
    yield* streamAnswer(chatUrl, answerId, history).pipe(
      Stream.groupedWithin(Number.MAX_SAFE_INTEGER, PROGRESS_EVERY),
      Stream.runForEach((pieces) => AppStore.commit(events.answerDelta({ id: answerId, text: pieces.join("") }))),
    )
    yield* AppStore.commit(events.answerCompleted({ id: answerId }))
    yield* Effect.logInfo("answer completed")
  }).pipe(
    Effect.catchCause((cause) =>
      AppStore.commit(events.answerFailed({ id: answerId })).pipe(Effect.andThen(Effect.logWarning("answer failed", cause))),
    ),
    Effect.annotateLogs({ answerId }),
  )

// This tab's answerer: fetches the answer to every question this tab asks, for as long as the tab is open.
// Every device sees the answer grow through sync.
export const answerQuestions = (chatUrl: string) =>
  Effect.gen(function* () {
    const { store } = yield* AppStore
    // An answer this tab was fetching before a reload can't resume, and may reach the store after boot.
    const bootedAt = yield* Clock.currentTimeMillis
    const started = new Set<string>()
    yield* store.subscribeStream(awaiting$(store.sessionId)).pipe(
      Stream.flatMap((rows) => Stream.fromIterable(rows)),
      Stream.filter(({ id }) => !started.has(id) && Boolean(started.add(id))),
      Stream.mapEffect(
        ({ id, createdAt }) =>
          createdAt < bootedAt
            ? AppStore.commit(events.answerFailed({ id })).pipe(
                Effect.andThen(Effect.logInfo("answer from before this page loaded failed", { answerId: id })),
              )
            : answer(chatUrl, id),
        { concurrency: "unbounded" },
      ),
      Stream.runDrain,
      Effect.annotateLogs({ feature: "chat", session: store.sessionId }),
    )
  })
