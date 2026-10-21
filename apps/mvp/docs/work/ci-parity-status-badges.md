---
title: CI parity: status badges
status: idea
area: sdk
owner: none
updated: 2026-10-20 22:50 PDT
links: [../proposals/ci-cd-parity.md]
---

## What

An SVG badge that shows a flow's latest result on the default branch.

## Why

No README in the three repositories shows a CI badge; Effect's one badge is a static pkg.pr.new badge. Nothing needs it yet.

## Repositories

None today.

## Smallest slice

`GET /<owner>/<repo>/flows/<name>/badge.svg`, reading the latest default-branch run, cached at the edge, for public repositories only.

## Disposition

Ticket only (Will, FLOW-8: advanced features are ticketed, not built now). Matrix row 43. Design: [the CI/CD parity proposal](../proposals/ci-cd-parity.md).

## History

2026-10-20 22:50 PDT: written by the Claude Opus merger from the merged CI/CD parity proposal (Opus and Codex Sol designs, ruling FLOW-8).
