---
title: Cerebras load cancellation and evidence
status: done
area: benchmarks
owner: codex-fix-239670
updated: 2026-10-21
links: []
---

Fix worker lifetime, admission diagnostics, and report accuracy with offline regression tests. Use the catalog's @smthrs/flow, @smthrs/model-host and @smthrs/platform-node entries; no new library or paid inference.

Latitude validation: original benchmark suite 7/7; eight added regressions failed
before fixes; final benchmark suite 18/18, including real durable-engine
cancellation and filesystem ledger/evidence integration. Eval suite 55/55
before and after. E2e: not run (mini offline). No live inference requested.

The report already used configured seconds; the reproduced report defect was
its fixed phase-limit wording. Persisted phase/campaign limits now drive it.
The durable API cancels by request, so the CLI also awaits its execution receipt
before releasing its worker. The engine records the cancellation and lifecycle.
