/**
 * Effect wrappers for the TanStack DB and Electric APIs the app uses. App code reaches both libraries only
 * through this module; React reads through `@tanstack/react-db`'s live-query hooks, which are its binding.
 *
 * - A collection is created scoped: it lives until its scope closes, then `cleanup()` stops its sync. Garbage
 *   collection is off, because the scope owns the lifetime.
 * - Reads (`toArray`, `get`, `status`, `getWindow`) are Effects; a change subscription is a scoped Stream.
 * - Mutations apply at once (optimistically) and return the TanStack DB Transaction; `settled` waits for it.
 * - Moving a live query's window (`setWindow`) is an Effect that moves it at once and succeeds once its rows load.
 * - Electric's `utils.awaitMatch` is an Effect with a timeout. A shape's retries are the wrapper's, so `reconnect` can
 *   end their wait.
 * - A mutation handler, shape error handler or request report is an Effect, run on the app's runtime through
 *   `Boundary`.
 *
 * Query expressions (`eq`, `caseWhen`, ...), Electric's `snakeCamelMapper` and its `isChangeMessage` are pure,
 * re-exported here unwrapped.
 */
import {
  FetchError,
  type GetExtensions,
  type Message,
  type Row,
  type ShapeStreamOptions,
} from "@electric-sql/client"
import {
  BasicIndex,
  type ChangeMessage,
  type Collection,
  type CollectionStatus,
  createCollection,
  createLiveQueryCollection,
  type ExtractContext,
  type GetResult,
  type InitialQueryBuilder,
  type InsertMutationFnParams,
  type LiveQueryCollectionUtils,
  type LocalOnlyCollectionUtils,
  localOnlyCollectionOptions,
  type NonSingleResult,
  type OperationConfig,
  type QueryBuilder,
  type SingleResult,
  type Transaction,
  type WritableDeep,
} from "@tanstack/db"
import {
  type ElectricCollectionConfig,
  type ElectricCollectionUtils,
  electricCollectionOptions,
  TimeoutWaitingForMatchError,
} from "@tanstack/electric-db-collection"
import { type Cause, Data, Duration, Effect, Latch, Option, Queue, Ref, Result, type Scope, Stream } from "effect"
import { Boundary } from "./runtime"

export { isChangeMessage, snakeCamelMapper } from "@electric-sql/client"
export { and, caseWhen, eq, gte, isUndefined, lt } from "@tanstack/db"
export type { ChangeMessage, Collection, CollectionStatus, Message as ShapeMessage, Transaction }

// biome-ignore lint/suspicious/noExplicitAny: matches any collection, as TanStack DB's own helpers do
type AnyCollection = Collection<any, any, any, any, any>

/** A collection of rows `T` keyed by `K`, whatever its sync, as the reads and mutations below take it. */
// biome-ignore lint/suspicious/noExplicitAny: any utils and schema, as TanStack DB's own helpers do
export type CollectionOf<T extends object, K extends string | number = string | number> = Collection<T, K, any, any, T>

/** An in-memory collection for one tab. */
export type LocalCollection<T extends object, K extends string | number> = Collection<T, K, LocalOnlyCollectionUtils, never, T>

/** A synchronous TanStack DB call threw: a duplicate key, a schema refusal or a key that isn't there. */
export class MutationRefused extends Data.TaggedError("MutationRefused")<{
  readonly operation: "insert" | "update" | "delete"
  readonly cause: unknown
}> {}

/** A transaction rolled back: its mutation handler failed. */
export class TransactionFailed extends Data.TaggedError("TransactionFailed")<{ readonly cause: unknown }> {}

/** A collection's sync failed: its first snapshot couldn't load, or its shape stream stopped. */
export class SyncFailed extends Data.TaggedError("SyncFailed")<{
  readonly cause: unknown
  /** The HTTP status Electric (or its proxy) answered, when it answered. */
  readonly status?: number
}> {}

/** Electric didn't deliver a message `awaitMatch` was waiting for in time. */
export class MatchTimeout extends Data.TaggedError("MatchTimeout")<{}> {}

/** A live query's window couldn't move, or the rows it needs didn't load. */
export class WindowFailed extends Data.TaggedError("WindowFailed")<{ readonly cause: unknown }> {}

