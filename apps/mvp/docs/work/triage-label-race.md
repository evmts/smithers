---
title: Preserve human labels across automatic-triage races
status: in-progress
area: app
owner: Opus security builder assigned by lead; Codex tracker curates documentation
updated: 2026-10-21 22:53 PDT
links: [issue-triage.md, issues.md, code-reviews.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 22:53 PDT

**What:** Keep human label choices after automatic triage writes.

**Why:** Automatic classification must not overwrite a person’s choices.

**Current state:** At 22:37 the lead reports the triage fix finished and tested: human labels land after the flow’s writes. It is queued with the repository-home and merge fixes under one lander, which must order their dependent migrations. No landing receipt is reported.

**Next step:** Land the ordered migrations and prove both write orders and recovery against the deployed revision.

**Open questions for Will:** None.

Evidence: script-filtered user-typed messages and lead text replies over the latest approximately two hours, through 22:53 PDT, in session 6253ecf2. Both requested paths were checked; the continuation path is unavailable here, while continuation-era replies are present in the original session. Current rulings and queue answers prevail over older decisions and proposals. Surviving briefs inform handoff state; reboot-wiped files are not missing work. Implementation owners are retained; Codex curates documentation. Product checks above are reported receipts, not rerun by this tracker refresh.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 12:28 PDT

**What:** Preserve a person’s labels when automatic triage races with their changes.

**Why:** Automatic classification must not overwrite human choices.

**Current state:** At 12:27 the lead reports triage can overwrite human labels when its write lands first. The new Opus security builder owns the fix; no completion is reported.

**Next step:** Fix ordering and reconciliation in the shared durable label path and retain tests for both write orders.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies, approximately 10:28–12:28 PDT, session 6253ecf2; rulings and queue answers govern over historical briefs, designs, decisions, proposals, TODOs and rules. Product results are lead-reported. Existing engineering ownership is retained; Codex curates tracker documentation and validates the site build.
