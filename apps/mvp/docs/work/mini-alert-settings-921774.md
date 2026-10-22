---
title: Preserve unsaved spend alert destinations during sync
status: done
area: app
owner: Codex mini alert settings agent
updated: 2026-10-21
links: [../features/spend-alerts.md]
---

Reproduce the supplied form-remount finding, fix it, and commit once on the
requested mini bookmark without pushing. Library catalog entries used:
`@smthrs/ui` for the existing form and `@smthrs/effect-tanstack-db` for real
collections and live queries in the component regression test. No new library.

Keep the form keyed by channel. Refresh the native field's default in place,
and its current value only when it still matches the previous default. Serialize
email lists with commas without spaces, matching the browser's email input.
This retains unsaved destinations and focus while untouched fields follow sync.
No persisted schema, action, flow, or telemetry contract changes.

The original email and Telegram regressions failed with the remote destinations
replacing the drafts; the existing spend suite passed all 13 tests. The key-only
shortcut passed those regressions but failed both untouched-field checks.
Astra review caught the multi-address email normalization mismatch; its retained
regression failed before comma-only serialization. Astra's follow-up found no
other actionable issue. A Fable review seat is unavailable in this session.

Validation (Node 26.5.0, in this clone):

- `pnpm install --frozen-lockfile --offline`: passed.
- `pnpm exec vitest run tests/AlertSettings.test.ts --coverage.enabled=false`:
  original code, 2 failed (draft loss) and 3 passed (untouched sync); final
  code, all 5 passed.
- `pnpm exec vitest run tests/AlertSettings.test.ts src/features/spend/spend.test.ts --coverage.enabled=false`:
  original spend suite 13 passed, both new draft regressions failed; final run
  18 passed. One intermediate run hit the existing refused-save timing assertion;
  subsequent full runs passed. Targeted runs disable aggregate coverage reporting;
  no coverage threshold changed.
- `pnpm exec tsc --noEmit` in `apps/mvp`: passed before and after.
- `pnpm exec smithers-build test '//apps/mvp:importRules'`: passed before and after.
- E2e: not run (mini clone).
