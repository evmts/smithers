---
title: Move hosted deployment configuration into private smithers-infra
status: todo
area: infra
owner: infrastructure owner after first deploy verification
updated: 2026-10-20
links: [infrastructure-as-code.md, land-and-deploy-mvp.md, ../rulings.md]
---

## Current specification — 2026-10-20, 19:56 PDT

**What:** Move hosted deployment specifics into private smithersai/smithers-infra, retaining a generic public Effect Layer.

**Why:** Will’s 18:08 queue answer requires private deployment information.

**Current state:** The lead reports production loads and syncs at revision 7b96f878 as of 19:38. This clears the earlier sync-verification prerequisite, but no private repository creation or configuration-migration receipt is reported. GitHub App setup and later-feature redeploy remain separate.

**Next step:** Have the infrastructure owner create/migrate the private repository and prove public builds use no private files or services.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies, session 6253ecf2, latest approximately two hours through 2026-10-21 02:55 UTC; queue answers through 02:38 UTC; rulings, decisions 0001–0020, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Later rulings supersede older proposals. Builder receipts are reported evidence; tracker verification is the site build. Execution ownership retained; reconciled by Codex tracker curator.

## Earlier tracker history (retained)


**What:** Create private smithersai/smithers-infra and move hosted account/org IDs, domains, secret mappings and plan configuration there; keep the public stack deployable with its own Effect Layer.

**Why:** Will directed that our deployment information stay private at 18:08.

**Current state:** At 18:09 the lead says the repository does not exist yet and plans creation after successful first deploy. The app was reported live at 18:37 with sync verification pending; no repository creation or migration receipt.

**Next step:** Verify deployment, create the private repository, move production-specific configuration without exposing credentials, and prove a public build needs no private files or services.

**Open questions for Will:** None.

Evidence: user-typed text and lead replies extracted by script from session 6253ecf2 for 23:45–01:44 UTC (16:45–18:44 PDT); queue answers through 18:30 PDT; current rulings, decisions, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Latest words and queue answers supersede older plans. Product receipts are reported by the lead; this tracker verifies only the maintainer-site build.
