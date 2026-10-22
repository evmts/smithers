---
title: Prevent a base-branch race during pull-request merge
status: in-progress
area: app
owner: Opus security builder assigned by lead; Codex tracker curates documentation
updated: 2026-10-21 12:28 PDT
links: [pr-review-and-merge.md, durable-external-effects.md, code-reviews.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 12:28 PDT

**What:** Fence PR merge against changes to the checked base branch.

**Why:** A person must never merge onto a base that the checks did not cover.

**Current state:** At 12:27 the lead reports a confirmed check-to-merge race and assigns a new Opus builder shared with the label and repository-role repairs. No repair receipt exists.

**Next step:** Use the shared durable merge path to validate exact base/head authority and reject or recheck changed bases; retain a race regression.

**Open questions for Will:** None; people still approve and merge.

Evidence: script-filtered user-typed text and lead replies, approximately 10:28–12:28 PDT, session 6253ecf2; rulings and queue answers govern over historical briefs, designs, decisions, proposals, TODOs and rules. Product results are lead-reported. Existing engineering ownership is retained; Codex curates tracker documentation and validates the site build.
