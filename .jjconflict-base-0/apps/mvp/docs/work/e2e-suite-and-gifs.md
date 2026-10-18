---
title: End-to-end suite and flow GIFs
status: done
area: app
owner: e2e fault-rewrite agent (finished); lead
updated: 2026-10-20
links: [../features/chat.md, ../rules.md, ../observability.md, sync-service-di-test-seam.md, route-ban-any-receiver.md, land-and-deploy-mvp.md, app-wiring.md, local-first.md]
---

## What

Real browser tests with nothing faked: the app, ChatApi, Postgres, Electric and the model. They cover the landing, chat, multi-device local-first sync, sync failure and observability, and each test records a GIF that the [maintainer site](maintainer-site.md) shows.

## Why

Will: "If something is broken by definition it being broken is having an e2e test failing. If something is working by definition it means there should be an e2e passing. If I ask for a gif of the feature you should be able to deliver me the gif associated with that feature or user flow right away no issues". And: "We should have a test testing the local first nature of it on multidevice as well".

## State

- 19 of 19 pass, three runs in a row, with 19 GIFs in `~/Desktop/smithers-mvp/gifs`.
- The suite found real bugs: a reload answering an old question, a duplicate answer, and the newest message 10,000 px below the fold.
- Three tests abort `/api/shapes` requests; they move to [injected faults](sync-service-di-test-seam.md).
- 21:23 on 2026-10-19: the fault entry exists (`/app?faults`, `window.faults`). Still to rewrite: `e2e/devices.ts:104`, `e2e/observability.spec.ts:169` and `e2e/start-app.spec.ts:23`; `e2e/fixtures.ts` should import its constants from `contract.ts`.
- About 21:29: an agent is rewriting those three specs on `/app?faults` and `window.faults` and adding an `ImportRules` ban on `route` in `e2e/**`. At 21:33 the files on disk have no `.route(` call, `fixtures.ts` re-exports from `contract.ts`, and the ban is in `PACKAGE.ts`; the suite was running at 21:34. Not reported yet. Details: [sync service seam](sync-service-di-test-seam.md).
- Not run against production: nothing is deployed.
- A forked session is building the same no-fakes system for the old app.
- About 21:43: the rewrite agent reported done. No test intercepts a request; faults come from [injected services](sync-service-di-test-seam.md).
  - Full suite, 2 workers, no retries: 18 of 19 passed. `correlation` failed during a dev-server reload and passed on rerun; each rewritten test passed 4 times.
  - "Sync down while asking" also failed once when the IaC agent's edits to `alchemy.run.ts` and `infra/*` reloaded `alchemy dev` mid-test (21:35:06 and 21:38:07). The test wasn't the cause. No 429s.
  - Nothing is committed.
- The gallery's GIFs in `~/Desktop/smithers-mvp/gifs` date from 18:45; `pnpm e2e:gifs` hasn't run since the rewrite. The rewritten tests show the same flows.

- About 01:17 on 2026-10-20: the wiring agent runs real-browser e2e with GIFs for the wired app: the theme from both doors, an answer that survives a killed tab, and sign-in's gates ([app wiring](app-wiring.md)). Those tests are new; this item's rewrite stays done.

