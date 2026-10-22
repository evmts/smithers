---
title: Toast layout and stale sandbox work
status: blocked
area: notifications
owner: Codex Sol toast-overlap
updated: 2026-10-22
links: [../decisions/0009-notifications-and-live-work.md, ../decisions/0034-toasts-reserve-page-space.md]
---

Implemented page notices in document flow with the existing three-card cap. Terminal engine cancellation closes an answer through durable settlement, including Stop after reload. Terminal answers repair notices whose run metadata disappeared; existing expiry handles missing answer records. Repair preserves recipients and rechecks branch access. No product copy was added.

Real Postgres and engine regressions failed before the fixes: missing metadata retained Working/version 1 after done or failed; Stop left an unobserved answer streaming; missing-answer expiry retained its Working notice. Revoked recipients remain unchanged. Delayed engine cleanup and one unavailable answer write prove settlement waits and retries, while a successful answer remains successful. These production-like fixtures explain the failure mechanisms; the original production account's exact sequence is unverified.

Validation receipts (2026-10-22):

- `pnpm --dir apps/mvp typecheck`: passed all four projects. `pnpm exec smithers-build test '//apps/mvp:importRules'`: passed.
- The six focused suites (notifications, expiry, run acts, chat terminal classifier, page placement) passed 73/73. Broader run suites passed 164/165; the untouched remote live-watch test observed one extra read. Chat passed 63/65, then all three targeted engine-failure/changed-plan cases passed on retry. Both added chat cancellation cases passed.
- The last complete five-module coverage report recorded 418/418 lines and all functions, with 99.59% statements and 98.68% branches. The remaining statement gaps were unchanged child-revision fallback paths. The unused new retry-error fallback was removed. No threshold or exclusion was changed. The final coverage rerun was interrupted by the mini's full disk and Docker outage, so the full coverage gate is unfinished.
- `pnpm --dir apps/mvp e2e e2e/toast-overlap.spec.ts` against this clone's local Alchemy/Postgres/Electric stack: 3/3 passed. Desktop Save, phone lower-left code click, and Stop-after-reload each failed with the old implementation. The farm was busy. Three exported GIFs passed the media checks; local artifact paths are in the delivery report.
- Codex Astra final review: no actionable findings. Fable review could not start: every account failed or was cooling. Production was not changed; delivery is local-only as the builder brief requires.

Blocked on a healthy mini stack for the final complete coverage run and available Fable review capacity. Do not treat the coverage gate as passed. Existing retained logs distinguish old-build failures, successful focused runs, and the infrastructure-interrupted reruns.
