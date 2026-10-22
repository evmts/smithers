---
title: Survey Pierre packages and adopt proven improvements
status: in-progress
area: app
owner: Opus Pierre survey builder assigned by lead; Codex curates tracker
updated: 2026-10-21 21:16 PDT
links: [ code-intelligence.md, repo-view-package-split.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 21:16 PDT

**What:** Adopt Highlights with VibeLang support and validated code views.

**Why:** Reuse the chosen highlighting library without losing language support.

**Current state:** At 21:06 Will approves Highlights after the lexer and permits a fork if upstream declines it. At 21:07 the lead starts an Opus builder on the mini to implement the lexer, switch code views/review diffs, benchmark and check both themes, and remove Shiki. No implementation-completion receipt is reported.

**Next step:** Validate the lexer and visual/performance behavior, land the migration and retain the minimal fork if needed. Drafting an upstream PR is separate from opening it.

**Open questions for Will:** None; the adoption decision is answered.

Evidence: script-filtered human messages and lead text replies, 19:15–21:15 PDT in session 6253ecf2; current rulings, queue answers and surviving briefs/reports. The supplied continuation file was not found; continuation-era lead replies are present in 6253ecf2. Product receipts are reported evidence, not rerun here. Existing execution ownership retained; Codex curates documentation. Reboot-wiped scratch files are not missing work.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 14:35 PDT

**What:** Survey Pierre packages and adopt proven code-view improvements.

**Why:** Reuse existing libraries while asking Will about visible changes.

**Current state:** At 14:28 the survey covers 26 npm packages and 7 repositories. The lead reports diffs 1.3.6 → 1.5.2, Pierre worker handling replacing custom code (192 → 156 lines), and 100% tests. Version 1.6 breaks default review themes; 1.6.1 is eligible after 18:05 UTC October 22. Highlights is a recommendation, not adopted; lead reports 67 ms versus 1,980 ms on a 98-file patch, changed TypeScript colors and no VibeLang highlighting. These are reported measurements, not a new benchmark by this tracker.

**Next step:** Collect landing receipts and record the survey in its proposal (not present in this checkout at refresh). Obtain Will’s Highlights decision before an appearance-changing switch; supply comparison screenshots and VibeLang lexer evidence.

**Open questions for Will:** Queue priority 880: adopt Highlights after a VibeLang lexer and visual comparison? Lead confidence 70%; no answer in answers.jsonl.

Evidence: script-filtered user-typed text and lead replies, approximately 12:34–14:34 PDT on 2026-10-21, session 6253ecf2. Automated notifications, tool records and generated summaries excluded. Current rulings and queue answers prevail over historical briefs/designs and planning docs. Product receipts are lead-reported; this pass verifies the maintainer-site build only. Existing engineering ownership retained.

## Earlier tracker history (retained)


**What:** Survey Pierre’s open-source packages and highlighting work against the shared UI and code viewer.

**Why:** Reuse proven improvements where they benefit the existing product.

**Current state:** At 13:15 PDT the lead reports an Opus agent reading the highlighting post and surveying Pierre packages. It will record evidence and adopt/upgrade/borrow/skip verdicts in the proposal. Clear wins include upgrades of packages already used and replacements rated at least 80%; uncertain or appearance-changing choices go to Will. No implementation or validation receipt is reported.

**Next step:** Finish the survey and proposal, implement clear wins through the existing libraries and validate the affected views. Keep uncertain recommendations for Will.

**Open questions for Will:** None yet; pending recommendations must identify the actual choice and evidence.

Evidence: lead text reply at 2026-10-21 13:15 PDT, extracted by script from session 6253ecf2. Rulings and queue answers govern over proposals. Existing implementation owner retained; tracker runs only the site build.
