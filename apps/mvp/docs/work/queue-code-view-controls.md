---
title: Code review comment hiding, folding and outline
status: in-progress
area: process
owner: Claude code-view builder assigned by lead
updated: 2026-10-21 00:06 PDT
links: [will-decision-queue.md, code-review-guides.md, code-reviews.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 00:06 PDT

**What:** Provide comment hiding, body folding and a symbol outline.

**Why:** Will requested readable code controls and reports a live regression.

**Current state:** At 00:01 Will reports nonworking buttons and lost scrolling. At 00:05 he confirms scrolling is restored but Collapse all and other controls still do nothing. The lead has assigned an immediate fix; no browser proof of working controls exists.

**Next step:** Make every button and keyboard action work, prove them in the live queue with real browser checks, then return a verify item. Preserve scrolling and original line numbers.

**Open questions for Will:** None.

Evidence: script-filtered human text and lead replies from the last two session hours, through 00:05 PDT; queue answers through 00:05:48 PDT; current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Product checks are reported receipts, not checks executed by this tracker. Existing execution owners and history retained; Codex curates documentation only.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-20 23:55 PDT

**What:** Add comment hiding, collapsible bodies and an outline to the maintainer queue’s code viewer.

**Why:** Will requested VS Code-style controls while approving the first guided ModelStep code slice.

**Current state:** Will’s 23:47 queue answer requests all three. The lead reports a Claude builder implementing them: c hides comments without renumbering source lines; gutter chevrons fold bodies; z/Z fold/unfold all; o opens a filterable symbol outline. Positions come from TypeScript’s parser. At 23:50 the request is assigned, not fixed.

**Next step:** Finish and verify all controls on every code slice, including keyboard navigation and source line fidelity; return a verify item when the implementation lands.

**Open questions for Will:** None.

Evidence: last two session hours of user-typed text and lead replies extracted with a JSONL script (notifications and tool content excluded), through 23:54 PDT; queue answers through 23:51; current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Product receipts are lead-reported; tracker validation is the maintainer-site build. Prior history and execution ownership retained.
