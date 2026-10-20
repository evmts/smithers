---
title: "The durable browser engine"
description: "How one dedicated worker per origin runs the durable flow engine over SQLite in OPFS, how tabs elect it and reach it, and how a new leader resumes runs."
---

The durable engine is the same `@smthrs/flows` composition the Node, Bun and
Cloudflare hosts build: `Runtime.layer` over the journal, run, attempt and
cache stores, with retries, durable timers, waits and replay. In a browser,
`BrowserRuntime` hosts it in a dedicated Web Worker and keeps its store in
SQLite on the origin private file system.

## Why a dedicated worker

| Need                                   | Dedicated worker                                               | Service worker                      |
| -------------------------------------- | -------------------------------------------------------------- | ----------------------------------- |
| Fast SQLite on OPFS                    | yes: `createSyncAccessHandle` exists only in dedicated workers | no synchronous access handle        |
| Stays alive while a model call streams | yes, as long as its tab is open                                | stopped after about 30 seconds idle |
| One engine across tabs                 | through a Web Lock                                             | one instance, but stopped when idle |

`BrowserSqlite.layerSqlite` loads `@journeyapps/wa-sqlite`'s synchronous build
and opens its access-handle pool VFS, and `BrowserSqlite.layer` opens the
database on it. Every commit flushes its access handles,
so a recorded step survives a killed browser.

The worker hands the build over as lazy imports, and `BrowserRuntime` imports
the engine itself only when a worker builds one. A waiting worker loads
neither, and a tab that imports the package's root for `BrowserEngine` or
`SharedSqlite` loads no engine module and no wasm.

## One leader per origin

Every tab starts its own worker, and every worker asks for the exclusive Web
Lock named after the engine. The worker that holds it is the leader: only it
opens the store and builds the engine. The others wait in the lock's queue,
having opened nothing.

A browser releases a lock when the context holding it ends, so when the
leader's tab closes or crashes, the next worker in the queue gets the lock.
It then:

1. Opens the store. If the old worker's OPFS access handles are not released
   yet, it opens the pool again for up to about five seconds.
2. Builds the engine and registers the flows. Registration re-arms every
   durable timer, so a sleep that came due while no tab was open fires now.
3. Drives every unfinished run once, in the background. A run the old leader
   held is taken at once, because the engine's liveness check,
   `@smthrs/run-store`'s `Ownership.singleIncarnationLiveness`, declares every
   other incarnation of the same engine dead: only the lock holder runs, and the
   old one no longer holds the lock. Without that answer the engine would wait
   out the old owner's 30-second lease.
4. Posts `Leader` on the engine's channel.

From then on the engine sweeps its own store once a second, as on a server, so
timers fire and stalled runs are reclaimed while the tab stays open.

Another context can take the lock with `WebLock.hold(name, { steal: true })`.
The leader whose lock is stolen stops leading at once, closing its engine and
store, logs `browser.runtime.lost`, and waits for the lock again.

## A tab whose worker fails

A tab whose own worker fails cannot lead, so it does not wait for a leader
that may never come. The worker fails when it throws, as when its module fails
to load, which the tab sees as the worker's `error` event, or when it cannot
build the engine, as without OPFS, which the worker tells its tab in a message
before it stops. Every request the tab is waiting on then fails with `EngineUnavailable`, whose `reason` is `worker-failed` or
`engine-failed`, and `BrowserEngine.unavailable` completes with it, so the app
can show the failure instead of hanging. A new leader announcement restores
requests from this tab, even though its own worker stopped. OPFS handles still
held by a previous worker are retried through Effect resource acquisition until
released or cancelled, rather than permanently stopping the worker.

## The app's shared database

The leader also opens the app's own database, `app.db`, beside `engine.db` in
the same pool, on a connection of its own, and runs every tab's
`SharedSqlite.execute` on it, over the channel `<name>/sql`. An app that keeps
TanStack DB collections on the device hands that database to TanStack's
browser persistence, so it loads one SQLite build and opens one pool.

- A tab sends one statement at a time, and the leader runs each request once.
- A transaction is one tab's from the statement that opens it to the one that
  ends it, by SQLite's own autocommit flag. Another tab's statement waits, so
  it never runs inside the transaction or reads what it has not committed.
- Each tab holds a Web Lock of its own while it lives. When a tab ends with a
  transaction open, the leader takes that lock and rolls the transaction back.
- A transaction open when the leader's tab closes ends with that connection.
  Its tab runs the transaction's statements again on the new leader, in
  order, and carries on if each returns the rows it returned before, so the
  handover is invisible to the caller. If one returns other rows, because
  another tab wrote in between, the tab rolls the transaction back and the
  statement fails with a `ConnectionError`.
- The leader records each transaction inside it, by the request that opened
  it, in the table `shared_sqlite_commits`. A statement that committed the
  transaction just as the old leader ended is answered as committed by the
  new one, never run twice. A statement outside a transaction that the old
  leader never answered is sent to the new one, which may run it a second
  time if the old one ran it before it stopped.
