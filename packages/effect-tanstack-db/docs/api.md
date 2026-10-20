---
title: "API reference"
description: "Every export of @smthrs/effect-tanstack-db: the Collection, LiveQuery, Query, Persistence and Outbox namespaces, their models, constructors, metrics and errors."
---

The package root exports five namespaces and nothing else:

```ts
import { Collection, LiveQuery, Outbox, Persistence, Query } from "@smthrs/effect-tanstack-db"
```

## `Collection`

### `Collection.local`

```ts
const local: <A extends object, K extends Key>(options: {
  readonly id: string
  readonly schema: RowSchema<A>
  readonly getKey: (row: A) => K
  readonly initialData?: ReadonlyArray<NoInfer<A>>
}) => Effect.Effect<Collection<A, K>, never, Scope.Scope>
```

An in-memory collection, cleaned up when the scope closes. Its writes apply at
once and need no handler. `initialData` is decoded with `schema`; a row that
doesn't decode is a defect. The row type comes from `schema`, the key type from
`getKey`.

### `Collection.persisted`

```ts
const persisted: <A extends object, K extends Key>(options: {
  readonly id: string
  readonly schema: RowSchema<A>
  readonly getKey: (row: A) => K
  readonly schemaVersion: number
}) => Effect.Effect<Collection<A, K>, never, Scope.Scope | Persistence.Persistence>
```

