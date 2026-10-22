---
title: Prevent implicit stale-workspace recovery from removing edits
status: in-progress
area: sdk
owner: Codex stale-workspace builder assigned by lead
updated: 2026-10-21 21:24 PDT
links: [jj-shared-mutation-lock.md, land-to-main.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 21:24 PDT

**What:** Refuse implicit stale-workspace recovery that can remove uncommitted edits.

**Why:** Routine checks must preserve source changes.

**Current state:** Surviving nodejj-stale-report.md hands off 877e38d8b982, not pushed. Real-jj regression loses precious.txt on old code and preserves it with typed stale_workspace on new code. Report records 431 jj passes/1 existing skip, hygiene 36 and host 11 passes, changed-file coverage 100%, and Astra/Fable review. Full docs wrapper was lock-blocked; direct docs implementation passed.

**Next step:** Land the validated repair, collect final docs/landing receipts, and preserve deliberate recovery guidance.

**Open questions for Will:** None.

Evidence: script-filtered human messages and lead text replies in the latest approximately two hours across both requested transcript paths; continuation path is absent, but continuation-era replies appear in 6253ecf2. Current rulings and queue answers prevail. Surviving briefs/reports used where cited; wiped scratch files are not missing work. Execution ownership retained; Codex curates this note. Product checks are reported receipts, not rerun here.

## Earlier tracker history (retained)


**What:** Remove implicit working-copy rewrites from the jj SDK and its callers; fail with a typed stale-workspace error instead.

**Why:** At 20:58 the lead reports that running lint removed a builder's uncommitted files after stale workspace recovery.

**Current state:** NODEJJ-STALE-BRIEF.md assigns the repair and a real-jj red-to-green regression. No completed report is present. This is separate from the shared lock editor hang.

**Next step:** Audit implicit recovery call sites; preserve an uncommitted file in a real stale/sibling workspace regression, document deliberate recovery, and hand off a validated commit.

**Open questions for Will:** None.

Evidence: script-filtered lead reply at 20:58 PDT and the recovered brief; no raw transcript or credential values retained.
