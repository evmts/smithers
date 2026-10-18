# `@smthrs/effect-electric`

## 0.2.0 (unreleased)

### Added

- `persist: { schemaVersion }` on `ElectricCollection.make`: the rows and
  Electric's resume state are kept through `@smthrs/effect-tanstack-db`'s
  `Persistence`, restored before the network answers (`restored`), and the
  shape resumes from its stored handle and offset.
- Peer dependency `@tanstack/db-sqlite-persistence-core` 0.4.11.

### Removed

- `syncMode: "on-demand"`: a collection holds its whole shape, `eager` or
  `progressive`.
- The `keepOffset` workaround for `@electric-sql/client` 1.5.28, which only
  on-demand subset snapshots needed.
- `"subsets"` from `ShapeSource.Requests`: a collection sends no subset
  requests.
- `ShapeProxy`'s `subset` option and `SubsetPolicy`: the proxy drops a
  browser's `subset__*` parameters like every other parameter outside the
  protocol, never forwarding them, and no longer answers 400 `Invalid subset
  request`. Its log line and span lose `subset`, `refused`,
  `electric.shape.subset` and `electric.shape.refused`.

## 0.1.0 (unreleased)

### Added

- `ElectricCollection.make`: a TanStack DB collection synced from an Electric
  shape, scoped, with every synced row decoded by an Effect `Schema` column by
  column.
- Mutation handlers (`onInsert`, `onUpdate`, `onDelete`) as Effects run with
  the services of the fiber that made the collection.
- `sync`: the shape's sync status as a `Stream` of `Sent`, `Succeeded`,
  `Failed` and `Stopped` events.
- `retry`: the sync policy as an Effect `Schedule`, defaulting to
  `SyncPolicy.defaultPolicy`, and `reconnect`, which ends every wait and
  restarts a stopped shape.
- `awaitTxId` and `awaitMatch`, failing with `AwaitTimeout` or `SyncFailed`.
- `statusOf`: the HTTP status in a failure's cause chain.
- `SyncPolicy.backoff` and `SyncPolicy.defaultPolicy`.
- `ShapeSource`: the service every shape request goes through, real by
  default (`fetchSource`), and `ShapeSource.layerFaulty`, its test
  implementation with `down`, `refuse`, `stall`, `corrupt` and `heal` switches
  for testing unhappy paths without intercepting requests.
- `ShapeProxy.make` and `ShapeProxy.config`: a server-side shape proxy with a
  host-chosen shape, a protocol parameter allowlist, subset requests checked
  against a strict grammar and printed again, Electric's secret added on the
  server, and one span, log line and count per request.
- A workaround for `@electric-sql/client` 1.5.28 moving a live stream's offset
  to every subset snapshot's.
