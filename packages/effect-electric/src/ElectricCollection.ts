/**
 * TanStack DB collections synced from an Electric shape, as Effect services.
 *
 * `make` builds on `@smthrs/effect-tanstack-db`: the collection is created in
 * a scope and cleaned up when the scope closes, every synced row is decoded by
 * the collection's `Schema`, and its mutation handlers are Effects run with
 * the services of the fiber that made the collection, so they share its
 * logger, tracer, metrics and `HttpClient`.
 *
 * On top of a plain collection it adds:
 * - `sync`, the shape's sync status as a `Stream` of each request's outcome
 *   and of the shape stopping;
 * - a retry policy, an Effect `Schedule` (`SyncPolicy`), in place of
 *   Electric's own backoff, and `reconnect`, which ends every wait and
 *   restarts a stopped shape;
 * - `awaitTxId` and `awaitMatch`, which wait for Electric to deliver a write.
 *
 * With `persist`, the collection keeps its rows and Electric's resume state
 * (the shape's handle and offset) on the device through
 * `@smthrs/effect-tanstack-db`'s `Persistence`: a program restores them
 * before the network answers (`restored`), and its first shape request
 * resumes where the last program stopped.
 *
 * @since 0.1.0
 */

import { FetchError, isChangeMessage, type Row, type ShapeStreamOptions } from "@electric-sql/client"
import { Collection, type Persistence } from "@smthrs/effect-tanstack-db"
import {
  electricCollectionOptions,
  type ElectricCollectionUtils,
  TimeoutWaitingForMatchError,
  TimeoutWaitingForTxIdError
} from "@tanstack/electric-db-collection"
import * as Data from "effect/Data"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Latch from "effect/Latch"
import * as Option from "effect/Option"
import * as PubSub from "effect/PubSub"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import { RequestFailed, ShapeSource } from "./ShapeSource.ts"
import * as SyncPolicy from "./SyncPolicy.ts"

/**
 * Electric's mapper between `snake_case` columns and `camelCase` fields,
 * re-exported as it is. It is pure configuration for `shape.columnMapper`.
 *
 * @category configuration
 * @since 0.1.0
 */
export { snakeCamelMapper } from "@electric-sql/client"

/**
 * A row's key: what `getKey` returns.
 *
 * @category models
 * @since 0.1.0
 */
export type Key = string | number

/**
 * Electric stopped the shape, or a wait ended because it did. `status` is the
 * HTTP status when Electric or a proxy answered: a 4xx, or a 5xx or 429 the
 * sync policy gave up on. Without one, the request failed on the network
 * after the policy gave up, or the response could not be read or decoded.
 *
 * @category errors
 * @since 0.1.0
 */
export class SyncFailed extends Data.TaggedError("SyncFailed")<{
  readonly cause: unknown
  readonly status?: number
}> {}

/**
 * Electric didn't deliver what `awaitTxId` or `awaitMatch` waited for in time.
 *
 * @category errors
 * @since 0.1.0
 */
export class AwaitTimeout extends Data.TaggedError("AwaitTimeout") {}

/**
 * One step of the shape's sync, in order:
 * - `Sent`: a shape request went out;
 * - `Succeeded`: it was answered with a 2xx;
 * - `Failed`: it failed on the network (no `status`) or with a 5xx or 429, and
 *   waits for the sync policy before it is sent again;
 * - `Stopped`: Electric gave up on the shape, and it waits for `reconnect`.
 *
 * A request Electric aborts, and a 4xx before `Stopped`, report neither
 * `Succeeded` nor `Failed`.
 *
 * @category models
 * @since 0.1.0
 */
export type SyncEvent =
  | { readonly _tag: "Sent" }
  | { readonly _tag: "Succeeded" }
  | { readonly _tag: "Failed"; readonly status?: number }
  | { readonly _tag: "Stopped"; readonly error: SyncFailed }

/**
 * One change Electric delivered, as `awaitMatch` sees it. An update carries
 * only the columns that changed, so `value` is partial.
 *
 * @category models
 * @since 0.1.0
 */
