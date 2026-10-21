---
title: CI parity: environments and approvals
status: todo
area: sdk
owner: none
updated: 2026-10-20 22:50 PDT
links: [../proposals/ci-cd-parity.md, ../features/secrets.md, ../decisions/0005-sandboxes-secrets-and-the-forge.md]
---

## What

`environment: "<name>"` on a job: a person approves before it runs, and only then does the job get that environment's secrets.

## Why

Smithers publishes and deploys under `npm-publish`, `production`, `installer-publish` and `homebrew-publish`. Tevm's factory needs a reviewer for `factory-admin` and `factory-approval`. Effect gates fork snapshots with `fork` and promotions with `npm-promote`. `HumanTask` exists; main-only secrets are designed but unbuilt (0005 line 209).

## Repositories

Smithers, Tevm, Effect.

## Smallest slice

A repository setting per environment: the minimum role that approves (Maintainer by default), the branches allowed and the secrets granted. The job waits on a `HumanTask` addressed to that role and bound to the candidate's digest (the SHA and its artifacts); only a person answers, as with `run/answer`. The environment's secrets reach the box only after the answer, and an agent never approves.

## Disposition

Build now, 12 of 18. Matrix rows 27 and 28. Design: [the CI/CD parity proposal](../proposals/ci-cd-parity.md).

## History

2026-10-20 22:50 PDT: written by the Claude Opus merger from the merged CI/CD parity proposal (Opus and Codex Sol designs, ruling FLOW-8).
