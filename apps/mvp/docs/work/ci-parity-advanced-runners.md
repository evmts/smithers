---
title: CI parity: macOS, Windows, arm64, self-hosted and GPU machines
status: idea
area: sdk
owner: none
updated: 2026-10-20 22:50 PDT
links: [../proposals/ci-cd-parity.md, ../rulings.md, second-build-machine.md, ../decisions/0005-sandboxes-secrets-and-the-forge.md]
---

## What

Run a job on a machine Cloudflare doesn't offer: macOS, Windows, Linux arm64, a person's own machine, or a GPU.

## Why

Cloudflare containers are linux/amd64 only (0005 line 73). Will: "running on different machines like macos or advanced features maybe should be ticketed rather than implemented" (FLOW-8). Until one of these lands, the jobs below show as blocked, never silently run on Linux.

## Repositories

Smithers only. macOS: `ci.yml` `packages` (advisory), `release.yml` `server-bundle`, `native-helper`, `installer-archive`, `homebrew-bottle`, the `reliability.yml` reference leg. Windows: `ci.yml` `packages` (advisory), `native-windows.yml`, `release.yml` `native-helper`. arm64: `release.yml` `native-helper` and `installer-archive`. Self-hosted: `reference-host.yml`, `reliability.yml`. GPU: no workflow.

## Smallest slice

One provider interface behind `CiJob`, with a machine kind it refuses when absent. macOS: the Mac mini reference host or a hosted Mac. Windows: a hosted Windows VM. arm64: an arm64 Linux server. Self-hosted: a runner agent that registers a person's machine over `smthrs environment` SSH locations, one job at a time, with no secrets unless granted. GPU: nothing until a repository asks.

## Disposition

Ticket only (Will, FLOW-8: advanced features are ticketed, not built now). Matrix rows 46 to 50. Design: [the CI/CD parity proposal](../proposals/ci-cd-parity.md).

## History

2026-10-20 22:35 PDT: added by Codex tracker curator from script-filtered Will text at 22:24 and lead update at 22:27, ruling FLOW-8 and CI-PARITY-BRIEF.md.

2026-10-20 22:50 PDT: rewritten with each machine kind's jobs and slice; written by the Claude Opus merger from the merged CI/CD parity proposal (Opus and Codex Sol designs, ruling FLOW-8).