export interface Delivered<A> {
  readonly operation: "insert" | "update" | "delete"
  readonly value: Partial<A>
}

/**
 * What a mutation handler receives: the rows of its transaction (the new rows
 * for an insert or update, the deleted rows for a delete) and the collection.
 *
 * @category models
 * @since 0.1.0
 */
export interface Persist<A extends object> {
  readonly rows: ReadonlyArray<A>
  readonly collection: ElectricCollection<A>
}

/**
 * A collection synced from an Electric shape.
 *
 * @category models
 * @since 0.1.0
 */
export interface ElectricCollection<A extends object>
  extends Collection.Collection<A, Key, ElectricCollectionUtils<Row<unknown>>>
{
  /**
   * The shape's sync status: each request's outcome, and the shape stopping. A stream started late begins with the
   * latest event, so a shape that stopped before anyone listened still says so.
   */
  readonly sync: Stream.Stream<SyncEvent>
  /** Sends every request waiting out the sync policy now, and restarts a stopped shape where it stopped. */
  readonly reconnect: Effect.Effect<void>
  /** Waits until Electric delivers transaction `txid` and TanStack DB has applied it. */
  readonly awaitTxId: (txid: number, timeout: Duration.Input) => Effect.Effect<void, AwaitTimeout | SyncFailed>
  /**
   * Waits until Electric delivers a change `match` accepts and TanStack DB has
   * applied it. A change already applied and still among the collection's
   * recent messages counts.
   */
  readonly awaitMatch: (
    match: (change: Delivered<A>) => boolean,
    timeout: Duration.Input
  ) => Effect.Effect<void, AwaitTimeout | SyncFailed>
}

/**
 * The schema of an Electric collection's rows: a `Schema.Struct` that checks
 * rows without transforming them. Electric's `parser` turns Postgres values
 * into JavaScript ones first.
 *
 * @category models
 * @since 0.1.0
 */
export type RowSchema<A> = Collection.RowSchema<A> & { readonly fields: Schema.Struct.Fields }

/**
 * Options for `make`.
 *
 * @category models
 * @since 0.1.0
 */
export interface Options<A extends object, E, R> {
  readonly id: string
  readonly schema: RowSchema<A>
  readonly getKey: (row: A) => Key
  /** Where the shape is and how its rows are read. Electric's own retry and error options are this module's. */
  readonly shape: Pick<ShapeStreamOptions, "url" | "params" | "headers" | "columnMapper" | "parser">
  /**
   * How rows load: `eager`, the whole shape before the collection is ready
   * (the default); `progressive`, what queries ask for first, then the whole
   * shape. Either way the collection holds every row of the shape, so a
   * device can read all of it without the network.
   */
  readonly syncMode?: "eager" | "progressive"
  /**
   * Keeps the rows and Electric's resume state on the device through
   * `Persistence`, under `schemaVersion`: a new version syncs the shape again.
   */
  readonly persist?: Collection.Persist
  /** The sync policy. Defaults to `SyncPolicy.defaultPolicy`. */
  readonly retry?: Schedule.Schedule<unknown, RequestFailed>
  /**
   * Persists optimistic inserts. It must not succeed until Electric has
   * delivered them (`awaitTxId` or `awaitMatch`); failing rolls them back.
   */
  readonly onInsert?: (params: Persist<A>) => Effect.Effect<void, E, R>
  /** Persists optimistic updates, as `onInsert` does inserts. */
  readonly onUpdate?: (params: Persist<A>) => Effect.Effect<void, E, R>
  /** Persists optimistic deletes, as `onInsert` does inserts. */
  readonly onDelete?: (params: Persist<A>) => Effect.Effect<void, E, R>
}

