---
title: CI parity: watch a repository's runs live
status: in-progress
area: sdk
owner: Codex GPT-6.1 Sol (ci-spine)
updated: 2026-10-23 PDT
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

## Plan (ci-run-view, 2026-10-22)

- **One index.** A repository run is a `runs` row (decision 0009 §2; FLOW-2): `execution` (the engine's run id), `repo_id`, `flow`, `sha`, `ref`, `event`, `launched_by`. Whoever starts one records it in the same request (`worker/runs/RepoRuns.ts`); the execution's Durable Object settles the row from the engine's own status when its alarm settles the run (`done`, `failed`, `stopped`).
- **The list** is Electric's shape of those rows (`GET /api/shapes/actions`, the repository's read rule), `/$owner/$repo/actions`.
- **The page** is the Runs page (`RunPageView`) at `/$owner/$repo/actions/runs/$runId`, read through the existing `GET /api/remote-runs/<id>`, which now also admits a recorded repository run and the runs it started, and followed through the engine's change feed. A step's log is its `telemetry.log` journal events, as on a device.
- **Acts.** `run/cancel` and `run/retry` act on a run on Cloudflare through `POST /api/remote-runs/<id>/stop` and `/retry { failed }`: Stop records the cancellation in the engine's store and wakes the run's object; Retry starts the same repository flow at the same commit, Retry failed only the jobs that didn't pass.

## History

2026-10-20 22:50 PDT: written by the Claude Opus merger from the merged CI/CD parity proposal (Opus and Codex Sol designs, ruling FLOW-8).

## Combined-stack validation (2026-10-23)

Rebased the five CI-spine commits and recreated run-view `a3c129e82f66` on parent main `a7b2bd8cf98c`. Repository-run migration is `0053_repo_runs`; no new decisions. Trigger dispatch records the run before starting it, and execution composition retains main's signals, database sampling, domains, command waits and TODO retry/cancellation.

Latitude: all four TypeScript projects and import rules passed. Full app suite: 3,832 passed, 2 expected failures, 17 skipped. All 25 measured app production files changed by the combined stack have 100% statements, branches, functions and lines. Global coverage remains below the unchanged 100% gate in seven untouched files; see the builder report. Sandbox: 862 passed, 31 skipped, 100% in all four measures.

The real-push and run-view recording case declares `requires("githubApp", "webhookSecret", "localLogs", "repoFlows")`; the missing credentials mean no live e2e or GIF receipt. Generated documentation is refreshed. The docs CLI did not return a completion receipt, and the site suite's existing hostname-literal assertion fails against main's configured domain. These gates remain open; nothing pushed.

## CI-spine rebase receipt, 2026-10-23

Rebased on `eeb01ea499d0`; migration `0053_repo_runs`, generated device epoch 75, decision 0082. Latitude full app gate: 308 files passed, 4,014 tests passed, 2 expected failures and 17 skips; all four coverage metrics 100%, exit 0. Mini CI fixture: 1/1 passed. The grant-store summary integration test now verifies six real ModelStep attempts and allows 90 seconds because the unchanged retry policy can spend 31 seconds in delays. Sandbox: 61 files, 862 tests passed, 31 platform skips, all four coverage metrics 100%. Final typecheck and importRules passed. Docs site generation completed with no output changes; both docs CLI tails timed out after 180 seconds, so the lander runs docs:check on the MacBook as requested. This receipt supersedes the earlier rebase and coverage blockers in this note.
