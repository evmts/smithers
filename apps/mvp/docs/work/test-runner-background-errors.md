---
title: Two-tab background errors and intermittent proxy test
status: in-progress
area: sdk
owner: test failure investigation agent assigned by lead
updated: 2026-10-20
links: [repo-checks-green.md, sdk-test-reds.md, land-to-main.md, local-first.md, model-endpoint.md]
---

## Current specification — 2026-10-20, 18:04 PDT

**What:** Fix unhandled two-tab background errors and an intermittent proxy-test failure.

**Why:** Passing test assertions do not make a runner failure a passing suite.

**Current state:** At 18:02:31 PDT the lead reported all app assertions passing at 100% coverage, but unhandled background errors make two-tab runs exit with failure. A proxy test fails about once in seven runs. Investigation is assigned; no cause or fix is reported.

**Next step:** Capture the real background failures, fix their sources, retain regressions and prove clean runner exits. Diagnose the proxy failure without treating reruns as a fix. Report assertion results separately from process exits.

**Open questions for Will:** None.

Evidence: lead text replies extracted by script from the latest two transcript hours through 2026-10-21 01:03:57 UTC; queue rulings through 00:42:06 UTC; current rulings and decision 0017 override historical panel proposals. Product checks and landing receipts are reported evidence; this tracker runs the maintainer-site build only.
