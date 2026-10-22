---
title: Enforce the agent eval token limit through the final trial
status: in-progress
area: app
owner: Codex tracker (note); production E2E builder assigned by lead (implementation)
updated: 2026-10-21 13:44 PDT
links: [agent-evals.md, agent-eval-regressions.md, production-e2e.md, agent-review-finding-repairs.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 13:44 PDT

**What:** Enforce eval token limits through the final trial.

**Why:** An eval must fail when it spends beyond its stated cap.

**Current state:** At 13:43 PDT the production E2E builder reports the eval spend-cap fix as one of three commits going to the lander. No landed revision or post-landing validation receipt is reported.

**Next step:** Land the fix with boundary/final-trial regression evidence and verify the real eval budget behavior.

**Open questions for Will:** None.

Evidence: script-filtered user-typed messages and lead text replies from session 6253ecf2, approximately 11:44–13:44 PDT; automated notifications and tool content excluded. Rulings and queue answers govern over historical briefs, panel designs, decisions, proposals, TODOs and rules. Product receipts are lead-reported; this pass validates the site build only. Existing execution owners retained; Codex curates tracker documentation.

## Earlier tracker history (retained)


**What:** Make evals fail when they exceed their stated token allowance, including the final trial.

**Why:** An eval’s spend limit must actually constrain its run.

**Current state:** At 13:20 PDT the lead reports a confirmed review finding: an eval can exceed its token limit, even on its final trial, without failing. The production E2E builder, which already owns the spend guard, is assigned. No fix, landing or passing regression receipt is reported.

**Next step:** Add a regression that fails on the old behavior, enforce accounting at the final trial and earlier boundaries, and retain validation and landing evidence.

**Open questions for Will:** None.

Evidence: script-filtered lead reply at 2026-10-21 20:20:19 UTC in session 6253ecf2. Current rulings and queue answers govern; this is a new budget-enforcement repair, separate from the completed behavior baseline.
