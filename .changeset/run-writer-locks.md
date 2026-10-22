---
"@smthrs/database": patch
"@smthrs/journal": patch
"@smthrs/run-store": patch
"@smthrs/engine-store": patch
"@smthrs/platform-cloudflare": patch
---

Runs write side by side on PostgreSQL. `DurableWriter.write` takes
`{ partition }`: a write that names one, such as a run's id, holds the
schema's writer lock shared and its partition's exclusively, so writes to two
partitions commit concurrently and writes to one partition one at a time; a
write that names none still commits alone, and a nested write takes the lock
its transaction lacks. Every write that changes one run's rows names that run:
the journal's appends, checkpoints and compactions, every `SqlConsensus` lease
operation, `RunStore`'s single-run writes, every `AttemptStore` write,
`DurableEngineState`'s per-execution writes, and the engine's admission,
activation, transition, handoff, wake and attempt transactions; a terminal
transition joins each child's partition before deciding its exit.
`Journal.transact` and `DurableEngineState.transaction` take the same option.
Run-parent edges, a run's cancellation cascade, lineage and tree cancellation,
step-cache publication and plan storage keep the schema's lock. See `docs/decisions/0001-run-writer-locks.md`.

Measured behind a 2 ms-each-way network: sixteen runs' one-row writes go 7.8
times as fast; eight runs appending 35 entries each take 1.14 times as long as
one run instead of 5.7 times; eight Durable Object alarms of a not-found
`repo/Clone` take 0.93 to 1.18 times as long as one instead of 4.3 to 4.6
times, and none of their 38 write transactions takes the schema's lock.

A Durable Object alarm no longer takes the schema's lock to find its store
installed: `PostgresDatabase` checks the schema, `Migrations.run` checks the
ledger, and the journal and the engine store check their tables, each with one
lock-free read, before taking the lock to install anything. `DatabaseMetrics.tally`
also counts `schemaWide` transactions, and each `cloudflare.execution.alarm`
line logs them. `@smthrs/database/test/SlowNetwork` puts a slow network in front
of a test database.
