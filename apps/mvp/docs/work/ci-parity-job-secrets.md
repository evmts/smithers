---
title: CI parity: secrets in job sandboxes
status: todo
area: sdk
owner: none
updated: 2026-10-20 22:50 PDT
links: [../proposals/ci-cd-parity.md, ../features/secrets.md, secrets-proxy.md, ../decisions/0005-sandboxes-secrets-and-the-forge.md]
---

## What

Turn on the secrets egress for sandboxes and allow the hosts CI needs, so a job uses `NPM_TOKEN`, cache tokens, deploy tokens and webhook secrets without ever holding a value.

## Why

Every repository's jobs use secrets: Smithers' `SMITHERS_CACHE_URL`, `SMITHERS_CACHE_READ_TOKEN`, `NPM_TOKEN` and `CLOUDFLARE_API_TOKEN`; Tevm's `TEVM_RPC_URLS_*` and `TEVM_TEST_ALCHEMY_KEY`; Effect's bot, dispatch and webhook secrets. The egress exists, but it stays off until an e2e proves a box gets a bound host's answer and never sees the value ([secrets](../features/secrets.md) line 51; `worker/BranchSandboxes.ts:51-56`). Deploys (wrangler, Alchemy), mirror pushes and outgoing webhooks carry their credential in a request header, so the egress covers them too.

## Repositories

Smithers, Tevm, Effect.

## Smallest slice

An e2e in which a box calls a bound host with a placeholder: the host receives the value, and the box, its logs, the journal and telemetry never contain it. Then set `SANDBOX_SECRETS=true` and add `registry.npmjs.org`, `build.smithers.sh` and the toolchain download hosts (nodejs.org, GitHub release downloads, static.rust-lang.org, go.dev, apt.postgresql.org) to `EGRESS_ALLOW_HOSTS`.

## Disposition

Build now, 1 of 18. Matrix rows 23, 26 and 34. Design: [the CI/CD parity proposal](../proposals/ci-cd-parity.md).

## History

2026-10-20 22:50 PDT: written by the Claude Opus merger from the merged CI/CD parity proposal (Opus and Codex Sol designs, ruling FLOW-8).
