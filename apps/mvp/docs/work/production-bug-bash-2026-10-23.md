---
title: Production bug bash, October 23–24
status: in-progress
area: app
owner: Codex production bug bash
updated: 2026-10-23 13:27 PDT
links: [production-e2e.md, ../features/repo.md, ../rulings.md]
---

## Scope

Exercise smithers.sh as a real user for 24 hours, through October 24 at about 12:50 PDT. Cover public and signed-in journeys, then a real repository engineering workflow with stacked changes, review and landing under the product's human approval rules. Record deployed behavior separately from work Claude is still implementing.

## 2026-10-23, 12:55 PDT

- The landing page loaded in an isolated Chromium profile with no page errors. `/app` and `/app/` both reached the signed-out view; initial visible content took 5.35 s and 3.86 s respectively in fresh profiles. An earlier 3.5 s observation of a blank `/app` page was a premature check, not a confirmed persistent blank route.
- Public repository pages for `smithersai/vibelang` and `smithersai/tevm-monorepo` rendered only the repository shell and “Sign in to clone.” Their `/api/repos/<owner>/<name>/about` requests returned 503 twice. Direct `GET /api/repos/smithersai/vibelang/about` returned `{"code":"unavailable"}` with `Retry-After: 60` at 12:53 PDT.
- The existing `e2e/repo-browse.spec.ts` “first visit” test failed against `BASE_URL=https://smithers.sh` after 30 s: the About panel never appeared for `octocat/linguist`. A direct request to that repository's About endpoint also returned 503. The Playwright trace, video and browser log are in `apps/mvp/test-results/repo-browse-first-visit-a--75fee-DME-and-about-panel-at-once/` in the active checkout; a direct response sample is in `/tmp/smithers-bugbash-20261023/linguist-about.json`.
- The server returns a generic `unavailable`. In the checked-out source, `RepoApi.about` logs that code while `RepoAbout` drops the upstream stage and status; the deployed bundle must be checked before attributing its behavior to this source. `Retry-After: 60` suggests a rate limit but does not establish its source. Diagnose from production records and add safe stage/status diagnostics before choosing a fix. Do not log credentials or repository content.
- Signed-in engineering workflows required an authorized production Member test session. Will directed this bug bash to Arc; its existing GitHub session signed Smithers in as `roninjin10` at 13:10 PDT.

## 2026-10-23, 12:58 PDT

- The live browser bundle was `/assets/index-DbdQPSQg.js`. A fresh `smithersai/vibelang` visit again got one About 503, and after 10 s the page still showed an empty grey repository pane with no visible error. Screenshot: `/tmp/smithers-bugbash-20261023/vibelang-unavailable.png`.
- The failed E2E run's browser log shows a `repo/about` flow started and a signed-out `auth.run_credential` warning. It does not show that flow settling within the test's 30 s wait. The direct public About API also returned 503, so these observations do not yet isolate one root cause.
- From the landing page, “Get started for free” opened `/app`; “Sign in with GitHub” then reached GitHub's login page without browser errors. This checks the redirect only, not a completed sign-in.
- A read-only Alchemy logs query could not start because this Mac's default Alchemy profile has no Cloudflare provider. No production Worker logs were inspected; the API response and browser trace are the available receipts.

## 2026-10-23, 13:01 PDT

- At a 390 × 844 mobile viewport, the landing page and signed-out repository shell had no horizontal document overflow or browser errors. The app's signed-out top navigation clips “Conversations”: its left edge settles at x = −11.45 px at 390 px wide, −26.45 px at 375 px, and −81.45 px at 320 px (almost entirely offscreen); the page cannot scroll horizontally to reach it. At 430 px the link starts at x = 24 px. Screenshot: `/tmp/smithers-bugbash-20261023/mobile-app.png`. Retest after the ongoing mobile work deploys.
- The existing `e2e/home-effect.spec.ts` visitor journey passed against `BASE_URL=https://smithers.sh` (one test, 6.1 s): Effect's curated home, public blocks, and Code link rendered. This proves the public home path works while first-visit GitHub About reads fail.

## 2026-10-23, 13:05 PDT

- PWA offline reload passed in a fresh Chromium profile once `navigator.serviceWorker.ready` resolved. The service worker took 20.9 s from navigation to ready; after going offline, `/app/` reloaded and showed the signed-out view. A first probe timed out at 15 s and failed to reload offline because it had gone offline before installation; that probe is not a product failure.

## 2026-10-23, 13:07 PDT

- A signed-out visit to `/smithersai/vibelang/issues` remained at “Loading issues” after 35 s. The same state appeared for `/Effect-TS/effect/issues` and `/octocat/linguist/issues` after 15 s. A 90 s probe of `Effect-TS/effect/issues` also remained loading while Issues shapes (`items`, `comments`, `github-sync`) repeatedly returned 200. The visible 401s were for TODO feeds, not Issues feeds. `/smithersai/vibelang/stack` settled on “Sign in with GitHub.” The exact Issues failure is already owned in `multi-repository-issues-loading.md`; retest after its deployment.

## 2026-10-23, 13:13 PDT

