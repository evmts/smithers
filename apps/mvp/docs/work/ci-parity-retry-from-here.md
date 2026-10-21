---
title: CI parity: retry a run from a chosen step
status: idea
area: sdk
owner: none
updated: 2026-10-20 22:50 PDT
links: [../proposals/ci-cd-parity.md, ci-parity-rerun-failed.md, flow-debugging.md]
---

## What

Start a run again from a chosen step, keeping everything before it.

## Why

`TimeTravel.fork` and `rewind` exist but need jj on the host (`docs/libraries.md:230`), and CI needs rules for which later steps a changed step invalidates. Retry failed (`ci-parity-rerun-failed`) covers the common case.

## Repositories

Smithers, Tevm, Effect.

## Smallest slice

Wire `TimeTravel.fork` on the Cloudflare host, define invalidation by step dependencies, and refuse to rewind past an irreversible step such as a publish.

## Disposition

Ticket only (Will, FLOW-8: advanced features are ticketed, not built now). Matrix row 41. Design: [the CI/CD parity proposal](../proposals/ci-cd-parity.md).

## History

2026-10-20 22:50 PDT: written by the Claude Opus merger from the merged CI/CD parity proposal (Opus and Codex Sol designs, ruling FLOW-8).
