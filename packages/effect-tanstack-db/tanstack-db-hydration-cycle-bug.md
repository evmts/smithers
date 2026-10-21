# Upstream report: a peer tab's commit fails an open Electric transaction

For TanStack DB (`TanStack/db`). Not filed yet.

## Versions

- `@tanstack/db` 0.15.1
- `@tanstack/db-sqlite-persistence-core` 0.4.11
- `@tanstack/browser-db-sqlite-persistence` 0.2.36 (`BrowserCollectionCoordinator`)
- `@tanstack/electric-db-collection` 0.6.2, `@electric-sql/client` 1.5.28

## Symptom

Two tabs share one SQLite database through `BrowserCollectionCoordinator`, each
with the same persisted Electric collection (eager sync). In one tab the
collection stops syncing for good. The tab logs two uncaught errors, rethrown
from `@electric-sql/client`'s subscriber callback:

```
InvalidPersistedCollectionConfigError: a persisted sync transaction cannot cross a hydration cycle
    at assertHydrationSequenceCurrent (db-sqlite-persistence-core/dist/esm/persisted.js)
    at commit (db-sqlite-persistence-core/dist/esm/persisted.js)
    at commit (electric-db-collection/dist/esm/electric.js)
    at commitSourceTransaction / processMessages (electric-db-collection/dist/esm/electric.js)
TransactionError: No pending sync transaction to write to
    at write (db-sqlite-persistence-core/dist/esm/persisted.js)
    at processChangeMessage / processMessages (electric-db-collection/dist/esm/electric.js)
```

## Cause

1. The persisted core stamps every source transaction with the runtime's
   hydration sequence when it begins (`begin` in `createWrappedSyncConfig`,
   `src/persisted.ts` around line 5921), and `commit` throws if the sequence
   moved (`assertHydrationSequenceCurrent`, around line 6220).
2. `reloadActiveSubsetsUnsafe` advances the sequence (around line 5150). It
   runs when a peer tab's `tx:committed` reaches this tab
   (`invalidateFromCommittedTxUnsafe`, around line 4976), and on a `pullSince`
   recovery. It does not wait for an open source transaction, though
   `loadSubset` does wait for one that reserved its commit turn (around line
   6664).
3. The Electric adapter keeps a transaction open across batches. A fresh eager
   snapshot opens it on the first batch (`freshSnapshotPending`: begin and
   truncate), and that batch is often `[snapshot-end]` alone; it commits on the
   next batch's `up-to-date`.
4. So when a peer commits the same collection between those two batches, the
   commit throws. The core has already popped the transaction, but Electric's
   `transactionStarted` stays `true`, so every later `write` throws "No pending
   sync transaction to write to" and the collection never syncs again.

Observed order (instrumented, one device, three tabs; `#n` is a runtime):

```
BATCH chat-messages open=false fresh=true msgs=snapshot-end     -> BEGIN #57, #9, #25 (seq 1)
BATCH ... msgs=insert,insert,up-to-date                          -> COMMIT #57 ok
reloadActive chat-messages#25 seq=2   (peer #57's tx:committed)
BATCH ... msgs=insert,insert,up-to-date                          -> COMMIT #25 txseq=1 now=2 -> THROW
```

## Minimal reproduction

No Electric needed: a sync source that keeps its params, on two tabs over one
SQLite file and one `BrowserCollectionCoordinator` name.

1. Tab B: `begin(); truncate(); write({ type: "insert", value: b })`, left open.
2. Tab A: `begin(); truncate(); write(a); await commit(); markReady()`.
3. Wait until tab B shows `a` (its reload ran).
4. Tab B: `commit()` throws `a persisted sync transaction cannot cross a hydration cycle`.

The Smithers test is `packages/effect-tanstack-db/test/SyncTransactions.test.ts`,
"commits after a peer tab's commit read the device's rows again in between".

## Suggested fix

Either `reloadActiveSubsetsUnsafe` waits for the open source transaction's
publication, as `loadSubset` does for a reserved commit turn, or the core
re-validates an open transaction against the new hydration instead of
refusing it. A transaction open across batches is the Electric adapter's
documented behavior, so the persisted core should not treat it as a
configuration error.

## Our workaround

`Collection.make` with `persist` hands each source transaction to the core
whole, at its commit (`src/internal/wholeTransactions.ts`): begin, the writes
and metadata in order, then commit, in one synchronous turn. A metadata read
inside a transaction first hands the core what the transaction holds, so it
reads its own writes exactly as the core reads them.