// No garbage collection: a collection lives exactly as long as the scope that made it.
const GC_OFF = 0

// Indexes are made as queries need them, so a join or filter on a field doesn't scan every row.
const INDEXED = { autoIndex: "eager", defaultIndexType: BasicIndex } as const

const own = <C extends AnyCollection>(create: () => C): Effect.Effect<C, never, Scope.Scope> =>
  Effect.acquireRelease(Effect.sync(create), (collection) =>
    Effect.tryPromise(() => collection.cleanup()).pipe(
      Effect.catchCause((cause) => Effect.logWarning("collection cleanup failed", { collection: collection.id }, cause)),
    ),
  )

/** An in-memory collection for one tab, cleaned up when the scope closes. Its writes apply at once. */
export const localOnly = <T extends object, K extends string | number>(options: {
  readonly id: string
  readonly getKey: (row: T) => K
  readonly initialData?: Array<T>
}): Effect.Effect<LocalCollection<T, K>, never, Scope.Scope> =>
  own(() => createCollection(localOnlyCollectionOptions<T, K>({ ...options, ...INDEXED })))

/** What an Electric collection's `onInsert` Effect receives: TanStack DB's handler parameters. */
export type InsertParams<T extends Row<unknown>> = InsertMutationFnParams<T, string | number, ElectricCollectionUtils<T>>

/** A collection synced from an Electric shape, with Electric's `utils`. */
export type ElectricCollection<T extends Row<unknown>> = Collection<T, string | number, ElectricCollectionUtils<T>, never, T>

/**
 * How an Electric collection loads rows:
 * - `eager`: the whole shape, before the collection is ready;
 * - `on-demand`: only the rows its queries ask for, plus every change after it starts;
 * - `progressive`: what its queries ask for first, then the whole shape in the background.
 */
export type SyncMode = NonNullable<ElectricCollectionConfig["syncMode"]>

/** What `onSyncError` decides once Electric gives up on a shape: restart it from where it stopped, or stop. */
export type SyncDecision = "retry" | "stop"

/**
 * How long an Electric collection waits before retrying a request that failed on the network, or with 5xx or 429:
 * `initial`, doubling to `max`, each wait between half and all of that. It never gives up, so a device that was offline
 * syncs when it comes back; `reconnect` ends every wait at once.
 */
export interface Backoff {
  readonly initial: Duration.Input
  readonly max: Duration.Input
}

const BACKOFF: Backoff = { initial: Duration.seconds(1), max: Duration.seconds(10) }

/** An Electric collection, and how to make it retry now. */
export interface Electric<T extends Row<unknown>> {
  readonly collection: ElectricCollection<T>
  /** Retries now every request waiting out its backoff, for example when the device comes back online. */
  readonly reconnect: Effect.Effect<void>
}

/**
 * What happened to one of a shape's requests: `sent`, then `succeeded` (any 2xx) or `failed` (the network, or 5xx or
 * 429, with its `status`). A 4xx or an aborted request is neither; Electric reports a 4xx through `onSyncError`.
 */
export type RequestEvent =
  | { readonly _tag: "sent" }
  | { readonly _tag: "succeeded" }
  | { readonly _tag: "failed"; readonly status?: number }

// Electric's protocol: a shape request carrying `subset__*` parameters is a subset snapshot, and these headers on its
// response move the shape's offset (@electric-sql/client `SUBSET_PARAM_*`, `CHUNK_LAST_OFFSET_HEADER`,
// `SHAPE_HANDLE_HEADER`).
const SUBSET_PARAM = "subset__"
const POSITION_HEADERS = ["electric-offset", "electric-handle"]

/**
 * A subset snapshot's response, minus the headers that would move the shape's offset, unless the shape hasn't started
 * (`offset=now`), when the offset must start there. @electric-sql/client 1.5.28 moves the offset to every subset
 * snapshot's, which skips the log's changes to rows outside that snapshot, such as an answer streaming while earlier
 * messages load. Kept at its own offset, the shape reads them, and drops the changes the snapshot already holds.
 */
