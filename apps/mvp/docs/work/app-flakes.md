---
title: The app suite under parallel load
status: in-progress
area: app
owner: app-flakes builder
updated: 2026-10-23
links: [app-suite-flakes.md, ../infrastructure.md]
---

**What:** Make `pnpm test --maxWorkers=2` in apps/mvp pass on every run on Latitude, fixing each flaky test at its cause.

**Why:** On main a full run failed 24 and 43 tests (13 and 15 files) on nyc-01, and every failing file passed alone. Landers reran and bisected each batch, and the noise hid real regressions.

## Causes

| Cause | Where | Fix |
| --- | --- | --- |
| Electric 1.5.28 keeps its replay and expired-handle caches per module, keyed by URL; simulated tabs shared them | `@smthrs/effect-electric` ShapeSource | `cacheNamespace` per simulated realm (track C) |
| The relay's list lacked `flow.run.created`, `flow.run.claimed`, `engine-store.registration.recovered` | `src/flows/contract.ts` | Listed; failed every run, not a flake |
| A hand-written shape follower ignored `409 must-refetch` after the per-test truncate | `worker/ShapeProxy.test.ts` | Restarts from `offset=-1` |
| Exact revision equality while the owner's 1 s heartbeat moves it | `src/features/runs/remote.test.ts` | At least the eligibility revision |
| Cloning lasted ~15 ms (three 5 ms polls) | `src/features/repo/warm.test.ts` | `scripted().hold(operation)` |
| A delivery slower than `confirmWithin` resends the same question | `src/features/chat/controls.test.ts` | Counts one question by id |
| The run finished its 1.5 s sleep before the first snapshot | `worker/RemoteRuns.test.ts` | Holds the first step on a gate |
| The "dead" engine reconnected and stole the run back | `worker/flows/Todo.test.ts` | `databaseGate` closed at death |
| A truncate not yet replicated: Electric served the last test's rows | `worker/test/repos.ts` `resetRepos` | Waits for the shape's 409 |
| Electric's replication connection decodes catalog changes more slowly the longer it lives | Test Postgres and Electric | Fresh connection per run (`db/ElectricReplication.ts`) |

## Electric's replication lag

With the first nine fixes a run still failed 6 to 17 tests, nearly all waiting on Electric with 6 to 10 s budgets.

- A probe beside the suite: an inserted row reached a live shape in p50 0.5 s, p90 4.0 s, max 8.6 s.
- Postgres' view: the walsender serving Electric ran at 100% of a core in 526 of 571 samples; Electric itself was mostly idle; no spill, no long transactions.
- One-minute synthetic loads in the app's database, walsender at ≥90% CPU: plain DML 0/44, table create and drop 0/45, schema create and drop 45/45, truncate 45/45, another publication's changes 45/45. The same schema churn in another database: 0/133.
- The walsender had been connected for 1 day 6 h. Schema churn at 5/s cost it 42% CPU; after ending it (Electric reconnected within 1 s), 0%.
- A full run from a fresh walsender: walsender ≥90% in 0 of 319 samples, replay lag p90 0.9 s, 2 failures, 761 s instead of ~1,300 s.

Tried and measured without effect, and reverted: moving engine stores to another database; reusing migrated schemas (truncate and rename).

**Next step:** Three consecutive clean full runs on Latitude with the fresh connection.

**Open questions for Will:** None.
