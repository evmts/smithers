---
title: Production database capacity and Neon plan
status: in-progress
area: infra
owner: Will chooses plan; production-flows builder measures and validates
updated: 2026-10-21 10:15 PDT
links: [cloudflare-flow-host.md, production-e2e.md, private-hosted-infrastructure.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 10:15 PDT

**What:** Keep production Neon funded and measure database compute after remote-flow recovery.

**Why:** Database suspension would stop every database-backed feature.

**Current state:** Will reports selecting Launch for the organization containing production at 10:13 PDT: $0.106 per compute-unit hour plus storage. ARCH-4 records the decision. The plan choice is resolved; the earlier Free-plan estimates are historical. Endless migration retries and Electric activity still require measurement and repair.

**Next step:** Verify the effective production plan and record compute usage after the migration repair; retain infrastructure details privately.

**Open questions for Will:** None. Will selected Launch; do not ask him to choose again.

Evidence: user-typed messages and lead text replies extracted by script from session 6253ecf2, approximately 08:14–10:14 PDT on 2026-10-21; tool records, automated notifications, local-command output and continuation summaries excluded. Current rulings (ARCH-4, TEST-6, AUTH-4, ARCH-14, PROC-20) and queue answers take precedence over shared briefs, panel designs, decisions, proposals, TODOs and rules. Execution owners are retained; Codex curates tracker documentation only. Product validation is lead-reported; this refresh runs only the site build.

## Earlier tracker history (retained)


**What:** Keep the production database within a funded compute allowance.

**Why:** Exhausting Free compute can suspend every database-backed feature.

**Current state:** At 09:54 PDT the lead reports Neon awake 87% of the time, with Electric and migration retries contributing. At 10:03 the curator reportedly verified Free's 100 compute-hours per month and estimates roughly 182 hours at the observed rate, about $19/month on Launch. These are reported estimates, not a measured steady state after the migration repair. No upgrade is confirmed.

**Next step:** Finish the migration fix, measure database activity and actual plan usage, and apply Will's plan decision in the private infrastructure environment. Retain a capacity receipt without credentials or deployment-specific configuration here.

**Open questions for Will:** None. Answered 10:13 on 2026-10-21 (option 1, Launch), Will: "Neon shows Launch at $0.106 per compute-unit hour plus storage, and I've selected it for the organization containing production." (rulings.md, ARCH-4 addendum).

Evidence: script-filtered lead replies at 09:54, 10:02 and 10:03 PDT on 2026-10-21; current rulings and queue answers reviewed. This is a new workstream, not an authorization to upgrade. Codex owns tracker curation only.
