---
title: CI parity: concurrency groups and cancel-in-progress
status: todo
area: sdk
owner: none
updated: 2026-10-20 22:50 PDT
links: [../proposals/ci-cd-parity.md, ../features/runs.md]
---

## What

`concurrency: { group, cancelInProgress }` on a trigger or a flow.

## Why

28 live workflows set a concurrency group. Most cancel a superseded pull request run; releases and deploys queue. Smithers dedupes by execution id, and `@smthrs/triggers` has `supersede` for crons, but nothing covers events or manual runs.

## Repositories

Smithers, Tevm, Effect.

## Smallest slice

A group key from the repository, the flow and the group value (a pull request number or a ref), claimed in Postgres when a run starts. With `cancelInProgress`, the new run interrupts the holder and waits for its cancellation; without it, the new run queues, and only the newest waiter is kept, as on GitHub. A step marked irreversible, such as a publish, is never interrupted halfway.

## Disposition

Build now, 8 of 18. Matrix row 35. Design: [the CI/CD parity proposal](../proposals/ci-cd-parity.md).

## History

2026-10-20 22:50 PDT: written by the Claude Opus merger from the merged CI/CD parity proposal (Opus and Codex Sol designs, ruling FLOW-8).
