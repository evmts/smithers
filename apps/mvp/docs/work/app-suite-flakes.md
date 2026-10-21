---
title: App suite flakes left after the round 4 burn-down
status: todo
area: app
owner: unassigned (found by the green-bar agent, 2026-10-20)
updated: 2026-10-20
links: [effect-tanstack-db-and-effect-electric.md, ../rulings.md]
---

## Landing in round 4

These fixes are proven by targeted runs:

- **Hydration-cycle errors.** `Collection.make` with `persist` now hands each sync transaction to TanStack DB's persisted core whole (`packages/effect-tanstack-db/src/internal/wholeTransactions.ts`). The upstream report is `packages/effect-tanstack-db/tanstack-db-hydration-cycle-bug.md`.
- **ModelProxy interruption flake.** `worker/ModelEndpoint.test.ts` interrupts the call after its text arrives, not after a fixed 200 ms. It passed 200 of 200 runs.
- **Engine refusal misreport.** `ClientEngine.layerRuntime` reports `refused` with the refusal's code (`src/flows/dispatch.ts`).
- **Postgres deadlock on schema drop.** `db/TestDatabase.ts` ends the schema's open connections before it drops the schema. The mini's Postgres log shows the deadlock: `DROP SCHEMA test_chat_… CASCADE` against ChatApi's question insert, or a branch read, which was still being served.
- **Index lock.** `SourceRevision` runs `git --no-optional-locks status`.

## Still flaky

1. **`crash()` crashes nothing.** `src/test/agent.ts` `crash()` ends the backends whose query text contains the engine's schema name. `PostgresDatabase` sends the schema as a bound parameter, so the probe terminated 0 backends on every run. The "dead" engine keeps driving its run and races the next one. This is the cause of:
   - `runs.test.ts` "Resume drives a run…": 150 s with no progress after Resume;
   - `agent.test.ts` "resumes after the tab is killed…": 4 model calls instead of 3.

   I prototyped a TCP gate in `worker/test/flowHost.ts` that `crash()` closes. Afterwards the crashed engine got `ECONNREFUSED`, as it should. The prototype is not proven, and in one loop under load 7 other tests failed with "Failed to connect", so I reverted it. A 150 s stall after takeover also showed up once with the gate in place; its cause is unknown.

   Next step: make the cut work, add a regression test that a crashed engine writes nothing more, then find the 150 s stall with the takeover probe (the `flows_runs` and `flows_attempts` rows and the engine's `pg_stat_activity`).
2. **`agent.test.ts` "an agent that never answers…".** This is not a race. Its eight durable model calls through ChatApi take about 0.6 s each when the mini is idle and 2.5 to 3.5 s each under load, which passes the 30 s budget. One option is a host-level frame cap (`AgentAction` lets the action's `maxFrames` override the host's), so the test can prove the cap with 2 frames while the app keeps 8.
3. **Test-only robustness.** The test ChatApi could stop serving, and abort its in-flight requests, before its schema drops. That would also close the gap between ending the connections and the drop. I wrote it but reverted it because it was not proven.
