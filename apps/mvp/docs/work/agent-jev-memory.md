---
title: Jev-ranked memory and relevant skills
status: in-progress
area: app
owner: Codex Sol memory-port builder assigned by lead
updated: 2026-10-21 04:24 PDT
links: [../rulings.md, agent-jev.md, flows-and-agent.md, durable-browser-engine.md, ../decisions/0011-the-agent-runs-in-the-browser.md]
---

## Tracker reconciliation — 2026-10-21 04:24 PDT

**Current state:** At 04:24 PDT the lead confirms Jev-ranked opening-context recall and skill filtering are finished, with 48 SDK and 7 app tests including real-model runs. A lander is putting the work on main; wiki memory remains deferred until the wiki feature. No completed landing or production validation receipt is reported.

**Next step:** Retain the landing receipt and validate the shipped recall path; keep wiki-dependent memory deferred.

**Open questions for Will:** None new. Existing unresolved questions remain in the retained history.

Evidence: lead text reply at 04:24 PDT, extracted by script from the latest approximately two session hours; no human-typed message in that window. Automated notifications and tool content excluded. Current rulings and queue answers override historical briefs, designs, decisions, proposals, TODOs and rules. Product receipts are lead-reported; the tracker runs only the maintainer-site build. Execution owner retained; documentation curator: Codex.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 01:54 PDT

**What:** Port Jev-ranked memory recall and relevant skill filtering.

**Why:** AGENT-5 restores useful opening context without waiting for the wiki.

**Current state:** Shared jev-memory-report.md reports isolated commit 24747a3bf0a92e8ff418fcb7b95c6e2d3fc62423, unpushed: sealed recall, ranking, token-budgeted opening context, skill filtering and remember flow. It reports 48 SDK and 7 app tests including 3 real-model/browser-engine E2Es, full new-module coverage and passing build/types/lint/telemetry. Ordering timed out under load then passed alone. No Playwright or production run; wiki and cross-device memory sync are deferred. No landing receipt.

**Next step:** Review and land the isolated commit after the combined round, then validate app integration and production recall. Keep future wiki sources injectable.

**Open questions for Will:** None.

Evidence: script-filtered user-typed messages and lead text replies, session 6253ecf2, 23:53–01:53 PDT; current rulings and queue answers through 01:19 PDT; shared briefs and designs, decisions, proposals, TODOs and rules. Completion and test receipts are reported evidence; this tracker validates only the site build. Execution ownership retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 00:06 PDT

**What:** Port Jev-ranked durable memory recall and skill filtering.

**Why:** AGENT-5 requests useful memories early in the context without waiting for the future wiki.

**Current state:** At 23:58 the lead restarts the Codex memory port without wiki search. Recall uses the durable memory store; sources are injected so wiki can join later. No implementation or real-model eval completion receipt.

**Next step:** Rank configured durable memory via durable Jev steps, insert budgeted memories at the start of context, filter skills, and prove recall/debug behavior with real evals. Wiki-backed recall belongs to wiki.md.

**Open questions for Will:** None.

Evidence: script-filtered human text and lead replies from the last two session hours, through 00:05 PDT; queue answers through 00:05:48 PDT; current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Product checks are reported receipts, not checks executed by this tracker. Existing execution owners and history retained; Codex curates documentation only.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-20 23:55 PDT

**What:** Port the old Jev-based wiki/memory recall and skill filtering into the browser agent.

**Why:** Will requested useful memories at the start of the context window and a relevant skill catalog (AGENT-5).

**Current state:** At 23:53 the lead reports Codex Sol assigned in an isolated jj workspace, separate from the landing checkout. JEV-MEMORY-BRIEF.md requires documenting old @smthrs/memory/Jev behavior first. No implementation, eval or end-to-end completion receipt.

**Next step:** Recall configured sources before the first model call, rank through durable Jev steps, insert within a token budget, and filter skills through the same path. Extend generic SDK services where needed; inject browser-safe storage. Add content-free metrics, tests, a real-model wiki-fact eval, debug-visible e2e and docs; hand the isolated commit to the lander.

**Open questions for Will:** None.

Evidence: last two session hours of user-typed text and lead replies extracted with a JSONL script (notifications and tool content excluded), through 23:54 PDT; queue answers through 23:51; current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Product receipts are lead-reported; tracker validation is the maintainer-site build. Prior history and execution ownership retained.
