---
title: Two-tab background errors and intermittent proxy test
status: in-progress
area: sdk
owner: test failure investigation agent assigned by lead
updated: 2026-10-20
links: [repo-checks-green.md, sdk-test-reds.md, land-to-main.md, local-first.md, model-endpoint.md]
---

## Current specification — 2026-10-20, 20:24 PDT

**What:** Eliminate two-tab background failures, proxy flakiness and misclassified engine refusals.

**Why:** A passing assertion count must also produce a clean runner exit and preserve refusal semantics.

**Current state:** At 20:16 PDT the lead reports fixes for TanStack hydration through whole transactions, a model-proxy test passing 200 consecutive runs, and engine refusals carrying their refusal code. The upstream report remains a draft. Three other intermittent failures remain with the same investigator; two consecutive full green runs are still required.

**Next step:** Retain regression tests for each discovered bug, fix the remaining intermittent failures and obtain two full clean runs. Keep focused receipts distinct from whole-suite completion.

**Open questions for Will:** None.

Evidence: script-filtered user text and assistant replies from session 6253ecf2, approximately 18:24–20:24 PDT; queue answers through 19:38 PDT; rulings, decisions through 0021, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Builder checks are reported evidence; this tracker verifies the maintainer-site build. Existing execution ownership retained.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 18:04 PDT

**What:** Fix unhandled two-tab background errors and an intermittent proxy-test failure.

**Why:** Passing test assertions do not make a runner failure a passing suite.

**Current state:** At 18:02:31 PDT the lead reported all app assertions passing at 100% coverage, but unhandled background errors make two-tab runs exit with failure. A proxy test fails about once in seven runs. Investigation is assigned; no cause or fix is reported.

**Next step:** Capture the real background failures, fix their sources, retain regressions and prove clean runner exits. Diagnose the proxy failure without treating reruns as a fix. Report assertion results separately from process exits.

**Open questions for Will:** None.

Evidence: lead text replies extracted by script from the latest two transcript hours through 2026-10-21 01:03:57 UTC; queue rulings through 00:42:06 UTC; current rulings and decision 0017 override historical panel proposals. Product checks and landing receipts are reported evidence; this tracker runs the maintainer-site build only.