/**
 * A collection synced from an Electric shape, cleaned up when the scope
 * closes. Its shape requests go through `ShapeSource`. Mutation handlers and
 * the shape's requests run with the services of the fiber that runs `make`,
 * and stop when the scope closes.
 *
 * Every synced row is decoded by `schema`. Electric sends an update's changed
 * columns only, so rows are decoded column by column: each column present
 * must decode. A row that doesn't stops the shape (`Stopped`, with no status).
 *
 * @category constructors
 * @since 0.1.0
 */
export function make<A extends Row<unknown>, E = never, R = never>(
  options: Options<A, E, R> & { readonly persist: Collection.Persist }
): Effect.Effect<ElectricCollection<A>, never, Scope.Scope | R | Persistence.Persistence>
export function make<A extends Row<unknown>, E = never, R = never>(
  options: Options<A, E, R> & { readonly persist?: undefined }
): Effect.Effect<ElectricCollection<A>, never, Scope.Scope | R>
export function make<A extends Row<unknown>, E = never, R = never>(
  options: Options<A, E, R>
): Effect.Effect<ElectricCollection<A>, never, Scope.Scope | R | Persistence.Persistence> {
  return Effect.gen(function*() {
    const context = yield* Effect.context<R>()
    // Aborted when the scope closes, so no callback outlives the collection.
    const closing = new AbortController()
    yield* Effect.addFinalizer(() => Effect.sync(() => closing.abort()))
    const run = <X, Y>(effect: Effect.Effect<X, Y, R>, signal: AbortSignal) =>
      Effect.runPromiseWith(context)(effect, { signal })

    // The latest event is replayed to each new subscriber: a status read after the fact is still the status.
    const events = yield* PubSub.unbounded<SyncEvent>({ replay: 1 })
    const publish = (event: SyncEvent) => PubSub.publish(events, event)
    const woken = yield* Latch.make(false)
    const restart = yield* Latch.make(false)
    // The policy's wait, ended early by `reconnect`.
    const policy = (options.retry ?? SyncPolicy.defaultPolicy).pipe(
      Schedule.modifyDelay(({ duration }) =>
        Effect.raceFirst(Effect.sleep(duration), woken.await).pipe(Effect.as(Duration.zero))
      )
    )
    const source = yield* ShapeSource

    const attempt = (input: RequestInfo | URL, init: RequestInit | undefined) =>
      Effect.gen(function*() {
        yield* publish({ _tag: "Sent" })
        const response = yield* source.request(String(input), { ...init }).pipe(
          Effect.tapError(() => publish({ _tag: "Failed" }))
        )
        if (response.status >= 500 || response.status === 429) {
          // Its body is read only to free the connection; a body that fails to read changes nothing.
          yield* Effect.tryPromise(() => response.arrayBuffer()).pipe(Effect.ignore)
          yield* publish({ _tag: "Failed", status: response.status })
          return yield* new RequestFailed({ status: response.status })
        }
        if (response.ok) yield* publish({ _tag: "Succeeded" })
        return response
      })

    // A request the policy gave up on goes back to Electric as it failed, so Electric stops the shape.
    const request = (input: RequestInfo | URL, init: RequestInit | undefined) =>
      attempt(input, init).pipe(
        Effect.retry(policy),
        Effect.catch((failure) =>
          failure.status === undefined
            ? Effect.fail(failure)
            : Effect.succeed(new Response(null, { status: failure.status }))
        )
      )

    const stopped = (error: Error) =>
      Effect.gen(function*() {
        yield* restart.close
        yield* publish({ _tag: "Stopped", error: syncFailed(error) })
        yield* restart.await
      })

    const decode = Schema.decodeUnknownSync(columnwise(options.schema))
    const shapeOptions: ShapeStreamOptions = {
      ...options.shape,
      fetchClient: (input, init) =>
        run(request(input, init), init?.signal ? AbortSignal.any([closing.signal, init.signal]) : closing.signal),
      // The sync policy retries; Electric's own backoff never waits, and gives a failure straight to `onError`.
      backoffOptions: { initialDelay: 0, maxDelay: 0, multiplier: 1, maxRetries: 0 },
      // An object restarts the shape where it stopped (ShapeStreamOptions.onError).
      onError: (error) => run(stopped(error), closing.signal).then(() => ({})),
      transformer: (row) => decode(row) as Row
    }

    // The collection a handler receives, set once it exists; TanStack DB calls a handler only after that.
    const self: { current?: ElectricCollection<A> } = {}
    const handler = (side: "modified" | "original", persist?: (params: Persist<A>) => Effect.Effect<void, E, R>) =>
      persist &&
      (({ transaction }: { readonly transaction: { readonly mutations: ReadonlyArray<Record<typeof side, A>> } }) =>
        run(
          persist({ rows: transaction.mutations.map((mutation) => mutation[side]), collection: self.current! }),
          closing.signal
        ))
    const handlers = {
      onInsert: handler("modified", options.onInsert),
      onUpdate: handler("modified", options.onUpdate),
      onDelete: handler("original", options.onDelete)
    }

    const collectionOptions = electricCollectionOptions({
      id: options.id,
      getKey: options.getKey,
      shapeOptions,
      syncMode: options.syncMode ?? "eager",
      ...Object.fromEntries(Object.entries(handlers).filter(([, persist]) => persist !== undefined))
    } as never) as never
    const collection = yield* (options.persist === undefined
      ? Collection.make<A, Key, ElectricCollectionUtils<Row<unknown>>>(options.schema, collectionOptions)
      : Collection.make<A, Key, ElectricCollectionUtils<Row<unknown>>>(options.schema, collectionOptions, {
        persist: options.persist
      }))
    const utils = collection.tanstack.utils
    self.current = {
      ...collection,
      sync: Stream.fromPubSub(events),
      reconnect: Effect.andThen(woken.release, restart.open).pipe(Effect.asVoid),
      awaitTxId: (txid, timeout) => awaiting(() => utils.awaitTxId(txid, Duration.toMillis(timeout))),
      awaitMatch: (match, timeout) =>
        awaiting(() =>
          utils.awaitMatch(
            (message) =>
              isChangeMessage(message) &&
              match({ operation: message.headers.operation, value: message.value as Partial<A> }),
            Duration.toMillis(timeout)
          )
        )
    }
    return self.current
  })
}

