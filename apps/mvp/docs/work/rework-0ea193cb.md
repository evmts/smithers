---
title: Rework worker identity and alert links
status: done
area: worker
owner: codex
updated: 2026-10-21
links: []
---

Reapply 0ea193cb82d2 on current main. Execution IDs reach Durable Object getByName unchanged; opaque IDs are case sensitive. UUID IDs retain Postgres case equivalence. Replace the contradictory Actor test. Use existing Effect and notifications catalog entries, with no new dependencies.

Latitude regression receipt: temporarily restoring the original boundTo comparison makes `pnpm vitest run worker/Actor.test.ts --coverage.enabled=false` fail the opaque-ID case (1 failed, 6 passed). Restoring the fix then passes `pnpm vitest run worker/Actor.test.ts worker/branch/SandboxCalls.test.ts worker/PersonOnly.test.ts src/flows/registry.test.ts src/features/spend/spend.test.ts --coverage.enabled=false`: 5 files, 65 tests. No fixed sleeps added.

`pnpm vitest run worker/Actor.test.ts worker/AlertChannels.test.ts worker/RunCredentials.test.ts worker/Answers.test.ts worker/Runs.test.ts --coverage.enabled=false`: 5 files, 97 tests passed on Latitude. `pnpm exec smithers-build test //apps/mvp:importRules` passed on Latitude: 1 target ran, 0 failed. Coverage thresholds remain unchanged; these focused runs disable coverage and make no package-wide coverage claim.
