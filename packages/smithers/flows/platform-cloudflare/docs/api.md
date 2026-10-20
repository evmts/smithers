---
title: "API reference"
description: "Every public export of @smthrs/platform-cloudflare: the Host surface, the runtime for one execution, the per-execution Durable Object functions, and the edge cache."
---

```ts
import { CloudflareHost, CloudflareRuntime, EdgeCache, ExecutionObject } from "@smthrs/platform-cloudflare"
```

The package has one entry point, its root. It imports no `node:` built-in and
no `cloudflare:` module, so it bundles for workerd and runs under Node.

## CloudflareHost

The closed Host surface for a Worker or a Durable Object.

### `CloudflareHost.layer`

```ts
const layer: Layer.Layer<CloudflareHost>
```

Provides `FileSystem`, `Path`, `ChildProcessSpawner`, `Jj`, `HttpClient`,
`Crypto` and `OwnerIdentity`. `Crypto` is `WebCrypto.layer` from
`@smthrs/crypto`. See [the Cloudflare Host surface](./concepts/host-surface.md) for what each one does.

A Worker's `fetch` goes through Cloudflare's network, which a Worker cannot pin
to checked addresses, and a Worker has no name resolver. So the web tools in
`@smthrs/std` (`Fetch`, `HttpPost`, `WebFetch`) refuse here with `unsupported`,
and `@smthrs/kernel`'s `HttpClient.ResolveHost` keeps its default, which
refuses every name. Smithers' destination check is never weakened to fit.

### `CloudflareHost.CloudflareHost`

```ts
type CloudflareHost =
  | FileSystem
  | Path.Path
  | ChildProcessSpawner
  | Jj.Jj
  | HttpClient
  | Crypto.Crypto
  | OwnerIdentity.OwnerIdentity
```

The services `layer` provides.

## CloudflareRuntime

### `CloudflareRuntime.layer`

```ts
const layer: <Registered, RegistrationError, RegistrationRequirements>(
  options: CloudflareRuntime.Options,
  registerFlows: Layer.Layer<Registered, RegistrationError, RegistrationRequirements>
) => Layer.Layer<…, RegistrationError, SqlClient | RegistrationRequirements>
```

The durable engine for one execution, with `registerFlows` registered:
`@smthrs/flows`' `Runtime.layer` over `CloudflareHost.layer`, with

- `owner: { hostId }` and `isAlive: Ownership.singleIncarnationLiveness` from
  `@smthrs/run-store`: an owner with the claimant's host id and another
  incarnation is an earlier incarnation of the same Durable Object, and dead;
  every other owner, the claimant included, is judged by its lease;
- `canExecute` true only for the run whose id is `executionId`;
- `sweep: { host: executionId }`: no background sweep and no lease renewal;
- `StepBoundary.layerUnsupported` and `WorkspaceSandbox.layerUnsupported`.

