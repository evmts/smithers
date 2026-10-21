---
title: Local-first conflict coverage and multi-device walkthroughs
status: in-progress
area: app
owner: conflict-coverage builder assigned by lead
updated: 2026-10-21 03:14 PDT
links: [local-first.md, branch-coediting.md, chaptered-review-videos.md, ../decisions/0002-local-first.md, ../rules.md]
---

## Tracker reconciliation — 2026-10-21 03:14 PDT

**What:** Prove every real device-conflict class with end-to-end tests and clear recordings.

**Why:** Will requested all conflict types; unexplained real-model failures remain product evidence to resolve.

**Current state:** At 02:56 PDT the lead started an Opus job in its own workspace to reproduce the four unexplained failures, bisect round-4 changes and fix the causes. The earlier eleven-case outcome accounting remains incomplete; no new passing full-suite receipt is reported.

**Next step:** Follow local-first-conflicts.md for the detailed inventory, reconcile all eleven results and retain a real-model regression for every repaired cause.

**Open questions for Will:** None.

Evidence: script-extracted user text and lead replies, 08:13–10:13 UTC on 2026-10-21 (01:13–03:13 PDT); current rulings and queue answers take precedence over briefs and designs. Execution owners and status retained. Product receipts are lead-reported; this tracker validates only the maintainer-site build.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 00:44 PDT

**What:** Prove device-conflict behavior with the real model and preserve failing cases.

**Why:** Passing scripted-agent journeys do not establish real-model behavior.

**Current state:** At 00:41 the lead reports 5 of 11 passing, 1 failing where already marked broken, and 4 other unexplained failures after the real-model switch. These counts account for only 10 cases; the eleventh outcome is unreported. Earlier 6-of-11 scripted-agent evidence does not settle the current suite. The lead plans committed known-broken cases for landing.

**Next step:** Reconcile all eleven outcomes and investigate the failures first after deployment; retain each broken test and fix its cause. Do not present this suite as passing.

**Open questions for Will:** None; debugging and test accounting belong to the owners.

Evidence: script-filtered user-typed text and lead text replies from session 6253ecf2, approximately 22:44–00:44 PDT; rulings, queue answers through 00:17:42 PDT, current decisions, proposals, TODOs, rules and shared briefs/designs. Automated notifications and teammate messages are excluded as human evidence. Product checks are lead-reported receipts; this tracker validates the site build only. Existing execution owners and all history are retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-20 23:44 PDT

**What:** Demonstrate every real device-conflict class with meaningful multi-device journeys.

**Why:** Will requested all conflict types and clear evidence.

**Current state:** At 23:37 Will approved page.clock only for clock tests (TEST-12), closing queue 940. Last reported inventory remains 6 of 11 passing with retained product bugs; no new complete passing receipt. Scripted-agent happy paths still need the real model.

**Next step:** Run the clock cases under the approved exception, replace scripted happy paths, and fix retained broken regressions. Detailed inventory remains local-first-conflicts.md.

**Open questions for Will:** None on page.clock; permission is granted for clock tests only.

Evidence: user-typed text and lead text replies extracted by script from session 6253ecf2, approximately 21:44–23:44 PDT; queue answers through 23:38:44, current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Synthetic notifications and tool content excluded. Later rulings supersede retained history. Product receipts are lead-reported; this tracker validates the maintainer-site build. Execution ownership retained; documentation reconciled by Codex tracker curator.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-20, 22:24 PDT

**What:** Demonstrate every device-conflict class with real multi-device journeys.

**Why:** Will asked for all conflict types and clearer recordings.

**Current state:** At 22:18 the lead reports 6 of 11 cases pass. Broken tests retain four bugs: old leader tab blanks, Edit withdraws an accepted question, withdrawal stays Queued in another tab, and a backward clock reorders offline questions. Scripted-agent tests do not satisfy the real-model rule.

**Next step:** Use local-first-conflicts.md as the detailed inventory; replace scripted agent with the real model after the pause and fix each retained broken case. Keep offline permission-revocation coverage visible.

**Open questions for Will:** Queue 940 asks permission for Playwright device-clock simulation in two clock tests; no answer recorded.

Evidence: script-extracted human text and lead replies, approximately 20:24–22:24 PDT; synthetic notifications excluded. Latest Will text, rulings and queue answers supersede older briefs and proposals. Execution ownership retained; Codex tracker curator updates documentation only. Product checks above are reported receipts; this pass validates the maintainer-site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 18:26 PDT

**What:** Inventory and demonstrate every device-storage conflict type in two-device tests.

**Why:** Will requested all conflict types and better scenario descriptions at 18:22.

**Current state:** At 18:23 the lead assigned inventory, code verification and one chaptered two-device journey per kind. No inventory or complete passing suite receipt yet.

**Next step:** Cover concurrent edits, edit/delete, both devices offline with either reconnect order, duplicate send, stale leader tab, withdrawal versus send, offline revocation, cross-deploy changes, clock skew and co-edited drafts. Check each against code; retain unsupported behavior as committed broken tests and surface it to Will. Produce readable full-size videos with scenario, devices and chapter outcomes.

**Open questions for Will:** Only confirmed unsupported cases needing a product choice; none established yet.

Evidence: latest two session hours extracted by script as human text/lead replies; queue answers through 2026-10-21 01:24:15 UTC, current rulings, shared briefs/designs, decisions, proposals, TODOs and rules. Latest rulings override historical proposals. Product results are reported receipts; this pass verifies the maintainer-site build only.
