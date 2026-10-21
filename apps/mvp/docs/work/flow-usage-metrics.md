---
title: Flow usage metrics and Grafana dashboard
status: in-progress
area: sdk
owner: flow metrics builder assigned by lead
updated: 2026-10-21 01:54 PDT
links: [observability.md, self-hosted-grafana.md, flow-debugging.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 01:54 PDT

**What:** Measure flows and expose expandable run details.

**Why:** Make Smithers runs inspectable.

**Current state:** Flow metrics landed in c6940ac5 (lead 01:49). Earlier reported e2e/GIF proves per-run metrics, Grafana dashboard and flow totals. The requested GitHub-Actions-style Smithers run list and expandable steps remain after-deploy work.

**Next step:** Verify production metrics and build the requested flow/status/branch/trigger/duration rows and expandable details.

**Open questions for Will:** None.

Evidence: script-filtered user-typed messages and lead text replies, session 6253ecf2, 23:53–01:53 PDT; current rulings and queue answers through 01:19 PDT; shared briefs and designs, decisions, proposals, TODOs and rules. Completion and test receipts are reported evidence; this tracker validates only the site build. Execution ownership retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 00:24 PDT

**What:** Measure flow usage and show expandable run details.

**Why:** Will wants familiar run navigation and inspectable steps.

**Current state:** At 00:16 the lead reports per-run metrics, Grafana dashboard and Runs totals complete and with the lander, with passing e2e/GIF and a browser-run-start visibility regression fixed. The requested GitHub-Actions-style list and expandable rows remain after-deploy work, so the full workstream stays open.

**Next step:** Land metrics; after deploy add flow, status, branch, trigger, duration and expandable steps/details for Smithers runs.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies from session 6253ecf2, latest two hours through 00:23 PDT; queue answers through 00:17 PDT; rulings, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules. Product receipts are reported evidence, not new tracker-run tests. Execution owners retained; documentation reconciled by Codex tracker curator.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 00:06 PDT

**What:** Show per-flow counts and expandable run details.

**Why:** Will wants Smithers runs presented with the familiarity of GitHub Actions.

**Current state:** The 23:55 lead update reports the flow-usage e2e passing. Will’s 23:59 queue answer requests expandable details; the lead assigns this for after deployment. The requested UI is not implemented.

**Next step:** After deployment, show flow, status, branch, trigger and duration, with expandable run steps/details. Retain metrics privacy and dashboard-ingestion proof; no GitHub Actions support is added.

**Open questions for Will:** None.

Evidence: script-filtered human text and lead replies from the last two session hours, through 00:05 PDT; queue answers through 00:05:48 PDT; current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Product checks are reported receipts, not checks executed by this tracker. Existing execution owners and history retained; Codex curates documentation only.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 21:43 PDT

**What:** Measure flow runs and outcomes through SDK instrumentation, with per-flow totals and a Grafana dashboard.

**Why:** Will wants to see which flows run and how they are used, without user content in diagnostics.

**Current state:** At 21:34 PDT the lead reports the first flow-usage browser recording failed. It shows a slash-command run counted by flow and per-flow totals on Runs. The curator holds priority 780 until it passes; no successful dashboard ingestion or complete feature receipt is established.

**Next step:** Fix the failing recording journey, prove counts through the real engine and Runs page, and retain telemetry-ingestion/dashboard receipts with privacy assertions.

**Open questions for Will:** None.

Evidence: lead text replies and human-typed messages extracted by script from session 6253ecf2 for 19:43–21:43 PDT; synthetic notifications and compaction summaries excluded. Rulings and queue answers through 19:38 PDT take precedence over older briefs, designs, decisions, proposals, TODOs and rules. Product results are reported receipts; this tracker validates the site build. Execution ownership is retained; reconciliation by Codex tracker curator.

## Earlier tracker history (retained)


**What:** Emit engine-level run counts, outcomes, duration, steps, retries, waits and model tokens, split by flow, entry point, execution host and safe actor category. Provide a Grafana dashboard for volume, success, p50/p95 duration, failures and tokens.

**Why:** At 18:26 Will said usage metrics should explain what flows run and how.

**Current state:** The lead assigned engine-emitted metrics and a self-hosted Grafana dashboard at 18:26. No implementation or dashboard receipt exists. The Runs-page compact summary is conditional, not a promised feature.

**Next step:** Instrument the engine through SDK services so every flow is covered; test outcome/entry-point/host combinations and privacy, prove telemetry ingestion, and build the dashboard. Record no payload, user content or personal identifiers.

**Open questions for Will:** None.

Evidence: script-filtered last two hours of session 6253ecf2 through 18:32 PDT; queue answers through 18:30 PDT; current rulings, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules. Queue answers supersede older open questions. Product receipts are reported evidence; this tracker validates only the site build.
