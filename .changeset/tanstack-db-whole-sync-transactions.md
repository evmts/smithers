---
"@smthrs/effect-tanstack-db": patch
---

A synced collection made with `persist` no longer stops syncing when another
tab commits to the device's database while its source has a transaction open.
TanStack DB's persisted core refused such a commit, uncaught, with "a persisted
sync transaction cannot cross a hydration cycle", and every later batch with
"No pending sync transaction to write to". Electric holds a transaction open
from a fresh snapshot's first batch (`snapshot-end` alone) to the next batch's
`up-to-date`, so two tabs syncing at once hit it. `Collection.make` now hands
each of the source's transactions to the persisted core whole, at its commit.
