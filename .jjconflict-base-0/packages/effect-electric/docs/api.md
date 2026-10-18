---
title: "API reference"
description: "Every export of @smthrs/effect-electric: the ElectricCollection, SyncPolicy and ShapeProxy namespaces, their models, constructors and errors."
---

The package root exports four namespaces and nothing else:

```ts
import { ElectricCollection, ShapeProxy, ShapeSource, SyncPolicy } from "@smthrs/effect-electric"
```

## `ElectricCollection`

### `ElectricCollection.make`

```ts
function make<A extends Row<unknown>, E = never, R = never>(
  options: Options<A, E, R> & { readonly persist: Collection.Persist }
): Effect.Effect<ElectricCollection<A>, never, Scope.Scope | R | Persistence.Persistence>
function make<A extends Row<unknown>, E = never, R = never>(
  options: Options<A, E, R> & { readonly persist?: undefined }
): Effect.Effect<ElectricCollection<A>, never, Scope.Scope | R>
```

A collection synced from an Electric shape, cleaned up when the scope closes.

- Every synced row is decoded by `schema`, column by column, because Electric
  sends an update's changed columns only. A row with a column that doesn't
  decode stops the shape (`Stopped`, with no status).
- Its mutation handlers and its shape requests run with
  `Effect.runPromiseWith` and the services of the fiber that runs `make`, so
  they share its logger, tracer, metrics and `HttpClient`. `R` is what the
  handlers need. They stop when the scope closes.
- Every shape request goes through the `ShapeSource` service in the context
  of the fiber that ran `make`: Electric through `fetch` unless a program
  provides another source.
- A request that fails on the network, or with a 5xx or 429, waits on `retry`
  and is sent again. See [The sync policy](sync-policy.md).
