---
title: End-to-end suite and flow GIFs
status: in-progress
area: app
owner: recording pipeline builder and feature builders
updated: 2026-10-21 09:24 PDT
links: [../features/chat.md, ../rules.md, ../observability.md, sync-service-di-test-seam.md, route-ban-any-receiver.md, land-and-deploy-mvp.md, app-wiring.md, local-first.md, slash-commands.md, navigate-flow.md, web-page-flow.md, agent-jev.md, ../rulings.md, chaptered-review-videos.md, device-data-migrations.md]
---

## Tracker reconciliation — 2026-10-21 09:24 PDT

**What:** Maintain a feature-by-feature end-to-end evidence matrix with usable recordings.

**Why:** Will asks which major features actually fail and wants all of them derisked.

**Current state:** At 09:22 PDT the lead reports a Codex Sol sweep of all 37 specs against one fixed main revision on the Mac mini. No completed matrix is reported. Production has no end-to-end test coverage yet; historical local suite passes do not prove hosted behavior.

**Next step:** Collect the sweep revision and per-feature pass/fail/flaky/needs-live results, distinguish environment failures and untested features, then add and run production proofs with GIFs. The brief requires a retry of each failure and forbids counting closed-port model/live-service requirements as product failures. Route confirmed gaps into the four-model/Opus repair effort.

**Open questions for Will:** None. The provider preference and investigation/implementation direction are explicit; engineering validation remains with the builders.

Evidence: session 6253ecf2, script-filtered user text and lead replies in the last approximately two hours through 09:23:49 PDT; automated notifications, compacted summaries and tool results excluded. Rulings (including ARCH-14), Will’s queue answers, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules were reconciled. Product results are lead-reported; this tracker verifies the site build only. Existing feature execution ownership is retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 00:44 PDT

**What:** Maintain passing, chaptered recordings for actual feature behavior.

**Why:** Will reviews product quality after tests establish functionality.

**Current state:** At 00:32 the lead reports 82 passing chaptered walkthroughs, including all 17 local-first and all 4 agent walkthroughs. That recording snapshot does not override the later 00:41 conflict-suite failures. Issue triage remains unrecordable without the scratch-account permission. Clone state and bell overlap are being fixed before landing.

**Next step:** Refresh affected recordings after fixes and deployment; retain real-model conflict failures. Fix the status bell locator, navigate header locator and long-conversation late-joiner fixture after landing.

**Open questions for Will:** Grant codeplanesmithers Maintain on roninjin10/smithers-github-tests for issue-triage recording; this remains person-owned.

Evidence: script-filtered user-typed text and lead text replies from session 6253ecf2, approximately 22:44–00:44 PDT; rulings, queue answers through 00:17:42 PDT, current decisions, proposals, TODOs, rules and shared briefs/designs. Automated notifications and teammate messages are excluded as human evidence. Product checks are lead-reported receipts; this tracker validates the site build only. Existing execution owners and all history are retained.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 20:14 PDT

**What:** Keep real local/live browser journeys and review recordings current.

**Why:** Working behavior and readable review evidence need separate receipts.

**Current state:** At 19:56 the lead reports the shared helper complete and the full rerecord underway. At 20:10 the lead names issues, navigate, chat shortcut and web-page replacement recordings in progress. No full rerecord or production-suite completion is reported.

**Next step:** Finish passing replacements with full-window capture, title cards, chapters, scripts and deterministic theme coverage; publish each only after its product changes pass. Add the old-build device migration journey before the next deploy.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and assistant replies in session 6253ecf2, 18:15–20:14 PDT on 2026-10-20; queue answers through 19:38 PDT; current rulings, decisions 0001–0020, proposals, TODOs, rules and shared briefs/designs. Later Will text and queue answers prevail. Product checks are reported receipts; this tracker validates the site build. Execution ownership is retained.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 17:44 PDT

**What:** Keep real local/live journeys and usable review recordings current.

**Why:** A passing test and a comprehensible walkthrough establish different evidence.

**Current state:** At 17:28 the lead reported every recording passing, including clone by agent. Subsequent Will feedback rejects branch/TODO clarity and identifies old sign-in/status media. The earlier four failures are superseded by passing reports, not by universal review approval.

**Next step:** Complete chaptered replacements, rerun changed UI journeys and execute live checks after deployment; keep failures out of the review queue.

**Open questions for Will:** None for this update.

Evidence: queue answers through 2026-10-21 00:42:06 UTC and script-filtered human text/lead replies from 22:43–00:43 UTC; current rulings and decision 0017 supersede historical briefs. Product checks are reported evidence; this tracker validates the site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 16:24 PDT

**What:** Run real browser journeys locally and live, retaining passing chaptered MP4s and GIF previews.

**Why:** TEST-1–7 and Will’s queue feedback require working behavior and usable review evidence.

