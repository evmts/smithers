---
title: "Local dev live-feed connection contention"
status: done
area: infra
owner: dev sync performance builder assigned by lead
updated: 2026-10-20 23:55 PDT
links: [dev-stack-hygiene.md, notifications-and-live-work.md, effect-tanstack-db-and-effect-electric.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-20 23:55 PDT

**What:** Serve local live feeds over HTTP/2 and prove prompt cross-device convergence.

**Why:** Plain HTTP connection starvation delayed device updates.

**Current state:** At 23:51 the lead reports the builder finished and handed off for round 4d. Branch sharing passes 2/2 and the HTTP/2 sync test passes with GIFs; the HTTPS front has 100% coverage. The measured Mac-mini write latency is 0.05 s versus 19.6 s previously. Notifications/status tests still fail because their new assertions count 411 stale runs, not because sync waits expired. This note’s done status covers the dev transport slice, not landing or the full app.

**Next step:** Land the validated handoff in 4d. Notifications owner must isolate assertions to runs created by each test; retain timing method and limitations.

**Open questions for Will:** None.

Evidence: last two session hours of user-typed text and lead replies extracted with a JSONL script (notifications and tool content excluded), through 23:54 PDT; queue answers through 23:51; current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Product receipts are lead-reported; tracker validation is the maintainer-site build. Prior history and execution ownership retained.

## Earlier tracker history (retained)


## Builder's state — 2026-10-20, 22:20 PDT

**Fix:** `pnpm dev` also serves the app at https://localhost:1443 over HTTP/2 (`dev/https.ts`, a Vite plugin in front of Vite), as Cloudflare does; e2e tests open it by default. Fewer long polls per tab was rejected: Electric has no multi-shape endpoint, and production needs none. See [infrastructure.md](../infrastructure.md#https-and-http2). A dev server on a stage other than `dev_$USER` must set `DEV_HTTPS_PORT`, and fails to start without it.

**Measured** on the Mac mini, same server and tree: a write on A reaches B in 19.6 s median over HTTP/1.1 and 0.05 s over HTTP/2; the agent's toast on B 35.1 s and 1.5 s.

**Waits lowered:** notifications (sync 90 s to 15 s, test 480 s to 180 s), status (toast 60 s to 15 s, test 300 s to 120 s), branch sharing (sync 90 s to 30 s). New regression test: `e2e/sync.spec.ts` "sync over HTTP/2". `e2e/devices.ts` names the dev person cookie `__Host-` over HTTPS, as ChatApi reads it.

**Proof, 23:50 on the Mac mini over HTTP/2:** branch-sharing passed both tests (sync wait 30 s), and sync.spec "sync over HTTP/2" passed (GIF `~/Desktop/smithers-mvp/gifs/sync-sync-over-http-2.gif`). notifications and status failed on the new top-bar assertions from the notifications work ("Notifications: N needs you" not found; 411 open questions left by earlier runs on the mini), not on a sync wait. `dev/https.ts` has 100% coverage over 44 tests.

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
