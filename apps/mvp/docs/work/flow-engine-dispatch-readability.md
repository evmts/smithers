---
title: FlowEngine Dispatch readability
status: todo
area: sdk
owner: lead assigns execution; Codex tracker curator maintains evidence
updated: 2026-10-21 00:06 PDT
links: [flows-as-code-api.md, code-review-guides.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 00:06 PDT

**What:** Simplify FlowEngine Dispatch code for review.

**Why:** Will’s 00:05:23 queue answer says it is complex and hard to read before review.

**Current state:** The queue requests readability changes to packages/smithers/flows/engine/src/FlowEngine/Dispatch.ts at reviewed revision 5a75c229. No assignment, fix or passing checks are established by the extracted lead replies.

**Next step:** Lead assigns a focused readability refactor preserving durable dispatch behavior, cancellation, fencing and recovery; run the engine’s behavioral checks and refresh the review guide.

**Open questions for Will:** None.

Evidence: script-filtered human text and lead replies from the last two session hours, through 00:05 PDT; queue answers through 00:05:48 PDT; current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Product checks are reported receipts, not checks executed by this tracker. Existing execution owners and history retained; Codex curates documentation only.
