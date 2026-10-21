---
title: CI parity: commands that run for hours
status: todo
area: sdk
owner: none
updated: 2026-10-20 22:50 PDT
links: [../proposals/ci-cd-parity.md, ../features/sandbox-tools.md, sandboxes.md]
---

## What

Run each job step as an `ExternalJob` over a detached process in the job's box, with a heartbeat, a log file and cancellation.

## Why

`SandboxTools.run` stops a command at 600 seconds and returns at most 64 KiB of each stream (`packages/smithers/flows/sandbox/src/SandboxTools/index.ts:59-70`). Smithers' jobs run for up to 180, 190, 330 and 360 minutes. `ExternalJob` already has start, probe, collect, cancel and a journaled deadline (`packages/smithers/flows/flow/docs/api.md:307-321`).

## Repositories

Smithers (ci, release, reliability); every job over 10 minutes in Tevm and Effect.

## Smallest slice

`ci/step` starts `sh -c` under tmux once per call id, probes exit status and log size with a heartbeat, collects the exit code and the log's digest, and cancels the whole process group. Its deadline is the step's `timeoutMinutes`. `sandbox/Keep` counts a running step as busy, so the box doesn't sleep under it.

## Disposition

Build now, 5 of 18. Matrix rows 20 and 36. Design: [the CI/CD parity proposal](../proposals/ci-cd-parity.md).

## History

2026-10-20 22:50 PDT: written by the Claude Opus merger from the merged CI/CD parity proposal (Opus and Codex Sol designs, ruling FLOW-8).
