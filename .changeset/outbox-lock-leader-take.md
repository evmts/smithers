---
"@smthrs/effect-tanstack-db": minor
---

`Outbox.lockLeader` returns `take`, which makes the program lead the outbox at
once by stealing the lock, so the tab a person is using admits their writes
instead of refusing them as a follower's. The program it took the lead from
stops leading and waits for the lock again, so it leads again once the taker
closes.

Breaking: `Outbox.Lock.hold` takes `options?: { steal?: boolean }` and returns
`{ lost }`, which completes when another program steals the lock, as
`@smthrs/platform-browser`'s `WebLock` does. A lock service written for the old
`hold: (name) => Effect<void, never, Scope>` must return `{ lost }`.

```ts
// Before
const lock: Outbox.Lock = { hold: (name) => holdTheLock(name) }
// After
const lock: Outbox.Lock = WebLock.make(navigator.locks)
const leader = yield* Outbox.lockLeader({ lock, name: "app-outbox" })
yield* leader.take
```

A write is sent only while the outbox's storage still holds it. A program that
queued a write, lost the lead, and leads again after the taker sent and deleted
that write settles it without sending it again, counted as `outbox_attempts`
with outcome `sent_elsewhere`.
