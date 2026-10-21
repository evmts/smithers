---
title: Rotate exposed Code Storage API key
status: blocked
area: infra
owner: Will rotates key; lead verifies configuration safely
updated: 2026-10-20
links: [land-and-deploy-mvp.md, observability.md, secrets-proxy.md, ../rulings.md]
---

## Current specification — 2026-10-20, 19:07 PDT

**What:** Rotate the Code Storage credential exposed in local diagnostic output.

**Why:** OBS-5 forbids credential values in diagnostics.

**Current state:** The 18:02 disclosure remains unresolved. At 19:06 the lead explicitly says CODE_STORAGE_API_KEY is still to rotate, alongside the newly reported shell-configuration exposures tracked separately. No rotation receipt is present.

**Next step:** Rotate and update the active secret reference, then prove service access without printing values. Follow exposed-credentials-rotation.md for the wider incident.

**Open questions for Will:** Rotate the Code Storage API key; completion is not yet reported.

Evidence: session 6253ecf2 user text and assistant replies extracted by script for the latest approximately two hours, through 2026-10-21 02:07 UTC; queue answers through 01:57 UTC; current rulings and shared briefs. Latest answers supersede older proposals. Receipts below are lead-reported; this tracker verifies only the maintainer-site build. Execution owners are retained; reconciliation by Codex.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 18:04 PDT

**What:** Rotate the Code Storage credential exposed in local session output.

**Why:** OBS-5 forbids secret values in diagnostic output.

**Current state:** At 18:02:31 PDT the lead reported the Code Storage API key value was printed while checking configuration. The lead says it entered no file or commit and asked Will to rotate it. No rotation receipt is present. No credential value is retained here.

**Next step:** Will rotates the key; the owner updates the active configuration through its secret store and verifies service access without printing values. Check credential presence as a boolean in future diagnostics.

**Open questions for Will:** Please rotate the exposed Code Storage API key; completion is not yet reported.

Evidence: lead text replies extracted by script from the latest two transcript hours through 2026-10-21 01:03:57 UTC; queue rulings through 00:42:06 UTC; current rulings and decision 0017 override historical panel proposals. Product checks and landing receipts are reported evidence; this tracker runs the maintainer-site build only.
