---
title: CI parity: run artifacts
status: todo
area: sdk
owner: none
updated: 2026-10-20 22:50 PDT
links: [../proposals/ci-cd-parity.md, infrastructure-as-code.md]
---

## What

Named artifacts uploaded from a job on success or failure, kept for a retention, handed between jobs by digest and downloadable from the run page.

## Why

11 live workflows upload artifacts: test results, e2e screenshots, release candidates and bundle stats. Smithers' release hands candidates between jobs and between runs.

## Repositories

Smithers, Tevm (factory), Effect (bundle stats).

## Smallest slice

`artifacts: [{ name, paths, when, retentionDays }]` on `ci/job`: tar, upload to the R2 bucket by SHA-256, and record `run_artifacts` (run, job, name, digest, size, expiry). A later job's `inputs: [{ artifact }]` downloads and verifies by digest. A downloaded artifact is data, never code. The run page lists artifacts for Members.

## Disposition

Build now, 11 of 18. Matrix row 24. Design: [the CI/CD parity proposal](../proposals/ci-cd-parity.md).

## History

2026-10-20 22:50 PDT: written by the Claude Opus merger from the merged CI/CD parity proposal (Opus and Codex Sol designs, ruling FLOW-8).