const keepOffset = (input: RequestInfo | URL, response: Response): Response => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  const subset = [...url.searchParams.keys()].some((key) => key.startsWith(SUBSET_PARAM))
  const offset = url.searchParams.get("offset")
  if (!subset || offset === "now" || offset === "-1" || !response.ok) return response
  const headers = new Headers(response.headers)
  for (const name of POSITION_HEADERS) headers.delete(name)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

/** Never resolves; rejects as fetch does once `signal` aborts. */
const untilAborted = (signal: AbortSignal | undefined) =>
  new Promise<never>((_, reject) => {
    const abort = () => reject(signal?.reason ?? new DOMException("The operation was aborted.", "AbortError"))
    if (signal?.aborted) abort()
    else signal?.addEventListener("abort", abort, { once: true })
  })

/**
 * A collection synced from an Electric shape, cleaned up (its stream aborted) when the scope closes.
 * - Rows are typed `T`; the shape's `parser` turns Postgres values into it (TanStack DB never validates synced rows).
 * - `syncMode` (default `eager`) says which rows it loads. An `on-demand` collection loads what its live queries ask
 *   for, through the shape's subset requests (`subset__*`), so a query with `orderBy` and `limit` loads one window.
 * - `onInsert` persists optimistic inserts. It must not succeed until Electric has delivered them (`awaitMatch`);
 *   failing it rolls them back.
 * - Every request reports to `onRequest`. One that fails on the network, or with 5xx or 429, is retried after
 *   `backoff` (default 1 s, doubling to 10 s), forever; `reconnect` retries every waiting request now.
 * - `onSyncError` runs once Electric gives up on the shape: on a 4xx or a response it can't read. It decides: `retry`
 *   restarts the shape from where it stopped, keeping every row; `stop` ends it, and a first snapshot that never
 *   loaded fails the collection.
 */
export const electric = <T extends Row<unknown>, E>(options: {
  readonly id: string
  readonly getKey: (row: T) => string
  readonly shape: Omit<ShapeStreamOptions<GetExtensions<T>>, "onError" | "signal" | "backoffOptions">
  readonly syncMode?: SyncMode
  readonly backoff?: Backoff
  readonly onInsert: (params: InsertParams<T>) => Effect.Effect<void, E>
  readonly onRequest?: (event: RequestEvent) => Effect.Effect<void>
  readonly onSyncError: (error: SyncFailed) => Effect.Effect<SyncDecision>
}): Effect.Effect<Electric<T>, never, Scope.Scope | Boundary> =>
  Effect.gen(function* () {
    const boundary = yield* Boundary
    const backoff = options.backoff ?? BACKOFF
    const failures = yield* Ref.make(0)
    const woken = yield* Latch.make(false)
    const send = options.shape.fetchClient ?? ((input, init) => globalThis.fetch(input, init))
    const report = options.onRequest ?? (() => Effect.void)
    const failed = (status?: number) =>
      Ref.update(failures, (n) => n + 1).pipe(
        Effect.andThen(report(status === undefined ? { _tag: "failed" } : { _tag: "failed", status })),
      )
    // Waits out the backoff after `n` failures in a row, unless `reconnect` ends it.
    const wait = (n: number) =>
      Effect.suspend(() => {
        const ceiling = Math.min(
          Duration.toMillis(backoff.initial) * 2 ** (n - 1),
          Duration.toMillis(backoff.max),
        )
        return Effect.sleep(ceiling * (0.5 + Math.random() / 2))
      }).pipe(Effect.raceFirst(woken.await))
    // Every request the shape makes. Electric's own backoff is off: this one waits, so `reconnect` can end it.
    const request = (input: RequestInfo | URL, init?: RequestInit) =>
      Effect.gen(function* () {
        const before = yield* Ref.get(failures)
        if (before > 0) yield* wait(before)
        yield* report({ _tag: "sent" })
        const response = yield* Effect.tryPromise({ try: () => send(input, init), catch: (error) => error }).pipe(
          Effect.tapError(() => (init?.signal?.aborted === true ? Effect.void : failed())),
        )
        if (response.status >= 500 || response.status === 429) yield* failed(response.status)
        else if (response.ok) yield* Ref.set(failures, 0).pipe(Effect.andThen(report({ _tag: "succeeded" })))
        return keepOffset(input, response)
      })
    const config: ElectricCollectionConfig<T> & { schema?: never } = {
      id: options.id,
      getKey: options.getKey,
      gcTime: GC_OFF,
      ...INDEXED,
      ...(options.syncMode === undefined ? {} : { syncMode: options.syncMode }),
      shapeOptions: {
        ...options.shape,
        // The request's own outcome, as fetch gives it. If the runtime stops it instead (the app is closing), it
        // settles only when the shape aborts it, so Electric never retries in a loop meanwhile.
        fetchClient: (input, init) =>
          boundary
            .runPromise(Effect.result(request(input, init)), init?.signal == null ? {} : { signal: init.signal })
            .then(
              (outcome) => (Result.isSuccess(outcome) ? outcome.success : Promise.reject(outcome.failure)),
              () => untilAborted(init?.signal ?? undefined),
            ),
        backoffOptions: { initialDelay: 0, maxDelay: 0, multiplier: 1 },
        // An object restarts the shape where it stopped; nothing stops it (ShapeStreamOptions.onError).
        onError: (error) =>
          boundary
            .runPromise(
              options.onSyncError(
                new SyncFailed({ cause: error, ...(error instanceof FetchError ? { status: error.status } : {}) }),
              ),
            )
            .then((decision) => (decision === "retry" ? {} : undefined)),
      },
      onInsert: (params) => boundary.runPromise(options.onInsert(params)),
    }
    const collection = yield* own(() => createCollection(electricCollectionOptions(config)))
    return { collection, reconnect: Ref.set(failures, 0).pipe(Effect.andThen(woken.release)) }
  })

