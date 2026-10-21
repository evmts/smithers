---
title: CI parity: machine sizes
status: todo
area: sdk
owner: none
updated: 2026-10-20 22:50 PDT
links: [../proposals/ci-cd-parity.md, sandbox-budgets.md, infrastructure-as-code.md]
---

## What

Choose a Linux machine size per job.

## Why

Effect runs on Namespace profiles (`namespace-profile-linux-default` and `-small`); Smithers' heaviest jobs want 4 vCPU. A Cloudflare container's size is its class's `instanceType` (`node_modules/alchemy/src/Cloudflare/Containers/ContainerApplication.ts:111`), at most 4 vCPU, 12 GiB and 20 GB (0005 line 73).

## Repositories

Effect (check, snapshot, cluster, ai-codegen), Smithers.

## Smallest slice

One `JobSandbox` class per size (`standard-1`, `standard-2`, `standard-4`) and `machine` on `ci/job`. An unknown size is refused before anything runs.

## Disposition

Build now, 16 of 18. Matrix row 21. Design: [the CI/CD parity proposal](../proposals/ci-cd-parity.md).

## History

2026-10-20 22:50 PDT: written by the Claude Opus merger from the merged CI/CD parity proposal (Opus and Codex Sol designs, ruling FLOW-8).
