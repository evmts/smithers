---
title: Production bug bash, October 23–24
status: in-progress
area: app
owner: Codex production bug bash
updated: 2026-10-23 12:58 PDT
links: [production-e2e.md, ../features/repo.md, ../rulings.md]
---

## Scope

Exercise smithers.sh as a real user for 24 hours, through October 24 at about 12:50 PDT. Cover public and signed-in journeys, then a real repository engineering workflow with stacked changes, review and landing under the product's human approval rules. Record deployed behavior separately from work Claude is still implementing.

## 2026-10-23, 12:55 PDT

- The landing page loaded in an isolated Chromium profile with no page errors. `/app` and `/app/` both reached the signed-out view; initial visible content took 5.35 s and 3.86 s respectively in fresh profiles. An earlier 3.5 s observation of a blank `/app` page was a premature check, not a confirmed persistent blank route.
- Public repository pages for `smithersai/vibelang` and `smithersai/tevm-monorepo` rendered only the repository shell and “Sign in to clone.” Their `/api/repos/<owner>/<name>/about` requests returned 503 twice. Direct `GET /api/repos/smithersai/vibelang/about` returned `{"code":"unavailable"}` with `Retry-After: 60` at 12:53 PDT.
- The existing `e2e/repo-browse.spec.ts` “first visit” test failed against `BASE_URL=https://smithers.sh` after 30 s: the About panel never appeared for `octocat/linguist`. A direct request to that repository's About endpoint also returned 503. The Playwright trace, video and browser log are in `apps/mvp/test-results/repo-browse-first-visit-a--75fee-DME-and-about-panel-at-once/` in the active checkout; a direct response sample is in `/tmp/smithers-bugbash-20261023/linguist-about.json`.
- The server returns a generic `unavailable`. In the checked-out source, `RepoApi.about` logs that code while `RepoAbout` drops the upstream stage and status; the deployed bundle must be checked before attributing its behavior to this source. `Retry-After: 60` suggests a rate limit but does not establish its source. Diagnose from production records and add safe stage/status diagnostics before choosing a fix. Do not log credentials or repository content.
- Signed-in engineering workflows await an authorized production Member test session. Asked Will where the existing test session can be accessed; public paths continue in the meantime.

## 2026-10-23, 12:58 PDT

- The live browser bundle was `/assets/index-DbdQPSQg.js`. A fresh `smithersai/vibelang` visit again got one About 503, and after 10 s the page still showed an empty grey repository pane with no visible error. Screenshot: `/tmp/smithers-bugbash-20261023/vibelang-unavailable.png`.
- The failed E2E run's browser log shows a `repo/about` flow started and a signed-out `auth.run_credential` warning. It does not show that flow settling within the test's 30 s wait. The direct public About API also returned 503, so these observations do not yet isolate one root cause.
- From the landing page, “Get started for free” opened `/app`; “Sign in with GitHub” then reached GitHub's login page without browser errors. This checks the redirect only, not a completed sign-in.
- A read-only Alchemy logs query could not start because this Mac's default Alchemy profile has no Cloudflare provider. No production Worker logs were inspected; the API response and browser trace are the available receipts.