/** A live query's collection: one row (`findOne`) or many, typed by its query. */
// biome-ignore lint/suspicious/noExplicitAny: TanStack DB's own bound for a query of any shape
export type LiveQuery<TQuery extends QueryBuilder<any>> =
  ExtractContext<TQuery> extends SingleResult
    ? Collection<GetResult<ExtractContext<TQuery>>, string | number, LiveQueryCollectionUtils> & SingleResult
    : Collection<GetResult<ExtractContext<TQuery>>, string | number, LiveQueryCollectionUtils> & NonSingleResult

/** A live query's window over its ordered rows: `limit` rows from `offset`. */
export type Window = { readonly offset: number; readonly limit: number }

/** A live query over other collections, cleaned up when the scope closes. It starts on first read or `preload`. */
// biome-ignore lint/suspicious/noExplicitAny: TanStack DB's own bound for a query of any shape
export const liveQuery = <TQuery extends QueryBuilder<any>>(
  query: (q: InitialQueryBuilder) => TQuery,
): Effect.Effect<LiveQuery<TQuery>, never, Scope.Scope> =>
  // createLiveQueryCollection's own result type, which TypeScript can't resolve for a query still generic here.
  own(() => createLiveQueryCollection({ query, gcTime: GC_OFF }) as unknown as LiveQuery<TQuery>)

/** Starts a collection's sync and waits for its first snapshot. */
export const preload = (collection: AnyCollection): Effect.Effect<void, SyncFailed> =>
  Effect.tryPromise({ try: () => collection.preload(), catch: (cause) => new SyncFailed({ cause }) })

/** Where a collection's sync is: `loading` until its first snapshot, then `ready`; `error` once that failed. */
export const status = (collection: AnyCollection): Effect.Effect<CollectionStatus> => Effect.sync(() => collection.status)

/** A live query's window, if it has `orderBy` and `limit`: the one it last finished moving to. */
export const getWindow = (collection: {
  readonly utils: Pick<LiveQueryCollectionUtils, "getWindow">
}): Effect.Effect<Option.Option<Window>> => Effect.sync(() => Option.fromUndefinedOr(collection.utils.getWindow()))

/**
 * Moves a live query's window (`orderBy` with `limit`). It moves when the Effect runs; the Effect succeeds once the rows
 * the window needs have loaded, from an on-demand source through its subset requests. On failure the query keeps its
 * last settled window.
 */
export const setWindow = (
  collection: { readonly utils: Pick<LiveQueryCollectionUtils, "setWindow"> },
  window: Partial<Window>,
): Effect.Effect<void, WindowFailed> =>
  Effect.try({ try: () => collection.utils.setWindow(window), catch: (cause) => new WindowFailed({ cause }) }).pipe(
    Effect.flatMap((loading) =>
      loading === true
        ? Effect.void
        : Effect.tryPromise({ try: () => loading, catch: (cause) => new WindowFailed({ cause }) }),
    ),
  )

