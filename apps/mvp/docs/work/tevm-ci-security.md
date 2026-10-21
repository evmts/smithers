---
title: Restrict Tevm agent launches and remove committed cache token
status: todo
area: process
owner: Will decides; implementation unassigned
updated: 2026-10-20 23:34 PDT
links: [ci-cd-parity.md, exposed-credentials-rotation.md, ../proposals/ci-cd-parity.md]
---

## Tracker reconciliation — 2026-10-20 23:34 PDT

**What:** Track the Tevm security finding and Will’s replacement of Nx with Smithers automation.

**Why:** Remove the committed Nx Cloud token by removing Nx; retain explicit permission boundaries.

**Current state:** Will’s 23:29 answer says remove Nx (OTHER-5). At 23:32 the lead clarifies his option was “Not now” for restricting claude.yml: that launcher stays unchanged. The old proposal to move an Nx token to a secret is superseded by Nx removal. No security change completion receipt.

**Next step:** Track the authorized Nx migration separately; retain the launcher finding as deferred rather than repeatedly requesting approval.

**Open questions for Will:** None; do not re-ask the declined launcher change.

Evidence: script-filtered user-typed text and lead text replies in session 6253ecf2, approximately 21:34–23:34 PDT; queue answers through 23:33:36, current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Notifications and teammate messages excluded from human evidence. Product receipts are lead-reported; this tracker verifies the site build. Existing execution ownership retained.

## Earlier tracker history (retained)


## What

Restrict the public claude.yml launcher to maintainers and move the committed Nx Cloud token to a secret, rotating it.

## Why

The CI/CD inventory found unrestricted agent launches and a committed token.

## Current state

At 22:53 the lead confirms queue item 970. No answer or fix receipt. A curator redaction failure also printed the already-public read-only token; no value is retained here.

## Next step

Obtain Will’s queue answer, then apply and validate the authorized changes in Tevm.

## Open questions for Will

Approve both security fixes in queue 970.

Evidence: script-filtered lead text replies, session 6253ecf2, 2026-10-20 22:47–22:54 PDT; current rulings and queue answers. Added by Codex tracker curator; execution ownership is as stated.
