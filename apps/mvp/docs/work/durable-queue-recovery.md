---
title: Repair durable queue completion and exhausted-retry recovery
status: in-progress
area: sdk
owner: durable-effects builder assigned by lead
updated: 2026-10-21 14:23 PDT
links: [durable-external-effects.md, everything-is-a-durable-flow.md, agent-review-finding-repairs.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 14:23 PDT

**What:** Persist completed queue results and settle callers through engine-owned retries.

**Why:** Result-save failure must never repeat a finished job or strand its parent.

**Current state:** At 14:20 the lead reports all three queue bugs fixed: each item is its own durable execution, failed result persistence does not repeat work, callers settle, and retries belong to the engine. Crash tests across two engine instances pass; the flow suite reports 912/912 at 100% coverage. The fix is queued with durable effects, with no landing receipt yet.

**Next step:** Collect landing and deployment receipts and preserve the crash regressions; do not mark the work done before the queued fix lands.

**Open questions for Will:** None newly identified; existing decisions remain with their owning notes.

Evidence: lead text replies at 14:20–14:23 PDT on 2026-10-21, extracted by script from session 6253ecf2 within its latest approximately two hours (12:23–14:23 PDT). Automated notifications, tool blocks and relayed agent messages excluded. Current rulings and Will’s queue answers take precedence over historical briefs and designs. Product results are lead-reported; this tracker verifies the site build. Engineering ownership is retained; Codex maintains these notes.

## Earlier tracker history (retained)


**What:** Persist completed job results without repeating completed work, and settle callers when recovery cannot succeed.

**Why:** A storage failure must not rerun an external job or strand its parent; DUR-2 forbids a separate recovery retry loop.

**Current state:** At 13:49 the lead reports confirmed flow-engine findings and assigns them to the durable-effects builder. No fix or validation receipt is reported.

**Next step:** Add failure-injected Effect-service regressions for result-save failure, crash recovery and exhausted retries; replace handwritten recovery with engine retries and prove terminal parent settlement.

**Open questions for Will:** None.

Evidence: lead text replies at 13:44–13:53 PDT on 2026-10-21, extracted by script from session 6253ecf2 within its latest approximately two hours. Automated notifications, relayed agent messages and tool content are excluded. Rulings and queue answers take precedence over historical briefs and designs. Results are lead-reported; this tracker verifies the maintainer-site build. Existing implementation ownership is retained.
