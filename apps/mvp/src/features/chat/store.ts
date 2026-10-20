import { Clock, Context, Duration, Effect, FiberHandle, Latch, Layer, Metric, Option, Ref, type Scope, Stream } from "effect"
import { HttpClient } from "effect/http"
import * as Collections from "../../lib/collections"
import { postQuestion, QuestionNotTaken } from "./api"
import { askFailures, firstAnswerText, historyLoads, syncFailures } from "./metrics"
import {
  composerQuery,
  conversationQuery,
  historyQuery,
  pendingQuery,
  recentQuery,
  syncQuery,
  waitingQuery,
} from "./queries"
import {
  type Ask,
  COMPOSER,
  type Composer,
  type FailedMessage,
  HISTORY,
  type History,
  type Message,
  PAGE_SIZE,
  PENDING_POSITION,
  SYNC,
  type SyncFailure,
  type SyncHealth,
} from "./schema"

/** Where this tab reaches ChatApi, and its deadlines. */
export interface ChatConfig {
  /** Electric's shape for `messages`, served by ChatApi's proxy, which fixes the table. */
  readonly shapeUrl: string
  /** `POST /api/questions`. */
  readonly questionsUrl: string
  /** How long ChatApi gets to answer `POST /api/questions`, its body included. Default 15 s. */
  readonly answerWithin?: Duration.Input
  /** How long Electric gets to deliver a question ChatApi took before the ask counts as failed. Default 15 s. */
  readonly confirmWithin?: Duration.Input
  /**
   * How long sync may go without a shape request succeeding, at open or once one failed, before it counts as failed.
   * Default 10 s.
   */
  readonly openWithin?: Duration.Input
  /** How long a failed shape request waits before it retries. Default 1 s, doubling to 10 s. */
  readonly backoff?: Collections.Backoff
  /** How many of the most recent messages the conversation loads, and how many more "Load earlier" adds. Default 50. */
  readonly pageSize?: number
  /** The fetch the shape stream uses. Defaults to the global one; `POST /api/questions` goes through `HttpClient`. */
  readonly fetch?: typeof globalThis.fetch
}

/** ChatApi on `origin`, as the browser reaches it. */
export const chatConfig = (origin: string, options: Omit<ChatConfig, "shapeUrl" | "questionsUrl"> = {}): ChatConfig => ({
  shapeUrl: `${origin}/api/shapes/messages`,
  questionsUrl: `${origin}/api/questions`,
  ...options,
})

/**
 * Chat's state for one tab:
 * - `messages`: the conversation in Postgres, synced by Electric on demand: only what `recent` asks for, plus every
 *   change after the tab opened. Inserting into it asks ChatApi.
 * - `recent`: the window of most recent messages Postgres has, which this tab loads and shows; "Load earlier" widens
 *   it. `pending`: the rows this tab inserted until Postgres stores them.
 * - `composer`, `asks`, `failures`, `sync`, `history`: this tab's own state, in memory.
 * - `conversation`, `composerState`, `waiting`, `syncState`, `historyState`: what frontends read (queries.ts).
 * - `scope`: where background work an action starts runs, until the store closes.
 * - `restart`, `reconnect`, `watchSync`: what `retrySync` uses to restart a failed sync.
 */
export class ChatStore extends Context.Service<
  ChatStore,
  {
    readonly messages: Collections.ElectricCollection<Message>
    readonly recent: Effect.Success<ReturnType<typeof recentQuery>>
    readonly pending: Effect.Success<ReturnType<typeof pendingQuery>>
    readonly composer: Collections.LocalCollection<Composer, string>
    readonly asks: Collections.LocalCollection<Ask, string>
    readonly failures: Collections.LocalCollection<FailedMessage, string>
    readonly sync: Collections.LocalCollection<SyncHealth, string>
    readonly history: Collections.LocalCollection<History, string>
    readonly conversation: Effect.Success<ReturnType<typeof conversationQuery>>
    readonly composerState: Effect.Success<ReturnType<typeof composerQuery>>
    readonly waiting: Effect.Success<ReturnType<typeof waitingQuery>>
    readonly syncState: Effect.Success<ReturnType<typeof syncQuery>>
    readonly historyState: Effect.Success<ReturnType<typeof historyQuery>>
    readonly scope: Scope.Scope
    /** Opened to restart a shape Electric gave up on (a 4xx); closed again by the next such failure. */
    readonly restart: Latch.Latch
    /** Retries now every shape request waiting out its backoff. */
    readonly reconnect: Effect.Effect<void>
    /** Starts the `openWithin` deadline over: a shape request must succeed within it, or sync fails. */
    readonly watchSync: Effect.Effect<void>
    readonly pageSize: number
    /** Counts this tab's asks: the order of rows it inserted, until Postgres gives them a position. */
    readonly asked: Ref.Ref<number>
  }
