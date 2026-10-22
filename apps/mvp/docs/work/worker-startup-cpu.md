---
title: Keep API Worker startup below the deployment CPU limit
status: done
area: infra
owner: remote-flows builder assigned by lead
updated: 2026-10-21 12:46 PDT
links: [cloudflare-flow-host.md, land-and-deploy-mvp.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 12:46 PDT

**What:** Reduce API Worker startup cost and gate regressions.

**Why:** Startup CPU made deployments fail intermittently.

**Current state:** The lead reports b1bab88a landed at 12:28 and deployed on the first attempt at 12:35. Production startup measured 64–76 ms, compared with 416–735 ms before the fix; the regression gate rejects startup above 200 ms. No TODO runs were active before deployment. This work has a deployment and measurement receipt; longer remote-flow suites remain separate.

**Next step:** Retain the startup gate and deployment measurements; follow production feature suites in their owning notes.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies, approximately 10:44–12:44 PDT on 2026-10-21, session 6253ecf2; synthetic notifications, relayed agents and tool blocks excluded. Rulings and queue answers govern over shared briefs/designs and historical decisions, proposals, TODOs and rules. Product receipts are lead-reported; Codex curates documentation and validates the site build. Existing execution ownership is retained.

## Earlier tracker history (retained)

## Tracker reconciliation — 2026-10-21 12:28 PDT

**What:** Reduce API Worker startup cost and gate regressions.

**Why:** Startup CPU made deployments fail intermittently.

**Current state:** At 12:09 the lead reports startup reduced from 416–735 ms to about 100 ms, with a test rejecting startup above 200 ms. The repair is queued to land, not confirmed deployed.

**Next step:** Land the repair and retain build/startup measurements plus a successful production deploy.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies, approximately 10:28–12:28 PDT, session 6253ecf2; rulings and queue answers govern over historical briefs, designs, decisions, proposals, TODOs and rules. Product results are lead-reported. Existing engineering ownership is retained; Codex curates tracker documentation and validates the site build.

## Earlier tracker history (retained)


**What:** Move expensive module work out of API Worker startup.

**Why:** Production deployments must succeed reliably.

**Current state:** The lead reports at 11:50 that the first deployment attempt failed near Cloudflare’s startup CPU limit and a retry passed. The remote-flows builder is changing module startup and adding a regression gate. Production fixes are live, but startup stability is not established.

**Next step:** Finish and land the startup repair; retain a regression that fails on excessive startup CPU and verify the production build/deployment.

**Open questions for Will:** None.

History: Added by Codex tracker from script-filtered lead replies through 11:54 PDT in session 6253ecf2. Current rulings and queue answers govern. Implementation ownership is recorded above; Codex owns documentation curation. Product results are reported evidence, not tests run by this tracker.
