---
title: The engine's writer lock under load
status: in-progress
area: sdk
owner: hyperdrive-conn builder (Claude Opus)
updated: 2026-10-22 04:20 PDT
links: [cloudflare-flow-host.md, todo-production-start-latency.md, production-database-capacity.md, ../infrastructure.md, ../rulings.md]
---

**What:** Keep remote flows fast and failure-free when many run at once, though every engine write in a deployment takes one advisory lock on the engine's schema.

**Why:** On 2026-10-22, under an end-to-end burst, production alarms failed with `PgConnection: Connection closed`, runs stalled for an hour and TODO runs started minutes late.

**Current state:**
- Cause, reproduced behind a real Hyperdrive config with the deployed `ExecutionHost` in real Durable Objects on a Neon branch of production: `@smthrs/database` writers waited for the lock inside their transaction, each holding one of Hyperdrive's 60 origin connections. 40 executions at once held all 60 for 90 s, and Hyperdrive closed every other client after exactly 15 s: 10 of 40 alarms failed.
- Fixed, sent to lander 1: a wait lasts at most 2 s (`writerLockTimeout`), then rolls back and backs off; pool waits fail after 30 s (`acquireTimeout`); `flows_db_writer_lock_timeouts`, `flows_db_connection_wait` and `flows_db_login_failures`. Same burst after the fix: no failures, lock waits capped at 2 s. Also a dead stealer's claim is released (runs stuck `Undriven`), and the compute autoscales 0.25 to 1 CU with a per-client connection budget.
- The lock's ceiling is set by the round trip: about 1 locked write a second from an object near San Jose (80 ms to us-east-1), about 15 from one hinted `enam` (4 ms). `FLOW_EXECUTION_LOCATION` places new execution objects ([placement](../infrastructure.md#placement)); production sets it in the deployment's environment.

- Production since the deploy of 11:10 UTC with `FLOW_EXECUTION_LOCATION=enam`: the median time between a run's journal records, about one write each, fell from 1,552 to 160 ms for `github/Reconcile` and from 1,165 to 263 ms for `terminal/Open` (14 and 28 gaps after; [placement](../infrastructure.md#placement)). No TODO run started since, so its start latency is not measured yet.

**Next step:**
1. Measure a TODO run's start after the next production TODO, against the 2 to 6.5 minutes of [delayed TODO starts](todo-production-start-latency.md).
2. Narrow the lock (follow-up, not started): per-run advisory locks taken in run-id order, with the schema's lock taken shared by them and exclusively by migrations and drops. It needs an audit of every store transaction for the runs it touches; parents and children, lineage rounds, deferred completions, the step cache and the durable queue are cross-run, and a key a transaction misses is a lost update. The bounded wait stays as the backstop.

**Open questions for Will:** None.
