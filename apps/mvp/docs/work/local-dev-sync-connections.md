---
title: "Local dev live-feed connection contention"
status: in-progress
area: infra
owner: dev sync performance builder assigned by lead
updated: 2026-10-20
links: [dev-stack-hygiene.md, notifications-and-live-work.md, effect-tanstack-db-and-effect-electric.md, ../rulings.md]
---

## Current specification — 2026-10-20, 17:55 PDT

**What:** Remove local live-feed connection starvation.

**Why:** Up to 40-second cross-device delays undermine interaction and review recordings.

**Current state:** The 17:36 lead reply assigns measurement and either production-like transport or shared feeds; at 17:54 that owner is confirmed resumed. The former unassigned owner is stale. No measured fix receipt exists.

**Next step:** Measure before/after with several tabs and real writes; implement through shared SDK services and shorten workaround test waits only after proving convergence.

**Open questions for Will:** None for this update.

Evidence: script-extracted user-typed text and lead replies for the latest two session hours through 2026-10-21 00:54:49 UTC; queue answers through 00:42:06 UTC; current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Later rulings prevail. Product and landing receipts are lead-reported; this tracker validates the maintainer-site build only.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 17:44 PDT

**What:** Remove local plain-HTTP live-feed connection starvation.

**Why:** Cross-device changes taking up to 40 seconds make the app and recordings look slow.

**Current state:** At 17:36 the lead assigned measurement and a fix: production-like dev transport or shared feeds. Earlier low-priority requests did not resolve the full delay. No new timing receipt.

**Next step:** Measure before and after, preserve concurrent writes, then remove long browser-test waits added as a workaround.

**Open questions for Will:** None for this update.

Evidence: queue answers through 2026-10-21 00:42:06 UTC and script-filtered human text/lead replies from 22:43–00:43 UTC; current rulings and decision 0017 supersede historical briefs. Product checks are reported evidence; this tracker validates the site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 17:14 PDT

**What:** Make local development support concurrent live feeds and writes without plain-HTTP connection starvation.

**Why:** Slow cross-device sync distorts development and browser-test timing.

**Current state:** At 17:13 the lead reports up to roughly 40 seconds for changes to reach another device. Each tab opens more feeds than the six plain-HTTP connection slots. Earlier low-priority shape requests improved other requests, but did not eliminate this observed delay. Production uses a different connection protocol; this pass has no production timing receipt.

**Next step:** Assign a fix using the Electric and dev-host services; reproduce under several tabs, then verify writes, read-state and run progress converge promptly with real browser tests. Match production transport where practical.

**Open questions for Will:** None.

Evidence: script-extracted human text and lead replies from session 6253ecf2, latest two hours through 2026-10-21 00:13:56 UTC; queue answers through 00:06:34 UTC; current rulings, decisions, proposals and shared briefs. Queue answers supersede older design proposals. Test results are lead-reported; this tracker runs the site build only.