An in-memory collection whose rows are kept on the device through
`Persistence`, and restored by the next program that makes it: TanStack DB's
persisted collection without a sync source. Its writes apply at once, then are
stored; `preload` and `restored` wait for the stored rows. A write the device
couldn't store rolls back: it is logged as `persisted write failed` at Warn
level, with `collection`, `operation` and `error` (the error's name, never its
message), and counted in `Persistence.writeFailures`. A changed
`schemaVersion` does what the persistence's `schemaMismatchPolicy` says.
Without a database (`Persistence.memory`, or one that couldn't open) it is the
same as `local`.

### `Collection.make`

```ts
function make<A extends object, K extends Key, U extends UtilsRecord = UtilsRecord>(
  schema: RowSchema<A>,
  options: Options<A, K, U>
): Effect.Effect<Collection<A, K, U>, never, Scope.Scope>
function make<A extends object, K extends Key, U extends UtilsRecord = UtilsRecord>(
  schema: RowSchema<A>,
  options: Options<A, K, U>,
  settings: { readonly persist: Persist }
): Effect.Effect<Collection<A, K, U>, never, Scope.Scope | Persistence.Persistence>
```

The collection TanStack DB creates from a sync adapter's options, checked by
`schema`, and cleaned up when the scope closes. It sets the schema, turns
garbage collection off and indexes fields eagerly as queries need them. Use it
to build a sync adapter's collection; use `local` for in-memory state.

With `persist`, the collection keeps its rows, and its sync adapter's resume
state, through `Persistence`: TanStack DB's `persistedCollectionOptions` with
network-first initial rendering that waits for no network
(`networkTimeoutMs: 0`), so the rows restored from the device show at once and
the network's rows follow. `restored` waits for them, and the milliseconds it
took are recorded in `Persistence.restoreMs`. Without a database, the rows stay
in memory.

### `Collection.Persist`

```ts
interface Persist {
  readonly schemaVersion: number
}
```

How a collection keeps its rows on the device. `schemaVersion` names the rows'
shape: when it changes, a synced collection drops the rows kept under the old
one and syncs again; a collection without a sync source does what the
persistence's `schemaMismatchPolicy` says.

### `Collection.Collection<A, K, U>`

```ts
interface Collection<A extends object, K extends Key = Key, U extends UtilsRecord = UtilsRecord> {
  readonly id: string
  readonly tanstack: TanStackCollection<A, K, U>
  readonly toArray: Effect.Effect<ReadonlyArray<A>>
  readonly get: (key: K) => Effect.Effect<Option.Option<A>>
  readonly isSynced: (key: K) => Effect.Effect<boolean>
  readonly preload: Effect.Effect<void, LoadFailed>
  readonly restored: Effect.Effect<void, LoadFailed>
  readonly changes: (options?: { readonly initial?: boolean }) => Stream.Stream<ReadonlyArray<Change<A, K>>>
  readonly insert: (rows: A | ReadonlyArray<A>) => Effect.Effect<Transaction, MutationRefused>
  readonly update: (key: K, recipe: (draft: WritableDeep<A>) => void) => Effect.Effect<Transaction, MutationRefused>
  readonly delete: (keys: K | ReadonlyArray<K>) => Effect.Effect<Transaction, MutationRefused>
}
```

| Field                        | Does                                                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tanstack`                   | The TanStack DB collection, for a framework binding and for `from` in a live query. See [Frameworks](frameworks.md).                                                                                               |
| `toArray`                    | The rows as they are now, optimistic writes included.                                                                                                                                                              |
| `get`                        | One row as it is now.                                                                                                                                                                                              |
| `isSynced`                   | Whether the row is there as the sync source has it: present, with no optimistic write of its own pending. A row a mutation inserted is not synced until its handler persists it and the source delivers it back.   |
| `preload`                    | Starts the sync and waits for the first rows: for a synced collection, the network's. Fails with `LoadFailed`.                                                                                                     |
| `restored`                   | Starts the collection and waits until the rows kept on the device have loaded, whatever the network does. For a collection that keeps none, the same as `preload`. Fails with `LoadFailed` when the restore fails. |
| `changes`                    | The change batches from when the stream starts. Without `initial`, every later change, including to rows that existed before; with `initial`, the current rows first.                                              |
| `insert`, `update`, `delete` | Apply at once. Fail with `MutationRefused`. Return the `Transaction`.                                                                                                                                              |

### `Collection.Change<A, K>`

```ts
interface Change<A, K extends Key = Key> {
  readonly type: "insert" | "update" | "delete"
  readonly key: K
  readonly value: A
  readonly previousValue: A | undefined
}
```

One change, in the batch TanStack DB published it in. `previousValue` is the
row before an update.

### `Collection.Transaction`

```ts
interface Transaction {
  readonly id: string
  readonly persisted: Effect.Effect<void, TransactionFailed>
}
```

`persisted` succeeds once the collection's mutation handler, if it has one,
accepted the mutation, and fails with `TransactionFailed` when the handler
failed and the mutation rolled back.

### `Collection.RowSchema<A>`

```ts
type RowSchema<A> = Schema.Codec<A, A>
```

A schema that checks rows and never transforms them, so a row's encoded and
decoded forms are the same type. TanStack DB stores what a mutation passes and
validates merged rows on update, so a transforming schema such as
`Schema.NumberFromString` is refused at compile time.

### `Collection.Options<A, K, U>`

```ts
type Options<A extends object, K extends Key, U extends UtilsRecord> =
  & Omit<CollectionConfig<A, K, never, U>, "schema" | "gcTime" | "autoIndex" | "defaultIndexType" | "utils">
  & { readonly utils?: U }
```

The options TanStack DB creates a collection from, as a sync adapter returns
them, without the fields `make` sets.

### `Collection.Key`

```ts
type Key = string | number
```

### Errors

| Error               | Fields                                                          | When                                                                                                                                                          |
| ------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MutationRefused`   | `operation: "insert" \| "update" \| "delete"`, `cause: unknown` | TanStack DB refused a mutation before applying it: a duplicate key, a key that isn't there, a row the schema refused, or no handler for the operation.        |
| `TransactionFailed` | `cause: unknown`                                                | A transaction rolled back because its handler failed; `cause` is the handler's failure.                                                                       |
| `LoadFailed`        | `cause: unknown`                                                | Rows a collection or live query needed didn't load: its first sync failed, or a window's rows couldn't be fetched. `cause` is what the sync adapter reported. |

All three are `Data.TaggedError`s, so `Effect.catchTag` narrows them.

## `LiveQuery`

### `LiveQuery.make`

```ts
const make: <Q extends AnyQuery>(
  query: (q: InitialQueryBuilder) => Q
) => Effect.Effect<LiveQuery<Q>, never, Scope.Scope>
```

A live query over other collections, built with TanStack DB's query builder and
the expressions in `Query`, cleaned up when the scope closes. Name a source by
its `tanstack` field: `q.from({ todo: todos.tanstack })`. It starts on its
first read, `preload` or stream.

### `LiveQuery.LiveQuery<Q>`

```ts
interface LiveQuery<Q extends AnyQuery> {
  readonly tanstack: TanStackLiveQuery<Q>
  readonly toArray: Effect.Effect<ReadonlyArray<Row<Q>>>
  readonly preload: Effect.Effect<void, LoadFailed>
  readonly rows: Stream.Stream<ReadonlyArray<Row<Q>>>
  readonly changes: (options?: { readonly initial?: boolean }) => Stream.Stream<ReadonlyArray<Change<Row<Q>>>>
  readonly setWindow: (window: Partial<Window>) => Effect.Effect<void, LoadFailed>
}
```

| Field       | Does                                                                                                                                                                                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tanstack`  | The TanStack DB collection behind the query.                                                                                                                                                                                                                                           |
| `toArray`   | The result as it is now.                                                                                                                                                                                                                                                               |
| `preload`   | Starts the query and waits for its first result. Fails with `LoadFailed`.                                                                                                                                                                                                              |
| `rows`      | The result when the stream starts, then again after every change. A result can repeat; none is skipped.                                                                                                                                                                                |
| `changes`   | As `Collection.changes`, over the result.                                                                                                                                                                                                                                              |
| `setWindow` | Moves the window of a query with `orderBy` and `limit`. The window moves when the Effect runs; the Effect succeeds once the rows it needs have loaded. It fails with `LoadFailed` when they don't load, or when the query has no window; the query then keeps its last settled window. |

TanStack DB adds its virtual properties (`$synced`, `$key`, `$origin`,
`$collectionId`, `$hasPendingWrites`) to every result row.

### Types

| Type                   | Is                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `AnyQuery`             | `QueryBuilder<any>`: any query TanStack DB's builder returns.                                           |
| `Row<Q>`               | The row type query `Q` selects.                                                                         |
| `TanStackLiveQuery<Q>` | The TanStack DB collection behind `Q`: a single result for a query ending in `findOne()`, else many.    |
| `Window`               | `{ readonly offset: number; readonly limit: number }`: `limit` rows from `offset` of an ordered result. |

## `Query`

```ts
export { and, caseWhen, eq, gt, gte, isNull, isUndefined, lt, lte, not, or } from "@tanstack/db"
```

TanStack DB's expressions, re-exported as they are. They are pure data: each
call returns a description of an expression for a live query to compile, and
runs nothing, so they need no Effect wrapper. Nothing else from TanStack DB is
re-exported; import its types from `@tanstack/db` where a signature needs one.

## `Persistence`

TanStack DB's SQLite persistence as an Effect service. The host supplies
everything platform-specific as arguments, so the module imports and runs
anywhere Effect does.

### `Persistence.layer`

```ts
const layer: <D extends Database>(options: Options<D>) => Layer.Layer<Persistence>

interface Options<D extends Database> {
  readonly open: () => Promise<D> | D
  readonly make: (
    database: D,
    coordinator: PersistedCollectionCoordinator | undefined
  ) => PersistedCollectionPersistence
  readonly coordinator?: () => Coordinator
}
```

| Option        | Is                                                                                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open`        | Opens the database: `openBrowserWASQLiteOPFSDatabase` in a tab, a file in Node. A throw or rejection means the database is unavailable.                   |
| `make`        | TanStack DB's persistence over the open database, sharing `coordinator` when there is one: `createBrowserWASQLitePersistence({ database, coordinator })`. |
| `coordinator` | Makes the coordinator that shares one database between a browser's tabs: `new BrowserCollectionCoordinator({ dbName })`.                                  |

Opens the database and builds the persistence. When the layer closes, the
coordinator is disposed, then the database closed; a close that fails is
ignored. When `open` fails, collections keep their rows in memory: the layer
logs `persistence unavailable` at Warn level with an `error` annotation (the
error's tag, `PersistenceUnavailable`), counts `unavailable`, and succeeds.

```ts
import {
  BrowserCollectionCoordinator,
  createBrowserWASQLitePersistence,
  openBrowserWASQLiteOPFSDatabase
} from "@tanstack/browser-db-sqlite-persistence"

const DeviceStore = Persistence.layer({
  open: () => openBrowserWASQLiteOPFSDatabase({ databaseName: "app.sqlite" }),
  make: (database, coordinator) =>
    createBrowserWASQLitePersistence({ database, ...(coordinator ? { coordinator } : {}) }),
  coordinator: () => new BrowserCollectionCoordinator({ dbName: "app" })
})
```

`make` accepts any database TanStack DB's driver can use: an object with
`execute(sql, params)` and an optional `close`. The package's tests hand it one
over `node:sqlite`.

### `Persistence.memory`

```ts
const memory: Layer.Layer<Persistence>
```

No database: every persisted collection keeps its rows in memory. For a program
or test that persists nothing.

### Models

| Type          | Is                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `Persistence` | The service: `{ readonly persistence: Option.Option<PersistedCollectionPersistence> }`, none when rows stay in memory.   |
| `Database`    | `{ readonly close?: () => Promise<void> \| void }`: whatever `open` returns and `make` builds on.                        |
| `Coordinator` | TanStack DB's `PersistedCollectionCoordinator` with an optional `dispose`, run as the layer closes, before the database. |

### Metrics and errors

| Export                   | Is                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `unavailable`            | Counter `persistence_unavailable`: times the database couldn't open, so rows stayed in memory.                                      |
| `restoreMs`              | Histogram `persistence_restore_ms`, by `collection` (its id): milliseconds from making a persisted collection to its rows restored. |
| `writeFailures`          | Counter `persistence_write_failures`, by `collection` and `operation`: writes to a persisted collection the device couldn't store.  |
| `PersistenceUnavailable` | `Data.TaggedError` with `cause: unknown`: the database couldn't be opened. `cause` is what the host reported.                       |

## `Outbox`

A durable outbox for TanStack DB writes, through
`@tanstack/offline-transactions`. A write is an offline transaction: its
optimistic rows show at once, the transaction is stored durably (IndexedDB in a
browser) before anything is sent, and the library sends it with its own
backoff, one at a time in the order written, across reloads and restarts. Only
a program that leads the outbox, with durable storage, admits a write.

### `Outbox.layer`

```ts
const layer: <R>(options: Options<R>) => Layer.Layer<Outbox, never, R>

interface Options<R> {
  readonly start: (config: OfflineConfig) => OfflineExecutor
  readonly collections: Readonly<Record<string, Collection<any, any, any>>>
  readonly storage: StorageAdapter
  readonly leader?: Leader
  readonly online: Online
  readonly mutations: Readonly<Record<string, Mutation<R>>>
}

type Mutation<R> = (params: {
  readonly rows: ReadonlyArray<unknown>
  readonly idempotencyKey: string
}) => Effect.Effect<void, Refused | Retry, R>
```

| Option        | Is                                                                                                                                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start`       | The library's entry point: `startOfflineExecutor` from `@tanstack/offline-transactions`.                                                                                                                                |
| `collections` | The collections writes may change, keyed by a name that never changes: a stored write names its collection by this key, so a write queued by one version of a program is restored into the same collection by the next. |
| `storage`     | Where writes are stored: `new IndexedDBAdapter(...)` in a browser. The library's own storage probe is skipped.                                                                                                          |
| `leader`      | Who leads: a `LeaderElection`, such as `lockLeader`'s. Without one, the library elects with its own `WebLocksLeader`, which never queues: when the leader closes, no other program takes over.                          |
| `online`      | The network detector: the library's `WebOnlineDetector` in a browser, `Online.always()` elsewhere.                                                                                                                      |
| `mutations`   | The named mutations, as Effects run with the services of the fiber that builds the layer.                                                                                                                               |

Starts the outbox and waits until it has loaded the writes stored earlier,
restored their rows, and asked to lead; a storage it can't read at start is
logged as `outbox couldn't load its writes` at Warn level. The outbox stops
when the layer closes.

A mutation's typed failure becomes the library's retry decision:

| Mutation fails with | The write                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Retry`             | Is sent again after the library's backoff, 1 second doubling to 60, jittered, or at once on `retryNow` or the browser coming back online.                          |
| `Refused`           | Is never sent again; its optimistic rows roll back and `settled` fails.                                                                                            |
| a defect            | Is never sent again; its rows roll back, and it is logged as `outbox write failed` at Error level with `name` and `outcome: "defect"`, never the defect's message. |

The outbox throws the library errors with fixed messages, and its
`shouldRetry` retries only an error named `OutboxRetry`. So the library's own
rules, which never retry an `AbortError` or an error whose message contains
`400`, `401`, `403` or `422`, never see any other error: an aborted request or
a status in a message can't stop a write that should be sent again.

### `Outbox.Outbox`

```ts
interface Service {
  readonly transact: (
    name: string,
    ids: { readonly idempotencyKey: string },
    mutate: Effect.Effect<void, MutationRefused>
  ) => Effect.Effect<Write, NotAdmitted | MutationRefused>
  readonly status: Stream.Stream<Status>
  readonly retryNow: Effect.Effect<void>
}

interface Write {
  readonly id: string
  readonly admitted: Effect.Effect<void, NotAdmitted>
  readonly settled: Effect.Effect<void, TransactionFailed>
}

interface Status {
  readonly leader: boolean
  readonly failing: null | "network" | "server"
}
```

| Field      | Does                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transact` | Writes through mutation `name`. `mutate` runs at once, synchronously, inside the write, so its inserts, updates and deletes show as optimistic rows until the write settles. Fails with `NotAdmitted` when this program doesn't lead (it never takes the library's online-only path), and with `mutate`'s `MutationRefused`, after rolling the write back. The current span, if any, is stored with the write. |
| `status`   | The outbox's state now, then each change: whether this program leads, and whether the last send failed on the `network` (no status) or at the `server`; null once a send gets through.                                                                                                                                                                                                                         |
| `retryNow` | Sends every waiting write now instead of waiting out its backoff: the network detector's `notifyOnline`.                                                                                                                                                                                                                                                                                                       |

`Write.admitted` succeeds once the write is stored, and fails with
`NotAdmitted` (`reason: "storage"`) when the storage refused it, or
`reason: "follower"` when leadership was lost before persistence; the write then
rolls back. `Write.settled` succeeds once the mutation succeeded, and fails
with `TransactionFailed` when the write rolled back.

### `Outbox.lockLeader` and `Outbox.Lock`

```ts
interface Lock {
  readonly hold: (name: string) => Effect.Effect<void, never, Scope.Scope>
}

const lockLeader: (options: {
  readonly lock: Lock
  readonly name: string
  readonly grantWithin?: Duration.Input
}) => Effect.Effect<Leader & { readonly dispose: () => void }, never, Scope.Scope>
```

A leader for the outbox over a lock service, so the outbox shares the host's one
election mechanism: `hold(name)` waits until this program holds the exclusive
lock `name` and holds it until the scope closes, as `@smthrs/platform-browser`'s
`WebLock` does. Unlike the library's `WebLocksLeader`, a program that doesn't
get the lock waits for it, so when the leader closes, the next one leads and
restores the writes it stored. `requestLeadership` answers within
`grantWithin` (default 100 ms); a lock granted later is reported through
`onLeadershipChange`. The lock is released when the outbox stops or the scope
closes.

```ts
const leader = yield * Outbox.lockLeader({ lock: WebLock.make(navigator.locks), name: "app-outbox" })
```

### `Outbox.Online.always`

```ts
const Online: { readonly always: () => Online }
```

A network detector that is always online: the outbox sends whenever it has a
write, and `retryNow` sends at once. For Node, a Worker or a test, where the
library's browser detector has no `online` event to follow, and reads Node as
offline.

### Models, errors and records

| Export             | Is                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Leader`           | The library's `LeaderElection`.                                                                                                                                                |
| `Online`           | The library's `OnlineDetector`.                                                                                                                                                |
| `Refused`          | `Data.TaggedError` with `status?: number`: the server refused the write for good.                                                                                              |
| `Retry`            | `Data.TaggedError` with `status?: number`: the write didn't get through (a 5xx, 408 or 429, or no status for the network or a deadline).                                       |
| `NotAdmitted`      | `Data.TaggedError` with `reason: "follower" \| "storage"`: another program leads, or the storage failed to store the write. Nothing was sent and the write's rows rolled back. |
| `attempts`         | Counter `outbox_attempts`, by `name` and `outcome`: `sent`, `retry`, `refused` or `defect`.                                                                                    |
| `refused`          | Counter `outbox_refused`, by `name` and `status` (`none` without one).                                                                                                         |
| `queuedMs`         | Histogram `outbox_queued_ms`, by `name`: milliseconds from a write to its mutation succeeding.                                                                                 |
| `leaderChanges`    | Counter `outbox_leader_changes`, by `leader` (`true` or `false`).                                                                                                              |
| span `outbox.send` | One per send, with `name`, `attempt` and `outcome`, linked to the span the write was made in, so a send after a reload still points at the ask.                                |
