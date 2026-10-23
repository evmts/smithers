---
title: Production bug bash, October 23–24
status: in-progress
area: app
owner: Codex production bug bash
updated: 2026-10-23 12:55 PDT
links: [production-e2e.md, ../features/repo.md, ../rulings.md]
---

## Scope

Exercise smithers.sh as a real user for 24 hours, through October 24 at about 12:50 PDT. Cover public and signed-in journeys, then a real repository engineering workflow with stacked changes, review and landing under the product's human approval rules. Record deployed behavior separately from work Claude is still implementing.

## 2026-10-23, 12:55 PDT

- The landing page loaded in an isolated Chromium profile with no page errors. `/app` and `/app/` both reached the signed-out view; initial visible content took 5.35 s and 3.86 s respectively in fresh profiles. An earlier 3.5 s observation of a blank `/app` page was a premature check, not a confirmed persistent blank route.
- Public repository pages for `smithersai/vibelang` and `smithersai/tevm-monorepo` rendered only the repository shell and “Sign in to clone.” Their `/api/repos/<owner>/<name>/about` requests returned 503 twice. Direct `GET /api/repos/smithersai/vibelang/about` returned `{"code":"unavailable"}` with `Retry-After: 60` at 12:53 PDT.
- The existing `e2e/repo-browse.spec.ts` “first visit” test failed against `BASE_URL=https://smithers.sh` after 30 s: the About panel never appeared for `octocat/linguist`. A direct request to that repository's About endpoint also returned 503. The Playwright trace, video and browser log are in `apps/mvp/test-results/repo-browse-first-visit-a--75fee-DME-and-about-panel-at-once/` in the active checkout; a direct response sample is in `/tmp/smithers-bugbash-20261023/linguist-about.json`.
- The server returns a generic `unavailable`. `RepoApi.about` logs that code, while `RepoAbout` drops the upstream stage and status; `Retry-After: 60` suggests a rate limit but does not establish its source. Diagnose from production records and add safe stage/status diagnostics before choosing a fix. Do not log credentials or repository content.
- Signed-in engineering workflows await an authorized production Member test session. Asked Will where the existing test session can be accessed; public paths continue in the meantime.
