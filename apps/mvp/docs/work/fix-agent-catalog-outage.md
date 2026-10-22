---
title: Preserve chat during saved-flow catalog outages
status: done
area: agent
owner: codex-fix-agent-033459
updated: 2026-10-21
links: []
---
Regression and repair for catalog outages discarding successful memory recall.
Uses the library catalog memory opening entry (`@smthrs/memory`); no new library.

Regression failed with OpeningFailed before the fix. Catalog outages now retain
recalled memory; refusals still fail closed. Warning and counter verified.
Latitude: pnpm test src/features/agent --coverage.enabled=false: baseline 64
passed; fixed 65 passed. Memory baseline 4 passed; regression before fix 1 failed.
Mac mini: pnpm e2e agent.spec.ts: 1 passed, 3 failed (answer, agent theme,
killed tab). Original-code browser comparison cancelled after ten minutes
waiting for the shared runner. Browser regression status remains unverified.
