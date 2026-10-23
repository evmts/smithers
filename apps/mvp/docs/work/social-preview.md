---
title: Social preview image
status: blocked
area: hosting
owner: codex-mvp-og
updated: 2026-10-23
links: []
---
Serve origin-aware social metadata and a minimal Smithers card through the existing site Worker.


Implemented origin-aware Open Graph and X metadata, the 1200×630 card, editable
SVG, and render script. Core hosting infrastructure; library catalog UI entry:
@smthrs/ui, with the existing public logo reused directly.

Latitude receipts: pre-fix real-Worker requests fail on missing og:title;
focused tests pass 21/21 with worker/index.ts at 100% statements, branches,
functions and lines. App typecheck and //apps/mvp:importRules pass.
Full suite: 290 files passed, 6 skipped; 3721 tests passed, 2 expected failures,
16 skipped. Coverage fails the unchanged 100% gate: statements 99.69%, branches
99.30%, functions 99.53%, lines 99.81%. Changed Worker remains 100% on all four.
The uncovered files are outside this change (including device/home-history,
agent/memory, stack and flow handlers). Landing rendering is unchanged.
Blocked on the full app coverage gate; do not claim this handoff is fully green.
