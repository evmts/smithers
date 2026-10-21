---
title: CI parity: watch a repository's runs live
status: todo
area: sdk
owner: none
updated: 2026-10-20 22:50 PDT
links: [../proposals/ci-cd-parity.md, flow-debugging.md, flows-run-graph-slice1.md, ../features/runs.md, pull-request-list-and-tabs.md]
---

## What

`/$owner/$repo/actions` lists a repository's runs, and a run page reads a Cloudflare run's journal and each step's log, live, with Stop, Retry and Retry failed.

## Why

Will asked for the "ability to watch flows". The Runs page reads only this browser's engine; runs on Cloudflare and a repository's runs page are not built ([runs](../features/runs.md) lines 14-17). Every CI run is a Cloudflare run.

## Repositories

Smithers, Tevm, Effect.

## Smallest slice

`GET /api/runs/:id/trace` over the engine's `RunInspection` in `smithers_flows`, with the same redaction and a Member read check. The existing run page components (`RunHeader`, `FlowGraph`, `RunWaterfall`) draw it. A step's log tails from a cursor. Stop interrupts the run on its Durable Object (`FlowRuntime.interrupt`); Retry starts the same flow and payload.

## Disposition

Build now, 6 of 18. Matrix rows 38 and 39. Design: [the CI/CD parity proposal](../proposals/ci-cd-parity.md).

## History

2026-10-20 22:50 PDT: written by the Claude Opus merger from the merged CI/CD parity proposal (Opus and Codex Sol designs, ruling FLOW-8).
