---
title: Issue lifecycle and playable proof of concept
status: in-progress
area: app
owner: Codex tracker curator; execution assigned by lead
updated: 2026-10-20
links: [issue-triage.md, issues-to-todos.md, vibelang-coding-factory.md, ../decisions/0012-git-end-to-end.md, ../decisions/0016-todos-and-the-stack.md, ../rulings.md]
---

## Current specification — 2026-10-20, 19:56 PDT

**What:** Track issue reproduction, discussion acceptance, maintainer commitment and playable POCs through the canonical issue-lifecycle.md workstream.

**Why:** Will’s 19:33 ruling simplifies the factory; retain this earlier tracker entry without a competing execution claim.

**Current state:** Decision 0018 is written and proposed. The executing builder’s canonical note issue-lifecycle.md records needs-repro and commitment UI/write/filter implementation with nine targeted tests; sandbox reproduction verification and auto-POC remain unbuilt, and real browser evidence is pending. This note is retained as history and an index to that same workstream.

**Next step:** Follow implementation and receipts in issue-lifecycle.md; do not count acceptance, a POC or commitment as a committed TODO or permission to merge.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies, session 6253ecf2, latest approximately two hours through 2026-10-21 02:55 UTC; queue answers through 02:38 UTC; rulings, decisions 0001–0020, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Later rulings supersede older proposals. Builder receipts are reported evidence; tracker verification is the site build. Execution ownership retained; reconciled by Codex tracker curator.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 19:34 PDT

**What:** Require minimal bug reproductions, separate acceptance for discussion from commitment, and automatically produce a playable POC on acceptance.

**Why:** Will’s 19:33 request simplifies the factory and makes accepted ideas tangible before implementation.

**Current state:** The lead assigned a lifecycle builder and a proposed design plus vertical slices. The brief proposes needs-repro handling, maintainer-set now/next/later/no-commitment labels, bounded durable POC runs and previews. These implementation choices are a brief, not completed behavior or Will’s approval of each detail. No end-to-end receipt exists.

**Next step:** Write the proposed decision, coordinate with triage and issue-to-TODO owners, then prove reproduction gating, commitment and auto-POC previews against live GitHub. Verify a bug fails on main; acceptance must not imply a promise to build. Keep POCs separate from TODO bases.

**Open questions for Will:** None yet; settle mechanical choices from existing decisions before raising product questions.

Evidence: script-extracted user-typed messages and lead text replies from session 6253ecf2, 2026-10-21 00:34–02:34 UTC (17:34–19:34 PDT); queue answers through 02:33:47 UTC; current rulings, decisions, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Latest Will text and queue answers prevail. Product receipts are reported, not rerun by this tracker. Existing execution owners are retained.
