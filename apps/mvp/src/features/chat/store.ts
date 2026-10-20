import { ElectricCollection, type ShapeSource } from "@smthrs/effect-electric"
import { Collection, Outbox } from "@smthrs/effect-tanstack-db"
import { BrowserEngine } from "@smthrs/platform-browser"
import {
  Clock,
  Context,
  Duration,
  Effect,
  FiberHandle,
  Layer,
  Metric,
  Option,
  Ref,
  type Schedule,
  type Scope,
  Stream,
} from "effect"
import { FlowDispatch } from "../../flows/dispatch"
import { ChatClient, type Taken } from "./api"
import { PAGE_SIZE, SHAPE_ROUTE } from "./contract"
import { askFailures, connectionDrops, firstAnswerText } from "./metrics"
import {
  composerQuery,
  connectionQuery,
  conversationQuery,
  historyQuery,
  latestQuery,
  queuedQuery,
  shownQuery,
} from "./queries"
import {
  Asking,
  COMPOSER,
  Composer,
  CONNECTION,
  Connection,
  HISTORY,
  History,
  Message,
  Unsent,
  type UnsentReason,
} from "./schema"

/**
 * Where this tab syncs from, its deadlines and its sync policy. It asks through `ChatClient`, syncs through
 * `ShapeSource`, and keeps its rows through `Persistence`: the services the layer is given.
 */
export interface ChatConfig {
  /** Electric's shape for `messages`, served by ChatApi's proxy, which fixes the table. */
  readonly shapeUrl: string
  /** How long Electric gets to deliver a question ChatApi took before the send counts as failed. Default 15 s. */
  readonly confirmWithin?: Duration.Input
  /**
   * How long shape requests or sends may keep failing, with the browser online, before the pill says the device is
   * offline, with Retry. Default 10 s.
   */
  readonly unreachableAfter?: Duration.Input
  /** How long a failed shape request waits before it is sent again. Default `SyncPolicy.defaultPolicy`. */
  readonly retry?: Schedule.Schedule<unknown, ShapeSource.RequestFailed>
  /** How many of the most recent messages the conversation shows, and how many more "Load earlier" adds. */
  readonly pageSize?: number
}

/**
 * What the host gives chat: the outbox's entry point, storage and network detector; the lock service that elects the
 * tab leading the outbox (`@smthrs/platform-browser`'s `WebLock`); and whether the browser says it is online now
 * (`navigator.onLine`).
 */
export interface ChatHost {
  readonly outbox: Omit<Outbox.Options<never>, "collections" | "mutations" | "leader">
  readonly lock: Outbox.Lock
  readonly isOnline: () => boolean
}

/** The Web Lock the tab leading the outbox holds. */
export const OUTBOX_LOCK = "smithers-outbox"

/** ChatApi's shape on `origin`, as the browser reaches it. */
export const chatConfig = (origin: string, options: Omit<ChatConfig, "shapeUrl">): ChatConfig => ({
  shapeUrl: `${origin}${SHAPE_ROUTE}`,
  ...options,
})

type Query<F extends (...args: never) => unknown> = Effect.Success<ReturnType<F>>

/**
 * Chat's state for one tab:
 * - `messages`: the conversation in Postgres, synced by Electric and kept on the device; read-only.
 * - `asking`: questions the outbox holds, as the optimistic rows of their writes; in memory, restored by the outbox.
 * - `unsent`: questions the server refused or the outbox couldn't take; kept on the device.
 * - `composer`, `connection`, `history`: this tab's own state, in memory.
 * - `outbox`: the durable outbox every ask goes through.
 * - the live queries frontends read (queries.ts), and `scope`, where background work an action starts runs.
 */
