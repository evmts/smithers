---
title: Restore agent-authorized docs synchronization
status: in-progress
area: sdk
owner: Codex tracker curator; execution assigned by lead
updated: 2026-10-20
links: [docs-check-flow-outcome.md, agent-run-credentials.md, agent-eval-regressions.md, ../rulings.md]
---

## Current specification — 2026-10-20, 19:34 PDT

**What:** Restore agents’ ability to launch docs sync without weakening person-only actions.

**Why:** Docs synchronization must remain available to authorized development flows.

**Current state:** At 19:29 the lead reports docs sync now waits for a person’s approval and an agent is restoring it. This is a new authorization regression, separate from the earlier completed docs-check outcome-reading fix. No passing receipt yet.

**Next step:** Find the authorization classification causing the regression, use the shared registry policy, and retain tests proving docs sync works while genuinely person-only actions remain refused.

**Open questions for Will:** None.

Evidence: script-extracted user-typed messages and lead text replies from session 6253ecf2, 2026-10-21 00:34–02:34 UTC (17:34–19:34 PDT); queue answers through 02:33:47 UTC; current rulings, decisions, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Latest Will text and queue answers prevail. Product receipts are reported, not rerun by this tracker. Existing execution owners are retained.
