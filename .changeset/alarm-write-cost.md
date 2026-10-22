---
"@smthrs/database": patch
"@smthrs/journal": patch
"@smthrs/platform-cloudflare": patch
---

An alarm's log line says what its writes cost. `DatabaseMetrics.tally(effect)`
answers how many PostgreSQL write transactions the effect ran that took a
writer lock, and their summed wait for it (`flows_db_writer_lock_wait`, per
effect instead of per process). `JournalMetrics.tally(effect)` answers how
many new journal entries the effect committed, counted at commit. Each
`cloudflare.execution.alarm` line and span now carries `durationMs`, `events`,
`transactions` and `lockWaitMs`.