>()("@smthrs/mvp/chat/ChatStore") {
  /** The store, its collections cleaned up and its Electric shape closed when the layer's scope closes. */
  static readonly layer = (config: ChatConfig) => Layer.effect(ChatStore, make(config))
}

/** The store's value: what `yield* ChatStore` gives and what frontends render. */
export type Chat = ChatStore["Service"]

/** Why Electric gave up on the shape: a 4xx, or a response it couldn't read. */
const syncFailure = ({ status }: Collections.SyncFailed): SyncFailure =>
  status === undefined ? "invalid_response" : status >= 500 || status === 429 ? "unreachable" : "refused"

const make = Effect.fnUntraced(function* (config: ChatConfig) {
  const scope = yield* Effect.scope
  const http = yield* HttpClient.HttpClient
  const answerWithin = config.answerWithin ?? Duration.seconds(15)
  const confirmWithin = config.confirmWithin ?? Duration.seconds(15)
  const openWithin = config.openWithin ?? Duration.seconds(10)
  const pageSize = config.pageSize ?? PAGE_SIZE

  const composer = yield* Collections.localOnly<Composer, string>({
    id: "chat-composer",
    getKey: (row) => row.id,
    initialData: [{ id: COMPOSER, open: false, draft: "" }],
  })
  const asks = yield* Collections.localOnly<Ask, string>({ id: "chat-asks", getKey: (row) => row.id })
  const failures = yield* Collections.localOnly<FailedMessage, string>({ id: "chat-failures", getKey: (row) => row.id })
  const sync = yield* Collections.localOnly<SyncHealth, string>({
    id: "chat-sync",
    getKey: (row) => row.id,
    initialData: [{ id: SYNC, status: "syncing", reason: null, httpStatus: null }],
  })
  const history = yield* Collections.localOnly<History, string>({
    id: "chat-history",
    getKey: (row) => row.id,
    initialData: [{ id: HISTORY, opened: false, limit: pageSize, earlier: false, loading: false }],
  })

  // --- Sync health (schema.ts `SyncHealth`) ---

  const restart = yield* Latch.make(false)
  // The last shape request's outcome (`none` before the first is sent) and status, whether one ever succeeded, and
  // whether the deadline has passed.
  const lastRequest = yield* Ref.make<Collections.RequestEvent["_tag"] | "none">("none")
  const lastStatus = yield* Ref.make<number | null>(null)
  const everSucceeded = yield* Ref.make(false)
  const overdue = yield* Ref.make(false)
  const deadline = yield* FiberHandle.make<void, never>()

  const syncNow = Effect.map(Collections.get(sync, SYNC), Option.getOrThrow)
  const setSync = (next: Omit<SyncHealth, "id">) =>
    Collections.update(sync, SYNC, (row) => {
      Object.assign(row, next)
    }).pipe(Effect.orDie)

  // The deadline, if it is still running, finds sync no longer `syncing` and ends.
  const failSync = (reason: SyncFailure, httpStatus: number | null) =>
    Effect.gen(function* () {
      yield* setSync({ status: "failed", reason, httpStatus })
      yield* Metric.update(Metric.withAttributes(syncFailures, { reason }), 1)
      yield* Effect.logError("chat sync failed").pipe(
        Effect.annotateLogs({ reason, ...(httpStatus === null ? {} : { status: httpStatus }) }),
      )
    })

  // Past the deadline, sync fails as `unreachable` when requests are failing, or one was sent and none has ever
  // succeeded. A request in flight may be a long poll that reached Electric, so it has until it settles. Nothing sent
  // yet (a tab opened hidden, whose shape Electric pauses) is no failure.
  const checkOverdue = Effect.gen(function* () {
    if ((yield* syncNow).status !== "syncing" || !(yield* Ref.get(overdue))) return
    const last = yield* Ref.get(lastRequest)
    if (last === "failed" || (last === "sent" && !(yield* Ref.get(everSucceeded)))) {
      yield* failSync("unreachable", yield* Ref.get(lastStatus))
    }
  })
  const watchSync = Ref.set(overdue, false).pipe(
    Effect.andThen(
      FiberHandle.run(
        deadline,
        Effect.sleep(openWithin).pipe(Effect.andThen(Ref.set(overdue, true)), Effect.andThen(checkOverdue)),
      ),
    ),
    Effect.asVoid,
    Effect.annotateLogs({ feature: "chat" }),
  )

  // Every shape request reports here (Collections.electric). One that succeeds makes sync `ready`, unless Electric
  // gave up on the shape; one that fails while `ready` starts the deadline.
  const onRequest = (event: Collections.RequestEvent) =>
    Effect.gen(function* () {
      yield* Ref.set(lastRequest, event._tag)
      const now = yield* syncNow
      if (event._tag === "succeeded") {
        yield* Ref.set(everSucceeded, true)
        yield* Ref.set(lastStatus, null)
        if (now.status === "ready" || (now.status === "failed" && now.reason !== "unreachable")) return
        yield* FiberHandle.clear(deadline)
        yield* setSync({ status: "ready", reason: null, httpStatus: null })
        yield* Effect.logInfo("chat sync up to date")
      } else if (event._tag === "failed") {
        yield* Ref.set(lastStatus, event.status ?? null)
        if (now.status !== "ready") return yield* checkOverdue
        yield* setSync({ status: "syncing", reason: null, httpStatus: null })
        yield* watchSync
      }
    }).pipe(Effect.annotateLogs({ feature: "chat" }))

  // Electric gave up on the shape: a 4xx, or a response it couldn't read. The rows stay, sync shows `failed`, and the
  // shape waits for `retrySync`, then restarts from where it stopped.
  const onSyncError = (error: Collections.SyncFailed) =>
    Effect.gen(function* () {
      yield* restart.close
      yield* failSync(syncFailure(error), error.status ?? null)
      yield* restart.await
      return "retry" as const
    }).pipe(Effect.annotateLogs({ feature: "chat" }))

  // --- Asking ---

  // Keeps a question ChatApi didn't take, and its failure, where this tab showed them: after the last synced row.
  const keepFailed = (rows: ReadonlyArray<Message>) =>
    Effect.gen(function* () {
      const synced = (yield* Collections.toArray(messages)).filter(({ position }) => position < PENDING_POSITION)
      const after = synced.reduce((last, { position }) => Math.max(last, position), 0)
      yield* Collections.insert(
        failures,
        rows.map(({ id, role, text, position }) => ({
          id,
          role,
          text: role === "user" ? text : "",
          status: role === "user" ? ("done" as const) : ("failed" as const),
          position: after,
          seq: position,
        })),
      )
    }).pipe(Effect.orDie)

  // `onInsert`: asks ChatApi, then waits until Electric delivers both rows, so TanStack DB swaps the optimistic rows
  // for the synced ones and they never vanish in between. That holds for a question that was already there (a retry,
  // 200), whose rows may not have arrived yet. Any failure rolls them back; `keepFailed` keeps them visible as failed.
  const ask = ({ transaction, collection }: Collections.InsertParams<Message>) => {
    const rows = transaction.mutations.map(({ modified }) => modified)
    const question = rows.find(({ role }) => role === "user")
    const answer = rows.find(({ role }) => role === "assistant")
    if (question === undefined || answer === undefined) {
      return Effect.die(new Error("messages takes a question and its answer together"))
    }
    const delivered = (id: string) =>
      Collections.awaitMatch(
        collection,
        (message) => Collections.isChangeMessage(message) && message.value.id === id,
        confirmWithin,
      )
    return Effect.gen(function* () {
      const taken = yield* postQuestion(
        config.questionsUrl,
        { id: question.id, answerId: answer.id, text: question.text },
        answerWithin,
      )
      yield* Effect.annotateCurrentSpan({ taken: taken._tag, ...(taken._tag === "inserted" ? { txid: taken.txid } : {}) })
      yield* Effect.all([delivered(question.id), delivered(answer.id)], { concurrency: "unbounded", discard: true }).pipe(
        Effect.mapError(() => new QuestionNotTaken({ reason: "unconfirmed" })),
      )
      yield* Effect.annotateCurrentSpan({ outcome: "asked" })
      yield* Effect.logInfo("question taken").pipe(Effect.annotateLogs({ taken: taken._tag }))
    }).pipe(
      Effect.tapError((error) =>
        Effect.all([
          Effect.annotateCurrentSpan({ outcome: error.reason }),
          keepFailed(rows),
          Metric.update(Metric.withAttributes(askFailures, { reason: error.reason }), 1),
          Effect.logWarning("question not taken").pipe(
            Effect.annotateLogs({ reason: error.reason, ...(error.status === undefined ? {} : { status: error.status }) }),
          ),
        ]),
      ),
      Effect.annotateLogs({ feature: "chat", questionId: question.id, answerId: answer.id }),
      Effect.withSpan("chat.ask", {
        attributes: { questionId: question.id, answerId: answer.id, "question.length": question.text.length },
      }),
      Effect.provideService(HttpClient.HttpClient, http),
    )
  }

  const electric: Collections.Electric<Message> = yield* Collections.electric<Message, QuestionNotTaken>({
    id: "chat-messages",
    getKey: (row) => row.id,
    syncMode: "on-demand",
    shape: {
      url: config.shapeUrl,
      columnMapper: Collections.snakeCamelMapper(),
      parser: { int8: (value: string) => Number(value) },
      ...(config.fetch === undefined ? {} : { fetchClient: config.fetch }),
    },
    ...(config.backoff === undefined ? {} : { backoff: config.backoff }),
    onInsert: ask,
    onRequest,
    onSyncError,
  })
  const messages = electric.collection

  const recent = yield* recentQuery(messages, pageSize)
  const pending = yield* pendingQuery(messages)
  const store = ChatStore.of({
    messages,
    recent,
    pending,
    composer,
    asks,
    failures,
    sync,
    history,
    conversation: yield* conversationQuery(recent, pending, failures),
    composerState: yield* composerQuery(composer),
    waiting: yield* waitingQuery(asks, recent, pending),
    syncState: yield* syncQuery(sync),
    historyState: yield* historyQuery(history),
    scope,
    restart,
    reconnect: electric.reconnect,
    watchSync,
    pageSize,
    asked: yield* Ref.make(0),
  })

  // A shape request has `openWithin` to first succeed.
  yield* watchSync
  // The first window: `opened` once it loads. Whether there may be earlier messages follows the window's changes.
  const windowChanges = yield* Collections.changes(recent)
  yield* windowChanges.pipe(
    Stream.runForEach(() => markEarlier(store)),
    Effect.forkIn(scope),
  )
  yield* Collections.preload(recent).pipe(
    Effect.andThen(
      Collections.update(history, HISTORY, (row) => {
        row.opened = true
      }),
    ),
    Effect.andThen(markEarlier(store)),
    Effect.ignore,
    Effect.forkIn(scope),
  )
  return store
})

