---
title: Cerebras capacity load test
status: done
area: infra
owner: codex-cerebras-load
updated: 2026-10-20
links: [../../bench/cerebras-load/RESULTS.md]
---

## Current specification — 2026-10-20, 21:04 PDT

**What:** Retain the bounded capacity experiment, sustained repeat and draft capacity request.

**Why:** Will chose measurement before contacting Cerebras.

**Current state:** The 20:59 lead confirms sustained results after the transport fix: at concurrency 10, 343 of 542 requests returned provider HTTP 429. Earlier receipts record 199 successes, zero other failures, 60.45 seconds, 371,265 tokens and estimated $0.39302; escalation to 25/50 stopped. Headers report 150k TPM and 450 RPM. The capacity request is queued at priority 960, for Will to send. The experiment is finished; sufficient capacity for hundreds of users is not established.

**Next step:** Keep raw receipts, method and user-count assumptions with the draft. Track provider capacity follow-up in cerebras-rate-limits.md; do not send a message or start another live campaign from this tracker.

**Open questions for Will:** Review the draft capacity request in the queue.

Evidence: script-filtered user-typed text and assistant text replies from session 6253ecf2, 19:04–21:04 PDT on 2026-10-20; rulings and queue answers through 19:38 PDT; decisions through 0021, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Later Will text and queue answers prevail. Product receipts are reported evidence; this tracker verifies the site build. Execution ownership retained; reconciliation by Codex tracker curator.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 19:56 PDT

**What:** Retain both bounded capacity experiments and the unsent provider-capacity draft.

**Why:** Will chose load testing before contacting Cerebras.

**Current state:** The transport owner records the sustained repeat: concurrency 10 for 60.45 seconds, 199 OK, 343 provider 429, zero other failures, 371,265 tokens and estimated $0.39302. The 63.3% refusal fraction stopped escalation to 25/50. Headers report 150k TPM and 450 RPM. This supersedes “no sustained repeat”; it does not prove capacity for hundreds of users. Original campaign bounds and artifacts remain below.

**Next step:** Retain raw receipts and update the user-count assumptions and draft from the measured provider limits. Do not launch an uncapped additional campaign or send the draft on Will’s behalf. Track pending transport validation separately.

**Open questions for Will:** None; the capacity request remains a draft for Will.

Evidence: script-filtered user-typed text and lead replies, session 6253ecf2, latest approximately two hours through 2026-10-21 02:55 UTC; queue answers through 02:38 UTC; rulings, decisions 0001–0020, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Later rulings supersede older proposals. Builder receipts are reported evidence; tracker verification is the site build. Execution ownership retained; reconciled by Codex tracker curator.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 19:34 PDT

**What:** Retain the first capped experiment and complete a separately bounded sustained campaign after fixing transport.

**Why:** Will approved measuring capacity before contacting Cerebras.

**Current state:** The first campaign is complete, but the lead restarted investigation at 19:28: Node session errors prevented sustained measurement. Headers reported 150k TPM and 450 RPM; roughly 70% of the 100-concurrency burst was rate-limited. Earlier precise bounds and artifacts remain below; the lead’s roughly 0.9M-token description is not substituted for their conservative bound.

**Next step:** Complete h2-model-transport.md, rerun sustained concurrency 10/25/50 under its own cap, and revise the 100/300/1,000-user plan estimate. Keep the capacity message as a draft for Will to send.

**Open questions for Will:** None.

Evidence: script-extracted user-typed messages and lead text replies from session 6253ecf2, 2026-10-21 00:34–02:34 UTC (17:34–19:34 PDT); queue answers through 02:33:47 UTC; current rulings, decisions, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Latest Will text and queue answers prevail. Product receipts are reported, not rerun by this tracker. Existing execution owners are retained.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 19:14 PDT

**What:** Run a reproducible capped Cerebras benchmark and retain results, limitations and an unsent capacity-request draft.

**Why:** Will chose a load test before contacting Cerebras.

**Current state:** The shared cerebras-load-report.md reports the campaign finished: concurrency 1 completed 81 requests; concurrency 10 encountered HTTP/2 transport failures; the separate concurrency-100 admission burst returned 71 rate limits out of 102 calls. Sustained capacity is unestablished. The conservative campaign bound is 1,957,551 tokens and $2.02076; three offline checks passed. This completes the bounded experiment, not the capacity investigation.

**Next step:** Retain raw receipts and assumptions. Fix ERR_HTTP2_INVALID_SESSION before a separately bounded repeat; make no further live calls in this campaign and send no draft on Will’s behalf.

**Open questions for Will:** None. The draft is for Will to send.

Evidence: latest approximately two hours of user-typed messages and lead text replies extracted by script from session 6253ecf2, through 2026-10-21 02:14:18 UTC; queue answers through 01:57:13 UTC; rulings, shared briefs/designs, decisions, proposals, TODOs and rules. Later Will answers supersede older proposals. Product validation is reported evidence; this pass verifies the site build only. Reconciled by Codex; execution owners retained.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 19:07 PDT

**What:** Measure Cerebras capacity with a reproducible, capped load test through the Smithers model route.

**Why:** Will chose load-testing before asking Cerebras for capacity at 18:57.

**Current state:** The lead reports Codex started the benchmark at 18:57:49. No completed results or capacity claim is evidenced. Catalog entries in the existing note name @smthrs/model, @smthrs/model-host, @smthrs/flow and @smthrs/platform-node.

**Next step:** Ramp concurrency 1, 10, 25, 50, 100, 200; stop escalation above 20% failures/rate limits and stop the run at 2 million tokens or $5. Record successes, rate limits, first-token/total latency, throughput and cost. Preserve raw receipts, table/chart, limitations, estimates for 100/300/1,000 daily users and a draft message for Will to send.

**Open questions for Will:** None.

Evidence: session 6253ecf2 user text and assistant replies extracted by script for the latest approximately two hours, through 2026-10-21 02:07 UTC; queue answers through 01:57 UTC; current rulings and shared briefs. Latest answers supersede older proposals. Receipts below are lead-reported; this tracker verifies only the maintainer-site build. Execution owners are retained; reconciliation by Codex.

## Earlier tracker history (retained)

Will chose load-testing before requesting capacity. Build and execute a capped SDK-route ramp; preserve raw evidence and a draft Will can send. No commits or outbound messages authorized.
Library catalog: @smthrs/model and @smthrs/model-host for the endpoint's provider route; @smthrs/flow for sealed probe steps; @smthrs/platform-node for SQLite flow evidence.

Completed: capped benchmark, live ramp and burst diagnostics, retained raw evidence, capacity scenarios and unsent draft. Sustained capacity remains unestablished because the SDK fetch transport failed with ERR_HTTP2_INVALID_SESSION; repeat after a transport fix. No further live calls within this campaign.