- The record fails closed. A leader that can't write it rolls the
  transaction back, and the statement that opened it fails with
  `TransactionUnrecorded`. A leader that can't read it runs nothing, and the
  statement fails with `TransactionUndecided`; the tab's next statement asks
  again. A leader that can't create the table still runs reads and single
  statements, so no transaction commits twice.
- A statement that fails after it opened a transaction, such as
  `BEGIN; <refused>`, rolls that transaction back, so no transaction stays
  open that its tab doesn't know of.

## Tabs reach the leader over a channel

A tab never talks to the engine directly, not even its own worker. It posts
requests on the engine's `BroadcastChannel`, under its own client id and a
request number, and only the leader answers. On `Leader`, every tab posts its
unanswered requests again. That is safe because every request is idempotent:
starting an execution id twice admits it once, a poll reads, a cancellation
and a signal record the first answer.

The leader also posts the execution id and event type of every event its
engine commits. `BrowserEngine.result` waits on those rather than on a timer:
it polls once, then again after each event for its execution and after each
new leader.

Payloads, values and results cross the channel as JSON, encoded and decoded
with the flow's own schemas. The channel is open to every script of the
origin, which is the app's own trust boundary; the leader runs only the flows
it was given, and only with a payload their schema decodes.

## Tabs read runs through the leader

A run page reads the engine's runs the same way: `BrowserEngine.inspect(runId,
{ afterSeq, limit })` posts `Inspect`, and `BrowserEngine.list({ limit,
cursor, roots })` posts `List`. Neither names a flow. The leader answers from
its engine's `RunInspection` (`@smthrs/engine-store`), so every value is
redacted and cut to 16 KiB before it reaches the channel, and a failure travels
as its closed code. `inspect` returns the run, its steps with their attempts,
the runs it started and one page of its journal; page on by passing the
reply's `journal.nextSeq` as `afterSeq`. A run the engine never held is
refused with `@smthrs/engine-store/RunNotFound`. The tab decodes each reply with
a declaration of its own, so a tab bundle never loads `@smthrs/engine-store`.

The engine host gives every registered flow `RunInspection` as well, so a flow
running in the engine, such as one that retries another run, can read it. The
reads know the flows `BrowserRuntime.run` serves, and each action their plans
call, so a `Schema.Redacted` value in a run's input or result, a step's output
or a journal preview reads as `<redacted>`, and a value its schema no longer
decodes as `<withheld>`.

## Observability

Every operation is logged, traced and counted with ids, counts and error tags,
never content:

| Signal                                                                | Where                                                                                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `browser.runtime.elect` span                                          | the wait for the lock                                                                                                           |
| `smithers_browser_runtime_leaderships`, `browser.runtime.leader`      | each worker that becomes leader                                                                                                 |
| `smithers_browser_runtime_wakes`, `browser.runtime.wake` span and log | each unfinished run a new leader finds, by outcome                                                                              |
| `smithers_browser_runtime_requests`, `browser.runtime.request` span   | each request the leader answers, by request and outcome                                                                         |
| `smithers_browser_engine_requests`, `browser.engine.request` span     | each request a tab sends                                                                                                        |
| `run.inspect` span and log                                            | each `Inspect` the leader reads: host `local`, outcome (`read`, `not_found`, `failed`), events, bytes, clipped values, duration |
| `smithers_browser_engine_storage`, `browser.engine.storage`           | whether the origin holds persistent storage                                                                                     |
| `smithers_browser_runtime_statements`, `browser.runtime.statement`    | each shared-database statement, by outcome                                                                                      |
| `smithers_browser_engine_unavailable`, `browser.engine.unavailable`   | a tab whose own worker failed, by reason                                                                                        |
| `browser.runtime.stopped`                                             | an engine that stopped                                                                                                          |
| `browser.runtime.lost`                                                | a leader whose lock another context stole                                                                                       |

The engine's own journal, run and attempt telemetry comes from `@smthrs/flows`
as on every host. A worker's records stay in the worker unless `run` gets a
`telemetry` layer, such as `Otlp.layerFetch` from `@smthrs/observability`,
which receives every log line, span and metric of the leader, the engine and
the flows it runs. The engine records many spans of its own, its store's
statements among them; an exporter's `spans` list keeps the ones you send.

```ts
BrowserRuntime.run({
  name: "smithers",
  sqlite,
  flows,
  registerFlows,
  telemetry: Otlp.layerFetch({
    baseUrl: `${self.location.origin}/api/telemetry`,
    serviceName: "engine",
    spans: ["browser.runtime.wake", "browser.runtime.request"]
  })
})
```

## Limits

- **All tabs closed pauses every run.** Nothing runs while no tab of the app is
  open. A flow that must run while every device is off belongs on Cloudflare or
  a sandbox.
- **Storage can be cleared.** Without persistent storage, a browser may clear
  the origin's OPFS under pressure, and Safari clears it after seven days
  without a visit. `BrowserEngine.layer` asks for persistent storage; the
  browser decides.
- **A run belongs to one browser profile.** Two profiles, or two devices, have
  two stores.
