---
"@smthrs/effect-tanstack-db": minor
"@smthrs/effect-electric": patch
---

One program stores what a persisted synced collection syncs, and any program can
wait for a row however it arrives.

- `Persistence.layer` takes `lock`, an `Outbox.Lock`: give it whenever
  `coordinator` shares the database between programs, as a browser's tabs do.
  `Collection.make` with `persist` then runs the sync source writing only in the
  program holding lock `persisted-sync:<id>`, which a program waits for and
  never steals. Every other program runs its source watching: what it writes,
  empties or commits is dropped, and it gets no sync metadata. Its rows come
  from the database through the coordinator, while its source still reports the
  network and marks the collection ready. A watcher that comes to hold the lock
  starts its source again, writing. A writer that stops lets the lock go only
  once the database has stored, or refused, what it committed; a source that
  throws as it starts fails the collection and lets the lock go. Before, every program stored what its own
  source synced, and a program's fresh snapshot, committed after another
  program had stored a newer row, erased that row from the database and, by the
  reload that followed, from every program.
- Each role is logged as `persisted sync role` (`collection`, `role`) and
  counted in `Persistence.syncRoles` (`persistence_sync_roles`).
- `Collection.awaitRow(match, timeout)` answers the first row `match` accepts,
  there now or once it shows, whichever program's source brought it, and fails
  with `TimeoutError` past `timeout`.
- `@smthrs/effect-electric`: `awaitTxId` and `awaitMatch` follow the program's
  own stream; the docs say to wait for a row with `awaitRow` in a program that
  watches.

```ts
const DeviceStore = Persistence.layer({ open, make, coordinator, lock: WebLock.make(navigator.locks) })
const question = yield* messages.awaitRow((row) => row.id === questionId, "15 seconds")
```
