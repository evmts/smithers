---
title: Add Latitude test-runner capacity
status: done
area: infra
owner: Codex Sol lat-run builder assigned by lead
updated: 2026-10-21 21:34 PDT
links: [second-build-machine.md, mac-mini-test-farm.md, dev-stack-hygiene.md, agent-review-finding-repairs.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 21:34 PDT

**What:** Install dependencies before a cold Latitude slot runs tests.

**Why:** Remote test slots must work without preinstalled packages.

**Current state:** Surviving latrun-deps-report.md reports the repair complete: cold slot installs in 5.1 seconds and passes 904/904 tests; warm slot skips installation and passes 904/904. Both exit zero and report 100% coverage. Failed installs leave no valid stamp; target closure fallback and workspace membership restoration are recorded. This supersedes the 21:22 missing-packages failure.

**Next step:** Use the rebuilt runner and retain cold/warm receipts; no repository landing is claimed for scratchpad tooling.

**Open questions for Will:** None newly required; existing product decisions and account provisioning remain in their owning workstreams.

Evidence: script-filtered user text and lead replies from the latest approximately two hours across both requested session paths, current rulings and queue answers, and surviving reports where named. Product checks are reported receipts. Implementation owner retained; Codex maintains this tracker entry. Earlier history below is preserved; reboot-wiped briefs are not missing work.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 21:24 PDT

**What:** Provide isolated remote suites and install missing dependencies before execution.

**Why:** A reserved slot must be usable even when its packages are absent.

**Current state:** The rebuilt runner has real passing suite receipts. At 21:16 the lead clears the apparent main lockfile problem as stale checkout files. At 21:22 a retry suite fails on a Latitude slot without packages installed; a Codex repair is running. This reopens runner completeness, not server reachability.

**Next step:** Finish missing-dependency installation repair and prove a cold slot installs before running; retain warm-slot, cancellation and isolation checks.

**Open questions for Will:** None.

Evidence: script-filtered human messages and lead text replies in the latest approximately two hours across both requested transcript paths; continuation path is absent, but continuation-era replies appear in 6253ecf2. Current rulings and queue answers prevail. Surviving briefs/reports used where cited; wiped scratch files are not missing work. Execution ownership retained; Codex curates this note. Product checks are reported receipts, not rerun here.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 20:47 PDT

**What:** Provide isolated remote unit and integration test capacity.

**Why:** Keep heavy checks off the MacBook.

**Current state:** Recovered runner report proves 904 flow tests across 68 files and 13 real-Postgres Views tests passed. Exit propagation, cancellation, lock release and input guards passed. The proof reused dependencies; default frozen installs still reject the unrelated playground lockfile mismatch. The lead confirms availability at 20:38.

**Next step:** Use LAT-RUN.md and isolated slots; resolve the lockfile mismatch in its owning workstream.

**Open questions for Will:** None.

Evidence: script-filtered human text and lead replies, 18:46–20:46 PDT, session 6253ecf2; current rulings and queue answers prevail. Runner results are recovered report receipts. Codex curates this update; existing implementation ownership is retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 20:34 PDT

**What:** Provide isolated remote unit and integration test capacity.

**Why:** Keep heavy checks off the MacBook without sharing mutable test state.

**Current state:** After the 20:11 reboot the lead assigned a Codex Sol recovery job. Recreated LAT-RUN.md describes the wrapper, surviving per-slot services and host locks; proof logs exist, but no final rebuild report or completed suite summary was available at this reconciliation. Earlier access bans are historical, not a renewed request for console intervention.

**Next step:** Collect the flow-suite and Postgres-backed app-test exit receipts, then confirm runner availability to builders.

**Open questions for Will:** None.

Evidence: lead text replies script-filtered from session 6253ecf2, approximately 18:34–20:34 PDT, and recovered briefs where named. Automated notifications and tool content are excluded. Current rulings and queue answers prevail over older plans. Existing implementation ownership is retained; Codex curates the tracker. Product results are reported evidence, not tests rerun by this refresh.

## Earlier tracker history (retained)

## Tracker reconciliation — 2026-10-21 17:14 PDT

**What:** Provide isolated remote test capacity.

**Why:** Keep heavy suites off the MacBook and prevent cross-agent interference.

**Current state:** At 17:10 Latitude is reachable again and the lander/review jobs move back. Up to six review fix jobs use the shared runner. Earlier console intervention is unnecessary; database-slot isolation remains a separate acceptance requirement.

**Next step:** Keep correct-key shared connections and isolated-suite receipts; avoid repeated failed logins.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies in session 6253ecf2, approximately 15:14–17:14 PDT. Notifications, relayed agents, tools and compaction summaries excluded. Rulings and queue answers supersede older briefs/designs and docs. Execution owner retained; Codex curates the tracker only. Product results are lead-reported.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 17:04 PDT

**What:** Provide isolated remote test capacity.

**Why:** Keep heavy suites off the MacBook when remote hosts are available.

**Current state:** At 17:03 PDT the lead reports both Latitude servers responding again after the failed-login block lifted automatically. Tests return to Latitude using a shared connection. This supersedes the earlier access blocker and dashboard request; it does not establish that concurrent database isolation is proven.

**Next step:** Resume remote suites with the correct key and shared connection; retain isolated-slot validation receipts.

**Open questions for Will:** None; the lead explicitly says console intervention is unnecessary.

Evidence: user text at 17:02 PDT and lead replies through 17:04 PDT, script-filtered from session 6253ecf2’s latest two hours. Rulings and queue answers govern over historical briefs and designs. Implementation ownership retained; Codex curates the tracker. Product measurements are lead-reported.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 16:43 PDT

**What:** Provide isolated remote test capacity.

**Why:** Remote suites must be reachable and independent.

**Current state:** At 16:41 the lead withdrew the dashboard request after diagnosing failed-login IP bans. At 16:42 both servers block this network; lane has no root rights. Runner defaults to nyc-02 and reuses one connection. MacBook suites remain the fallback; no recovery receipt exists.

**Next step:** Lead plans one correct-key connection around 17:02; avoid repeated login attempts. Restore access before proving isolated concurrent slots.

**Open questions for Will:** No immediate action requested; if bans persist when Will returns, console/root access may be needed.

Evidence: user-typed messages and lead text replies script-filtered from session 6253ecf2, 14:43–16:43 PDT; synthetic notifications, tools and compaction summaries excluded. Rulings and queue answers govern over historical briefs, panels, decisions, proposals, TODOs and rules. Implementation ownership retained; Codex curates this note. Product results are lead-reported.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 16:25 PDT

**What:** Provide isolated remote suite capacity.

**Why:** Keep implementation and validation claims tied to evidence.

**Current state:** Shared Postgres/Electric caused 436 clean-main app failures. At 16:23 both Latitude servers are unreachable from the current network since about 16:20. Firewall/IP restriction is only a hypothesis. Review fixes now test on the MacBook; the mini is offline.

**Next step:** Restore reachability and prove per-slot isolation before claiming concurrent suite capacity. Avoid large transfers on phone data.

**Open questions for Will:** Check the Latitude dashboard/network access, or confirm MacBook suites until home?

Evidence: script-filtered human messages and lead text replies, 14:25–16:24 PDT, session 6253ecf2; tool blocks, notifications and compaction summaries excluded. Rulings and queue answers govern over historical designs. Existing implementation owner retained; Codex maintains this note. Product receipts are lead-reported.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 16:04 PDT

**What:** Provide isolated Latitude suite slots while the Mac mini is offline.

**Why:** Parallel app suites must not collide through shared database and sync state.

**Current state:** The earlier clean-main run produced 436 app failures attributed to shared Postgres/Electric; slot isolation remains assigned to Codex Sol. At 15:50 the lead directs all suites to Latitude because the mini is offline, with local browser E2E only as needed. No large transfers, installs or container-image pushes while Will uses phone data. No isolation completion receipt is reported.

**Next step:** Finish slot database/sync isolation and prove concurrent app runs. Until then compare with main on the same runner; use necessary local browser checks within bandwidth limits.

**Open questions for Will:** None newly identified; unresolved questions in the retained history remain open.

Evidence: script-filtered user text and lead assistant replies from session 6253ecf2, approximately 14:03–16:03 PDT on 2026-10-21. Tool records, relayed agent messages, automation prompts and compaction summaries excluded. Rulings and queue answers prevail over shared briefs, panel designs and older planning docs. Product checks are lead-reported; this refresh verifies the maintainer-site build. Engineering ownership retained; documentation reconciliation by Codex.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 14:35 PDT

**What:** Provide isolated Latitude test slots.

**Why:** Shared infrastructure must not make concurrent app suites corrupt each other.

**Current state:** The 12-slot runner works for package suites, but at 14:25 the lead reports 436 app failures on clean main because slots share Postgres and Electric. A Codex Sol job is isolating each slot’s database.

**Next step:** Finish database/sync isolation and prove simultaneous app suites. Until then compare app results with main on the same runner or use the Mac mini; keep package capacity available.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies, approximately 12:34–14:34 PDT on 2026-10-21, session 6253ecf2. Automated notifications, tool records and generated summaries excluded. Current rulings and queue answers prevail over historical briefs/designs and planning docs. Product receipts are lead-reported; this pass verifies the maintainer-site build only. Existing engineering ownership retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 13:54 PDT

**What:** Provide shared Latitude capacity for unit and integration validation.

**Why:** The Mac mini’s four slots delay builders and repair jobs.

**Current state:** At 13:52 the lead reports lat-run working with 12 slots across two servers; the flow suite completed in 16 seconds while the mini was saturated. At 13:53 repair jobs use it and run six at a time. This establishes executed capacity; a repository landing receipt is not reported.

**Next step:** Retain runner validation and usage receipts; route eligible suites through it. End-to-end runs stay on the mini, per the runner brief.

**Open questions for Will:** None.

Evidence: lead text replies at 13:44–13:53 PDT on 2026-10-21, extracted by script from session 6253ecf2 within its latest approximately two hours. Automated notifications, relayed agent messages and tool content are excluded. Rulings and queue answers take precedence over historical briefs and designs. Results are lead-reported; this tracker verifies the maintainer-site build. Existing implementation ownership is retained.

## Earlier tracker history (retained)


**What:** Provide an equivalent remote test runner on the two Latitude servers.

**Why:** The Mac mini’s four slots are saturated and delay feature validation and repair jobs.

**Current state:** At 13:37 PDT the lead assigned Codex Sol to build lat-run. At 13:38 the planned addition is 12 slots. At 13:41 two suites are already running through it. This proves use, not completed suite outcomes or a landing receipt.

**Next step:** Collect suite outcomes and runner validation/landing receipts, then route eligible queued tests to the added capacity through the shared execution capability.

**Open questions for Will:** None; remote compute is already authorized.

Evidence: lead text replies at 13:37–13:41 PDT, script-filtered from session 6253ecf2; current rulings and queue answers take precedence over older briefs. Codex curates documentation; implementation ownership remains with the assigned builder.