It provides everything `Runtime.layer` provides, `FlowRuntime`,
`EngineStore.Driver`, `RunStore` and `DurableEngineState` among them, and requires the `SqlClient` the engine
writes to (`@smthrs/database`'s `PostgresDatabase.layer`) and whatever
`registerFlows` needs beyond the engine. Build it inside the invocation that
drives the execution.

### `CloudflareRuntime.Options`

```ts
interface Options {
  readonly hostId: string
  readonly executionId: string
}
```

- `hostId`: the Durable Object, the same for every incarnation of it. Pass
  `ctx.id.toString()`.
- `executionId`: the one execution this runtime drives.

## ExecutionObject

The per-execution Durable Object, as functions a Durable Object delegates to.
See [the execution lifecycle](./concepts/execution-lifecycle.md).

### `ExecutionObject.start`

```ts
const start: <A, E, R, RS>(
  storage: ExecutionObject.Storage<RS>,
  value: ExecutionObject.Intent,
  effect: Effect.Effect<A, E, R>
) => Effect.Effect<A, E | ExecutionObject.IntentConflict, R | RS>
```

Stores the intent and arms the alarm at now plus `startGraceMs`, runs `effect`,
then moves the alarm to now. Returns `effect`'s result, or its failure
unchanged. The same intent again stores nothing and runs `effect` again;
another intent for the same object fails with `IntentConflict` before anything
is stored or run.

### `ExecutionObject.wake`

```ts
const wake: <RS>(storage: ExecutionObject.Storage<RS>) => Effect.Effect<boolean, never, RS>
```

Moves the alarm to now when an intent is stored and answers `true`; answers
`false` and arms nothing when none is. Another object's `alarm` calls it
through its `Router` when its drive made this execution due. So does whoever
completes a deferred the execution waits on, or cancels it.

### `ExecutionObject.alarm`

```ts
const alarm: <E, R, RS, RE = never, RR = never>(
  storage: ExecutionObject.Storage<RS>,
  options: {
    readonly flows: ReadonlyArray<Flow.Any>
    readonly runtime: (intent: ExecutionObject.Intent) => Layer.Layer<ExecutionObject.Services, E, R>
    readonly router: ExecutionObject.Router<RE, RR>
  }
) => Effect.Effect<ExecutionObject.Outcome, never, R | RS | RR>
```

Counts the attempt and arms the alarm one backoff away, builds
`runtime(intent)` in this alarm's scope, drives the flow named by the intent
once with `EngineStore.drive`, then routes:

- the round a handoff admitted, and the current round of each child lineage
  linked to the round just driven (to every round of the lineage once its
  last round settled): `router.start` with its intent, read from the store,
  when it is `pending` and due, and `router.wake` when it was started and is
  due now, such as one asked to cancel;
- when the execution settled and is the last round of its lineage, each parent
  due now: `router.wake`.

Then it clears the count and deletes the alarm (settled) or arms it for the
engine's next wake (parked), reading `EngineStore.nextWake` once more after
arming so a wake that landed during the alarm is kept. Never fails: a failure,
a router call's included, is `Retrying`. `flows` must list every flow an
execution may start as a child or hand off to.

### `ExecutionObject.Router`

```ts
interface Router<E = never, R = never> {
  readonly start: (intent: ExecutionObject.Intent) => Effect.Effect<void, E, R>
  readonly wake: (executionId: string) => Effect.Effect<void, E, R>
}
```

How one object reaches another, both named by execution id: `start` calls
`ExecutionObject.start` on the object named by `intent.executionId` with
nothing for the caller's effect, and `wake` calls `ExecutionObject.wake` on the
object named by `executionId`. Both must be idempotent. Supply it over the
class's own namespace binding.

### `ExecutionObject.intent`

```ts
const intent: <F extends Flow.Any>(
  flow: F,
  options: { readonly executionId: string; readonly payload: Flow.PayloadSchema<F>["Type"] }
) => Effect.Effect<ExecutionObject.Intent, Schema.SchemaError, Flow.PayloadSchema<F>["EncodingServices"]>
```

Builds an intent, encoding the payload with the flow's own JSON codec, the one
`alarm` decodes it with. Fails with `SchemaError` for a payload the schema
refuses or an empty execution id.

### `ExecutionObject.Intent`

```ts
const Intent: Schema.Struct<{
  flow: Schema.NonEmptyString
  executionId: Schema.NonEmptyString
  payload: Schema.Json
}>
type Intent = typeof Intent.Type
```

What the object runs. It is stored as its canonical JSON, so equal intents are
equal strings.

### `ExecutionObject.Storage`

```ts
interface Storage<R = never> {
  readonly get: <A = unknown>(key: string) => Effect.Effect<A | undefined, never, R>
  readonly put: <A>(key: string, value: A) => Effect.Effect<void, never, R>
  readonly delete: (key: string) => Effect.Effect<boolean, never, R>
  readonly setAlarm: (scheduledTime: number) => Effect.Effect<void, never, R>
  readonly deleteAlarm: () => Effect.Effect<void, never, R>
}
```

The slice of Durable Object storage the functions use. An Alchemy
`DurableObjectState`'s `storage` satisfies it with `R = RuntimeContext`; a plain
object wraps its Promise methods in `Effect.promise`.

### `ExecutionObject.Outcome`

```ts
type Outcome =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Settled" }
  | { readonly _tag: "Parked"; readonly wakeAtMs: number | null }
  | { readonly _tag: "Retrying"; readonly attempt: number; readonly retryAtMs: number; readonly failure: string }
```

What one alarm did. `failure` is the tag of what failed, never its message.

### `ExecutionObject.Services`

```ts
type Services = EngineStore.Driver | RunStore.RunStore | DurableEngineState.DurableEngineState
```

What `alarm` reads from the runtime it builds: `@smthrs/engine-store`'s
`EngineStore.Driver`, which `EngineStore.drive` uses, and the stores it reads
the next wake and the routes from. `CloudflareRuntime.layer` provides all three.

### `ExecutionObject.IntentConflict`

```ts
class IntentConflict extends Schema.TaggedError<IntentConflict>()(
  "@smthrs/platform-cloudflare/IntentConflict",
  { executionId: Schema.String, message: Schema.String }
)
```

### Constants

| Export                         | Value                                                               | Meaning                                                                  |
| ------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `ExecutionObject.intentKey`    | `"smithers/intent"`                                                 | The storage key the intent lives under.                                  |
| `ExecutionObject.failuresKey`  | `"smithers/failures"`                                               | The storage key the count of alarms without progress lives under.        |
| `ExecutionObject.startGraceMs` | `5_000`                                                             | How long after `start` stores an intent its alarm fires if `start` dies. |
| `ExecutionObject.retryPolicy`  | `RetryPolicy.make({ initialMs: 1_000, factor: 2, maxMs: 300_000 })` | The backoff between alarms without progress. Never gives up.             |

### Metrics

| Export                   | Name                                   | Attributes                                                 |
| ------------------------ | -------------------------------------- | ---------------------------------------------------------- |
| `ExecutionObject.starts` | `smithers_cloudflare_execution_starts` | `outcome`: `accepted`, `duplicate`, `conflict` or `failed` |
| `ExecutionObject.alarms` | `smithers_cloudflare_execution_alarms` | `outcome`: `idle`, `settled`, `parked` or `retrying`       |
| `ExecutionObject.routed` | `smithers_cloudflare_execution_routed` | `route`: `start` or `wake`, counted per successful call    |
| `ExecutionObject.wakes`  | `smithers_cloudflare_execution_wakes`  | `outcome`: `armed` or `idle`                               |

Each `alarm` span carries `smithers.execution.started` and
`smithers.execution.woken`, the counts it routed; each `wake` runs in a
`cloudflare.execution.wake` span with `smithers.execution.wake`.

## EdgeCache

`@smthrs/artifacts`' `ImmutableCache` over the Workers Cache API. Use it for
content that never changes at its key, such as a repository's tree or file at a
commit SHA: a hit costs no read from the source.

### `EdgeCache.layer`

```ts
const layer: (options?: Options) => Layer.Layer<ImmutableCache, ImmutableCacheError>

interface Options {
  readonly name?: string
  readonly maxEntryBytes?: number
  readonly caches?: CacheStorage
}

interface CacheStorage {
  readonly default?: ImmutableCache.WebCache
  readonly open: (name: string) => Promise<ImmutableCache.WebCache>
}
```

| Option          | Default                | Meaning                                                                                               |
| --------------- | ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `name`          | none: `caches.default` | A named cache from `caches.open(name)`, apart from `caches.default`, which the zone's `fetch` shares. |
| `maxEntryBytes` | 8 MiB                  | The largest entry stored; a larger `put` answers `too_large`.                                         |
| `caches`        | the global `caches`    | The `CacheStorage` to use instead. Tests inject one that refuses.                                     |

The layer's telemetry and errors are labelled `cloudflare`. Without a `caches`
global, or without `caches.default` when no `name` is given, or when
`caches.open` rejects, the layer fails with `ImmutableCacheError` and reason
`unavailable`.

```ts
import { ImmutableCache } from "@smthrs/artifacts"
import { EdgeCache } from "@smthrs/platform-cloudflare"

const blob = ImmutableCache.readThrough(
  ImmutableCache.key("repo.blob", repo, sha, path),
  readBlob(repo, sha, path) // a failure, such as a spent budget, is never stored
).pipe(Effect.provide(EdgeCache.layer({ name: "repo" })))
```

What the Workers Cache API means for it:

- **One data center.** An entry lives in the data center that stored it and is
  not replicated, so each data center misses once.
- **Eviction.** Cloudflare may evict any entry; a `get` then misses.
- **Subrequests.** Each `get` and `put` counts toward the request's subrequest
  limit (50 on Workers Free, 1,000 on Paid), as `fetch` does.
- **Cache-Control.** Each stored response carries `Cache-Control: public,
  max-age=31536000, immutable`; without it the Workers cache stores nothing.
- **Previews.** The dashboard editor and Playground previews ignore every Cache
  API call, so there every `get` misses.