/**
 * The HTTP status Electric or a proxy answered, if a failure carries one: an
 * Electric `FetchError`, or a `SyncFailed`, anywhere in its `cause` chain.
 * Use it on a `LoadFailed` from a collection or live query over the shape.
 *
 * @category utilities
 * @since 0.1.0
 */
export const statusOf = (failure: unknown): Option.Option<number> => {
  for (let at = failure, depth = 0; depth < 8 && typeof at === "object" && at !== null; depth++) {
    if (at instanceof FetchError) return Option.some(at.status)
    if (at instanceof SyncFailed && at.status !== undefined) return Option.some(at.status)
    at = (at as { readonly cause?: unknown }).cause
  }
  return Option.none()
}

const syncFailed = (cause: Error): SyncFailed =>
  new SyncFailed(cause instanceof FetchError ? { cause, status: cause.status } : { cause })

// The schema with every field optional: an update carries only the columns that changed.
const columnwise = (schema: RowSchema<unknown>): Schema.Codec<unknown> =>
  // A row schema checks without transforming (`Collection.RowSchema`), so each field decodes with no services.
  Schema.Struct(
    Object.fromEntries(Object.entries(schema.fields).map(([name, field]) => [name, Schema.optionalKey(field)]))
  ) as unknown as Schema.Codec<unknown>

const awaiting = (wait: () => Promise<unknown>): Effect.Effect<void, AwaitTimeout | SyncFailed> =>
  Effect.tryPromise({
    try: wait,
    catch: (cause) =>
      cause instanceof TimeoutWaitingForTxIdError || cause instanceof TimeoutWaitingForMatchError
        ? new AwaitTimeout()
        : new SyncFailed({ cause })
  }).pipe(Effect.asVoid)
