---
title: "@smthrs/effect-electric"
description: "Electric shapes for Effect programs: TanStack DB collections synced from Postgres, decoded by an Effect Schema, with a Schedule retry policy, sync status as a Stream, write confirmation by txid or match, and a validating shape proxy for your server."
---

`@smthrs/effect-electric` syncs Postgres into TanStack DB collections through
Electric, as an Effect library. It builds on
[`@smthrs/effect-tanstack-db`](../../effect-tanstack-db/docs/README.md), so an
Electric collection is a `Collection` with everything that package guarantees,
plus what syncing needs.

## What it guarantees

- **Scoped.** The collection, its shape stream, its pending requests and its
  running handlers all end when the scope that made it closes.
- **Decoded rows.** Every synced row is decoded by the collection's schema, a
  `Schema.Struct` that checks without transforming. Electric sends an update's
  changed columns only, so rows are decoded column by column: each column
  present must decode. A row that doesn't stops the shape. Electric's `parser`
  turns Postgres values into JavaScript ones first, for example `int8` into a
  number.
- **Your services in handlers.** `onInsert`, `onUpdate` and `onDelete` are
  Effects. They run with `Effect.runPromiseWith` and the services of the fiber
  that ran `make`, so they share its logger, tracer, metrics and `HttpClient`,
  and they stop when the scope closes.
- **One retry policy.** A request that fails on the network, or with a 5xx or
  429, waits on the collection's sync policy, an Effect `Schedule`, and is sent
  again. Electric's own backoff is off. `reconnect` ends every wait at once and
  restarts a stopped shape. See [The sync policy](sync-policy.md).
- **Sync status as a stream.** `sync` streams each request's outcome and the
  shape stopping, from when the stream starts.
- **Write confirmation.** `awaitTxId` waits for a Postgres transaction to
  arrive; `awaitMatch` waits for a change a predicate accepts.
- **Rows on the device.** With `persist`, the rows and Electric's resume state
  are kept through `@smthrs/effect-tanstack-db`'s `Persistence`: the next
  program restores the rows before the network answers (`restored`) and
  resumes the shape from its stored handle and offset. A collection holds the
  whole shape (`eager` or `progressive`), so a device reads all of it offline.

## Testing unhappy paths

Every shape request goes through the `ShapeSource` service. Its test
implementation, `ShapeSource.layerFaulty`, is the real source behind switches
that make it down, refuse or stall on command, so a test of what a program does
when sync fails provides it instead of intercepting requests. Happy-path tests
use the real source. See the [API reference](api.md#testing-unhappy-paths-layerfaulty-and-faults).

## On the server

`ShapeProxy.make` is an `effect/http` handler that serves a browser's shape
requests from your route. The host chooses the table and Electric's secret;
the browser reads the whole shape, and every parameter outside the Electric
client's protocol, subset requests' included, is dropped. See
[Proxy shapes through your server](shape-proxy.md).

## Pages

- [API reference](api.md)
- [The sync policy](sync-policy.md)
- [Proxy shapes through your server](shape-proxy.md)

## Tests

`pnpm test` runs the suite at 100% coverage of `src/`. The Electric-backed
suites need Postgres with logical replication and Electric. They read
`DATABASE_URL` and `ELECTRIC_URL`; the defaults are the services in
`apps/mvp/docker-compose.yml`, started with `pnpm --filter @smthrs/mvp db:up`.
Each test writes to a scratch schema of its own and drops it. Persisted
collections run on SQLite files through TanStack DB's own browser persistence
over `node:sqlite`. A suite skips, with a warning naming the variable, only
when nothing answers at `ELECTRIC_URL`; any other failure fails it.

## Writes

The collection's mutation handlers send a write straight away. For writes that
must survive going offline, use `@smthrs/effect-tanstack-db`'s `Outbox`: keep
the collection read-only, put each write's optimistic rows in a local
collection, and let a named mutation wait for Electric with `awaitTxId` or
`awaitMatch`.
