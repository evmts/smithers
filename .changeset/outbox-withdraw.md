---
"@smthrs/effect-tanstack-db": minor
---

`Outbox.withdraw(idempotencyKey)` takes back a write not sent yet, made by this
program or restored after a reload: it is deleted from the storage, never sent,
and its optimistic rows roll back. A send claims its write under the same lock,
so a write being sent fails with `NotWithdrawn` (`reason: "sending"`) and
settles as usual, and a withdrawn write counts as `outbox_attempts` outcome
`withdrawn`.
