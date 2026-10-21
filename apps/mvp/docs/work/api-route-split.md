---
title: Split the API routes for readability
status: todo
area: app
owner: lead assigns after deploy
updated: 2026-10-21 00:24 PDT
links: [server-hardening.md, code-readability-burn-down.md, ../rulings.md]
---

**What:** Split the API route implementation into focused modules.

**Why:** Reduce complexity while preserving the current public behavior.

**Current state:** The 00:17 overnight plan explicitly includes the API route split after deployment. No implementation scope, builder handoff or passing receipt is reported.

**Next step:** Inspect the current route composition and existing module boundaries, choose a minimal behavior-preserving split, and retain route/auth regression coverage.

**Open questions for Will:** None; exact module boundaries are implementation choices.

Evidence: script-filtered user-typed text and lead replies from session 6253ecf2, latest two hours through 00:23 PDT; queue answers through 00:17 PDT; rulings, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules. Product receipts are reported evidence, not new tracker-run tests. Execution owners retained; documentation reconciled by Codex tracker curator.