export class ChatStore extends Context.Service<
  ChatStore,
  {
    readonly messages: ElectricCollection.ElectricCollection<Message>
    readonly asking: Collection.Collection<Asking, string>
    readonly unsent: Collection.Collection<Unsent, string>
    readonly composer: Collection.Collection<Composer, string>
    readonly connection: Collection.Collection<Connection, string>
    readonly history: Collection.Collection<History, string>
    readonly outbox: Outbox.Service
    readonly conversation: Query<typeof conversationQuery>
    readonly latest: Query<typeof latestQuery>
    readonly shown: Query<typeof shownQuery>
    readonly queued: Query<typeof queuedQuery>
    readonly composerState: Query<typeof composerQuery>
    readonly connectionState: Query<typeof connectionQuery>
    readonly historyState: Query<typeof historyQuery>
    readonly scope: Scope.Scope
    readonly pageSize: number
    /** When this tab last queued a question: each takes a later `queuedAt`, so questions asked in one millisecond keep their order. */
    readonly lastQueuedAt: Ref.Ref<number>
    /** The browser went offline (`true`) or online (`false`). */
    readonly browserOffline: (offline: boolean) => Effect.Effect<void>
    /** Retry: syncs and sends now, and gives failing requests `unreachableAfter` again. */
    readonly retryNow: Effect.Effect<void>
  }
>()("@smthrs/mvp/chat/ChatStore") {
  /**
   * The store; its collections cleaned up, its outbox stopped and its Electric shape closed when the scope closes. It
   * dispatches each question ChatApi takes to this device's agent through `FlowDispatch`.
   */
  static readonly layer = (config: ChatConfig, host: ChatHost) => Layer.effect(ChatStore, make(config, host))
}

/**
 * What a refused send keeps the question as, by ChatApi's status: 400, 401 (signed out) and 403 (not a Member) are
 * `refused`, 409 `conflict`, 413 `too_large`. Any other failure is sent again.
 */
const refusal = (status: number | undefined): UnsentReason | undefined =>
  status === 400 || status === 401 || status === 403
    ? "refused"
    : status === 409
      ? "conflict"
      : status === 413
        ? "too_large"
        : undefined

/**
 * Keeps a question on the device as unsent, once: a send replayed after a crash finds it there. The row shows at once;
 * the Effect it returns waits until the device has stored it.
 */
export const keepUnsent = (unsent: Collection.Collection<Unsent, string>, row: Asking, reason: UnsentReason) =>
  Effect.gen(function* () {
    if (Option.isSome(yield* unsent.get(row.id))) return Effect.void
    const kept = yield* unsent.insert({ id: row.id, answerId: row.answerId, text: row.text, queuedAt: row.queuedAt, reason })
    return Effect.orDie(kept.persisted)
  }).pipe(Effect.orDie)

/**
 * What the connection pill follows, besides the questions queued: the browser's `offline` event, the last shape request
 * (`pending` until one is answered), why Electric stopped the shape, whether sends are failing, and whether failures
 * have lasted `unreachableAfter`.
 */
interface Signals {
  readonly offline: boolean
  readonly shape: "pending" | "ok" | "failing" | "stopped"
  readonly stopReason: "refused" | "invalid_response" | null
  readonly sending: boolean
  readonly overdue: boolean
  /** This tab's engine worker failed. */
  readonly engine: boolean
}

