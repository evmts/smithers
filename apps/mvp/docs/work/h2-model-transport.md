---
title: Node model transport session recovery
status: done
area: sdk
owner: codex-h2-transport
updated: 2026-10-20
links: [cerebras-load.md]
---

## Current specification — 2026-10-20, 21:04 PDT

**What:** Use one scoped Node provider transport with safe connection recovery.

**Why:** Load tests and evals encountered invalid HTTP/2 sessions.

**Current state:** At 20:58–20:59 the lead explicitly reports the transport fix done and waiting for round 4 to land on main. The earlier final builder report records the TLS corruption reproduction, HTTP/1.1 recovery, 42 Node and six model-host tests, full changed-file coverage, benchmark checks and packaged-host end-to-end proof. Its broader platform-node/environment failures and pending docs check remain limitations; this is not a claim that the entire package or production is green.

**Next step:** Hand the completed transport change and receipts to the round-4 lander; retain broader package/doc checks with their owners. Confirm the pushed revision and deployment separately.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and assistant text replies from session 6253ecf2, 19:04–21:04 PDT on 2026-10-20; rulings and queue answers through 19:38 PDT; decisions through 0021, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Later Will text and queue answers prevail. Product receipts are reported evidence; this tracker verifies the site build. Execution ownership retained; reconciliation by Codex tracker curator.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 20:57 PDT

**What:** Use one scoped Node provider transport with safe connection recovery.

**Why:** Capacity tests and evals encountered invalid HTTP/2 sessions.

**Current state:** The final transport report now reproduces a destroyed Undici HTTP/2 session after a corrupted TLS record on Node 26.5/26.10. The shared HTTP/1.1 providerFetch recovers under the same fixture. It reports 42 Node and six model-host transport tests passing with 100% changed-file coverage, three benchmark checks and packaged-host e2e. Full platform-node validation still has environment/test failures and docs:check is pending. This supersedes the earlier 41-test and unproven-local-cause summary; it does not prove the exact historical incident cause.

**Next step:** Resolve full-package environment/test failures and obtain docs:check. Preserve the rate-limited repeat’s limits; no provider capacity claim beyond its measured receipts.

**Open questions for Will:** None.

Evidence: script-filtered human messages and lead text replies from session 6253ecf2, approximately 18:57–20:57 PDT; current rulings and queue answers, decisions through 0021, proposals and shared briefs/designs. Transport details additionally use its final builder report. Product checks are reported evidence; this pass runs the maintainer-site build. Execution ownership retained.

## Earlier tracker history (retained)

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

Root cause established subsequently with a retained local fatal-TLS fixture: corrupt one encrypted record after a successful HTTP/2 response; Node 26.5/26.10 emit BAD_RECORD_MAC, then every later request uses the destroyed session through Undici openStream/writeH2 and fails INVALID_SESSION. No abort or alternate origin is involved. This supersedes the earlier unproven-race limitation. HTTP/1.1 with a single pre-header fresh-pool repair passes all six calls under the same fault; the new regression retains both outcomes. The isolated child trusts its ephemeral CA without disabling certificate verification. Package docs and decision 0019 updated.
