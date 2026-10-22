---
"@smthrs/run-store": patch
---

Advance the run change feed during long action attempts from durable and lossy journal inserts, coalesced to once per two seconds per run. Migration 1005 adds progress metadata and transactional triggers for SQLite and PostgreSQL without changing replay keys.