const make = Effect.fnUntraced(function* (config: ChatConfig, host: ChatHost) {
  const scope = yield* Effect.scope
  const flows = yield* FlowDispatch
  const confirmWithin = config.confirmWithin ?? Duration.seconds(15)
  const unreachableAfter = config.unreachableAfter ?? Duration.seconds(10)
  const pageSize = config.pageSize ?? PAGE_SIZE

  const composer = yield* Collection.local<Composer, string>({
    id: "chat-composer",
    schema: Composer,
    getKey: (row) => row.id,
    initialData: [{ id: COMPOSER, open: false, draft: "" }],
  })
  const connection = yield* Collection.local<Connection, string>({
    id: "chat-connection",
    schema: Connection,
    getKey: (row) => row.id,
    initialData: [{ id: CONNECTION, status: host.isOnline() ? "up" : "offline", retry: false }],
  })
  const history = yield* Collection.local<History, string>({
    id: "chat-history",
    schema: History,
    getKey: (row) => row.id,
    initialData: [{ id: HISTORY, opened: false, limit: pageSize, earlier: false }],
  })
  const asking = yield* Collection.local<Asking, string>({ id: "chat-asking", schema: Asking, getKey: (row) => row.id })
  const unsent = yield* Collection.persisted<Unsent, string>({
    id: "chat-unsent",
    schema: Unsent,
    getKey: (row) => row.id,
    schemaVersion: 1,
  })
  const messages = yield* ElectricCollection.make<Message>({
    id: "chat-messages",
    schema: Message,
    getKey: (row) => row.id,
    syncMode: "eager",
    // 2: `attempts` is gone (server answering went with it) and an answer can fail `unfinished`.
    persist: { schemaVersion: 2 },
    shape: {
      url: config.shapeUrl,
      columnMapper: ElectricCollection.snakeCamelMapper(),
      parser: { int8: (value: string) => Number(value) },
    },
    ...(config.retry === undefined ? {} : { retry: config.retry }),
  })

  // --- Sending: the outbox's `ask` mutation (docs/decisions/0002-local-first.md §3) ---

  // Waits until Electric delivers the question: by the transaction id ChatApi inserted it in, or, for a question that
  // was already there (a resend, 200), by its id, unless the device already has it.
  const delivered = (taken: Taken, id: string) =>
    Effect.gen(function* () {
      if (taken._tag === "inserted") return yield* messages.awaitTxId(taken.txid, confirmWithin)
      if (Option.isSome(yield* messages.get(id))) return
      yield* messages.awaitMatch((change) => change.value.id === id, confirmWithin)
    })

  // This device's agent answers the question ChatApi took: `chat/Answer`, with the answer's id as its execution id, in
  // the background. The engine starts an execution once, so a resend that dispatches it again starts no second run. A
  // dispatch that fails is already logged and counted.
  const answer = (row: Asking) =>
    flows.dispatch("chat/Answer", { answerId: row.answerId }, { door: "composer", executionId: row.answerId }).pipe(
      Effect.ignore,
      Effect.forkIn(scope),
    )

  // Sends one queued question. A refusal (400, 401, 403, 409, 413) keeps it as unsent and stops; anything else is sent
  // again. Once ChatApi takes it, this device's agent answers it.
  const send = ({ rows }: { readonly rows: ReadonlyArray<unknown> }) => {
    const row = rows[0] as Asking
    return Effect.gen(function* () {
      const client = yield* ChatClient
      const taken = yield* client.ask({ id: row.id, answerId: row.answerId, text: row.text }).pipe(
        Effect.catchTag("QuestionNotTaken", (error): Effect.Effect<never, Outbox.Retry | Outbox.Refused> => {
          const reason = refusal(error.status)
          return reason === undefined
            ? Effect.fail(new Outbox.Retry(error.status === undefined ? {} : { status: error.status }))
            : keepUnsent(unsent, row, reason).pipe(
                Effect.flatten,
                Effect.andThen(Metric.update(Metric.withAttributes(askFailures, { reason }), 1)),
                Effect.andThen(
                  Effect.logWarning("question not sent").pipe(Effect.annotateLogs({ reason, status: error.status })),
                ),
                Effect.andThen(Effect.fail(new Outbox.Refused({ status: error.status! }))),
              )
        }),
      )
      yield* Effect.annotateCurrentSpan({ taken: taken._tag })
      yield* answer(row)
      yield* delivered(taken, row.id).pipe(Effect.mapError(() => new Outbox.Retry({})))
      yield* Effect.logInfo("question stored").pipe(Effect.annotateLogs({ taken: taken._tag }))
    }).pipe(
      Effect.annotateLogs({ feature: "chat", questionId: row.id, answerId: row.answerId }),
      Effect.withSpan("chat.ask.send", { attributes: { questionId: row.id, answerId: row.answerId } }),
    )
  }

  const leader = yield* Outbox.lockLeader({ lock: host.lock, name: OUTBOX_LOCK })
  const outbox = Context.get(
    yield* Layer.build(Outbox.layer({ ...host.outbox, leader, collections: { asking }, mutations: { ask: send } })),
    Outbox.Outbox,
  )

  // --- The conversation, as frontends read it ---

  const conversation = yield* conversationQuery(messages, unsent, asking)
  const latest = yield* latestQuery(conversation, pageSize)
  const queued = yield* queuedQuery(conversation)

  // --- The connection pill (schema.ts `Connection`), from the browser, the shape and the outbox ---

  const state = yield* Ref.make<Signals>({
    offline: !host.isOnline(),
    shape: "pending",
    stopReason: null,
    sending: false,
    overdue: false,
    engine: false,
  })
  const deadline = yield* FiberHandle.make<void, never>()
  // A request sent after failures, or after a restart, that hasn't failed within `reachedAfter` reached Electric: a live
  // request is held there until Postgres changes, so it may not answer for a long time.
  const reachedAfter = Duration.seconds(1)
  const reaching = yield* FiberHandle.make<void, never>()

  const connectionNow = Effect.map(connection.get(CONNECTION), Option.getOrThrow)
  // What the pill shows now. While it shows, reconnecting has no state of its own: it hides once the shape is up to
  // date, nothing is failing and every queued question reached Postgres.
  const settle = Effect.gen(function* () {
    const now = yield* Ref.get(state)
    const shown = yield* connectionNow
    // Read now, not from a stream that may not have caught up with an ask this tick.
    const waiting = (yield* queued.toArray).length
    const next: Omit<Connection, "id"> =
      now.engine
        ? { status: "stopped", retry: false }
        : now.shape === "stopped"
        ? { status: "failed", retry: true }
        : now.offline
          ? { status: "offline", retry: false }
          : now.overdue
            ? { status: "offline", retry: true }
            : shown.status !== "up" && !(now.shape === "ok" && !now.sending && waiting === 0)
              ? { status: shown.status, retry: shown.retry }
              : { status: "up", retry: false }
    if (next.status === shown.status && next.retry === shown.retry) return
    yield* connection
      .update(CONNECTION, (row) => {
        row.status = next.status
        row.retry = next.retry
      })
      .pipe(Effect.orDie)
    if (next.status !== "up") {
      const reason = next.status === "stopped"
        ? "engine"
        : next.status === "failed"
        ? now.stopReason!
        : now.offline
        ? "offline"
        : "unreachable"
      yield* Metric.update(Metric.withAttributes(connectionDrops, { reason }), 1)
    }
    yield* Effect.logInfo("chat connection changed").pipe(Effect.annotateLogs({ status: next.status }))
  })

  // Shape requests or sends failing, with the browser online, for `unreachableAfter` show as offline, with Retry.
  const watchFailures = Effect.gen(function* () {
    const now = yield* Ref.get(state)
    if (now.shape !== "failing" && !now.sending) {
      yield* FiberHandle.clear(deadline)
      return yield* Ref.update(state, (s) => ({ ...s, overdue: false }))
    }
    if (yield* FiberHandle.get(deadline).pipe(Effect.map(Option.isSome))) return
    yield* FiberHandle.run(
      deadline,
      Effect.sleep(unreachableAfter).pipe(
        Effect.andThen(Ref.update(state, (s) => ({ ...s, overdue: true }))),
        Effect.andThen(settle),
      ),
    )
  })

  const update = (change: (now: Signals) => Partial<Signals>) =>
    Ref.update(state, (now) => ({ ...now, ...change(now) })).pipe(
      Effect.andThen(watchFailures),
      Effect.andThen(settle),
      Effect.annotateLogs({ feature: "chat" }),
    )

  const onSync = (event: ElectricCollection.SyncEvent) => {
    switch (event._tag) {
      case "Sent":
        return Effect.gen(function* () {
          const shape = (yield* Ref.get(state)).shape
          if (shape !== "failing" && shape !== "pending") return
          yield* FiberHandle.run(
            reaching,
            Effect.sleep(reachedAfter).pipe(
              Effect.andThen(update((now) => (now.shape === "failing" || now.shape === "pending" ? { shape: "ok" } : {}))),
            ),
          )
        })
      case "Succeeded":
        return update(() => ({ shape: "ok", stopReason: null }))
      case "Failed":
        return FiberHandle.clear(reaching).pipe(Effect.andThen(update(() => ({ shape: "failing" }))))
      case "Stopped":
        return update(() => ({
          shape: "stopped",
          stopReason: event.error.status === undefined ? "invalid_response" : "refused",
        }))
    }
  }

  const store = ChatStore.of({
    messages,
    asking,
    unsent,
    composer,
    connection,
    history,
    outbox,
    conversation,
    latest,
    shown: yield* shownQuery(latest),
    queued,
    composerState: yield* composerQuery(composer),
    connectionState: yield* connectionQuery(connection),
    historyState: yield* historyQuery(history),
    scope,
    pageSize,
    lastQueuedAt: yield* Ref.make(0),
    browserOffline: (offline) => update(() => ({ offline })),
    retryNow: Effect.all([messages.reconnect, outbox.retryNow], { discard: true }).pipe(
      Effect.andThen(FiberHandle.clear(deadline)),
      Effect.andThen(
        update((now) => ({ overdue: false, shape: now.shape === "stopped" ? "pending" : now.shape })),
      ),
    ),
  })

  const background = <E>(stream: Stream.Stream<E>, each: (event: E) => Effect.Effect<void>) =>
    stream.pipe(Stream.runForEach(each), Effect.forkIn(scope, { startImmediately: true }))
  yield* background(messages.sync, onSync)
  // This tab's engine failing is for good: the pill says so until the page reloads.
  yield* (yield* BrowserEngine.BrowserEngine).unavailable.pipe(
    Effect.andThen(update(() => ({ engine: true }))),
    Effect.forkIn(scope, { startImmediately: true }),
  )
  yield* background(outbox.status, ({ failing }) => update(() => ({ sending: failing !== null })))
  yield* background(queued.rows, () => update(() => ({})))
  // Whether the device has messages before the window.
  yield* background(conversation.rows, (rows) => markEarlier(history, rows.length))
  // The conversation has opened once the device's rows are restored, or, failing that, synced.
  yield* messages.restored.pipe(
    Effect.catch(() => messages.preload),
    Effect.andThen(
      history.update(HISTORY, (row) => {
        row.opened = true
      }),
    ),
    Effect.ignore,
    Effect.forkIn(scope, { startImmediately: true }),
  )
  return store
})

