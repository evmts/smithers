---
"@smthrs/effect-tanstack-db": minor
---

`Migrations` carries a device's data from one build of a program to the next.
Each persisted collection (`local`, `synced`) and each outbox payload
(`payload`) declares its versions, oldest first, with a pure migration between
each pair; `registry` collects them and derives an `epoch`. `apply` brings a
device store to this build's versions before anything reads it, one SQLite
transaction per local collection, leaves synced collections to drop and sync
again, and keeps every row it can't bring forward in `device_kept`. `prepare`
is what `@smthrs/platform-browser`'s leader runs before it serves the database.
`fingerprint`, `lock` and `check` fail a test when a schema changes without a
new version.

`Outbox.layer` takes `upgrade` (`Migrations.outbox(registry)`): each write is
stamped with its payloads' versions, and a write an older build stored is
upgraded before the library loads it, or parked when this build can't send it
as it was meant. `parked` hands each parked write to its feature; the service's
`parked` lists them and `discard` deletes one. `Persistence.layer` takes
`registry`, and a persisted collection it doesn't declare dies with
`Undeclared` as it opens.
