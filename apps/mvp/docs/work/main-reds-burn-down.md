---
title: Repair pre-existing main test and lint failures
status: in-progress
area: sdk
owner: Codex tracker (documentation); Codex Sol repair job assigned by lead after current landings
updated: 2026-10-21 23:44 PDT
links: [repo-checks-green.md, app-suite-flakes.md, app-coverage-gap.md, api-baseline-rerecord.md, durable-external-effects.md, ../rules.md]
---

## Tracker reconciliation — 2026-10-21 23:44 PDT

**What:** Repair failing main checks and preserve replay compatibility.

**Why:** Feature validation needs a trustworthy base.

**Current state:** Main 0d66db74 has 15 more small fixes; roughly 33 further fixes were gating at 23:29. Three agent key tests remain assigned to plan-core with an older-run replay regression required. At 23:38 the public export-map repair passes all 39 cases and publish dry-runs for three packages, and is queued with the second lander. This does not establish a green full main suite.

**Next step:** Land the checked fixes and obtain complete main validation, including the agent suite.

**Open questions for Will:** None.

Evidence: recent user-typed text and lead replies extracted by script from the last two transcript hours; surviving final briefs/reports, rulings and queue answers. The named continuation file is absent; continuation-era replies are present in the original transcript. Reboot-wiped files are not missing work. Implementation ownership is retained; Codex maintains this note. Product checks above are reported receipts.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 23:35 PDT

**What:** Repair failing main checks.

**Why:** Keep the base trustworthy for feature validation.

**Current state:** At 23:29 the lead reports 15 more fixes pushed, main 0d66db74, with about 33 fixes still gating. At 23:31 three agent key tests are red after the intended plan-core encoding change; a dedicated builder owns expected-key updates and old-key replay proof. The agent suite is now a landing gate.

**Next step:** Land corrected batches and the agent-key repair; obtain complete green receipts.

**Open questions for Will:** None.

Evidence: script-filtered recent human text and lead replies in session 6253ecf2; surviving briefs/reports, rulings, queue answers and decision 0021. The continuation filename was not found; continuation-era replies survive in the original transcript. Reboot-wiped files are not missing work. Product receipts are reported evidence; tracker validation is the site build.

## Earlier tracker history (retained)

## Tracker reconciliation — 2026-10-21 23:14 PDT

**What:** Repair existing main check failures.

**Why:** Feature validation needs a trustworthy base.

**Current state:** At 23:11 the lead reports a briefly landed schema restriction rejected existing saved data; a follow-up landed and device storage/upgrade tests pass 21/21. Thirteen additional small fixes are next, followed by the docs batch. This targeted recovery does not establish all main checks green.

**Next step:** Land remaining corrected fixes and collect fresh complete check receipts.

**Open questions for Will:** None newly required.

Evidence: user text and lead replies extracted by script from session 6253ecf2, approximately 21:14–23:14 PDT; tool payloads and automated notifications excluded. The supplied continuation transcript path is absent; recent continuation-era replies are in the original file. Rulings and queue answers take precedence over older docs and surviving briefs. Wiped scratch files are not missing work. Product receipts are lead-reported; this refresh validates the site build. Codex curates documentation and retains execution ownership.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 22:43 PDT

**What:** Repair existing main failures.

**Why:** Feature checks need a trustworthy base.

**Current state:** At 22:38 four Codex fixes landed in 3b028386: CI cloud script, agent error registration, site support matrix and SUPPORT.md. Nine fixes were returned for sleeps or conflicts; six already redone. Other checks and fixes remain open.

**Next step:** Land corrected remaining fixes and obtain fresh complete check receipts.

**Open questions for Will:** None newly required.

Evidence: script-filtered recent human messages and lead text replies in 6253ecf2, through 22:43 PDT; the supplied continuation path is absent, with continuation-era text in the available session. Current rulings and queue answers prevail. Existing execution ownership retained; Codex curates this note. Reported product receipts were not rerun here. Wiped briefs are not missing work.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 21:44 PDT

**What:** Repair independent test, coverage and documentation failures on main.

**Why:** Feature validation needs a trustworthy base.

**Current state:** By 21:39 five of eight Mac mini fix jobs are reported done, with fixes queued to the second lander. The agent error registration is fixed; the lockfile job required no change. Site support-matrix coverage now includes views with 114 site tests passing. Boot expectations now reflect 19 layers; stricter boot checks exposed and fixed a real Node 26 keyboard-shortcut cleanup bug. CI inventory and engine-store coverage jobs remain running.

**Next step:** Land the batch through its gates and collect current-main suite receipts; finish the remaining jobs.

**Open questions for Will:** None newly required.

Evidence: script-filtered recent human text and lead replies through 21:43 PDT in session 6253ecf2, current rulings and queue answers; surviving reports where cited. The supplied continuation path is absent; post-reboot replies are in the available transcript. Product results are reported receipts, not rerun here. Existing execution owner retained; Codex curates documentation. Wiped scratch files are not missing work.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 11:54 PDT

**What:** Repair remaining main test, lint and baseline failures after current landings.

**Why:** A previously green revision does not establish current main health.

**Current state:** At 11:47 ten commits land as b3d8ea23, including seven previously failing revoke tests and production harness fixes. At 11:54 the factory test’s six fixed waits are replaced by event waits and handed to the lander. Six other lint violations remain assigned: device identity’s two fetches and timer, one run-page test timer, and two other test files. The broader MAIN-REDS inventory still lacks a combined green receipt. Browser-package lint remains reserved for dogfooding.

**Next step:** Land assigned fixes, then reproduce and clear the remaining suite/baseline failures on one revision. Retain regressions and full-suite receipts; do not silently refresh baselines or absorb the reserved dogfood issue.

**Open questions for Will:** None.

Evidence: script-filtered user text and lead replies from session 6253ecf2, approximately 09:54–11:54 PDT; current rulings and queue answers take precedence over historical briefs, decisions, proposals, TODOs and rules. Product results are lead-reported; this tracker validates the site build only. Existing implementation ownership is retained; Codex curates documentation.

## Earlier tracker history (retained)


**What:** Repair the collected test, lint and baseline failures after the current landing stack.

**Why:** Earlier green checks do not establish that current main passes; builders report independent failures under load.

**Current state:** The lead’s MAIN-REDS brief lists sandbox RemoteKill and real-container failures, terminal documentation/formatting lint, factory/device import-rule violations, run Resume timeouts under load, stale agent eval and eleven-package public API baselines, browser-host import-type lint, loaded chat flakes, and three factory-stack openOnWindow failures. Seven sign-out revoke failures are reported repaired in 7cf66b16, queued with production fixes. At 10:32 the lead assigns one Codex Sol cleanup job after the landings; no combined green receipt exists. TODO commit-recovery identity is separately tracked under durable external effects (DUR-8).

**Next step:** Reproduce on one landed revision, repair each behavioral failure with regressions, refresh baselines only after verifying behavior, and retain full-suite and load receipts. Reconcile the historical repo-checks-green claim with the current revision.

**Open questions for Will:** None; tests establish whether the features work.

Evidence: shared MAIN-REDS.md read at this refresh; script-filtered lead replies at 10:32, 10:39 and 10:53 PDT; current rulings and queue answers. This note records reported failures, not independently executed tests. Existing workstream history remains in the linked notes.
