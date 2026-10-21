---
title: Migrate local-first device data on every deploy
status: in-progress
area: app
owner: local-first migrations builder assigned by lead (started 2026-10-20 20:20 PDT)
updated: 2026-10-21 00:06 PDT
links: [../decisions/0021-local-first-migrations.md, ../decisions/0002-local-first.md, ../decisions/0011-the-agent-runs-in-the-browser.md, local-first.md, plan-identity-across-deploys.md, device-data-recovery.md]
---

## Tracker reconciliation — 2026-10-21 00:06 PDT

**What:** Maintain the device migration gate.

**Why:** A deploy must preserve local work.

**Current state:** The canonical execution stream device-data-migrations.md now has passing real old-build upgrade proof and Will’s 00:01 recording approval. This clears the deploy gate; it does not establish deployment or old-tab coordination completion.

**Next step:** Follow device-data-migrations.md for landing and deploy receipts; preserve the slice-2 old-tab gap.

**Open questions for Will:** None.

Evidence: script-filtered human text and lead replies from the last two session hours, through 00:05 PDT; queue answers through 00:05:48 PDT; current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Product checks are reported receipts, not checks executed by this tracker. Existing execution owners and history retained; Codex curates documentation only.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-20 23:44 PDT

**What:** Keep the app’s device schema and outbox migration gate explicit.

**Why:** Prevent deployment from losing drafts and queued writes.

**Current state:** Same execution stream as device-data-migrations.md. At 23:43 the corrected deployed-build upgrade test is queued on the Mac mini; 4c and deployment remain pending. Lander owns the docs check.

**Next step:** Use device-data-migrations.md for detailed proof; complete the upgrade test and hand off immediately.

**Open questions for Will:** None.

Evidence: user-typed text and lead text replies extracted by script from session 6253ecf2, approximately 21:44–23:44 PDT; queue answers through 23:38:44, current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Synthetic notifications and tool content excluded. Later rulings supersede retained history. Product receipts are lead-reported; this tracker validates the maintainer-site build. Execution ownership retained; documentation reconciled by Codex tracker curator.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-20 23:25 PDT

**What:** Migrate persisted device collections and outbox payloads.

**Why:** Deploy without losing local work.

**Current state:** Same execution workstream as device-data-migrations.md. At 23:25 round 4b is landed, but the deployed-build upgrade proof is still finishing; no round 4c or deployment receipt.

**Next step:** Track the migration gate in device-data-migrations.md and retain upgrade receipts.

**Open questions for Will:** None.

Evidence: script-filtered human messages and lead text replies through 23:25 PDT; queue answers through 23:16, current rulings, decisions, proposals and shared briefs/designs. Automated notifications excluded. Product receipts are lead-reported; tracker validation is the site build. Execution owner retained; Codex curates the note.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-20 23:14 PDT

**What:** Version and migrate persisted device data before app reads.

**Why:** Preserve drafts and pending offline writes across deploys.

**Current state:** At 23:07 the lead reports 290 passing browser-platform tests and SDK coverage at 100%. The full app suite and upgrade test from the deployed build are still running. No completed upgrade, round 4c landing or new deployment receipt exists. The shared outbox also contains an unrelated edit that appears to undo a fix already on main; the lander was told to take only migration changes.

**Next step:** Finish the full app suite and deployed-build upgrade proof, isolate migration edits and hand passing receipts to the lander for round 4c.

**Open questions for Will:** None; these are two existing indexes of the same migration workstream.

Evidence: session 6253ecf2 user-typed text and lead text replies, script-filtered for the latest two hours through 23:13 PDT; rulings FE-16 and PROC-18; queue answers through 23:13 PDT. Synthetic notifications and relayed agent messages excluded. Current rulings supersede historical briefs and proposals. Product checks are lead-reported, not rerun by the tracker. Execution ownership retained; reconciliation by Codex tracker curator.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-20, 22:35 PDT

**What:** Safely version and migrate all persisted device data before app reads after deployment.

**Why:** Offline writes and drafts must survive an upgrade.

**Current state:** At 22:27 the lead reports code complete and all checks permitted during the test pause passing. Full-suite and old-deployed-build upgrade proof still wait for the lander’s run; the earlier readiness estimates are not completion receipts.

**Next step:** Run the full suite and deployed-build upgrade preserving offline writes and drafts when the pause lifts; keep deployment gated on their success.

**Open questions for Will:** None.

Evidence: script-filtered human text and lead text replies from session 6253ecf2, approximately 20:35–22:35 PDT; automated notifications and tool blocks excluded. Current rulings and queue answers (latest 19:38 PDT) prevail over historical briefs and proposals. Execution ownership retained; Codex tracker curator reconciles documentation only. Product receipts are lead-reported; tracker verification is the maintainer-site build.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-20, 22:15 PDT

**What:** Version and safely migrate persisted device data, including pending offline writes and drafts, across deployments.

**Why:** Will requires robust local-first upgrades before the next production deploy.

**Current state:** At 22:10 the lead reports code done, with docs/tests estimated by 23:10 and landing readiness about 30 minutes after the test pause lifts. Those are estimates; no full-suite or deployed-build upgrade proof is reported. Decision 0021 remains proposed specification rather than completed validation.

