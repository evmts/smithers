---
title: Refuse web pages with an invalid application origin
status: done
area: web
owner: codex-fix-web-088413
updated: 2026-10-21
links: []
---

The shared URL policy must refuse pages when the application origin cannot identify its host and site. Regression coverage exercises same-host, same-site and unrelated pages with malformed and opaque origins, in both modes.

Validation on Latitude:
- Baseline: `pnpm test src/features/web worker/Views.test.ts worker/WebPreview.test.ts --coverage.enabled=false`: 47 passed.
- Regression before fix: `pnpm test src/features/web/url.test.ts --coverage.enabled=false`: 1 failed, 9 passed; an empty application origin allowed the app's own host.
- After fix: the same affected suite: 47 passed, no new failures.
- `pnpm exec smithers-build test //apps/mvp:importRules`: passed.

No new library or action was introduced. Existing callers retain their refusal logging and metrics; the pure URL policy now returns the existing `invalid` reason when it cannot enforce host and site checks.

Browser validation: `mini-run apps/mvp -- pnpm e2e web-page.spec.ts` was cancelled while queued for shared execution capacity; Playwright did not start.