/** Sets `history.earlier`: the window is full, so there may be messages before it. Not while a page is loading. */
const markEarlier = ({ recent, history }: Chat) =>
  Effect.gen(function* () {
    const now = Option.getOrThrow(yield* Collections.get(history, HISTORY))
    if (now.loading || !now.opened) return
    const earlier = (yield* Collections.toArray(recent)).length >= now.limit
    if (earlier === now.earlier) return
    yield* Collections.update(history, HISTORY, (row) => {
      row.earlier = earlier
    })
  }).pipe(Effect.orDie)

/**
 * Widens the window from `from` to `limit` messages and records how it went: `history.loading` until the rows load,
 * then whether there may be more. If they don't load, the window stays at `from` and "Load earlier" applies again.
 * Run it with `startImmediately`, so the window moves before the action returns.
 */
export const loadWindow = Effect.fnUntraced(function* (limit: number, from: number) {
  const store = yield* ChatStore
  const settle = (next: Partial<History>) =>
    Collections.update(store.history, HISTORY, (row) => {
      Object.assign(row, next, { loading: false })
    }).pipe(Effect.orDie)
  yield* Collections.setWindow(store.recent, { limit }).pipe(
    Effect.matchEffect({
      onSuccess: () =>
        Effect.all([
          settle({}),
          markEarlier(store),
          Metric.update(Metric.withAttributes(historyLoads, { outcome: "loaded" }), 1),
          Effect.annotateCurrentSpan({ outcome: "loaded" }),
          Effect.logInfo("earlier messages loaded"),
        ]),
      onFailure: () =>
        Effect.all([
          settle({ limit: from }),
          Metric.update(Metric.withAttributes(historyLoads, { outcome: "failed" }), 1),
          Effect.annotateCurrentSpan({ outcome: "failed" }),
          Effect.logWarning("earlier messages didn't load"),
        ]),
    }),
    Effect.annotateLogs({ feature: "chat", limit }),
    Effect.withSpan("chat.history.load", { attributes: { limit } }),
  )
})

/**
 * Records how long the answer to a question this tab just asked took to show its first text. Ends without a record
 * when the answer fails first, rolls back, or takes over five minutes. Run it with `startImmediately`, so it is
 * subscribed before the ask returns: it follows changes from then on, without asking Electric for any rows.
 */
export const timeFirstText = Effect.fnUntraced(
  function* (answerId: string, askedAt: number) {
    const { messages } = yield* ChatStore
    const changes = yield* Collections.changes(messages)
    const decided = yield* changes.pipe(
      Stream.flattenIterable,
      Stream.filter((change) => change.key === answerId),
      Stream.takeUntil(
        (change) => change.type === "delete" || change.value.text !== "" || change.value.status !== "streaming",
      ),
      Stream.runLast,
      Effect.timeoutOrElse({ duration: "5 minutes", orElse: () => Effect.succeed(Option.none()) }),
    )
    if (Option.isSome(decided) && decided.value.type !== "delete" && decided.value.value.text !== "") {
      yield* Metric.update(firstAnswerText, (yield* Clock.currentTimeMillis) - askedAt)
    }
  },
  Effect.scoped,
)
