---
title: App suite flakes left after the round 4 burn-down
status: in-progress
area: app
owner: Codex Sol simple-fixes builder; Opus conflict-test builder for notification failure
updated: 2026-10-21 10:44 PDT
links: [effect-tanstack-db-and-effect-electric.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 10:44 PDT

**What:** Repair baseline flaky tests, lint failures and stale eval expectations after current landings.

**Why:** Existing failures must not conceal new regressions or weaken gates.

**Current state:** At 10:32 the lead reports multiple builders encountering failures already on main: flaky tests, lint and a stale eval baseline. A Codex Sol cleanup job is planned after current landings. Earlier notification and conflict investigations remain in the retained history; no evidence closes them here.

**Next step:** Consolidate the exact failures after landing, fix each with a regression and rerun required gates; coordinate the TODO recovery finding with its SDK design.

**Open questions for Will:** None. Existing access, Neon, Telegram and review-routing decisions are settled.

Evidence: script-filtered user-typed messages and lead text replies in session 6253ecf2 through 10:43 PDT; current rulings and queue answers through 10:31 PDT. Product results are lead-reported; this tracker validates the site build only. Implementation ownership is unchanged; Codex curates these notes. Later evidence supersedes retained history.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 04:44 PDT

**What:** Repair the app-suite failures left after round 4.

**Why:** A missing notification on another device prevents confirming needs-you delivery.

**Current state:** At 04:24 PDT the lead reports passing recordings for the bell name, header locator and late-joiner fixes, in a five-commit batch with the lander. The previous unassigned owner is stale. The separate status test still fails: one device receives no notifications; data takes about 38 seconds to load. The lead routed this finding to the active Opus conflict-test builder. A common cause with the four conflict failures is suspected, not established. No completed landing receipt appears through 04:43.

**Next step:** Retain targeted recordings and the landing receipt. Have the conflict-test builder establish and fix the notification root cause, retain the cross-device regression, and verify production delivery.

**Open questions for Will:** None new.

Evidence: script-extracted user-typed text and lead text replies from session 6253ecf2, approximately 02:43–04:43 PDT; no user-typed messages in that window. Current rulings and queue answers take precedence over shared briefs, panel designs, decisions, proposals, TODOs and rules. Execution ownership is recorded above; Codex curates documentation only. Product checks are lead-reported; this tracker runs only the maintainer-site build.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 04:24 PDT

**Current state:** At 04:24 PDT the lead reports passing recordings for the bell name, header locator and late-joiner fixes; the five-commit batch is being landed. The separate status test still fails: one device receives no notifications, and notification data takes about 38 seconds to load. Root cause is unknown.

**Next step:** Retain the targeted recordings and landing receipt; coordinate the unresolved notification failure with the conflict-test builder.

**Open questions for Will:** None new. Existing unresolved questions remain in the retained history.

Evidence: lead text reply at 04:24 PDT, extracted by script from the latest approximately two session hours; no human-typed message in that window. Automated notifications and tool content excluded. Current rulings and queue answers override historical briefs, designs, decisions, proposals, TODOs and rules. Product receipts are lead-reported; the tracker runs only the maintainer-site build. Execution owner retained; documentation curator: Codex.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 04:15 PDT

**What:** Repair the bell, header and late-joiner journeys while retaining separate recovery failures.

**Why:** Targeted successes must not hide a failing notification or recovery path.

**Current state:** The small-fixes report records unpushed commits 2955fe61d169 (bell assertion), b193895188a2 (header) and dc0b473cdeed (real-API pagination setup). Both model-free navigation journeys pass; the late joiner runs unskipped and passes with recordings and GIF checks. Status e2e still fails twice before the bell assertion because its notification toast never arrives. Separate crash/recovery and conflict investigations remain open.

**Next step:** Land the validated fixes, investigate the missing toast and retain passing real-dependency journeys for the remaining recovery failures.

**Open questions for Will:** None new.

Evidence: script-filtered human text and assistant text replies from the latest approximately two hours of session 6253ecf2 through 04:13 PDT; automated notifications, tool results and teammate messages excluded. Current rulings and queue answers override historical briefs, panel designs, decisions, proposals, TODOs and rules. Builder reports in scratchpad/final supply validation receipts; the tracker independently runs only the maintainer-site build. Execution owners and earlier history retained; Codex curates documentation.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 03:04 PDT

**Current state:** At 02:56 PDT the lead started the Codex Sol small-fixes job for the bell accessible count, scoped repository-header locator and real-API long-conversation setup for the skipped late-joiner test. This does not resolve the separate crash/recovery flakes retained below.

**Next step:** Validate each repaired end-to-end test with real dependencies; preserve and separately investigate the remaining crash and takeover failures.

**Open questions for Will:** None new; existing unresolved questions remain in the retained history.

Evidence: lead text replies through 03:03 PDT, extracted by script from the latest approximately two session hours; automated notifications and tool blocks excluded. Current rulings and queue answers take precedence over briefs and designs. Execution ownership retained; documentation reconciled by Codex tracker curator. Product receipts are reported, not independently rerun here.

## Earlier tracker history (retained)


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
