---
title: Mobile responsiveness sweep
status: in-progress
area: frontend
owner: codex-mobile-sweep
updated: 2026-10-23
links: []
---

Finish Will's mobile sweep at 390×844, 768×1024 and 1280×800. This is the private working clone; never push. All dependency installs and unit/static checks run on Latitude, browser checks on the Mac mini. No node_modules installed on the MacBook.

Rebased the earlier CSS/test commits onto main@origin 9f03901b, including secrets, conversations, file tabs and repository settings. The catalog entries used are @smthrs/ui for shared controls and @smthrs/repo-view for repository presentation. No new library.

The mobile spec audits signed-in/out routes and populated composer, TODO, flow editor, conversation, queue, run and toast states. The 32px minimum applies only through 960px; desktop sizing is a separate decision. It measures wrapped-link fragments, edge hits and ancestor clipping, distinguishes visible overflow from clipped text, and preserves geometry receipts before desktop assertions. Desktop compares the same real page with the sweep's exact CSS additions applied and removed; stable content and both PNGs are retained. No content is masked. All production CSS changes remain narrow-screen-only.

Files and HTML viewers declare codeStorage and member; issue/PR details declare githubApp. Read-only deployment cases no longer require local sign-in; synthetic unfinished toast questions stay local. Skipped cases write no media manifest. Secrets, conversations and repository settings run on the farm; no storage/egress skip hides their available UI. The secrets form is audited empty: no secret is written or recorded. Conversation coverage uses a real tracked branch.

Red-first new-screen audit: 8 failed / 10 passed across all sizes. Mobile return links, conversation rows and segmented controls were too short. Fixed their CSS, including the segmented group's borders, and the sign-in button that a floating bell covered on New issue. Existing desktop docs have overlapping bells, and populated desktop timeline labels clip vertically. Changing either changes the frozen desktop baseline; Will was asked whether to allow the exception. Neither defect is hidden or relabeled as a missing prerequisite.

Docs cold loads first passed six times. A later failure was traced to the farm's anonymous GitHub quota: direct request HTTP 403, limit 60, remaining 0; reset 2026-10-23T09:31:26Z. ChatApi answered docs with 503 unavailable, while direct reads of the docs site's index and page returned 200. API receipts and quota headers are retained. This is evidence of the farm's upstream limit, not a first-load race or a missing shape. No app retry loop was added and no network failure became a skip.

Latest-main Latitude app suite: 283 files passed, 6 skipped; 3644 tests passed, 2 expected failures, 16 skipped. Only the known unchanged coverage gate failed: lines 99.81%, functions 99.53%, statements 99.69%, branches 99.3%. UI: 2633 passed, 0 failed. Typecheck (four configurations) and importRules passed. Full mini: 109 passed, 24 skipped, 20 failed. Phone/tablet each 37/8/6; desktop 35/8/8. Final conversations/docs follow-up passed all twelve phone/tablet cases and both desktop conversations cases; desktop docs retain four overlapping-bell failures. Combined latest receipts give phone/tablet 43 passed and 8 declared skips each, not a single green full run. Desktop also exposed README clipping in three cases after scrolling controls; retain these for investigation. All 49 desktop paired CSS-baseline PNGs were byte-identical. Full media: 129 converted, zero build failures, three flash-frame check failures. The report retains exact artifact paths and counts.

The external report is ~/smithers-builders/mobile-sweep-REPORT.md, evidence ~/smithers-builders/mobile-sweep-evidence/. Earlier receipts are historical; final status and per-size results belong in the report. BLOCKED: no push and no claim of a fully passing sweep while the desktop baseline defects remain.

2026-10-23 follow-up: Will authorized fixing the eight desktop defects. Rebased cleanly onto bce9128d. Owner codex-mobile-sweep is reproducing each case before CSS changes; desktop tap sizing remains excluded. Validation stays on Latitude and the mini.
