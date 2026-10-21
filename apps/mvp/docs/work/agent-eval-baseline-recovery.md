---
title: Recover the live agent eval baseline
status: todo
area: app
owner: unassigned; lead schedules after deployment
updated: 2026-10-21 01:14 PDT
links: [agent-evals.md, agent-eval-regressions.md, agent-jev.md, ../rulings.md]
---

**What:** Restore a reproducible full live-model eval run and record its current baseline.

**Why:** The earlier green baseline cannot prove the current shared tree while cases stall.

**Current state:** At 00:14 the lead reports three unrelated eval cases stalling and preventing the Jev baseline re-record. Jev itself passed 4/4 e2e runs and 7/7 eval trials. This is a new regression investigation; the earlier five behavior fixes remain historical completed work.

**Next step:** After deployment, identify the three cases, retain stall diagnostics, fix their causes with regression coverage and re-record the complete real-model baseline with cost and outcome receipts.

**Open questions for Will:** None; diagnosis belongs to the implementing agent.

Evidence: script-filtered user text and lead replies, session 6253ecf2, 23:14–01:14 PDT; rulings, queue answers, decisions, proposals, TODOs, rules and shared briefs/designs. Product receipts are lead-reported; tracker validation is the maintainer-site build. Prior history and execution owners retained.
