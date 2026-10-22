---
title: Issue credential regressions
status: done
area: issues
owner: codex-rework-2c53e7d3
updated: 2026-10-21
links: []
---

Rework 2c53e7d3fb0c. Catalog entries: Effect HttpClient and
@smthrs/effect-tanstack-db collections and outbox. Validate restored writes,
retain failed persistence for retry, and require a credential separator.
Issues reject malformed credentials with 400 locally; shared renewal retains
403 forbidden for unrenewable credentials.

Latitude validation:
- `pnpm exec vitest run src/flows/bearer.test.ts src/features/issues src/features/runs/api.test.ts src/device/upgrade.test.ts --coverage.enabled=false --silent`: 95 passed, including both bounced regressions.
- `pnpm exec vitest run src/features/issues/api.test.ts src/features/issues/writes.test.ts --coverage.enabled=false --silent`: final 21 passed.
- `pnpm typecheck`: passed (all four app configurations).
- `pnpm exec smithers-build test '//apps/mvp:importRules'`: passed.

An earlier expanded run also checked `src/device/schemas.test.ts`: three failures
report lock mismatches for homes v2 and curated-homes v1; this change edits no
stored schemas or registry. Its upgrade failure was fixed and the full upgrade
file subsequently passed. Coverage thresholds were not run.
