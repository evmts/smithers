---
title: Confirmation for protected agent actions
status: todo
area: app
owner: unassigned; follow-up to run-credentials builder
updated: 2026-10-21 01:14 PDT
links: [agent-run-credentials.md, roles-and-labels.md, ../decisions/0008-auth.md, ../rulings.md]
---

**What:** Provide the person-facing confirmation dialog for protected actions using the public plugin and durable approval interfaces.

**Why:** Agent credentials must never stand in for a person approving an action.

**Current state:** At 00:25 the lead reports the run-credential boundary proven end to end, but explicitly logs the protected-action confirmation dialog as the unfinished other half. No dialog completion or passing UI receipt is reported.

**Next step:** Follow the existing approval policy and shared UI; connect the dialog to the durable human approval step and prove refusal, cancellation and recovery as well as an actual person confirming. Preserve server-side checks.

**Open questions for Will:** None now; existing human-only approval rulings apply. Queue any unresolved product choice with a confidence score.

Evidence: script-filtered user text and lead replies, session 6253ecf2, 23:14–01:14 PDT; rulings, queue answers, decisions, proposals, TODOs, rules and shared briefs/designs. Product receipts are lead-reported; tracker validation is the maintainer-site build. Prior history and execution owners retained.
