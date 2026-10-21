---
title: CI parity: GitHub writes from repository flows
status: todo
area: sdk
owner: none
updated: 2026-10-20 23:44 PDT
links: [../proposals/ci-cd-parity.md, github-source-of-truth.md, pr-review-and-merge.md, ../rules.md]
---

## Tracker reconciliation — 2026-10-20 23:44 PDT

**What:** Expose authorized GitHub writes as durable system actions.

**Why:** Repository flows need release, branch and status writes without bypassing trust boundaries.

**Current state:** GH-10 now permits write-only commit statuses named smithers/<flow>. The historical blanket status ban below is superseded. Other proposed GitHub write capabilities remain todos; no implementation receipt.

**Next step:** Build scoped actions with tests after deploy; track commit-status lifecycle in ci-parity-commit-statuses.md. Agents still never approve or merge.

**Open questions for Will:** None newly raised.

Evidence: user-typed text and lead text replies extracted by script from session 6253ecf2, approximately 21:44–23:44 PDT; queue answers through 23:38:44, current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Synthetic notifications and tool content excluded. Later rulings supersede retained history. Product receipts are lead-reported; this tracker validates the maintainer-site build. Execution ownership retained; documentation reconciled by Codex tracker curator.

## Earlier tracker history (retained)


## What

System actions that repository flows may call with the App's installation token: commit files to a branch, open or update a pull request, create a tag, create a release and upload its assets, create a deployment and its status, and send `repository_dispatch`, beside the existing comment, sticky comment and label actions.

## Why

Changesets' Version PR (Tevm, Effect), GitHub releases (Smithers, Tevm, Effect), labels (Tevm's factory), bundle-size comments and the release queue (Effect) and the website dispatch (Effect) all write to GitHub. `@smthrs/integrations` has `createPull`, `createBranch`, `AddLabels` and `UpsertComment` (`GitHub/Pulls.ts:306`, `GitHub/Refs.ts:121`, `GitHub/Actions.ts:207`, `:324`), but no releases, tags, deployments or dispatch, and repository flows get no grant.

## Repositories

Smithers, Tevm, Effect.

## Smallest slice

`GitHub.Releases` (create, upload an asset, read back by tag) and `GitHub.Git` (commit files to a branch, create a tag) in `@smthrs/integrations`, each reading back before a retry. Each is granted per flow by a capability such as `github:release`. A write shows the App as author and the run as its cause. Nothing approves or merges, and check runs and statuses stay banned (`github.no-actions`).

## Disposition

Build now, 10 of 18. Matrix rows 29 and 30. Design: [the CI/CD parity proposal](../proposals/ci-cd-parity.md).

## History

2026-10-20 22:50 PDT: written by the Claude Opus merger from the merged CI/CD parity proposal (Opus and Codex Sol designs, ruling FLOW-8).
