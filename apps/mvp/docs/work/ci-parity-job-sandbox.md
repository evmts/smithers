---
title: CI parity: a machine per job with toolchains
status: todo
area: sdk
owner: none
updated: 2026-10-20 22:50 PDT
links: [../proposals/ci-cd-parity.md, sandboxes.md, sandbox-budgets.md, ../features/sandbox-tools.md, ../decisions/0005-sandboxes-secrets-and-the-forge.md]
---

## What

`ci/job`: a child flow that reserves one `JobSandbox` container for a job, checks out the exact SHA, runs its steps in order and settles an outcome value (`passed`, `failed`, `cancelled`, `skipped`), never a failure, so a matrix reports every row.

## Why

The only container today is a branch sandbox: Debian with git, tmux and bash, no Node and no internet (`infra/sandbox/Dockerfile`; [branch workspace](../features/branch-workspace.md) lines 96-102). Every CI job needs a toolchain and a machine of its own, and Smithers' `ci.yml` runs 15 jobs at once. A `SandboxObject` already works under any id, as the `todo` run's `todo-<attemptId>` machines show (`worker/flows/TodoMachine.ts:17`).

## Repositories

Smithers, Tevm, Effect: every job.

## Smallest slice

A `JobSandbox` container class from `infra/job/Dockerfile` (Debian trixie, Node 24, corepack pnpm, bun, git, build-essential, python3 and Postgres 18 binaries, pinned by digest), one object per `job:<run>:<job>`. The job checks out the SHA from the forge after `pullUpstream`, including `refs/pull/<n>/head`, and runs one step through `SandboxTools.run`. `CiJob` lives in `@smthrs/sandbox` (catalog: "Run commands on a container", `docs/libraries.md:64`). Proof: a two-job flow runs `node --version` and `pnpm --version` on two machines at once, and a job that exits 1 settles `failed` while its sibling settles `passed`.

## Disposition

Build now, 2 of 18. Matrix rows 16 to 19. Design: [the CI/CD parity proposal](../proposals/ci-cd-parity.md).

## History

2026-10-20 22:50 PDT: written by the Claude Opus merger from the merged CI/CD parity proposal (Opus and Codex Sol designs, ruling FLOW-8).
