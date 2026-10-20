---
title: Benchmarks, local and live
status: in-progress
area: app
owner: from 05:54 on 2026-10-20 no builder is named for the new baseline: the wiring agent reported the bench repo suite passing 21 of 21 and the baseline needing a re-record. Until 05:54: benchmark agent (built it); the wiring agent's sub-agent B1 reworks it for browser answering (since 02:23 on 2026-10-20); the lead runs it against the server
updated: 2026-10-20
links: [repo-follow-ups.md, ../benchmarks.md, app-wiring.md, durable-answering.md, dev-stack-hygiene.md]
---

## What

`pnpm bench` measures the real app, ChatApi, Postgres, Electric and model in Chromium and over HTTP, checks every answer, and compares p50 and p95 against a baseline per `BASE_URL`. `BASE_URL=https://<host> pnpm bench` runs it against a deployment.

## Why

Will: "We should also have performance benchmarks that can be run locally and also on live."

## State

- Local run on the new stack: 84 checks passed, no rate-limit errors. Typical: chat usable on a cold load 598 ms, question shown 10 ms, `POST /api/questions` 26 ms, a question on a second device 40 ms, first answer text about 1.9 s.
- Fable found the baseline was taken on a mid-change build.
- Never run live: nothing is deployed.
- **02:23 on 2026-10-20: the bench needs rework.** ChatApi no longer answers questions ([durable answering](durable-answering.md)). `POST /api/questions` only inserts the question and an empty `streaming` answer, and needs a signed-in Member. The asking tab's own agent answers, through `POST /api/model/agent` and `/api/answers/<id>`. A question posted from Node is never answered, and its `streaming` answer delays every later answer by up to 90 s (`ANSWER_TURN_LIVE_SECONDS`).
- The wiring agent's sub-agent B1 took it at 02:23 ([app wiring](app-wiring.md)). Brief: either ask through a real page, whose tab's agent answers, or keep only what Node can honestly measure (accept and Electric delivery); delete metrics that no longer mean anything; remove every mention of server answering, the sweep and `waitUntil`; and mark `bench/baseline.json` as predating browser answering unless it is recorded again. B1 runs only the bench's unit tests and a type check; the lead runs `pnpm bench`, since it costs real model calls.
- 02:29 to 02:35, on disk, unreported: `bench/probe.ts` and `probe.test.ts`, `suites.ts` (page-based suites), `run.ts`, `stats.ts`, `chatapi.ts` and `chatapi.test.ts` changed. B1 dropped the `postQuestion` test and the follower's `txids` record. `bench/baseline.json` is unchanged since 17:26 on 2026-10-19.

- By 02:35 on 2026-10-20: the R3 to R5 agent added a `repo` suite (`bench/repo.ts`, in `SUITES` beside `load`, `cmdk`, `shape`, `answer`, `sync` and `concurrent`). It reads `octocat/Spoon-Knife`'s tree and README and asks no model. Large-fixture cases aren't built ([repo follow-ups](repo-follow-ups.md)). `bench/suites.ts` and `probe.ts` changed again after 02:35, unreported.
- 04:57 to 05:00 on 2026-10-20, unreported: the wiring agent ran `pnpm bench --only repo` against the dev server on `:1337` (scratchpad `wiring/bench.sh`). At 04:57 the seed timed out after 90 s, so 0 of 1 checks passed (`bench/results/2026-10-20T11-56-20Z.json`). At 05:00 it passed 21 checks with no regressions against the 00:25 baseline (`bench/results/2026-10-20T12-00-25Z.json`): `repo.shape.initial_sync` p50 14.2 ms, first tree 5 ms, first blob 4.7 ms, cached tree p50 4.1 ms, cached blob p50 3.6 ms. `bench/probe.ts` and `stats.ts` changed at 05:00. No full bench run under browser answering is on record.
- **05:54:14 on 2026-10-20, the wiring agent's report:** "the bench repo suite passes 21/21", and under "Not done": "The bench baseline needs re-recording." `bench/baseline.json` still predates browser answering. No full bench run under browser answering is reported ([app wiring](app-wiring.md)).

## Next

From 05:54 on 2026-10-20: a full `pnpm bench` against the dev server on `:1337`, now that the app answers in a real browser, then a re-recorded `bench/baseline.json`. No owner is named. The live run waits on the first deploy ([land and deploy](land-and-deploy-mvp.md)).

Until about 05:54 on 2026-10-20 the next step was, from 02:23 on 2026-10-20: B1's report, with every remaining metric honest under browser answering and the bench's unit tests and type check green. Then the lead runs `pnpm bench` against the dev server once the app answers in a real browser, and records a new baseline.

Until 02:23 on 2026-10-20 the next step was: rebaseline after [durable answering](durable-answering.md) lands, add the engine writer-lock benchmark, then a live run after the first deploy.

## Questions for Will

None.
