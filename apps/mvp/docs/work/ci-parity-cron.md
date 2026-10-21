---
title: CI parity: scheduled flows
status: todo
area: sdk
owner: none
updated: 2026-10-20 22:50 PDT
links: [../proposals/ci-cd-parity.md, cloudflare-flow-host.md, ../features/remote-flows.md]
---

## What

Start repository flows on cron schedules while every device is off.

## Why

Six live workflows run on crons: Smithers' canary and reliability, Tevm's nightly conformance and auto-update, Effect's npm-promote and ai-codegen. `@smthrs/triggers` has `Trigger.make`, `Cron`, overlap and catch-up, but nothing in the app runs it (`worker/github/Reconcile.ts:19`). `Scheduler.layer` forks a fiber that runs forever, which a Durable Object can't host and DUR-3 forbids.

## Repositories

Smithers, Tevm, Effect.

## Smallest slice

`{ on: "cron", cron, timezone }` triggers stored through `SqlTriggerStore`. One `triggers/Tick` lineage on `FlowExecution`: a step calls `Scheduler.make(...).runOnce` with a runner that starts flows through `FlowStarter` under the key `<trigger>:<occurrence>`, then sleeps one minute durably and hands off. The started run's payload names the schedule that fired, as Smithers' canary needs to tell its hourly run from its quarter-hour ones.

## Disposition

Build now, 14 of 18. Matrix row 7. Design: [the CI/CD parity proposal](../proposals/ci-cd-parity.md).

## History

2026-10-20 22:50 PDT: written by the Claude Opus merger from the merged CI/CD parity proposal (Opus and Codex Sol designs, ruling FLOW-8).
