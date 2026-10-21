---
title: CI parity: a machine per job with toolchains
status: in-progress
area: sdk
owner: dogfood-loop builder (Claude Opus), from 12:40 on 2026-10-21; the image's toolchain is the sandboxes builder's
updated: 2026-10-21 13:30 PDT
links: [../proposals/ci-cd-parity.md, sandboxes.md, sandbox-budgets.md, ../features/sandbox-tools.md, ../features/pulls.md, ../decisions/0005-sandboxes-secrets-and-the-forge.md, dogfood-loop.md]
---

## Built, 2026-10-21 (the dogfood loop's first slice)

- A pull request head's checks run on a check job: a throwaway branch machine per head, `job-<owner>-<name>-<sha>`, `kind: "job"` on its `SandboxBranch`, put to sleep once its scripts ran ([where checks run](../features/pulls.md#where-checks-run)).
- A job's box reaches `registry.npmjs.org` and `plugins.dprint.dev` and nothing else, through the object's existing outbound intercept and `@smthrs/secrets`' `Egress.forward` with no secret (`worker/branch/JobEgress.ts`). Branch sandboxes stay closed.
- This repository's checks: `.smithers/checks/lint.sh` and `check.sh` run the changed packages' own `lint` and `check` scripts. Simulated on nyc-01 with pnpm 11.25.0 against a T1-like change.
- The lead decided at 12:58 that the sandboxes builder installs Node 26.5.0 (nodejs.org, SHA-256 pinned) and corepack pnpm 11.25.0 in `infra/sandbox/Dockerfile`. Debian's nodejs is v20; the repository needs Node 26.4 or later.

**Not built:** the `ci/job` child flow, matrices and outcome values below; one job per script; a job image of its own.

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
