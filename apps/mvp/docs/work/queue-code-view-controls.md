---
title: Code review comment hiding, folding and outline
status: done
area: process
owner: Claude code-view builder assigned by lead
updated: 2026-10-21 00:24 PDT
links: [will-decision-queue.md, code-review-guides.md, code-reviews.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 00:24 PDT

**What:** Keep scrolling, comment hiding, folding and symbol navigation usable.

**Why:** Code reviews must be readable before reaching Will.

**Current state:** At 00:13 the lead reports every control tested on three real code slices. At 00:16 and 00:18 it closes the code-view check on tests; Will’s 00:15 queue answer explicitly says to add tests rather than ask him whether it works. Files await the combined landing.

**Next step:** Retain browser regression evidence and include the tested files in the landing; return only product-quality decisions for review.

**Open questions for Will:** None; functional verification belongs to tests.

Evidence: script-filtered user-typed text and lead replies from session 6253ecf2, latest two hours through 00:23 PDT; queue answers through 00:17 PDT; rulings, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules. Product receipts are reported evidence, not new tracker-run tests. Execution owners retained; documentation reconciled by Codex tracker curator.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 00:14 PDT

**What:** Hide comments, fold bodies and navigate symbols while retaining source line numbers.

**Why:** Will reported broken controls and lost scrolling in the live queue.

**Current state:** At 00:13 the lead reports every key and button proven in a real browser on three code slices. Scrolling is restored; outline serving and stale failure caching are fixed. Keys are c, z/Z and capital O (lowercase o opens referenced files). File:line links reveal folded or hidden lines. The changes join the combined landing and return for Will to verify; no landing receipt yet.

**Next step:** Retain the browser proof, land the fix and return the verify item.

**Open questions for Will:** None; verification follows the fix.

Evidence: script-filtered user text and lead replies through 00:13 PDT; queue answers through 00:10 PDT, current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Product checks are reported receipts; tracker validation is the site build. Execution ownership retained; Codex curates documentation only.

## Earlier tracker history (retained)


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