- Switched live journeys to Arc at Will's direction. Screen was unlocked and a bounded `caffeinate` was active. Arc's `Canary William` profile completed GitHub OAuth in its own browser window and Smithers identified the signed-in account as `roninjin10`.
- Signed-in `smithersai/vibelang` Home and `tree/main` Code rendered. The signed-in Issues page still showed “Loading issues” and skeleton rows. Its repair is already in progress in another workstream.
- In the signed-in Stack, created a real TODO for the existing `smithersai/vibelang#1` docs search accessibility issue. The draft committed, briefly showed `Requested`, then became `T1` and `Working` with branch `smithers/t1-fix-docs-search-active-result-accessibil-ad313abc8224` and run `todo:58952106-9637-44cf-8777-495037822360`. The run card showed Begin done and Implement working. Prompt asks for a real keyboard regression and PR for human review; it explicitly forbids agent merge.
- While T1 was working, the app stayed usable. Arc opened `/app/`, loaded the prior chat timeline, and accepted a new “What is the current status of VibeLang TODO T1?” message with immediate “Smithers is answering” feedback. The model answer and T1 implementation outcome are pending.

## 2026-10-23, 13:16 PDT

- Chat answered the T1 question incorrectly: it said the TODO was still `requested` and “no attempt has started on this device.” At that time the T1 page and Cloud run card showed `Working`, `todo/Begin` done, and `todo/Implement` running for more than a minute. The answer's debug run is `/app/runs/644ed269-5653-42e2-8d07-49701e661098`.
- That chat run called `run/list/read` and then `run/inspect/read` twice. The visible run list contained the local `todo/commit` receipt and device runs but omitted the active Cloud `todo:58952106-9637-44cf-8777-495037822360` run. The inspected run shown in the card was `repo/about`. The source `run/list/read` reads the local `EngineStore.RunInspection` service. This strongly suggests the agent's run read did not include Cloud runs; the answer should have qualified its scope or followed the TODO's Cloud run link. Retain a real eval/regression and safe read diagnostics when repairing.
- `evmts/tevm` loaded its main branch Code view in Arc, but its Stack route rendered `Not found` for this account. That may reflect repository installation/access state; no mutation was attempted there and this is not classified as a product defect yet.

## 2026-10-23, 13:20 PDT

- The T1 branch's Code route first gave a truthful `Not cloned` state and a Clone button. Pressing Clone acknowledged immediately as `Requested`, then reported `Fetching 153.2 MB`; about 30 s later its branch file tree and `site` directory rendered. Notifications later showed `Clone · smithersai/vibelang` as done. This branch-browse and clone path passed.
- No Terminal control was exposed after the cloned branch tree settled, so the intended read-only terminal probe did not run; the transient `Terminal` text seen during initial loading was not a usable control. This is an untested capability, not a classified failure.
- Direct navigation to the existing VibeLang issue `/smithersai/vibelang/issues/1` also remained on `Loading`, consistent with the already-owned Issues repair.
- T1's Cloud run was still `Working` in `todo/Implement` after 6m 44s. The run card showed zero logs and no finer progress stage. Continue observing before classifying a stall; the card does not currently explain what work the agent is doing inside Implement.
- Arc's T1 page displayed three full model-spend notices plus a `+67` overflow marker above the branch content. The notification bell was usable and showed three unread items, including the completed clone and the completed chat answer. The lasting notices substantially push down repo content for this established account; evaluate against the minimal-text and toast behavior rules.

## 2026-10-23, 13:22 PDT

- Resized Arc so the actual page viewport was 390 CSS px, then restored the prior browser size. In the signed-in `/app/` view, the `Conversations` link's bounding box was x = −109.86 to −21.65 px, fully outside the viewport; `Flows` began at x = −9.65 px. `document.documentElement.scrollWidth` remained 390 px, so horizontal scrolling cannot reach either link. This is a stronger signed-in reproduction of the mobile navigation defect. Screenshot: `/tmp/smithers-bugbash-20261023/arc-mobile-signed-in.png`.

## 2026-10-23, 13:27 PDT

- T1's Cloud run settled after 9m 25s with result `{ "state": "failed" }`. `todo/Implement` finished after 9m 11s and reported no edits: the VibeLang issue #1 patch and real keyboard regression were already committed on the branch's base. `todo/Collect` failed with `TodoFailed`; Publish, Await and Settle then failed as dependencies, and `todo/Fail` returned failed. The run card's top status is `Done` despite the failed product result. The T1 detail still displayed `Working` about 10 seconds after the run settled; retest after sync before classifying a persistent stale state.
- Read-only source inspection shows the exact no-change path in `worker/flows/Todo.ts`: Collect emits `empty_change`, and Fail reports a failed TODO through `Stack.report`. The run card hides that code behind the generic `TodoFailed` tag; the actionable reason is only inferable by combining the agent's summary with source. Improve the safe failure reason shown to the person and record the stage and outcome without credentials or content.
- Used Arc on `vibelang.sh/001-onboarding` to check the original issue. Search for `scope` now sets a unique listbox ID and `aria-activedescendant`; advancing to result 3 linked the focused combobox to an existing selected option. A no-match query removed the active descendant and options. The GitHub issue's prior comment says the patch landed on main as `e680bb7` but was left open pending production deployment; this Arc check is production acceptance for the tested desktop semantics. No physical screen-reader test was run. The TODO's duplicate work arose from the stale open issue, not a missing code change.
- Arc then locked. `CGSSessionScreenIsLocked` returned 1; browser control stopped, and this bug bash's bounded `caffeinate` was ended. Resume Arc only after it is unlocked by the user.
