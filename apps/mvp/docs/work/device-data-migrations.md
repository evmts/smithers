---
title: Version and migrate device data across deploys
status: in-progress
area: sdk
owner: Device migration designer and builder assigned by lead
updated: 2026-10-21 00:06 PDT
links: [local-first-migrations.md, ../decisions/0021-local-first-migrations.md, local-first.md, durable-browser-engine.md, plan-identity-across-deploys.md, device-data-recovery.md, land-and-deploy-mvp.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 00:06 PDT

**What:** Version device stores and pending writes across deploys.

**Why:** Preserve messages, offline work and drafts.

**Current state:** At 23:59 the lead reports the real deployed-build upgrade test passed on the mini against 7b96f878: both questions reached Postgres once and in order, and the draft survived reload. Will approved the device-upgrade recording at 00:01:27. Round 4c is being landed; no landing receipt is reported. An old tab can still block new data loading until closed; slice 2 remains open.

**Next step:** Retain the upgrade proof, obtain 4c landing receipt and deploy; track old-tab coordination separately. Keep in-progress until landing and remaining migration scope are resolved.

**Open questions for Will:** None.

Evidence: script-filtered human text and lead replies from the last two session hours, through 00:05 PDT; queue answers through 00:05:48 PDT; current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Product checks are reported receipts, not checks executed by this tracker. Existing execution owners and history retained; Codex curates documentation only.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-20 23:44 PDT

**What:** Migrate device stores and pending writes safely across deployment.

**Why:** Preserve local work before shipping the new app build.

**Current state:** At 23:42 the lead says full-suite failures belong to other in-flight lanes and pass in smaller groups. The deployed-build upgrade test failed because its setup copied an empty deployed page. At 23:43 the corrected upgrade test is queued on the Mac mini. The builder dropped its own docs wait; the lander checks docs. No passing upgrade, 4c landing or deployment receipt.

**Next step:** Pass the real deployed-build upgrade test, hand files and receipts to the lander, then land 4c and deploy.

**Open questions for Will:** None.

Evidence: user-typed text and lead text replies extracted by script from session 6253ecf2, approximately 21:44–23:44 PDT; queue answers through 23:38:44, current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Synthetic notifications and tool content excluded. Later rulings supersede retained history. Product receipts are lead-reported; this tracker validates the maintainer-site build. Execution ownership retained; documentation reconciled by Codex tracker curator.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-20 23:25 PDT

**What:** Version and migrate persisted device data before reads.

**Why:** Keep drafts and pending writes across deploys.

**Current state:** The 23:07 receipts remain 290 browser-platform tests and SDK coverage at 100%. At 23:25 the lead says the builder resumed and is finishing the upgrade test from the deployed build. Round 4b landed; no passing upgrade or round 4c landing receipt yet.

**Next step:** Finish upgrade and full app validation, isolate migration edits in the outbox, and hand receipts to the lander.

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


## Tracker reconciliation — 2026-10-20, 23:04 PDT

**What:** Version and migrate persisted device data before app reads.

**Why:** Upgrades must preserve drafts and pending offline writes.

**Current state:** At 23:02 the lead reports the migration agent running its full suites, docs:check and the upgrade test from the deployed build, first after the test pause lifted. This remains the hard deployment gate and is intended to land as round 4c; no final passing or landing receipt yet.

**Next step:** Complete historical-fixture, crash-recovery and deployed-build upgrade proofs, then hand validated files to the lander for 4c.

**Open questions for Will:** None.

Evidence: script-filtered user-typed messages and lead text replies from session 6253ecf2, 21:03–23:03 PDT; synthetic notifications and tool blocks excluded. Current rulings and queue answers (latest 19:38 PDT) prevail over historical briefs/designs. Execution ownership is retained; Codex tracker curator reconciles documentation only. Product receipts are lead-reported; this pass verifies the site build.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-20, 22:24 PDT

**What:** Migrate all persisted device schemas before app reads after a deploy.

**Why:** Pending writes and personal drafts must survive upgrades.

**Current state:** At 22:10 the lead reports code done, with docs/tests targeted for 23:10 and readiness to land about 30 minutes after the test pause lifts. A deployed-build upgrade proof is still required; ETA is not completion. Decision 0021 defines the contract.

**Next step:** Require historical fixtures, crash recovery and an old-deployed-build upgrade preserving drafts/offline writes before the next deploy. Follow local-first-migrations.md for implementation details.

**Open questions for Will:** None.

Evidence: script-extracted human text and lead replies, approximately 20:24–22:24 PDT; synthetic notifications excluded. Latest Will text, rulings and queue answers supersede older briefs and proposals. Execution ownership retained; Codex tracker curator updates documentation only. Product checks above are reported receipts; this pass validates the maintainer-site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 20:24 PDT

**What:** Provide typed, ordered migrations for persisted device data through the canonical local-first-migrations.md workstream.

**Why:** Will requires safe upgrades across production deploys without losing drafts or pending writes.

**Current state:** Decision 0021 is now written, status proposed. The builder started slice 1 at 20:20 PDT and retained the deployed 7b96f878 build for an actual upgrade test. This earlier note indexes the same workstream, not a second assignment; implementation and upgrade receipts remain pending.

**Next step:** Follow local-first-migrations.md and decision 0021 for SDK machinery, schema-version guards, historical fixtures and an old-build offline-write upgrade journey. Gate the next deploy on those receipts.

**Open questions for Will:** None; the 20:23 curator update explicitly says decision 0021 asks Will nothing.

Evidence: script-filtered user text and assistant replies from session 6253ecf2, approximately 18:24–20:24 PDT; queue answers through 19:38 PDT; rulings, decisions through 0021, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Builder checks are reported evidence; this tracker verifies the maintainer-site build. Existing execution ownership retained.

## Earlier tracker history (retained)


**What:** Provide generic typed, ordered migrations for all persisted device data, run durably before the app reads it.

**Why:** The lead reports Will’s Telegram migration request at 20:05; the next production deploy waits for this safety machinery.

**Current state:** One agent is designing and building it. The brief covers build-stamped versions for synced collections, pending offline writes, engine journals and device-only data. Synced cache may be fetched again; drafts and pending writes must migrate or visibly refuse with Retry and Discard. No completed design, implementation or browser receipt is reported.

**Next step:** Inventory stored shapes and version contracts in the SDK, produce the design for Will’s queue, implement crash-resumable migration steps and current-production migrations, then test an old build with offline data upgrading to the new build. Add a shape-change gate and historical snapshot tests. Preserve persisted-history compatibility; a schema version stamp alone is not migration proof.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and assistant replies in session 6253ecf2, 18:15–20:14 PDT on 2026-10-20; queue answers through 19:38 PDT; current rulings, decisions 0001–0020, proposals, TODOs, rules and shared briefs/designs. Later Will text and queue answers prevail. Product checks are reported receipts; this tracker validates the site build. Execution ownership is retained.
