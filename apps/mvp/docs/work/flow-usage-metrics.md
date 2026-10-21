---
title: Flow usage metrics and Grafana dashboard
status: in-progress
area: sdk
owner: flow metrics builder assigned by lead
updated: 2026-10-20
links: [observability.md, self-hosted-grafana.md, flow-debugging.md, ../rulings.md]
---

**What:** Emit engine-level run counts, outcomes, duration, steps, retries, waits and model tokens, split by flow, entry point, execution host and safe actor category. Provide a Grafana dashboard for volume, success, p50/p95 duration, failures and tokens.

**Why:** At 18:26 Will said usage metrics should explain what flows run and how.

**Current state:** The lead assigned engine-emitted metrics and a self-hosted Grafana dashboard at 18:26. No implementation or dashboard receipt exists. The Runs-page compact summary is conditional, not a promised feature.

**Next step:** Instrument the engine through SDK services so every flow is covered; test outcome/entry-point/host combinations and privacy, prove telemetry ingestion, and build the dashboard. Record no payload, user content or personal identifiers.

**Open questions for Will:** None.

Evidence: script-filtered last two hours of session 6253ecf2 through 18:32 PDT; queue answers through 18:30 PDT; current rulings, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules. Queue answers supersede older open questions. Product receipts are reported evidence; this tracker validates only the site build.