**Current state:** The dev stack recovered at 15:17 PDT. At 16:02 the lead reported four failing browser tests: branch views, both flows tests and clone by the agent. At 16:03 failing-run media was removed from the queue; flows and branch-workspace verification stays withdrawn. Message controls and repository home retain passing recordings. At 16:08 a passing two-device issues recording joined the queue. Around 55 older GIFs still need replacement; mini test-farm setup has no completion receipt. These later receipts supersede the outage and chapterless-first-video state below.

**Next step:** Fix the four product failures and retain passing chaptered recordings; re-record older media once independent mini runs are proven. Do not present failing-run media for verification.

**Open questions for Will:** None; Will reviews the passing replacements.

Evidence: lead text replies extracted by script from session 6253ecf2, latest two hours through 23:23:40 UTC; current rulings and queue answers govern. Shared briefs/designs, decisions, proposals, TODOs and rules were consulted. Reported product receipts only; this tracker ran no product tests.

## Prior tracker record (retained)


## Current specification — 2026-10-20, 15:14 PDT

**What:** Real local/live browser tests with reliable chaptered videos and GIF previews.

**Why:** TEST-1 to TEST-7 require real behavior; Will needs usable recordings to review it.

**Current state:** At 15:12 PDT the first feature video is reported in the queue, covering issue access and triage, but without chapters. The lead requested chapters for every recording. Shared dev recovery still lacks a completion receipt; branch, flows, clone and home re-recordings remain outstanding.

**Next step:** Add named chapters, verify recording health and rerun blocked journeys after stack recovery. Preserve rejected recordings’ review history.

**Open questions for Will:** None.

Evidence: lead text replies through 2026-10-20 22:13:56 UTC (15:13:56 PDT), extracted from session `6253ecf2`; [rulings](../rulings.md), queue answers through 21:36 UTC, decisions, proposals, todo and rules. Reported receipts are not fresh test execution by this tracker.

## Earlier tracker history


## Current specification — 2026-10-20, 14:55 PDT

**What:** Produce trustworthy real browser evidence and usable walkthroughs.

**Why:** Will rejected blank/glitching GIFs and requested a timeline.

**Current state:** Earlier suite/GIF completion is historical. At 14:29 the lead assigned shared recording fixes; at 14:36 the pipeline moved toward fixed-size MP4s with named chapters and GIF health checks. Queue playback is live; feature re-recordings remain outstanding.

**Next step:** Run the recovered local stack and regenerate branch, flows, clone and home evidence; reject blank/frozen/glitched output.

**Open questions for Will:** None; the lead can settle implementation details.

Evidence: Will's typed messages and the lead's text updates in session `6253ecf2`, 12:54–14:55 PDT; [rulings](../rulings.md); queue answers through 14:36 PDT. These are reported receipts, not a new verification run by the tracker.

## Earlier tracker history

Previous owner record: e2e fault-rewrite agent (finished); lead


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
- **05:53:06 on 2026-10-20, `wiring/e2e-fresh.log` finished green:** 36 passed, 1 skipped ("late joiner"), 0 failed in 12.4 minutes, one worker, on a fresh database and fresh Durable Object state with no hand fixes and no cleanup step ([app wiring](app-wiring.md)). 05:53:20: `pnpm e2e:gifs` regenerated the gallery, 37 GIFs in `~/Desktop/smithers-mvp/gifs`, `chat-steady` included. The wiring agent reported at 05:54:14. Status stays done.
- 05:53 on 2026-10-20: a new spec is coming, `e2e/slash-commands.spec.ts` with its GIF ([slash commands](slash-commands.md)).
- By 07:20 on 2026-10-20, 11 new GIFs in `~/Desktop/smithers-mvp/gifs` since the 05:53 run: [navigate](navigate-flow.md) 2 (06:37), [slash commands](slash-commands.md) 3 (07:05), [web page](web-page-flow.md) 5 (07:11 to 07:12) and [Jev](agent-jev.md) 1 (07:11).
- 07:22 on 2026-10-20: a 12th, `navigate-navigate-by-a-person.gif`. From 07:44 to 07:49 three features reported done with their specs green: [navigate](navigate-flow.md) 3 of 3, the [web page flow](web-page-flow.md) 5 of 5 (its embed case failed once while other agents' edits reloaded the dev server, then passed) and [Jev](agent-jev.md) 1 of 1, with one judge call. No full-suite run since the 05:53 one is on record. Status stays done.

## Next

Done. Follow-ups that belong to other items:
- Run `pnpm e2e:gifs` after the lead commits, so the gallery shows the rewritten tests.
- Each new feature brings its own e2e test, such as [repo clone and view](repo-clone-and-view.md)'s R5.
- A production run once [deployed](land-and-deploy-mvp.md).
- From 05:53 on 2026-10-20: `e2e/slash-commands.spec.ts` and its GIF ([slash commands](slash-commands.md), done 07:05: 3 of 3, three GIFs); the late joiner's Load earlier half, which skips below 50 messages ([local-first](local-first.md)).

## Questions for Will

None.
