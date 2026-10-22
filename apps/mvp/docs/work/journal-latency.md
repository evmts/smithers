---
title: Journal latency and resume recovery
status: done
area: sdk
owner: Codex rebase16
updated: 2026-10-22
links: [../../../../packages/smithers/flows/database/docs/decisions/0001-run-writer-locks.md]
---

Finish the alarm metrics, per-run writer locks and deferred node-record stack.
Preserve agent resume re-drive and validate the agent suite and both database backends.
Catalog entries: database, journal, run-store, engine-store and platform-cloudflare.

The batching fix preserves one producer identity across sibling-savepoint
flushes and makes commit cleanup idempotent. The new journal regression fails
on the original batching code; the unchanged answered-module resume tests pass.

Rebased onto main 9dac89c7681e on 2026-10-22. The merged host uses one
ExecutionObject.make options object for admission, driveBudgetMs and afterAlarm.
Yielded drives re-arm immediately; cancellation keeps its durable tombstone and
admission gate. PostgreSQL partition writers retain bounded lock waits,
connection-release backoff and all database metrics. The combined host regression
checks admission once, immediate budget yields and afterAlarm on every outcome;
the lock-wait regression covers schema-wide and partition writes.

Latitude proofs: platform-cloudflare passes 159 tests with 100% coverage (seven
optional workerd/container cases skipped). Database, engine-store, journal and
run-store matrices pass with 100% combined coverage; engine-store passes 2,205
tests per backend. The app's TODO, runs and execution suites pass 397 tests,
including real workerd crash recovery. The app and six touched SDK packages pass
typecheck; the app and Cloudflare host's declared importRules targets pass.
Generated API sync/check is reserved for the lander. No push or local install.
