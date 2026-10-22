---
title: Verify agent step keys and older-run replay
status: in-progress
area: sdk
owner: Plan-core builder assigned by lead; Codex tracker owns note
updated: 2026-10-21 23:35 PDT
links: [planner-core-replay-ordering.md, main-reds-burn-down.md, plan-identity-across-deploys.md]
---

## Tracker reconciliation — 2026-10-21 23:35 PDT

**What:** Update agent key expectations and prove replay of recorded older keys.

**Why:** An intentional encoding change must preserve existing durable runs.

**Current state:** At 23:31 the lead reports three failing agent tests after plan-core landed. The builder must deliberately update sealed model-step and cell-call expected keys and add older-key replay proof. The lander now includes the agent suite in its gate. No repair receipt exists.

**Next step:** Add the compatibility regression, update expectations deliberately, pass the agent suite and land the fix.

**Open questions for Will:** None.

Evidence: script-filtered recent human text and lead replies in session 6253ecf2; surviving briefs/reports, rulings, queue answers and decision 0021. The continuation filename was not found; continuation-era replies survive in the original transcript. Reboot-wiped files are not missing work. Product receipts are reported evidence; tracker validation is the site build.