/** The rows, as they are now, optimistic writes included. */
export const toArray = <T extends object, K extends string | number>(
  collection: CollectionOf<T, K>,
): Effect.Effect<ReadonlyArray<T>> => Effect.sync(() => collection.toArray)

/** One row, as it is now. */
export const get = <T extends object, K extends string | number>(
  collection: CollectionOf<T, K>,
  key: K,
): Effect.Effect<Option.Option<T>> => Effect.sync(() => Option.fromUndefinedOr(collection.get(key)))

/**
 * Subscribes to a collection's changes now, and streams them in the batches TanStack DB publishes, until the scope
 * closes. Subscribing when the Effect runs, not when the stream is pulled, means no change after it is missed.
 * `includeInitialState` makes the current rows the first batch.
 */
export const changes = <T extends object, K extends string | number>(
  collection: CollectionOf<T, K>,
  options: { readonly includeInitialState?: boolean } = {},
): Effect.Effect<Stream.Stream<ReadonlyArray<ChangeMessage<T, K>>>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<ReadonlyArray<ChangeMessage<T, K>>, Cause.Done>()
    yield* Effect.acquireRelease(
      Effect.sync(() =>
        collection.subscribeChanges((batch) => Queue.offerUnsafe(queue, batch), {
          includeInitialState: options.includeInitialState ?? false,
        }),
      ),
      (subscription) => Effect.sync(() => subscription.unsubscribe()).pipe(Effect.andThen(Queue.end(queue))),
    )
    return Stream.fromQueue(queue)
  })

/** Inserts rows. They show at once; the returned transaction settles when the collection's handler does. */
export const insert = <T extends object, K extends string | number>(
  collection: CollectionOf<T, K>,
  rows: T | Array<T>,
  config?: OperationConfig,
): Effect.Effect<Transaction, MutationRefused> =>
  Effect.try({
    try: () => collection.insert(rows, config),
    catch: (cause) => new MutationRefused({ operation: "insert", cause }),
  })

/** Changes one row through a draft. It shows at once. */
export const update = <T extends object, K extends string | number>(
  collection: CollectionOf<T, K>,
  key: K,
  recipe: (draft: WritableDeep<T>) => void,
): Effect.Effect<Transaction, MutationRefused> =>
  Effect.try({
    try: () => collection.update(key, recipe),
    catch: (cause) => new MutationRefused({ operation: "update", cause }),
  })

/** Deletes rows. They disappear at once. */
export const remove = <T extends object, K extends string | number>(
  collection: CollectionOf<T, K>,
  keys: K | Array<K>,
): Effect.Effect<Transaction, MutationRefused> =>
  Effect.try({
    try: () => collection.delete(keys),
    catch: (cause) => new MutationRefused({ operation: "delete", cause }),
  })

/** Waits for a transaction to settle. A rolled-back transaction fails with its handler's error as the cause. */
export const settled = (transaction: Transaction): Effect.Effect<void, TransactionFailed> =>
  Effect.tryPromise({ try: () => transaction.when("settled"), catch: (cause) => new TransactionFailed({ cause }) }).pipe(
    Effect.asVoid,
  )

/**
 * Waits until Electric delivers a message `match` accepts and TanStack DB has applied its batch, for at most `timeout`.
 * A change already applied and still in the collection's recent messages counts. A shape that stops or is cleaned up
 * while waiting fails with `SyncFailed`.
 */
export const awaitMatch = <T extends Row<unknown>>(
  collection: { readonly utils: Pick<ElectricCollectionUtils<T>, "awaitMatch"> },
  match: (message: Message<T>) => boolean,
  timeout: Duration.Input,
): Effect.Effect<void, MatchTimeout | SyncFailed> =>
  Effect.tryPromise({
    try: () => collection.utils.awaitMatch(match, Duration.toMillis(timeout)),
    catch: (cause) => (cause instanceof TimeoutWaitingForMatchError ? new MatchTimeout() : new SyncFailed({ cause })),
  }).pipe(Effect.asVoid)