/** Sets `history.earlier`: the device has more messages than the window shows. */
export const markEarlier = (history: Collection.Collection<History, string>, total: number) =>
  Effect.gen(function* () {
    const now = Option.getOrThrow(yield* history.get(HISTORY))
    const earlier = total > now.limit
    if (earlier === now.earlier) return
    yield* history.update(HISTORY, (row) => {
      row.earlier = earlier
    })
  }).pipe(Effect.orDie)

/**
 * Records how long the answer to a question this tab just asked took to show its first text, counted from asking, so a
 * question queued offline counts its time in the queue. Ends without a record when the answer settles with no text,
 * and with the store otherwise. Run it with `startImmediately`, so it follows changes before the ask returns.
 */
export const timeFirstText = Effect.fnUntraced(function* (answerId: string, askedAt: number) {
  const { messages } = yield* ChatStore
  const decided = yield* messages.changes({ initial: true }).pipe(
    Stream.flattenIterable,
    Stream.filter((change) => change.key === answerId),
    Stream.takeUntil((change) => change.value.text !== "" || change.value.status !== "streaming"),
    Stream.runLast,
  )
  if (Option.isSome(decided) && decided.value.value.text !== "") {
    yield* Metric.update(firstAnswerText, (yield* Clock.currentTimeMillis) - askedAt)
  }
})
