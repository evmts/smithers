---
title: CI parity: required checks
status: todo
area: sdk
owner: none
updated: 2026-10-20 23:44 PDT
links: [../proposals/ci-cd-parity.md, no-github-actions.md, pr-review-and-merge.md, pull-request-list-and-tabs.md]
---

## Tracker reconciliation — 2026-10-20 23:44 PDT

**What:** Require configured Smithers flow results on the exact pull-request head.

**Why:** Branch protection must be able to require Smithers checks.

**Current state:** At 23:37 Will approved write-only GitHub commit statuses named smithers/<flow> (GH-10). This supersedes the statement below that M-52 forbids all statuses. Required-flow configuration and merge gates remain unbuilt.

**Next step:** Implement required-flow checks and connect the write-only status stream after deploy, keeping exact-head and person-only merge checks.

**Open questions for Will:** None on permission to write statuses.

Evidence: user-typed text and lead text replies extracted by script from session 6253ecf2, approximately 21:44–23:44 PDT; queue answers through 23:38:44, current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Synthetic notifications and tool content excluded. Later rulings supersede retained history. Product receipts are lead-reported; this tracker validates the maintainer-site build. Execution ownership retained; documentation reconciled by Codex tracker curator.

## Earlier tracker history (retained)


## What

A repository setting lists the flows that must pass on a pull request's head before Smithers merges it.

## Why

Effect's rulesets require six checks on `main`, seven on `v4/next-minor` and `v4/next-major`, and six on `v3`. `pr/Merge` reads no Smithers check (`worker/github/Merge.ts:14-21`), and `checks/Run` says checks never gate the merge (`worker/flows/Checks.ts:38-39`). Whether GitHub's own rulesets can require Smithers checks is the proposal's question 2: M-52 forbids writing commit statuses today.

## Repositories

Effect (main, `v4/next-*`, v3); any repository that wants a gate.

## Smallest slice

The setting per branch, changed by a Maintainer and read from the base, never the head. `pr/Merge` refuses `checks_pending` or `checks_failed` until each required flow's latest run on the head SHA has passed (0017's `merge/rules` hook). The Checks tab marks the required ones.

## Disposition

Build now, 18 of 18. Matrix row 42. Design: [the CI/CD parity proposal](../proposals/ci-cd-parity.md).

## History

2026-10-20 22:50 PDT: written by the Claude Opus merger from the merged CI/CD parity proposal (Opus and Codex Sol designs, ruling FLOW-8).
