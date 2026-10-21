---
title: CI parity: OIDC identity and publish provenance
status: idea
area: sdk
owner: none
updated: 2026-10-20 23:44 PDT
links: [../proposals/ci-cd-parity.md, ci-parity-publish.md, release-burn-down.md]
---

## Tracker reconciliation — 2026-10-20 23:44 PDT

**What:** Track future Smithers OIDC federation without replacing the approved publishing host.

**Why:** Advanced identity capabilities remain separate from current publish parity.

**Current state:** GH-9 keeps npm/JSR provenance publishing on GitHub Actions. The historical statement below that token publishing bridges the gap is superseded. Native Smithers OIDC remains an idea, not required for the current release.

**Next step:** Retain as future capability; do not implement a token-publishing substitute or contact providers from this tracker.

**Open questions for Will:** None; publishing placement is settled.

Evidence: user-typed text and lead text replies extracted by script from session 6253ecf2, approximately 21:44–23:44 PDT; queue answers through 23:38:44, current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Synthetic notifications and tool content excluded. Later rulings supersede retained history. Product receipts are lead-reported; this tracker validates the maintainer-site build. Execution ownership retained; documentation reconciled by Codex tracker curator.

## Earlier tracker history (retained)


## What

Let Smithers cloud publish with npm trusted publishing and provenance, publish to JSR with provenance, sign keylessly with cosign, and federate into cloud accounts.

## Why

npm trusted publishing works only from GitHub Actions, GitLab.com and CircleCI cloud, and provenance only from the first two (https://docs.npmjs.com/trusted-publishers). JSR provenance works only from GitHub Actions (https://jsr.io/docs/publishing-packages). Smithers' release signs installers with cosign bound to the Actions issuer (`.smithers/flows/release/installer-release.mjs:130-147`), and Effect publishes with OIDC and no `NPM_TOKEN` (Effect-TS/effect `.github/workflows/release.yml:32-43`). Until this lands, publishing uses tokens (proposal, question 1).

## Repositories

Smithers, Tevm, Effect.

## Smallest slice

Ask npm and Sigstore what a new CI issuer needs; publish Smithers' OIDC discovery document and keys; and mint a short-lived, run-bound identity token only in a trusted step, never in a box.

## Disposition

Ticket only (Will, FLOW-8: advanced features are ticketed, not built now). Matrix row 33. Design: [the CI/CD parity proposal](../proposals/ci-cd-parity.md).

## History

2026-10-20 22:50 PDT: written by the Claude Opus merger from the merged CI/CD parity proposal (Opus and Codex Sol designs, ruling FLOW-8).
