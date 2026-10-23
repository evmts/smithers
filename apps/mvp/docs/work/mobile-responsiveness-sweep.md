---
title: Mobile responsiveness sweep
status: in-progress
area: frontend
owner: codex-mobile-sweep
updated: 2026-10-23
links: []
---

Will requested every main screen at 390×844, 768×1024 and 1280×800, red-first browser evidence, source layout fixes, remote validation and screenshots/GIFs. Work stays in the mobile-sweep jj clone and is never pushed.

Library catalog entries: @smthrs/ui for shared components and @smthrs/repo-view for repository presentation. No new libraries or local dependency installs.

Baseline: 049a12c8. Browser checks run on the Mac mini; unit, type and lint checks run on Latitude.

Added `e2e/mobile.spec.ts`: signed-in and signed-out route audits at all three sizes, plus populated composer, TODO, question queue, run, toast and flow editor states. Audits retain screenshots and structured overflow, clipping, hit-testing and target-size findings. Shared UI and app CSS fixes are scoped to narrow screens; desktop CSS is unchanged.

Red baseline: 108 failed / 12 passed. Expanded intermediate sweep: 71 failed / 64 passed. Subsequent focused runs verify corrected mobile layouts; all-route completion remains blocked by unavailable Code Storage, absent synced issue/PR details, intermittent docs reads, and existing desktop controls below 32px. Secrets and conversations-list screens are absent; terminal coverage proves the panel, not a remote shell. Raw/download and generic plugin routes remain unaudited.

Latitude: UI 2627 passed; app typecheck and ImportRules passed. App unit assertions passed (3383), but the unchanged 100% coverage gate failed (99.73% statements, 99.41% branches, 99.57% functions, 99.81% lines). Desktop comparison: 25/36 paired screenshots byte-identical; data/readiness differences prevent claiming full parity.

Local evidence and commit inventory: `~/smithers-builders/mobile-sweep-REPORT.md` and `~/smithers-builders/mobile-sweep-evidence/`. No push. No claim of a fully passing sweep.

## Completion pass (2026-10-23)

Rebased all local sweep commits onto `main@origin` `9dd5d9d0` without conflicts; never pushed.
Desktop sizing is a separate decision: the 32px target minimum applies only at widths ≤960px. The audit checks actual wrapped-link fragments, visible overflow is not mislabeled clipping, and controls are checked against clipping ancestors. Desktop captures compare the same real page with the sweep's added CSS rules applied and removed, with stable-content checks and both PNGs retained.

File and HTML viewers declare `codeStorage`; synced issue/PR details declare `githubApp`. Read-only routes can run against a deployment; local sign-out is no longer required for the entire suite. Synthetic toast questions stay local so they never enter a deployment's shared home. Docs routes require the actual Retrying heading, and retain API status/refusal receipts.

First rebased browser run: 105 passed, 24 declared skips, 6 desktop failures. Phone and tablet each passed 37 with 8 declared skips. Wrapped inline-link bounding centers and visible badge overflow caused audit false positives, now corrected. Two actual desktop notification bells overlap on docs; fixing the baseline's visible duplication conflicts with the unchanged-desktop-screenshot instruction. Will was asked to choose the exception or retain the blocker.

Cold docs loads passed six times in the first run. The next run reproduced unavailable docs: the mini's direct anonymous GitHub request returned HTTP 403, limit 60, remaining 0, reset 2026-10-23T09:31:26Z. ChatApi returned 503 unavailable while direct requests to vibelang.sh's index and page returned 200. This is an exhausted farm GitHub quota, not evidence of a shape or first-load race. The receipt is `mobile-sweep-evidence/mini-github-headers.txt` beside the external report. No network failure was converted into a skip.

Latitude app suite: 268 files passed, 4 skipped; 3436 tests passed, 2 expected failures, 13 skipped. Assertions passed; the known global coverage gate remains red (lines 99.8%, functions 99.54%, statements 99.68%, branches 99.26%). Typecheck and ImportRules passed. Final browser/media and UI receipts are still being collected.

A second fetch still named 9dd5d9d0: it has no secrets screen or conversations-list route. Those cannot be audited until their stacks land; no invented route or success claim.
