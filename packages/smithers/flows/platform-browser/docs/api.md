---
title: "API reference"
description: "Every public export of @smthrs/platform-browser: the entry points, the two structural backend slices, what the filesystem serves and refuses, where the spawner diverges from a process table, and the durable engine."
---

```ts
import { BrowserServices } from "@smthrs/platform-browser"
import * as Effect from "effect/Effect"
import { ChildProcess } from "effect/process"

const makeProgram = (options: Parameters<typeof BrowserServices.layer>[0]) =>
  Effect.scoped(ChildProcess.make`ls -la`).pipe(
    Effect.provide(BrowserServices.layer(options))
  )
```

Both backends are arguments, not imports: neither `@zenfs/core` nor `just-bash`
is a dependency here. The page owns which ZenFS backend is mounted (IndexedDB,
OPFS, memory) and which just-bash instance is wired to it, and the signature
says so. The package's own dependencies are `effect`, `@smthrs/kernel`, whose
`CommandLine.render` produces the line the interpreter runs and whose
`withIsolatedFileSystem` marks the mounted volume as confined, `@smthrs/jj`,
whose wasm-backed `Jj` service the `BrowserHost` bundle composes, and, for the
durable engine, `@smthrs/flows` with the engine packages it composes and
`@journeyapps/wa-sqlite`.

:::danger
The filesystem behind `fs` and the one behind `bash` must be the _same_
filesystem, or the spawner and the `FileSystem` service will disagree about what
exists.
:::

## Entry points