- With `persist`, the collection keeps its rows and Electric's resume state
  (the shape's handle and offset) on the device through
  `@smthrs/effect-tanstack-db`'s `Persistence`. The next program restores the
  rows before the network answers (`restored`), and its first shape request
  resumes from the stored handle and offset instead of the start. A new
  `schemaVersion` drops the rows kept under the old one and syncs from the
  start. Synced rows are stored a moment after they show, so a program closed
  at once may sync them again next time.

### `ElectricCollection.Options<A, E, R>`

```ts
interface Options<A extends object, E, R> {
  readonly id: string
  readonly schema: RowSchema<A>
  readonly getKey: (row: A) => Key
  readonly shape: Pick<ShapeStreamOptions, "url" | "params" | "headers" | "columnMapper" | "parser">
  readonly syncMode?: "eager" | "progressive"
  readonly persist?: Collection.Persist
  readonly retry?: Schedule.Schedule<unknown, ShapeSource.RequestFailed>
  readonly onInsert?: (params: Persist<A>) => Effect.Effect<void, E, R>
  readonly onUpdate?: (params: Persist<A>) => Effect.Effect<void, E, R>
  readonly onDelete?: (params: Persist<A>) => Effect.Effect<void, E, R>
}
```

| Option                 | Is                                                                                                                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                   | The collection's id.                                                                                                                                                                                                                                |
| `schema`               | The rows' `RowSchema`.                                                                                                                                                                                                                              |
| `getKey`               | A row's key.                                                                                                                                                                                                                                        |
| `shape`                | Where the shape is and how its rows are read: Electric's own `url`, `params`, `headers`, `columnMapper` and `parser`. Its retry and error options belong to this package.                                                                           |
| `syncMode`             | `eager` (the default): the whole shape before the collection is ready. `progressive`: what queries ask for first, then the whole shape. Either way the collection holds every row of the shape, so a device can read all of it without the network. |
| `persist`              | `{ schemaVersion }`: keep the rows and Electric's resume state on the device through `Persistence`, which the collection then needs.                                                                                                                |
| `retry`                | The sync policy. Defaults to `SyncPolicy.defaultPolicy`.                                                                                                                                                                                            |
| `onInsert`             | Persists optimistic inserts. It must not succeed until Electric has delivered them (`awaitTxId` or `awaitMatch`); failing rolls them back.                                                                                                          |
| `onUpdate`, `onDelete` | The same, for updates and deletes.                                                                                                                                                                                                                  |

### `ElectricCollection.ElectricCollection<A>`

```ts
interface ElectricCollection<A extends object>
  extends Collection.Collection<A, Key, ElectricCollectionUtils<Row<unknown>>>
{
  readonly sync: Stream.Stream<SyncEvent>
  readonly reconnect: Effect.Effect<void>
  readonly awaitTxId: (txid: number, timeout: Duration.Input) => Effect.Effect<void, AwaitTimeout | SyncFailed>
  readonly awaitMatch: (
    match: (change: Delivered<A>) => boolean,
    timeout: Duration.Input
  ) => Effect.Effect<void, AwaitTimeout | SyncFailed>
}
```

Everything a `Collection` from `@smthrs/effect-tanstack-db` has, `restored`
included, and:

| Field        | Does                                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sync`       | The shape's sync status: each request's outcome, and the shape stopping. A stream started late begins with the latest event.                                             |
| `reconnect`  | Sends every request waiting out the policy now, and restarts a stopped shape where it stopped.                                                                           |
| `awaitTxId`  | Waits until Electric delivers Postgres transaction `txid` and TanStack DB has applied it.                                                                                |
| `awaitMatch` | Waits until Electric delivers a change `match` accepts and TanStack DB has applied it. A change already applied and still among the collection's recent messages counts. |

Both waits fail with `AwaitTimeout` after `timeout`, and with `SyncFailed` when
the wait ends any other way, such as the collection being cleaned up.

### `ElectricCollection.SyncEvent`

```ts
type SyncEvent =
  | { readonly _tag: "Sent" }
  | { readonly _tag: "Succeeded" }
  | { readonly _tag: "Failed"; readonly status?: number }
  | { readonly _tag: "Stopped"; readonly error: SyncFailed }
```

| Event       | When                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `Sent`      | A shape request went out.                                                                                                      |
| `Succeeded` | It was answered with a 2xx.                                                                                                    |
| `Failed`    | It failed on the network (no `status`) or with a 5xx or 429, and waits on the policy.                                          |
| `Stopped`   | Electric gave up on the shape: a 4xx, a response it couldn't read or decode, or a policy that ended. It waits for `reconnect`. |

A request Electric aborts, and a 4xx before `Stopped`, report neither
`Succeeded` nor `Failed`.

### `ElectricCollection.Delivered<A>`

```ts
interface Delivered<A> {
  readonly operation: "insert" | "update" | "delete"
  readonly value: Partial<A>
}
```

One change as `awaitMatch` sees it. An update carries only the columns that
changed, so `value` is partial.

### `ElectricCollection.Persist<A>`

```ts
interface Persist<A extends object> {
  readonly rows: ReadonlyArray<A>
  readonly collection: ElectricCollection<A>
}
```

What a mutation handler receives: the new rows for an insert or update, the
deleted rows for a delete, and the collection, to await the write with.

### `ElectricCollection.RowSchema<A>`

```ts
type RowSchema<A> = Collection.RowSchema<A> & { readonly fields: Schema.Struct.Fields }
```

A `Schema.Struct` that checks rows without transforming them.

### `ElectricCollection.statusOf`

```ts
const statusOf: (failure: unknown) => Option.Option<number>
```

The HTTP status Electric or a proxy answered, if a failure carries one: an
Electric `FetchError`, or a `SyncFailed` with a status, anywhere in its `cause`
chain, within its first 8 levels. Use it on a `LoadFailed` from a collection or live
query over the shape.

### `ElectricCollection.snakeCamelMapper`

Electric's mapper between `snake_case` columns and `camelCase` fields,
re-exported as it is. It is pure configuration for `shape.columnMapper`:

```ts
shape: { url, columnMapper: ElectricCollection.snakeCamelMapper() }
```

### `ElectricCollection.Key`

```ts
type Key = string | number
```

### Errors

| Error          | Fields                              | When                                                                                                                                                                                                                                          |
| -------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SyncFailed`   | `cause: unknown`, `status?: number` | Electric stopped the shape, or a wait ended because it did. `status` is the 4xx, or the 5xx or 429 a policy gave up on; without one, the request failed on the network after the policy gave up, or the response couldn't be read or decoded. |
| `AwaitTimeout` | none                                | Electric didn't deliver what `awaitTxId` or `awaitMatch` waited for in time.                                                                                                                                                                  |

## `ShapeSource`

The service an Electric collection sends its shape requests through: the
source of its shape stream. Without a layer it is `fetchSource`.

```ts
interface Source {
  readonly request: (url: string, init: RequestInit) => Effect.Effect<Response, RequestFailed>
}
const ShapeSource: Context.Reference<Source>
const fetchSource: Source
class RequestFailed extends Data.TaggedError("RequestFailed")<{ readonly status?: number }> {}
```

| Export          | Is                                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `ShapeSource`   | The service, a `Context.Reference` whose default is `fetchSource`.                                                                     |
| `fetchSource`   | The real source: each request sent with the `fetch` in Effect's `FetchHttpClient.Fetch`, the global one unless a program provides one. |
| `RequestFailed` | A shape request failed on the network (no `status`) or with a 5xx or 429. The sync policy is stepped with it.                          |

### Testing unhappy paths: `layerFaulty` and `Faults`

```ts
type Requests = "all" | "live"
interface Switches {
  readonly down: (requests?: Requests) => Effect.Effect<void>
  readonly refuse: (status?: number, requests?: Requests) => Effect.Effect<void>
  readonly stall: (requests?: Requests) => Effect.Effect<void>
  readonly corrupt: (requests?: Requests) => Effect.Effect<void>
  readonly heal: Effect.Effect<void>
  readonly sent: Effect.Effect<ReadonlyArray<URL>>
}
class Faults extends Context.Service<Faults, Switches>()(...) {}
const layerFaulty: (start?: (switches: Switches) => Effect.Effect<void>) => Layer.Layer<Faults | ...>
```

`layerFaulty` is the test implementation of `ShapeSource`: the source in place
when the layer is built, behind switches. Healthy, it is that source unchanged.
Test what a program does when sync fails by providing it, and keep every
happy-path test on the real source. Nothing intercepts a request: the
collection asks the faulty source, as it asks the real one.

| Switch    | Effect                                                                                       |
| --------- | -------------------------------------------------------------------------------------------- |
| `down`    | Requests fail on the network and never reach Electric, as when a device is offline.          |
| `refuse`  | Requests are answered with `status` (default 400) and never reach Electric, as by a gateway. |
| `stall`   | Responses that arrive from Electric, a long poll's included, are held until `heal`.          |
| `corrupt` | Responses come back with Electric's status and headers and a body cut short.                 |
| `heal`    | Back to the real source; held responses go through.                                          |
| `sent`    | Every request's URL, in order.                                                               |

`requests` narrows a fault to live requests: the long polls that follow the
shape.
`down` and `refuse` act when a request starts; `stall` and `corrupt` when its
response arrives. `start` throws switches before anything uses the source, for
a program that must open with sync already failing.

```ts
const program = Effect.gen(function*() {
  const faults = yield* ShapeSource.Faults
  const todos = yield* ElectricCollection.make({ id: "todos", schema: Todo, getKey: (todo) => todo.id, shape })
  yield* faults.down()
  // ... the program's offline behavior ...
  yield* faults.heal
}).pipe(Effect.provide(ShapeSource.layerFaulty()))
```

## `SyncPolicy`

```ts
interface Backoff {
  readonly initial: Duration.Input
  readonly max: Duration.Input
}

const backoff: (options: Backoff) => Schedule.Schedule<Duration.Duration>
const defaultPolicy: Schedule.Schedule<Duration.Duration>
```

`backoff` waits `initial`, doubling after each failure in a row up to `max`,
forever, each wait jittered to between 80% and 120% of its delay.
`defaultPolicy` is `backoff({ initial: "1 second", max: "10 seconds" })`. See
[The sync policy](sync-policy.md).

## `ShapeProxy`

```ts
const make: (
  options: Options
) => Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  never,
  HttpServerRequest.HttpServerRequest | HttpClient.HttpClient
>

const config: (options?: { readonly url?: string }) => Config.Config<Connection>

const defaultMetric: Metric.Counter<number>
```

| Model        | Fields                                                                                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Connection` | `url: string`, `secret?: Redacted<string>`, `sourceId?: string`                                                                                                      |
| `Shape`      | `table: string`, `where?: string`, `params?: Readonly<Record<string, string>>`, `columns?: ReadonlyArray<string>` (the only columns sent; every column when omitted) |
| `Options`    | everything in `Connection`, and `shape: Shape`, `name?: string`, `metric?: Metric.Counter<number>`                                                                   |

`make` serves one shape; `config` reads `ELECTRIC_URL`, `ELECTRIC_SECRET` and
`ELECTRIC_SOURCE_ID`; `defaultMetric` is the `electric_shape_requests` counter
`make` updates when `metric` is omitted. See
[Proxy shapes through your server](shape-proxy.md).
