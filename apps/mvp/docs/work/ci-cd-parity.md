---
title: Replicate real repository CI/CD with Smithers flows
status: todo
area: sdk
owner: none; Opus and Codex Sol designs merged by the Claude Opus merger at 22:50 on 2026-10-20
updated: 2026-10-20 23:44 PDT
links: [../proposals/ci-cd-parity.md, ../rulings.md, no-github-actions.md, flow-authoring.md, flow-debugging.md, release-burn-down.md, ci-parity-job-secrets.md, ci-parity-job-sandbox.md, ci-parity-repo-flows.md, ci-parity-triggers.md, ci-parity-long-commands.md, ci-parity-run-view.md, ci-parity-cache.md, ci-parity-concurrency.md, ci-parity-manual-run.md, ci-parity-github-writes.md, ci-parity-artifacts.md, ci-parity-environments.md, ci-parity-publish.md, ci-parity-cron.md, ci-parity-rerun-failed.md, ci-parity-machine-sizes.md, ci-parity-path-filters.md, ci-parity-required-checks.md, ci-parity-advanced-runners.md, ci-parity-docker.md, ci-parity-privileged-linux.md, ci-parity-oidc-provenance.md, ci-parity-preview-packages.md, ci-parity-retry-from-here.md, ci-parity-status-badges.md, ci-parity-flow-renderer.md]
---

## Tracker reconciliation — 2026-10-20 23:44 PDT

**What:** Replicate repository CI/CD as Smithers flows, retaining GitHub publishing.

**Why:** Match the real jobs while preserving provenance and required-check enforcement.

**Current state:** Will answered at 23:36–23:37: GH-9 keeps npm/JSR publishing with provenance on GitHub Actions; GH-10 permits write-only smithers/<flow> commit statuses. These supersede the unanswered choices and token-publishing plan below. Other implementation remains queued after deployment.

**Next step:** Build the approved spine after deploy; add promotion warning and write-only statuses. Keep Actions ingestion and display absent.

**Open questions for Will:** Publishing and status choices are answered; no repeated ask.

Evidence: user-typed text and lead text replies extracted by script from session 6253ecf2, approximately 21:44–23:44 PDT; queue answers through 23:38:44, current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Synthetic notifications and tool content excluded. Later rulings supersede retained history. Product receipts are lead-reported; this tracker validates the maintainer-site build. Execution ownership retained; documentation reconciled by Codex tracker curator.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-20, 22:54 PDT

**Current state:** The merged proposal is finished, implementation remains unbuilt. It inventories 44 live workflows and 52 capabilities; 26 gap notes already exist. At 22:53 the lead confirms queue decisions: publishing 950, write-only GitHub statuses 948, Tevm security 970. These are proposed choices, not new rulings; no answer has arrived.

**Next step:** Build the proposal’s spine only after burn-down deployment; wait for Will’s publishing/status decisions where required.

**Open questions for Will:** Publishing with tokens, GitHub commit statuses and Tevm security are queued; no decision is inferred.

Evidence: lead text replies extracted by script from session 6253ecf2, approximately 20:54–22:54 PDT; user-typed text only for human messages, synthetic notifications excluded. Rulings and queue answers (latest 19:38 PDT) prevail. Execution ownership retained; Codex tracker curator records reported receipts.

## Earlier tracker history (retained)


## What

Inventory every workflow and composite action in Smithers, ~/tevm-monorepo and Effect-TS/effect, including effect-smol when materially different. Produce a capability matrix, one TypeScript Flow.make port sketch per workflow and one maintainer work note per confirmed gap.

## Why

Will’s 22:24 request, ruling FLOW-8, requires 100% CI/CD parity through Smithers flows on Cloudflare. This does not authorize a GitHub Actions viewer or runtime.

## Current state

22:50: the merged design is [proposals/ci-cd-parity.md](../proposals/ci-cd-parity.md). 49 workflow files read (44 live: Smithers 14, Tevm 16, Effect `main` 9, Effect `v3` 5; `effect-smol`'s 5 are retired). 52 capabilities: 10 exist, 14 small additions, 16 missing and built now, 12 tickets. 18 build-now notes and 8 ticket-only notes, each `ci-parity-<gap>.md`. Nothing is built.

## Next step

Build in the proposal's order once the burn-down deploy lands. The spine comes first: `ci-parity-job-secrets`, `ci-parity-job-sandbox`, `ci-parity-repo-flows`, `ci-parity-triggers`, `ci-parity-long-commands`, `ci-parity-run-view`.

## Open questions for Will

1. Publish to npm with tokens and lose provenance, since npm's trusted publishing accepts only GitHub Actions, GitLab.com and CircleCI cloud?
2. May Smithers write commit statuses (write-only, `smithers/<flow>`) so GitHub rulesets can require Smithers checks? M-52 forbids it today.

## History

2026-10-20 22:35 PDT: added by Codex tracker curator from script-filtered Will text at 22:24 and lead update at 22:27, ruling FLOW-8 and CI-PARITY-BRIEF.md. Research owners retain execution ownership.

2026-10-20 22:50 PDT: the Claude Opus merger merged the Opus and Sol designs into the proposal and wrote the 26 gap notes.
