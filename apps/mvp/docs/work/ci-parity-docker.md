---
title: CI parity: Docker, testcontainers and service containers in a job
status: idea
area: sdk
owner: none
updated: 2026-10-20 22:50 PDT
links: [../proposals/ci-cd-parity.md, ../decisions/0005-sandboxes-secrets-and-the-forge.md, sandboxes.md]
---

## What

Run a Docker daemon in a job, so testcontainers and service containers work.

## Why

Effect's three test jobs run integration tests with testcontainers (Postgres, MySQL, MSSQL, Redis, Vitess, libsql, CoreDNS; `check.yml:145-154`), and `cluster.yml` needs them too. Smithers' tests use Docker's containerd image store (`ci.yml:35-47`). Cloudflare containers run Docker only with host networking and no iptables (0005 lines 49-53), and testcontainers maps ports. Until this lands, Effect's ported test jobs run without integration tests and check less than today's required `Test (Node)` and `Test (Bun)`.

## Repositories

Effect, Smithers.

## Smallest slice

Run 0005's S0 measurement: `dockerd --iptables=false` in a `JobSandbox`, and testcontainers with host networking. If that fails, a VM provider with Docker behind `CiJob`.

## Disposition

Ticket only (Will, FLOW-8: advanced features are ticketed, not built now). Matrix row 44. Design: [the CI/CD parity proposal](../proposals/ci-cd-parity.md).

## History

2026-10-20 22:50 PDT: written by the Claude Opus merger from the merged CI/CD parity proposal (Opus and Codex Sol designs, ruling FLOW-8).