**Next step:** Finish docs and meaningful tests; prove the upgrade from the retained deployed build, including offline writes, crash recovery and preserved history. Obtain the full-suite receipt before deployment.

**Open questions for Will:** None; completion timing and upgrade evidence come from the builder.

Evidence: script-filtered user-typed text and lead text replies from session 6253ecf2, approximately 20:15–22:15 PDT; synthetic notifications, relayed agents and compaction summaries excluded. Rulings and all 75 queue answers (latest 19:38 PDT) take precedence over historical shared briefs, panel designs, decisions, proposals, TODOs and rules. Execution ownership and status retained; Codex tracker curator reconciles documentation only. Product results are reported evidence; this pass validates the site build.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-20, 22:05 PDT

**What:** Version and safely migrate all local-first device data on deployment.

**Why:** Will explicitly requires robust upgrades that make data loss hard.

**Current state:** At 22:04 the lead reiterates that migration proof is a hard deploy prerequisite and has requested an ETA. No completed migration or old-production offline-write upgrade receipt appears. Decision 0021 and the retained production build remain the specification and fixture.

**Next step:** Finish the current migration slice; prove offline writes, drafts, crash recovery and old history survive an actual upgrade before deployment.

**Open questions for Will:** None; the builder supplies the ETA.

Evidence: script-filtered human text and lead replies in session 6253ecf2, approximately 20:04–22:04 PDT; synthetic notifications, compaction summaries and tool blocks excluded. Rulings and queue answers through 19:38 prevail over historical briefs, decisions and proposals. Execution ownership retained; Codex curates this note. Product checks are reported evidence; tracker validation is the site build.

## Earlier tracker history (retained)


## What

Will, 2026-10-20 about 20:05 on Telegram: "when we deploy to prod we will have a frontend migration to do and in fact need a generalized way of handling migrations of our local first data that should be robust and make messing up hard".

Design: [decision 0021](../decisions/0021-local-first-migrations.md). Slice 1 builds the machinery in the SDK, declares every persisted store the app keeps, migrates what changed since the last production deploy (`7b96f878`), and proves it with fixtures, property tests and an end-to-end test that upgrades the deployed build's device to this one.

## Status (builder, 2026-10-21 00:05 PDT)

Slice 1 is land-ready and handed to the round 4 lander for 4c.
- `packages/effect-tanstack-db`: 143 tests, 100% coverage; types, lint, format and the circular check clean.
- `packages/smithers/flows/platform-browser`: 290 tests on the mini, coverage met.
- `apps/mvp`: the device tests and `dev/https.test.ts` pass. The full suite's 70 failures on the loaded mini are other lanes' in-flight work, timing that passes in small batches, or reds that fail the same with this slice swapped out.
- `e2e/device-upgrade.spec.ts` passes on the mini against the deployed `7b96f878` build: Postgres has both questions, once each, and the draft survives a reload. GIF: `~/Desktop/smithers-mvp/gifs/device-upgrade-deploy.gif`.
- The lander runs `docs:sync` and `docs:check` on 4c.

The deployed build (`7b96f878`) is mirrored at `~/Desktop/smithers-mvp/builds/7b96f878` and on the mini at `~/smithers-mirror/builds/7b96f878`. Its `index.html` comes from `/app` (the site redirects `/index.html`); its MD5 matches the `sw.js` precache revision.

## Follow-ups (slice 2, status todo)

- **Epoch handshake with open tabs.** The leader announces its epoch with `Ready`; a tab of a lower epoch reloads, and one of a higher epoch asks older tabs to reload and waits for a leader of its epoch (0021 §2). Until then, a new tab whose store an old tab's worker serves sees its changed local collections fail to load until that tab closes; no data is lost.
- **The server's minimum epoch.** ChatApi sends `Smithers-Minimum-Epoch`; a device below it shows Update + Reload and sends nothing more (0021 §6).
- **`device_kept` in the device's export** ([device data recovery](device-data-recovery.md)).
- **Record the next fixture from the real deployed build** in the e2e (its IndexedDB outbox and `app.db` rows), not hand-written in its shapes.

## Reconciliation — 2026-10-20, 20:24 PDT

**Why:** Preserve local-only rows and pending writes across every deploy; synced caches may be refetched. This is also the canonical workstream for [the earlier device migration note](device-data-migrations.md).

**Current state:** Decision 0021 is proposed, not an approved implementation receipt. Slice 1 started at 20:20; the old production build fixture is retained. No completed migration or real upgrade test is reported. At 20:23 the curator confirms the decision asks Will nothing.

**Next step:** Implement the SDK version registry and durable preparation, declare app stores and outbox payload histories, add schema fingerprint and historical-fixture guards, and prove an old-production device with an offline write upgrades safely. Preserve engine-history decoding, crash recovery and multi-tab ordering. The next deploy waits for this proof.

**Open questions for Will:** None.

Evidence: decision 0021 and script-filtered lead replies through 20:24 PDT. Execution owner retained; product validation is pending.
