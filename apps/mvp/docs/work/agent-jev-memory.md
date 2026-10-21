---
title: Jev-ranked memory and relevant skills
status: in-progress
area: app
owner: Codex Sol memory-port builder assigned by lead
updated: 2026-10-21 00:06 PDT
links: [../rulings.md, agent-jev.md, flows-and-agent.md, durable-browser-engine.md, ../decisions/0011-the-agent-runs-in-the-browser.md]
---

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
