---
"@smthrs/effect-tanstack-db": minor
---

A queued write is sent only as the principal that queued it.

`Outbox.layer` takes `principal: { now, ownsUnstamped }`, read synchronously each
time the outbox asks. Each write `transact` makes is stamped with `now()`.

- **What loads:** the outbox loads, shows, parks and sends only the stored writes
  that are the principal's: stamped with `now()`, or, for a write stored before
  writes were stamped, when `ownsUnstamped()`.
- **Sealed writes:** every other write stays in the storage, sealed: never
  loaded, offered to `parked`, sent or deleted. Each is logged as
  `outbox write sealed` (`name`, `stage: "load"`).
- **A principal that changes:** a write whose principal changed after it was
  loaded is sealed as it comes up to be sent. It logs `stage: "send"` and counts
  in `attempts` as `sealed`; its rows roll back, `settled` fails, and the storage
  keeps it.

Without `principal`, nothing changes: every stored write is the program's.

```ts
Outbox.layer({ ...options, principal: { now: () => owner, ownsUnstamped: () => ownerHeldTheDevice } })
```