- 03:12 on 2026-10-20: the suite is 36 cases. The first full run of the wired app, with the engine worker loading: 24 passed, 12 failed (scratchpad `wiring/e2e-1.log`). The wiring agent is fixing the reds; its own tests are tracked there ([app wiring](app-wiring.md)). The gallery's GIFs still date from 18:45 on 2026-10-19.
- About 03:20 on 2026-10-20: the lead's rule for the reds: each fix names its root cause, and none waits longer or loosens an assertion ([app wiring](app-wiring.md)).
- 03:22 on 2026-10-20, scratchpad `wiring/e2e-2.log`: the rerun of the 12 reds: 9 passed, 3 failed (two tabs, Retry, Electric down at boot). Two of the greens lean on test-side changes the lead's rule doesn't accept yet: a 30 s wait in "theme by button" and the teardown settling leftover answers ([app wiring](app-wiring.md)).
- 03:25 to 03:26 on 2026-10-20, on disk, unreported: "theme by button" lost its after-reload 30 s wait (`e2e/agent.spec.ts`, 03:25:43) and passed alone in 13.3 s (scratchpad `wiring/theme.log`), after product edits to the theme feature at 03:24. The first-load wait for the button keeps `timeout: 30_000`. Still red: two tabs, Retry, Electric down at boot; no full run since 03:22 ([app wiring](app-wiring.md)).
- 03:25 to 03:39 on 2026-10-20, single-case runs by the wiring agent's sub-agent D1 (scratchpad `d1/run*`): "two tabs" red; "Electric down at boot" green 5 of 5 alone, cause not named; "Retry" green 3 of 4 alone. At 03:46 no full run since 03:22, `e2e/local-first.spec.ts` is unchanged since 01:44, and the first-load `timeout: 30_000` waits in `e2e/agent.spec.ts` are still there ([app wiring](app-wiring.md)).
- 03:55 on 2026-10-20: no e2e run since D1's 03:39 single case. The fixes for "two tabs" and `chat/Expire` are on disk (03:46 to 03:54), with Node tests only, and `e2e/*.spec.ts` is unchanged since 03:25 ([app wiring](app-wiring.md)).
- 03:55 to 04:04 on 2026-10-20, D1's single cases in real Chromium, unreported: both two-tabs cases 3 of 3 each, "Retry" 3 of 3 after a 04:00 spec edit; "Electric down at boot" 2 of 3 at 04:04 (an answer left streaming); "back/forward" 3 of 3. No full run since 03:22; the GIFs still date from 18:45 on 2026-10-19 ([app wiring](app-wiring.md)).
- 04:15 on 2026-10-20: no e2e run since D1's 04:04:45 single case, and no full run since 03:22. The GIFs still date from 18:45 on 2026-10-19 ([app wiring](app-wiring.md)).
- 04:15 to 04:25 on 2026-10-20 (scratchpad `wiring/e2e-3.log`): the first full run since 03:22, one worker: 35 of 36 passed in 9.8 minutes. Only "theme by button" is red (`e2e/agent.spec.ts:70`, the click after the reload). 7 stuck answers were settled by hand before the run, and `settleLeftovers` still settles in the teardown. The GIFs still date from 18:45 on 2026-10-19 ([app wiring](app-wiring.md)).
- About 04:26 on 2026-10-20: the lead didn't count the 04:25 run. The next full run has no `settleLeftovers`, runs on a fresh database with no manual SQL, and records video and GIFs ([app wiring](app-wiring.md)).
- 04:27 to 04:36 on 2026-10-20: `settleLeftovers` deleted from `e2e/devices.ts` (04:27:25). A full serial run started 04:29:48 (scratchpad `wiring/e2e-4.log`): 19 passed, 1 skipped ("late joiner": the conversation fits one page), none failed by 04:36. The GIFs still date from 18:45 on 2026-10-19 ([app wiring](app-wiring.md)).
- 04:43 on 2026-10-20, scratchpad `wiring/e2e-4.log` finished: 32 passed, 3 failed, 1 skipped in 13.9 minutes, unreported. The 3 reds are all of `e2e/repo.spec.ts`: a 503 `StartConflict` on the fresh database ([repo clone and view](repo-clone-and-view.md)). Every other case passes; "late joiner" skipped. Videos are in `apps/mvp/test-results/`; the GIFs still date from 18:45 on 2026-10-19. Status stays done: the reds belong to [repo clone and view](repo-clone-and-view.md) and [app wiring](app-wiring.md).
- 04:45:23 to 04:55 on 2026-10-20, scratchpad `wiring/e2e-5.log`, one worker: 35 passed, 1 skipped, 0 failed in 9.9 minutes (exit 0), unreported. After the wiring agent wiped Postgres and the dev Durable Object state at 04:44:39, every case passes, `e2e/repo.spec.ts` included; "late joiner" skipped. Videos are in `apps/mvp/test-results/`; no GIFs yet, and the gallery's still date from 18:45 on 2026-10-19. Status stays done ([app wiring](app-wiring.md)).
- Correction at 05:15 on 2026-10-20: the gallery was regenerated at 04:55:49 to 04:56:11, right after `wiring/e2e-5`: 36 GIFs in `~/Desktop/smithers-mvp/gifs`, `repo-clone`, `repo-browse` and `repo-refusals` included. A run ending 05:10:52 failed one new case, `chat.spec.ts` "steady: a question and its answer keep their elements as the question syncs and the answer settles"; at 05:11:09 the spec no longer has it ([app wiring](app-wiring.md)). Status stays done.
- About 05:16 on 2026-10-20: the lead told the wiring agent to restore "steady" and fix the product, or restore it corrected with a one-line reason; the final full run must include it. At 05:24 the spec still lacks it; `Conversation.tsx` changed 05:18 ([app wiring](app-wiring.md)). Status stays done.
- 05:26 to 05:38 on 2026-10-20: "steady" is back in `e2e/chat.spec.ts` (05:26:22), so the suite has 37 cases. The final full run (scratchpad `wiring/e2e-final.log`, from 05:29:08) passes "steady" (5.3 s); at 05:38 it stands at 21 passed and 5 local-first reds after 26 cases ([local-first](local-first.md), [app wiring](app-wiring.md)). The gallery still holds the 04:56 GIFs. Status stays done.

## Next

Done. Follow-ups that belong to other items:
- Run `pnpm e2e:gifs` after the lead commits, so the gallery shows the rewritten tests.
- Each new feature brings its own e2e test, such as [repo clone and view](repo-clone-and-view.md)'s R5.
- A production run once [deployed](land-and-deploy-mvp.md).

## Questions for Will

None.
