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
