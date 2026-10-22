---
title: Notification response and access validation
status: done
area: notifications
owner: codex-rework-07c9441b
updated: 2026-10-21
links: []
---

Rework delivery-evidence and notice-access validation while preserving legacy unscoped launcher delivery and a single refused-provider receipt. Provider reasons are selected from exact known diagnostics; arbitrary provider text is never retained.

Library catalog: sending short messages and routing per-person notices (`Channels.layer`, `Inbox.route`, `Inbox.ack`). No new library.

Latitude validation (`LAT_RUN_REUSE_DEPS=1`):
- `packages/smithers/notifications`: `pnpm exec vitest run` — 291 tests, 16 files, 100% reported coverage.
- `packages/smithers/notifications`: `pnpm exec tsc -p tsconfig.test.json --noEmit` — passed.
- `apps/mvp`: `pnpm exec vitest run worker/Notifications.test.ts worker/flows/SpendAlert.test.ts --coverage.enabled=false` — 39 tests passed, including both bounced regressions and the single provider request assertion.
- `apps/mvp`: `pnpm run typecheck` — passed (app, worker, infrastructure, evals).
- Workspace: `pnpm exec smithers-build test //packages/smithers/notifications:importRules` — passed.

The current worker already filters existing recipients by access. Its shared access predicate now permits only the launcher for legacy unscoped runs; scoped runs still check current branch access. The original provider diagnostic containment is retained using exact allowlisted values, including the existing Telegram destination refusal, with no change to durable retry classification.
