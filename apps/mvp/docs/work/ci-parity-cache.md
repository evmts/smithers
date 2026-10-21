---
title: CI parity: dependency caches
status: todo
area: sdk
owner: none
updated: 2026-10-20 22:50 PDT
links: [../proposals/ci-cd-parity.md, infrastructure-as-code.md]
---

## What

Restore and save directories (the pnpm store, cargo, mise, Go modules) keyed by a lockfile hash.

## Why

Every repository caches dependencies: setup-node `cache: pnpm` and `Swatinem/rust-cache` in Smithers, `actions/cache` and mise in Tevm, the Namespace cache in Effect. The app binds no bucket (`alchemy.run.ts`), though `ArtifactStore` and `RemoteArtifacts` exist (`docs/libraries.md:68`, `:233`).

## Repositories

Smithers, Tevm, Effect: every job that installs dependencies.

## Smallest slice

One R2 bucket in the Alchemy stack behind `RemoteArtifacts`. `ci/job` takes `cache: [{ name, key: { files }, paths }]`, restores before its first step and saves after success when the key missed. A pull request's run reads the default branch's entries and writes only its own scope, so a pull request can't poison `main`.

## Disposition

Build now, 7 of 18. Matrix row 22. Design: [the CI/CD parity proposal](../proposals/ci-cd-parity.md).

## History

2026-10-20 22:50 PDT: written by the Claude Opus merger from the merged CI/CD parity proposal (Opus and Codex Sol designs, ruling FLOW-8).
