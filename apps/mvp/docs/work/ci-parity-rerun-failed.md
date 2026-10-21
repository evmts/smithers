---
title: CI parity: re-run failed jobs
status: todo
area: sdk
owner: none
updated: 2026-10-20 22:50 PDT
links: [../proposals/ci-cd-parity.md, flow-debugging.md, ../features/runs.md, ci-parity-retry-from-here.md]
---

## What

Retry failed starts a new run that reuses the passed jobs' results and reruns only the failed ones.

## Why

Whole-run Retry exists for runs on this device; "No step retry is offered" ([runs](../features/runs.md) line 83). GitHub's "Re-run failed jobs" is how people recover from a flaky job. `Action.withCache` already shares a sealed result across runs (`packages/smithers/flows/flow/docs/guides/reuse-a-recorded-result.md`).

## Repositories

Smithers, Tevm, Effect.

## Smallest slice

Seal each `ci/job` result with `Action.withCache` under the repository, SHA, job, input digest and image digest. Jobs that publish or deploy are never sealed. Retry failed on the run page starts the same flow and payload, and the passed jobs replay from the cache.

## Disposition

Build now, 15 of 18. Matrix row 40. Design: [the CI/CD parity proposal](../proposals/ci-cd-parity.md).

## History

2026-10-20 22:50 PDT: written by the Claude Opus merger from the merged CI/CD parity proposal (Opus and Codex Sol designs, ruling FLOW-8).
