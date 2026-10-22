---
title: Isolate repository-home roles across repository navigation
status: in-progress
area: app
owner: Opus security builder assigned by lead; Codex tracker curates documentation
updated: 2026-10-21 22:53 PDT
links: [repository-home-role-switching.md, repository-declared-home.md, roles-and-labels.md, code-reviews.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 22:53 PDT

**What:** Scope repository-home authority to the repository being viewed.

**Why:** A role from one repository must never grant authority on another.

**Current state:** At 22:37 the lead reports the home-role fix finished and tested: a role read on one repository no longer counts on another. It is routed with the GitHub write fixes to one lander because the stack depends on earlier review-lane work. Landing and production acceptance are not yet reported.

**Next step:** Land the ordered stack and verify cross-repository navigation and denied access on the deployed revision.

**Open questions for Will:** None.

Evidence: script-filtered user-typed messages and lead text replies over the latest approximately two hours, through 22:53 PDT, in session 6253ecf2. Both requested paths were checked; the continuation path is unavailable here, while continuation-era replies are present in the original session. Current rulings and queue answers prevail over older decisions and proposals. Surviving briefs inform handoff state; reboot-wiped files are not missing work. Implementation owners are retained; Codex curates documentation. Product checks above are reported receipts, not rerun by this tracker refresh.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 12:28 PDT

**What:** Scope repository-home authority to the repository being viewed.

**Why:** A role from one repository must not grant access in another.

**Current state:** At 12:27 the lead reports a confirmed cross-repository role leak and assigns the same new Opus security builder. This is distinct from the planned switch-down UI. No fix is reported.

**Next step:** Repair repository-scoped role resolution and invalidate stale authority on navigation; retain cross-repository and denied-access regressions.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies, approximately 10:28–12:28 PDT, session 6253ecf2; rulings and queue answers govern over historical briefs, designs, decisions, proposals, TODOs and rules. Product results are lead-reported. Existing engineering ownership is retained; Codex curates tracker documentation and validates the site build.
