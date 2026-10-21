---
title: CI parity: preview packages per pull request
status: idea
area: sdk
owner: none
updated: 2026-10-20 22:50 PDT
links: [../proposals/ci-cd-parity.md, ci-parity-artifacts.md]
---

## What

Publish installable preview packages for each pull request head, as pkg.pr.new does.

## Why

Effect's and V3's `snapshot.yml` publish with `pkg-pr-new`, which checks the GitHub Actions run, so it can't run from Smithers cloud.

## Repositories

Effect (main and v3).

## Smallest slice

Serve each pull request head's packed tarballs from the artifacts bucket at an npm-compatible install URL, or ask pkg.pr.new for a Smithers integration.

## Disposition

Ticket only (Will, FLOW-8: advanced features are ticketed, not built now). Matrix row 51. Design: [the CI/CD parity proposal](../proposals/ci-cd-parity.md).

## History

2026-10-20 22:50 PDT: written by the Claude Opus merger from the merged CI/CD parity proposal (Opus and Codex Sol designs, ruling FLOW-8).