| Import                                                | Source                                                                                                                                                                       | Platform |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `@smthrs/platform-browser`                            | [src/index.ts](https://github.com/smithersai/smithers/blob/main/packages/smithers/flows/platform-browser/src/index.ts)                                                       | any      |
| `@smthrs/platform-browser/BrowserFileSystem`          | [src/BrowserFileSystem/index.ts](https://github.com/smithersai/smithers/blob/main/packages/smithers/flows/platform-browser/src/BrowserFileSystem/index.ts)                   | any      |
| `@smthrs/platform-browser/BrowserChildProcessSpawner` | [src/BrowserChildProcessSpawner/index.ts](https://github.com/smithersai/smithers/blob/main/packages/smithers/flows/platform-browser/src/BrowserChildProcessSpawner/index.ts) | any      |
| `@smthrs/platform-browser/BrowserServices`            | [src/BrowserServices.ts](https://github.com/smithersai/smithers/blob/main/packages/smithers/flows/platform-browser/src/BrowserServices.ts)                                   | any      |
| `@smthrs/platform-browser/BrowserHost`                | [src/BrowserHost.ts](https://github.com/smithersai/smithers/blob/main/packages/smithers/flows/platform-browser/src/BrowserHost.ts)                                           | any      |

Every module bundles for a browser, `BrowserHost` included: nothing this
package publishes resolves a `node:` built-in.

## The layers are functions

`NodeServices.layer` is a value; `BrowserServices.layer` is a function of
`{ bash, fs }`. That is not an ergonomic accident. A tab owns which ZenFS
backend is mounted and when, and the just-bash instance must be wired to the
_same_ filesystem: otherwise the spawner and the `FileSystem` service disagree
about what exists, and a command writes into a filesystem no reader can see. The
signature makes the pairing the caller's explicit decision.

Because the slices are structural, Node's own `node:fs/promises` satisfies
`ZenFsPromisesLike`, so a test can exercise the adapter against a real directory
rather than a double. See [Testing](./testing.md).

`BrowserFileSystem.layer` carries one further claim. The service it provides is
marked, for [`@smthrs/kernel`](/api/kernel), as a volume that cannot address any
path outside itself, which is what lets the guarded surface resolve paths
directly rather than through descriptor-relative operations. A mounted ZenFS
volume satisfies that only when its workspace occupies the whole mount, so the
layer's `workspaceRoot` option must be `/`, and any other root fails the layer
with `PermissionDenied`. [The isolation attestation](./concepts/isolation-attestation.md)
explains why. A host-backed `node:fs/promises` does not satisfy it, so passing
one is a test-time convenience for a process that is itself the sandbox, never a
production composition. `BrowserFileSystem.make` builds the same service without
the claim.

## What the filesystem serves

`BrowserFileSystem.make` wires up `readFile`, `readFileString`, `writeFile`,
`writeFileString`, `stream`, `makeDirectory`, `readDirectory`, `stat`,
`realPath`, `remove`, `access`, and `exists`, and delegates `rename` and
`utimes` to the backend when it supplies them. Everything else keeps a typed
`PermissionDenied` failure naming the unsupported operation. That is the honest
answer for a backend with no symlink creation, writable handles, or watchers:
`chmod`, `chown`, `copy`, `copyFile`, `glob`, `link`, `symlink`, `readLink`,
`open`, `sink`, `truncate`, `watch`, and the `makeTemp*` family fail rather than
pretend to have succeeded. `sink` is in that list because the slice has no
writable file handle to append through, so its incremental contract cannot be
honoured. `rename` and `utimes` refuse the same way on a backend without them,
and artifact publication needs both.
[Read and write files on a mounted volume](./guides/work-with-files.md#what-fails-and-how)
gives the served operation to reach for in place of each one.

The operations that are served honour their options rather than dropping them.

| Option                                       | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readDirectory({ recursive })`               | walked here, because the slice has no recursive `readdir`; entries come back as `parent/child` the way Node reports them, and a symlinked directory is listed but not descended into when the backend can `lstat`. A backend supplying neither `lstat` nor `realpath` follows a directory link forever, so that walk alone is capped at 128 levels and refuses a deeper tree; a backend with either member is walked to whatever depth the tree has |
| `access({ readable, writable })`             | answered from the reported `mode` bits, since a mounted volume has no user identity to check against; a path that exists without the requested permission fails `PermissionDenied`                                                                                                                                                                                                                                                                  |
| `access({ ok })`                             | the existence check a bare `access` already performs                                                                                                                                                                                                                                                                                                                                                                                                |
| `makeDirectory({ mode })`                    | forwarded, so a directory asked for as `0o700` is not created `0o755`                                                                                                                                                                                                                                                                                                                                                                               |
| `realPath`                                   | canonicalized through the backend's own `realpath`, so a `..` after a link names the parent of the link's target; a backend without `realpath` fails `PermissionDenied` rather than falling back to lexical normalization                                                                                                                                                                                                                           |
| `writeFile({ flag, mode })`                  | forwarded, so `{ flag: "a" }` appends instead of silently truncating and `{ flag: "wx" }` fails `AlreadyExists`                                                                                                                                                                                                                                                                                                                                     |
| `exists`                                     | `false` only for a path that is absent; every other backend failure propagates, so a refusal to look is not reported as absence                                                                                                                                                                                                                                                                                                                     |
| `stream({ offset, bytesToRead, chunkSize })` | honoured, and refused when they are not whole byte counts                                                                                                                                                                                                                                                                                                                                                                                           |

Bytes and names cross the backend boundary by value. `writeFile` copies
`data` and reads `flag` and `mode` when it is called, so the effect it returns
describes one write however the caller's buffer or options change before it
runs or between retries, and however long the backend holds the bytes it was
handed. `readFile` and `readDirectory` return a buffer and an array the caller
owns: writing into them does not reach a backend that answers from its own
storage, and a later change in that storage does not reach a result already
returned. `stream` chunks are fresh allocations for the same reason, and
`writeFileString` encodes at run time because a string cannot change under the
caller.

A tab has no working directory, so a relative path handed to `realPath` resolves
against the volume root rather than against an ambient `process.cwd()` that does
not exist. The same caveat applies to a relative `cwd` on a spawned command:
pass an absolute virtual path.

## Backend errors

A thrown backend error is mapped onto the `PlatformError` tag that carries its
meaning, with the original error kept as the `cause`:

| Backend code                 | Tag                |
| ---------------------------- | ------------------ |
| `ENOENT`                     | `NotFound`         |
| `EEXIST`                     | `AlreadyExists`    |
| `EACCES`, `EPERM`            | `PermissionDenied` |
| `EISDIR`, `ENOTDIR`, `ELOOP` | `BadResource`      |
| `EBUSY`                      | `Busy`             |
| anything else                | `Unknown`          |

A backend that answers with an impossible value is refused rather than
trusted. `stat` fails `BadResource` when the reported size is not a whole,
non-negative number of bytes, and reports no `mtime` when the timestamp is not
a finite number. `stream` fails `BadResource` when a read reports more bytes
than the buffer it was handed, or a negative or fractional count.

## Encoding and size policy

`readFileString` and `writeFileString` are UTF-8 by default, through the
standard `TextDecoder` and `TextEncoder`; an explicit encoding argument is
passed to `TextDecoder`, and one it does not know fails as `BadArgument`.
Invalid byte sequences decode to the replacement character, which is
`TextDecoder`'s non-fatal default, and paths are used exactly as given with no
Unicode normalization.

`stream` allocates one buffer per chunk: 64 KiB by default, and at most 64 MiB
when a caller names a size. Captured interpreter output is _not_ bounded. The
adapter holds the complete `stdout` and `stderr` strings the interpreter
returns and re-encodes them to bytes, so a command that prints a large amount of
text holds it twice in the tab's single heap. Bound the command, not the
adapter.

## ChildProcessSpawner divergences

just-bash is a buffered, run-to-completion API with no process table. The
spawner is built from `ChildProcessSpawner.make(spawn)`, so `exitCode`,
`string`, `lines`, `streamString`, and `streamLines` are all derived from the
one `spawn`, and all inherit the same divergences, each documented on the
module and covered by a test:

| Feature                        | Behaviour                                                                                                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Streaming output               | buffered; `stdout` and `stderr` each emit at most one chunk after the command finishes                                                                                                                                |
| `all`                          | `stdout` followed by `stderr`, not a live interleaving, and it inherits both stream options, so an ignored `stdout` leaves `all` carrying `stderr` alone                                                              |
| `isRunning`                    | `true` while the run is queued or executing, `false` once it has settled                                                                                                                                              |
| `stdin`                        | a failing `Sink`; a command supplying a stdin `Stream` is rejected at spawn time. just-bash itself accepts a string `stdin`, so the limit is this adapter's run-to-completion capture, not the interpreter            |
| Interruption, timeouts, `kill` | abort the interpreter through just-bash's `AbortSignal`; every observable on the handle then reports a `PlatformError` naming the abort rather than replaying the interrupt into the caller's fiber                   |
| `killSignal`                   | ignored: there is no process to signal in a tab                                                                                                                                                                       |
| `forceKillAfter`               | rejected on both routes it can arrive by, the command and `kill(options)`, because Effect's `CommandOptions` extends `KillOptions`; there is no harder stop after the abort                                           |
| Concurrency                    | one run at a time, behind a permit held until the interpreter promise settles, abort included, so two interpreters never mutate the mount at once                                                                     |
| `pid`                          | a per-layer counter, not an OS pid; `unref` is a no-op                                                                                                                                                                |
| Process pipelines              | a `PipedCommand` is rejected; express the pipeline as one command line                                                                                                                                                |
| `additionalFds`                | a nonempty configuration is rejected at spawn time with `BadArgument`; just-bash cannot configure extra file descriptors                                                                                              |
| `getInputFd` / `getOutputFd`   | `Sink.drain` / `Stream.empty` for an unconfigured descriptor, matching `NodeChildProcessSpawner`                                                                                                                      |
| `extendEnv`                    | honoured as a request to the interpreter: just-bash merges `env` into its own environment unless asked for `replaceEnv`, so the adapter asks for replacement whenever `env` is supplied and `extendEnv` is not `true` |
| `stdout`/`stderr` options      | kept at their Node meaning: `"inherit"` and `"ignore"` yield an empty stream, a `Sink` is transduced through, even though the interpreter captured the text either way                                                |

Because the permit outlives the promise, an interpreter that ignores its
`AbortSignal` and never settles blocks every later run rather than being
abandoned with the mount half-written. `JustBashLike.exec` states that
requirement: the returned promise must settle once the signal aborts.

A `StandardCommand` is rendered to a command line before it reaches the
interpreter. Without `shell`, the command and its arguments are POSIX
single-quoted so a spawn keeps argv semantics; with `shell`, they are joined
verbatim, mirroring how Node hands `sh -c` an unquoted line. `cwd` is validated
through the `FileSystem` service, which refuses a path that is not a directory,
and resolved through `Path` before anything runs, which is why the layer
requires both.

## The durable engine

Six modules host the durable flow engine in a browser.
[Run durable flows in a browser tab](./guides/run-flows-in-a-tab.md) walks
through them, and [The durable browser engine](./concepts/durable-browser-engine.md)
explains the design. The three platform services are injected, so a test
provides faulty ones and an app can share one instance.

| Export                                                                                    | Side   | What it is                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BrowserEngine.layer({ name, worker })`                                                   | tab    | Starts the tab's engine worker, asks for persistent storage, and provides `BrowserEngine` over the browser's own channel and storage.                                                           |
| `BrowserEngine.make(options)`                                                             | tab    | The same service, requiring `TabChannel` and `StoragePersistence` and a `Scope`.                                                                                                                |
| `BrowserEngine.BrowserEngine`                                                             | tab    | The service: `start`, `result`, `cancel`, `signal`, `events`, and `unavailable`, which completes with an `EngineUnavailable` once the tab's worker failed.                                      |
| `BrowserEngine.RequestRefused`                                                            | tab    | The leader refused a request; `request` names it and `error` is the failure's tag.                                                                                                              |
| `BrowserEngine.EngineUnavailable`                                                         | tab    | The tab's own worker failed: `reason` is `worker-failed` (it threw, as at load) or `engine-failed` (no engine could be built); `error` is a tag. Every pending and later request fails with it. |
| `BrowserEngine.RunEvent`, `WorkerLike`, `Options`                                         | tab    | An engine event's execution id and type; the slice of `Worker` the tab uses; the layer's options.                                                                                               |
| `BrowserEngine.FlowReference`                                                             | tab    | What the service's calls take of a flow: its `_tag` and its payload, success and error schemas. A whole flow is one.                                                                            |
| `BrowserEngine.requests`, `persistence`, `unavailable`                                    | tab    | Counters: requests by `request` and `outcome`; storage answers by `outcome`; failed workers by `reason`.                                                                                        |
| `BrowserRuntime.run(options)`                                                             | worker | The worker entry: `serve` over `layerHost` with the browser's own lock and channel, and `options.telemetry`, if given, as where its records go. Returns the fiber.                              |
| `BrowserRuntime.serve(options, engine)`                                                   | worker | Waits for the lock, builds `engine`, wakes unfinished runs, announces itself, answers requests and runs tabs' statements. Stops leading if its lock is stolen.                                  |
| `BrowserRuntime.layerHost({ name, sqlite }, registerFlows)`                               | worker | `layer` over `BrowserSqlite.layer`: `engine.db` on a pool in the OPFS directory `smithers/<name>`, and the shared `app.db` beside it on a connection of its own.                                |
| `BrowserRuntime.layer(options, registerFlows)`                                            | worker | `@smthrs/flows`' `Runtime.layer` over an injected `SqlClient`, with the run catalog and the engine host: WebCrypto, the owner identity, `Path`, fetch, a refusing `Jj`.                         |
| `BrowserRuntime.Services`, `Host`, `Options`, `HostOptions`, `ServeOptions`, `RunOptions` | worker | The types the functions above take and provide.                                                                                                                                                 |
| `BrowserRuntime.leaderships`, `wakes`, `requests`, `statements`                           | worker | Counters: leaders; unfinished runs by `outcome`; requests by `request` and `outcome`; shared-database statements by `outcome`.                                                                  |
| `BrowserSqlite.layerSqlite({ build, directory })`                                         | worker | The `Sqlite` service: the wa-sqlite `build`, loaded lazily, with the OPFS pool `directory` registered as its VFS, held until the scope closes.                                                  |
| `BrowserSqlite.Build`, `Factory`                                                          | worker | The build as lazy imports: `module` imports `wa-sqlite.mjs`, `wasm` loads `wa-sqlite.wasm`. The package itself never imports the build.                                                         |
| `BrowserSqlite.layer({ filename })`                                                       | worker | A `SqlClient` over `filename`, opened on the `Sqlite` service's VFS until the scope closes.                                                                                                     |
| `BrowserSqlite.Sqlite`, `open(filename)`, `make(database)`                                | worker | The build-and-VFS service an app can provide itself; open a database on it; build a `SqlClient` over any open wa-sqlite database.                                                               |
| `SharedSqlite.layer({ name })`, `make(options)`, `SharedSqlite`                           | tab    | `execute(sql, params)`: run statements on the app's shared database, on the leader's connection, one at a time per tab.                                                                         |
| `SharedSqlite.open({ name, within? })`, `Database`, `filename`                            | tab    | The database as `{ execute, close }` Promises, for TanStack DB's browser persistence; resolves once a leader answers, rejects after `within` (30 s) otherwise.                                  |
| `SharedSqlite.SqliteError`                                                                | tab    | What `Database.execute` rejects with: SQLite's own `message` and `code`, as wa-sqlite's `SQLiteError`, which TanStack DB reads; the `SqlError` is its `cause`.                                  |
| `WebLock.WebLock`, `make(locks)`, `layer`                                                 | both   | `hold(name, { steal? })`: wait for the exclusive lock, or take it at once with `steal`; hold it until the scope closes. `lost` completes if another context steals it.                          |
| `TabChannel.TabChannel`, `make(construct)`, `layer`                                       | both   | `open(name)`: a port that posts to every other port of the channel and subscribes to what they post.                                                                                            |
| `StoragePersistence.StoragePersistence`, `make(storage)`, `layer`                         | tab    | `persist`: ask for persistent storage and answer whether the origin has it.                                                                                                                     |

`BrowserSqlite` uses `@journeyapps/wa-sqlite`, the build TanStack DB's browser
persistence uses, so an app ships one SQLite. The leader's `layerHost` opens
the app's own database, `SharedSqlite.filename`, beside the engine's, and
`SharedSqlite.open` hands it to TanStack DB from any tab. To share one build and one VFS,
build `layerSqlite` once in the worker and provide it to `BrowserSqlite.layer`
for each store: every store opens its own file with its own connection, and
none runs statements inside another's transaction. `BrowserRuntime.layer`
then takes the engine's `SqlClient` from that composition instead of
`layerHost`.

`BrowserSqlite.make` needs the synchronous build. Its client reports
a write's `{ changes }` from `.raw`, which `@smthrs/database`'s
`DurableWriter.affectedRows` reads for compare-and-set; binds integers wider
than 32 bits as SQLite integers; runs one statement at a time; begins
transactions with `BEGIN IMMEDIATE`; and rolls back a failed COMMIT before
lending the connection again. It does not stream rows.

## The immutable cache

`BrowserCache.layer` provides `@smthrs/artifacts`' `ImmutableCache` over the
origin's Cache Storage, for content that never changes at its key, such as a
repository's file at a commit SHA. Cache Storage outlives the tab and the
browser, and a window, a dedicated worker and a service worker of the origin
reach the same named cache, so what one read fetched opens again offline.

```ts
const layer: (options?: Options) => Layer.Layer<ImmutableCache, ImmutableCacheError>

interface Options {
  readonly name?: string
  readonly maxEntryBytes?: number
  readonly caches?: CacheStorage
}

interface CacheStorage {
  readonly open: (name: string) => Promise<ImmutableCache.WebCache>
}
```

| Option          | Default                                                | Meaning                                                           |
| --------------- | ------------------------------------------------------ | ----------------------------------------------------------------- |
| `name`          | `BrowserCache.defaultName`, `smithers-immutable-cache` | The cache `caches.open` opens.                                    |
| `maxEntryBytes` | 8 MiB                                                  | The largest entry stored; a larger `put` answers `too_large`.     |
| `caches`        | the global `caches`                                    | The `CacheStorage` to use instead. Tests inject one that refuses. |

The layer's telemetry and errors are labelled `browser`. Without a `caches`
global, as in Node or an insecure context, or when `caches.open` rejects, the
layer fails with `ImmutableCacheError` and reason `unavailable`. A `put` over
the origin's quota fails with reason `failed` and `errorName`
`QuotaExceededError`; `ImmutableCache.readThrough` still answers the read. The
browser may clear the cache under storage pressure unless the origin has
persistent storage (`StoragePersistence`).

```ts
import { ImmutableCache } from "@smthrs/artifacts"
import { BrowserCache } from "@smthrs/platform-browser"

const tree = ImmutableCache.readThrough(
  ImmutableCache.key("repo.tree", repo, sha),
  fetchTree(repo, sha)
).pipe(Effect.provide(BrowserCache.layer()))
```

## Browser support

Every entry point bundles for a browser. No published module resolves a `node:`
built-in, `BrowserHost` included, because its `HttpClient` is Effect's `fetch`
client rather than a Node transport, so a browser-mode bundle of the root entry
point needs no polyfill and no `node:` shim. `BrowserHost.layer` is that
module's only factory, and `Crypto` is not among the five tags it provides: a
page that hashes artifacts adds `BrowserCrypto.layer` from
`@effect/platform-browser`. [The closed Host surface](./concepts/host-bundle.md)
covers what each tag is backed by and how the fetch client answers a redirect.

The fetch client cannot pin a connection to checked addresses, and a tab has no
name resolver, so the web tools in `@smthrs/std` (`Fetch`, `HttpPost`,
`WebFetch`) refuse here with `unsupported`. The browser mediates the tab's
network, and Smithers does not weaken its own destination check to fit:
`@smthrs/kernel`'s `HttpClient.ResolveHost` keeps its default, which refuses
every name.

Every entry point also loads in a dedicated web worker, where the engine and the
agent run: no module touches `document` or `window` while it loads. The
repository's browser contract imports each entry in a DOM-less worker, bundled
with and without the `worker` export condition.

Durable execution runs in a dedicated worker through `BrowserRuntime`; see
[The durable browser engine](./concepts/durable-browser-engine.md). See also the
[`@smthrs/kernel` reference](/api/kernel), whose closed service list this
package's `BrowserHost` bundle fills, and
[Capabilities and the host kernel](/docs/concepts/kernel/).
