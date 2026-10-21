---
"@smthrs/effect-tanstack-db": minor
"@smthrs/platform-browser": minor
---

The outbox's leader asks the lock instead of guessing from a timer.

- `Outbox.Lock` gains `tryHold(name)`, which takes the lock only when no program
  holds it or waits for it and answers `Option.none()` otherwise.
  `@smthrs/platform-browser`'s `WebLock` implements it with Web Locks'
  `ifAvailable`.
- `Outbox.lockLeader`'s `requestLeadership` now answers what the lock says,
  however long the lock manager takes: `true` when this program took the free
  lock, `false` when another program holds it or waits for it. The outbox
  starts only after that answer, so a program alone admits its first write
  instead of refusing it as a follower's. Released before the lock manager
  answers, it answers `false`; a lock manager that refuses the request answers
  `false` too, logged as `outbox lock refused`.
- Breaking: `lockLeader`'s `grantWithin` option is removed. Before, a lock
  granted after it (100 ms by default) made a program alone a follower until
  the grant arrived. A `Lock` you implement yourself needs `tryHold`.

```ts
const leader = yield* Outbox.lockLeader({ lock: WebLock.make(navigator.locks), name: "app-outbox" })
```
