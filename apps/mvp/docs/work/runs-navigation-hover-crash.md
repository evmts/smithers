---
title: Fix the Runs navigation hover crash
status: in-progress
area: app
owner: Codex Sol crash diagnostics and test rewrite owner
updated: 2026-10-21 16:53 PDT
links: [production-e2e.md, flow-usage-metrics.md, flow-debugging.md, ../decisions/0020-one-loading-pattern.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 16:53 PDT

**What:** Keep Runs navigation responsive and capture evidence for any renderer crash.

**Why:** Navigation must remain usable while lists load.

**Current state:** At 16:53 the production-e2e builder reports Runs hover now preloads the run list to fix the slow frame. This is one of five completed fixes queued to land and requires a deploy before production verification. Earlier intermittent renderer-crash evidence remains historical; preloading alone does not prove its cause or resolution.

**Next step:** Land and deploy the preload fix; rerun hover/focus/open navigation and retain crash diagnostics if the intermittent failure recurs.

**Open questions for Will:** None newly identified; earlier unresolved items remain in the retained history.

Evidence: lead text replies, script-filtered from session 6253ecf2 for 14:53–16:53 PDT; tool content, automated messages, relayed agent reports and compaction summaries excluded. Rulings and queue answers take precedence over historical briefs and plans. Implementation owners and statuses retained; Codex curates this update. Product checks are lead-reported.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 14:54 PDT

**What:** Diagnose the production renderer crash while navigating to Runs.

**Why:** Navigation must remain usable.

**Current state:** At 14:53 Codex Sol takes crash diagnostics and test rewrites. The panel has one production crash and a passing rerun; the hover operation alone is not a proven product trigger.

**Next step:** Retain browser crash records and repeat production navigation; implement a product fix if reproduced.

**Open questions for Will:** None for this repair. Existing pending decisions remain in the retained history.

Evidence: script-extracted user-typed text and lead replies from session 6253ecf2, 12:54–14:54 PDT; automated notifications excluded. Rulings and queue answers govern over historical briefs and proposals. Product receipts are lead-reported; this pass verifies only the maintainer-site build. Implementation owners remain assigned; Codex maintains tracker documentation.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 14:05 PDT

**What:** Prevent Runs navigation hover from crashing the app.

**Why:** Navigation must keep chat and unrelated actions usable.

**Current state:** At 14:01 PDT Runs hover is explicitly assigned to the live-attention panel. Its six confirmed findings are held for the panel builder at 14:03; no repair or passing regression is reported.

**Next step:** Repair through the panel builder and prove hover, keyboard focus and opening Runs locally and live.

**Open questions for Will:** None.

Evidence: user-typed text and lead text replies extracted by script from session 6253ecf2 for approximately 12:04–14:04 PDT on 2026-10-21; synthetic notifications and tool records excluded. Rulings and queue answers override historical briefs, designs, decisions, proposals, TODOs and rules. Product receipts are lead-reported; this tracker validates the maintainer-site build only. Engineering owners remain responsible; Codex owns this documentation reconciliation.

## Earlier tracker history (retained)


**What:** Keep hovering Runs in navigation from crashing the app.

**Why:** Navigation preloading must leave chat and unrelated actions usable.

**Current state:** At 13:15 PDT the lead lists a Runs hover crash among production product failures. The harness rerun must confirm its exact trigger. No dedicated repair or passing regression is reported; the restarted production E2E builder owns the rerun, not yet this product fix.

**Next step:** Preserve the hover failure, confirm it with the repaired harness, assign the panel/build repair, and prove hover, keyboard focus and opening Runs locally and live.

**Open questions for Will:** None.

Evidence: lead text replies extracted by script from session 6253ecf2, 11:37–13:37 PDT on 2026-10-21. Automated notifications and tool records excluded. Rulings and queue answers override historical briefs, panel designs, decisions, proposals, TODOs and rules. Product results are lead-reported. Existing execution owners retained; Codex owns tracker reconciliation only.
