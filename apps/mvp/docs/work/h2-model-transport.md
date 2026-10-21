---
title: Node model transport session recovery
status: in-progress
area: sdk
owner: codex-h2-transport
updated: 2026-10-20
links: [cerebras-load.md]
---

## Current specification — 2026-10-20, 19:56 PDT

**What:** Use one scoped Node provider transport through platform-node, without app retry loops.

**Why:** Load tests and evals hit Node HTTP/2 session errors.

**Current state:** Decision 0019 and the owner’s final receipts replace the earlier no-fix summary: providerFetch uses HTTP/1.1 across Node compositions; 41 focused host tests and six model-host tests pass at full changed-file coverage. Source checks and packaged-host e2e pass. The 60.45-second repeat at concurrency 10 records 199 successes, 343 provider 429s and no other errors; 25/50 escalation stopped. Exact historical persistent-wedge causation remains unproven. Full platform-node suite failed in the environment; final docs-check receipt remains pending.

**Next step:** Obtain docs-check and resolve/report the full-package environment failures before declaring completion; retain bounded pre-header repair semantics and the repeat’s rate-limit limitation.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies, session 6253ecf2, latest approximately two hours through 2026-10-21 02:55 UTC; queue answers through 02:38 UTC; rulings, decisions 0001–0020, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Later rulings supersede older proposals. Builder receipts are reported evidence; tracker verification is the site build. Execution ownership retained; reconciled by Codex tracker curator.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 19:34 PDT

**What:** Make robust provider HTTP transport the single Node model-host path and repeat the capacity benchmark.

**Why:** The load campaign and evals independently encountered ERR_HTTP2_INVALID_SESSION.

**Current state:** At 19:28 the lead reports 58 session errors at concurrency 10; sustained capacity remains unknown. Evals use EgressHttpClient.providerFetch over HTTP/1.1. The assigned transport brief requires host-wide consolidation, removal of the old path, local GOAWAY/reset regression evidence and docs. No completed fix or sustained rerun receipt.

**Next step:** Reproduce with a local HTTP/2 server, fix the host transport without app retry loops, then run a separately capped 60-second campaign at concurrency 10/25/50, stopping above 20% errors. Update capacity assumptions and the unsent Cerebras draft.

**Open questions for Will:** None.

Evidence: script-extracted user-typed messages and lead text replies from session 6253ecf2, 2026-10-21 00:34–02:34 UTC (17:34–19:34 PDT); queue answers through 02:33:47 UTC; current rulings, decisions, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Latest Will text and queue answers prevail. Product receipts are reported, not rerun by this tracker. Existing execution owners are retained.

## Earlier tracker history (retained)

Lead's 19:30 request: reproduce local HTTP/2 session failures, consolidate Node model provider fetch, retain one pre-response session recovery, rerun a separately capped 60-second concurrency 10/25/50 campaign stopping above 20% errors. No commits or outbound messages.
Catalog: @smthrs/platform-node for host HTTP, @smthrs/model-host for provider routes, @smthrs/flow for benchmark receipts.

Implemented one provider fetch for NodeHost's injected fetch reference, the packaged model host, playground, evals and benchmark. Regression controls reproduce the old one-shot socket loss; reset and GOAWAY tests run against real local TLS servers. Exact historical persistent-wedge race remains unproven, recorded in package troubleshooting rather than asserted as fact.

Live receipt: concurrency 10, 60.45 s, 199 OK / 343 provider 429 / 0 other, 371,265 tokens, estimated $0.39302. Error fraction 63.3% stopped 25/50 escalation. Headers: 150k TPM, 450 RPM. RESULTS and the unsent Cerebras draft updated. Both source package typechecks pass; focused Node tests and model-host transport tests pass. Full suite and docs validation pending. No commits, messages or app deployment.

Validation: 41 focused EgressHttpClient/providerFetch tests and six model-host transport tests pass with 100% statements, branches, functions and lines in each changed transport file; three offline benchmark tests pass. Packaged model-host e2e passes on the mini. Full platform-node suite on mini failed with missing native smithers-jj-export, later runtime/environment errors and two unhandled errors; no whole-package pass/coverage claim. Both SDK source checks and model-host test-source checks passed; final host checks pending. Docs sync completed (run-320); docs check pending.

Final source checks: platform-node (including tests), model-host (including tests), packaged model host and playground all pass. No runtime-failure or transport-error rows occurred in the sustained repeat. Docs check remains the sole pending validation receipt.
