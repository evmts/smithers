---
title: "CI parity: GitHub publishing and deployment warning"
status: todo
area: sdk
owner: none
updated: 2026-10-20 23:44 PDT
links: [../proposals/ci-cd-parity.md, release-burn-down.md, ci-parity-oidc-provenance.md]
---

## Tracker reconciliation — 2026-10-20 23:44 PDT

**What:** Keep npm and JSR publishing on GitHub Actions and warn when promoting main triggers deployment.

**Why:** Will chose provenance-preserving publishing in GH-9 rather than token publishing from Smithers.

**Current state:** At 23:36 Will selected keeping publishing on GitHub. At 23:37 the lead records the coding-factory warning as after-deploy work. The earlier token-publishing slice below is superseded, not authorized implementation.

**Next step:** Add the warning to the human promotion/merge surface, test it, and retain publish workflow provenance. Production checks and work run on Smithers.

**Open questions for Will:** None; GH-9 answers the publishing choice.

Evidence: user-typed text and lead text replies extracted by script from session 6253ecf2, approximately 21:44–23:44 PDT; queue answers through 23:38:44, current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Synthetic notifications and tool content excluded. Later rulings supersede retained history. Product receipts are lead-reported; this tracker validates the maintainer-site build. Execution ownership retained; documentation reconciled by Codex tracker curator.

## Earlier tracker history (retained)


## What

`npm publish`, `npm dist-tag` and `jsr publish --token` from a job, with the token swapped in by the egress.

## Why

All three repositories publish packages. Without GitHub's OIDC, a token is the only way to publish from Smithers cloud; JSR's docs say token publishing "works everywhere". Whether we accept losing provenance is the proposal's question 1.

## Repositories

Smithers (release, npm-dist-tag), Tevm (changesets, snapshot, JSR), Effect (changesets, npm-promote).

## Smallest slice

An e2e against a scratch package: `npm publish` with `NPM_TOKEN` as a placeholder in `.npmrc` and the egress bound to `registry.npmjs.org`, the version read back afterward, and a retry that first checks whether the version exists. Then the same for `npm dist-tag` and `jsr publish --token`.

## Disposition

Build now, 13 of 18. Matrix row 32. Design: [the CI/CD parity proposal](../proposals/ci-cd-parity.md).

## History

2026-10-20 22:50 PDT: written by the Claude Opus merger from the merged CI/CD parity proposal (Opus and Codex Sol designs, ruling FLOW-8).
