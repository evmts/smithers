---
title: Local-first device store and outbox
status: in-progress
area: app
owner: the wiring agent, from about 05:38 on 2026-10-20: the final e2e rerun on a fresh database and fresh Durable Object state (scratchpad `wiring/e2e-fresh.log`, from 05:40:43), with a named cause for any local-first case still red; the lead's best guess for the final run's 5 local-first reds is its own instruction to keep 2 stuck answers in the dev database, which block later answers because answers run in turn. Before: the wiring agent's sub-agent D1, on the 3 local-first reds (two tabs, Retry, Electric down at boot) since 03:23 on 2026-10-20, unreported at 03:46, 04:04 and 04:15. Before: L1 agent (started 23:01 on 2026-10-19; reported done 00:44 on 2026-10-20: 0002's plan steps 1, 2, 4 and 5, and the PWA); left: the wiring agent (since about 01:17 on 2026-10-20) wires L1's `Host` and derives the relay allowlist; `subset:` in `worker/Chat.ts`, 0002 §8 step 3 (the turn wait) and the §7 benchmarks have no named owner (by 01:52 on 2026-10-20 `subset:` is gone upstream, and the turn wait exists as F4+F5's `chat/LoadTurn`; the §7 benchmarks still have no owner)
updated: 2026-10-20
links: [app-wiring.md, ../decisions/0002-local-first.md, ../decisions/0002-local-first-comparison.md, ../todo.md, effect-tanstack-db-and-effect-electric.md, decisions-for-will.md, ../decisions/0011-the-agent-runs-in-the-browser.md, pwa.md, durable-browser-engine.md, lru-size-limit.md, model-endpoint.md, land-and-deploy-mvp.md, one-sqlite-one-leader.md, flows-and-agent.md, durable-answering.md, ../decisions/0001-electric-postgres-tanstack-db.md, ../../../../docs/libraries.md, agent-root-browser-safe.md, repo-clone-and-view.md, plan-identity-across-deploys.md]
---

## What

Every read comes from the device and every write goes through a durable outbox:
- `messages` persists in OPFS SQLite through TanStack DB persistence; Electric resumes from its stored offset.
- Asks queue in `@tanstack/offline-transactions` (IndexedDB) and replay after a reload or restart.
- A service worker caches the app shell, so the app opens offline after one visit.
- Status copy only: `Offline`, `Offline · 2`, `Queued`, `Sync failed`, `Not sent`.

Since decision [0011](../decisions/0011-the-agent-runs-in-the-browser.md) (22:31 on 2026-10-19), the flow engine's step record also lives in SQLite on OPFS, run by a leader tab's dedicated worker ([durable browser engine](durable-browser-engine.md)), and the app installs as a [PWA](pwa.md). The service worker serves the app offline but never runs the engine.

## Why

Will: "We want it to be local first no loading spinners other than waiting for external agents." And: "nailing the local first nature is really important especially later when we add multiplayer prompting and editing of files."

Will, 22:29: "The app should be a pwa to go along with it's local-firstness btw" and "We prefer things to be local first actaully".

## State

- Decision 0002 is accepted with Will's answers: the composer queues "just like claude code or codex", and each device keeps the whole conversation.
- Today an offline ask rolls back and shows "Smithers couldn't answer." Nothing persists across a reload.
- The Electric package agent was told to leave room for persistence and the outbox.
- 21:23 on 2026-10-19: [the packages](effect-tanstack-db-and-effect-electric.md) reported done. Creation and mutation options are objects, so persistence and an outbox can be added without breaking callers, and sync events already tell offline, reconnecting and up to date apart. `0002` still says to delete `src/lib/collections.ts`, which is already gone.
- 21:29: the lead fixed 0002's plan step 2. It now reads "Done 2026-10-19; `src/lib/collections.ts` is deleted", so step 2 (the wrappers) is complete and step 3 onward is this work.

- About 22:00: the lead asked Will to try the app at http://localhost:1337/app, fifth of five asks on [decisions for Will](decisions-for-will.md): go offline, reload, use two tabs, to catch client problems before durable answering lands. The app runs on the new packages with compose Postgres, Electric and PgBouncer healthy; it answered 200 at 22:04. Today's offline behavior (an ask rolls back; nothing survives a reload) is what this item fixes.
- 22:31: decision 0011 builds on 0002. The agent runs in the browser as one more local actor against the same collections. 0002's service worker (app step 4) becomes part of the [PWA](pwa.md), and 0011 repeats 0002's persistent-storage request.
- 22:35: 0004 Q3: views are conversation rows that sync to every device and every person in the conversation; scroll position and open tabs stay per device. Will: "Yes it syncs this is what enables multiplayer to work".
- 22:36: the app check at http://localhost:1337/app is still unanswered.
- 23:00: Will: "once we finish everything we got so far I need to test the app review the code". The app check now waits for the lead's "ready to test" ([decisions for Will](decisions-for-will.md)).
- 23:01: **L1 started**: decision 0002's plan, §8 steps 1, 2, 4 and 5.
  - Persisted collections: TanStack DB's SQLite persistence on OPFS, through `@smthrs/effect-tanstack-db` and `@smthrs/effect-electric`, whose option objects were built for it.
  - The outbox: `@tanstack/offline-transactions`.
  - The queued composer: asks queue while offline or while an answer streams, like Claude Code.
  - 0002 §2's states and copy, and the [PWA](pwa.md).
  - Client deletions 0002 §8 lists: paging, `keepOffset`, the loading and lost states.
  - Also a "Superseded by 0002" status line in decision 0001, and `docs/state.md` and `docs/features/chat.md` updated.
  - Not now: §8 step 3, the server half. W5 owns `worker/`, `db/` and `alchemy.run.ts`; L1 reports any server need. B1 owns `platform-browser`.
  - Tests: unit at 100% for `src` and the wrappers; real-browser e2e for offline asks, a flapping network, an offline reload after one online visit, two devices and 0002 §7's no-spinner observer; faults only by dependency injection through `/app?faults`.
- 23:01: **one SQLite build and one leader, with B1.** Two OPFS SQLite users will share the origin: the TanStack replica (TanStack's browser persistence uses `@journeyapps/wa-sqlite`) and B1's engine journal (`@effect/wa-sqlite`). L1 checks whether TanStack's persistence takes an injected connection or driver, so both use one wa-sqlite build, and whether TanStack's multi-tab coordination and B1's Web Locks election can be one mechanism. If not without forking a library, its report says why; never a silent fork ([durable browser engine](durable-browser-engine.md)).
- 23:07: no file under `apps/mvp/src`, `packages/effect-tanstack-db` or `packages/effect-electric` has changed yet.
- 23:10 to 23:17: L1's first files, unreported: in `packages/effect-tanstack-db/src`, `Persistence.ts` (23:12), `index.ts` (23:15), `Collection.ts` (23:16) and `Outbox.ts` (23:17); and a prototype script in `packages/effect-electric`, `proto-delete-me.mts` (23:10). `apps/mvp/src` is unchanged.

- 23:15 to 23:25: **L1's package work has tests**, unreported:
  - `@smthrs/effect-tanstack-db`: `src/Outbox.ts` and `src/Persistence.ts` (23:20) with `test/Outbox.test.ts` (16 cases: a write shows at once, is stored before it is sent and sent once by key; one that doesn't get through is sent again until it does; a server refusal rolls back and is counted; a write queued by one program is sent once by the next; the focused tab leads; a follower admits nothing) and `test/Persistence.test.ts` (5 cases: rows kept for the next program, restored before the source answers, dropped under another `schemaVersion`, `LoadFailed`, and a database that can't open stays in memory).
  - `@smthrs/effect-electric`: `ElectricCollection.ts` and `ShapeSource.ts` changed through 23:25. New cases restore the rows before Electric answers and resume from the stored handle and offset, and a new `schemaVersion` syncs again. `ShapeSource` gains fault switches (`down`, `refuse`, `stall`, `corrupt`), the seam behind `/app?faults`.
  - The prototype `proto-delete-me.mts` is gone.
  - New dependencies in both packages and in `apps/mvp/package.json` (23:16): `@tanstack/offline-transactions` 1.1.3, `@tanstack/browser-db-sqlite-persistence` 0.2.36 and `@journeyapps/wa-sqlite` 1.7.2; `apps/mvp/package.json` also lists `vite-plugin-pwa` 2.0.0 ([PWA](pwa.md)).
  - `apps/mvp/src` has no L1 change yet: no queued composer, status copy or deletions.
  - **SQLite and leader with B1:** the replica uses `@journeyapps/wa-sqlite`, B1's journal `@effect/wa-sqlite`. The outbox takes the library's `LeaderElection` as an option (`Leader.focusedTab` in a browser), so B1's Web Locks leader could be passed in. No report yet on whether the two merge ([durable browser engine](durable-browser-engine.md)).

- 23:28: **the lead settled the SQLite and leader question** ([one SQLite, one leader](one-sqlite-one-leader.md)): one build, `@journeyapps/wa-sqlite`, and one OPFS VFS for the replica and B1's engine; B1's Web Locks leader is the only leader, injected into the outbox. L1 was told the app side and the [PWA](pwa.md) must land in this run.
- 23:26 to 23:35, **L1's app side is on disk**, unreported:
  - `src/main.tsx` builds the browser's host: TanStack DB's SQLite persistence on OPFS (`smithers.sqlite`) with a `BrowserCollectionCoordinator` between tabs, and the outbox on IndexedDB (`smithers-outbox`) with TanStack's `WebLocksLeader` and `WebOnlineDetector`. It asks for persistent storage.
  - `src/boot.ts` takes that host and records `smithers_web_boot_ms`, from page start to the conversation restored from the device.
  - Chat: `schema.ts` gives each local question a `queuedAt`; `queries.ts` shows the synced rows, then this device's `unsent` and `queued` questions in the order asked. New `connectivity.ts`; `Composer.tsx`, `ConnectionPill.tsx`, `Conversation.tsx`, `store.ts`, `actions.ts` and `metrics.ts` changed; `src/test/faults.ts` changed (23:36).
  - `@smthrs/effect-tanstack-db`'s `Outbox.ts` and `Persistence.ts` and their tests changed again (23:28 to 23:34). `docs/features/chat.md` changed (23:29).
  - The [PWA](pwa.md) is configured.
  - Not yet the ruling: the replica opens its own database and the outbox uses TanStack's own leader, not B1's.

- 23:36 to 23:44, on disk, unreported: `src/test/faults.ts` and `src/test/chatApi.ts` (23:36), `features/chat/queries.ts` (23:38), and `actions.ts`, `store.ts`, `components/Conversation.tsx` and `chat.test.ts` (23:44).
- 23:39: W5 (a)+(c) is done ([durable answering](durable-answering.md)). Best guess: 0002 §8 step 3, the server half (the turn wait and the history bound), goes with W5 (b), the message write path, which waits for F5.
- About 23:41: B1 is done ([durable browser engine](durable-browser-engine.md)). By 23:44: **L1 was told** to wire its persistence and outbox to B1's `BrowserSqlite`, as a second database file on the shared service, and to `WebLock`, removing the redundant leaders ([one SQLite, one leader](one-sqlite-one-leader.md)).
- 23:41: the lead: "When F5 and local-first land, I wire them into the app, delete the old server-side answering, and tell you it's ready to test."

- 23:46 on 2026-10-19 to 00:04 on 2026-10-20, on disk, unreported:
  - `@smthrs/effect-tanstack-db`'s `Outbox.ts` and its test changed again (23:46).
  - **`src/main.tsx` (23:47):** the outbox now uses B1's `WebLock` from `@smthrs/platform-browser`, and its `StoragePersistence` asks for persistent storage. The replica still opens TanStack's own database (`openBrowserWASQLiteOPFSDatabase`, `smithers.sqlite`), not B1's `BrowserSqlite` ([one SQLite, one leader](one-sqlite-one-leader.md)).
  - `src/boot.ts` (23:47) and `boot.test.ts` (23:50); chat's `metrics.ts` (23:47), `telemetry.test.ts` (23:53), `Conversation.tsx` (00:00), and `chat.ts`, `actions.ts`, `store.ts` and `chat.test.ts` (00:03).
  - **The e2e suite:** `src/test/e2e.test.ts` (23:51), and `e2e/devices.ts` and `e2e/fixtures.ts` (00:00). They label each device in its video and take one offline; the pill reads `Offline`, or `Offline · 2` with queued questions.
  - A Playwright run at 23:59 passed; its results name only the smoke test.
- 00:09 to 00:10 on 2026-10-20, on disk, unreported: `e2e/local-first.spec.ts` has 18 cases, among them two questions asked offline surviving an offline reload, a restart offline, two tabs with the leader closing, a flapping network, two devices coming back in reverse order, a conflict that shows "Not sent", Electric down at boot, and a duplicate ask that changes nothing. `start-app.spec.ts` and `observability.spec.ts` changed too. The site build reports 8 of the new cases without a GIF yet; no pass result for the new spec is on record.


- 00:10 to 00:14 on 2026-10-20, on disk, unreported: **two of the new e2e cases fail.** `offline ask` and `restart offline` failed at 00:11 and again at 00:13. The page opened again offline couldn't load the app (`GET /src/main.tsx net::ERR_FAILED`), and then a 30-second wait for a service-worker controller timed out. L1 is changing `e2e/devices.ts` to wait for the service worker before a device goes offline ([PWA](pwa.md)). `start-app.spec.ts` now expects `Offline` instead of the sync-lost pill, and the browser log `question taken` is now `question stored`. `src/` still doesn't use `BrowserSqlite`.

- 00:16 to 00:26 on 2026-10-20, on disk, unreported:
  - `e2e/devices.ts` (00:22) now waits for `navigator.serviceWorker.ready`, then up to 30 seconds for a controller, before a device goes offline. That is L1's fix for the two offline cases that failed at 00:11 and 00:13 ([PWA](pwa.md)). `e2e/local-first.spec.ts` changed at 00:18. No pass result for those two cases is on record.
  - `src/main.tsx` is unchanged since 23:47: the replica still opens TanStack's own database, not B1's `BrowserSqlite` ([one SQLite, one leader](one-sqlite-one-leader.md)).
  - 00:26: a Playwright run in `apps/mvp` ended `failed`, with 2 failing tests. Its newest result folders are two observability cases: redaction of the browser's relayed records, and the answer id and trace id correlation. Which agent ran it isn't on record.

- 00:27 to 00:29 on 2026-10-20, on disk, unreported, best guess L1's docs pass:
  - decision [0001](../decisions/0001-electric-postgres-tanstack-db.md)'s status line now says 0002 supersedes it for writes and the device store, and "the rest stands" (00:27);
  - `@smthrs/effect-tanstack-db`'s `CHANGELOG.md` (0.2.0, unreleased: `Persistence`, `Collection.persisted`, persisted `Collection.make`, `Collection.restored` and `Outbox`), `README.md` and docs (00:28 to 00:29), and `@smthrs/effect-electric`'s `CHANGELOG.md`, `README.md`, `shape-proxy.md`, `sync-policy.md` and `api.md` (00:28 to 00:29);
  - the two packages' catalog rows in `docs/libraries.md`, decision [0002](../decisions/0002-local-first.md), `apps/mvp/AGENTS.md` and `docs/features/chat.md` (00:28 to 00:29);
  - a production build of the app in the scratchpad's `mvp-build/` (00:29), with `sw.js`, `registerSW.js` and `manifest.webmanifest` ([PWA](pwa.md)).
- About 00:37: `src/main.tsx` is still unchanged since 23:47, and no `e2e` file changed after 00:26. No report.


- 00:44 on 2026-10-20: **L1 is done, reported**, uncommitted. It built 0002's plan steps 1, 2, 4 and 5, and the [PWA](pwa.md). The app reads only from the device, every question goes through a durable outbox, and a reload works offline after one online visit.
  - **Tests:** the wrapper suites, 62 and 103 tests, pass at 100%. In the app the 64 chat, boot and telemetry tests pass, and those files are at 100%. E2e: every 0002 §7 case passes (E1 to E10, the no-spinner observer, two tabs, two devices), and the other 25 tests pass, against `:1337` with the live model. `pnpm docs:sync` and `docs:check` pass.
  - **Reds it didn't cause:** `src/features/agent/agent.test.ts` (F4+F5's) and `db/Database.test.ts` (W5's area). Import rules fail only on `src/flows/engine.worker.ts`'s `fetch` and the known `ChatApi.ts` `waitUntil`.
  - **Built:** `Persistence`, `Collection.persisted`, `persist` and `restored`, and `Outbox` in `@smthrs/effect-tanstack-db`; `persist` and eager or progressive sync only in `@smthrs/effect-electric`. The app has `asking` and `unsent`, the queued composer, 0002 §2's pill and copy, and the PWA (manifest, icons, and a service worker that never touches `/api/*`). Everything 0002 §8 deletes on the client is gone.
  - **Two observability e2e tests fail** until the relay allowlist in `worker/Chat.ts` adds L1's new browser record names and the fields `queued`, `action`, `granted`, `attempt` and `leader`; `docs/observability.md` lists them.
  - **Server needs:** that allowlist; deleting `subset:` from `worker/Chat.ts`, after which ShapeProxy's subset policy and `internal/subset.ts` in `@smthrs/effect-electric` can go; and the turn wait (0002 §8 step 3), still open.
  - **Not done:** one SQLite and one leader ([one SQLite, one leader](one-sqlite-one-leader.md)), and the §7 benchmarks. `@tanstack/node-db-sqlite-persistence` is left out: the tests run `node:sqlite` through TanStack's browser persistence, so there is no native build.
  - **What the wiring step passes:** `Host` in `src/boot.ts` takes `persistence {open, make, coordinator}`, `outbox {start, storage, online}`, `lock` (B1's `WebLock`), `isOnline` and `storage` (B1's `StoragePersistence`). `src/main.tsx` has the browser's version.
- 00:44 to 00:45: the lead told Will "Local-first is built", with three gaps on the wiring checklist (scratchpad `final/WIRING.md`): wa-sqlite loads twice, TanStack keeps its own tab election, and two observability tests stay red until the lead edits the telemetry allowlist, "once the sign-in and agent agents stop editing that file".

- After 00:47 on 2026-10-20: the lead's wiring step is its own note, [app wiring](app-wiring.md). As of 00:54 none of its L1 items is done: `src/boot.ts` and `src/main.tsx` are unchanged since 23:47 on 2026-10-19, and `worker/Chat.ts` still has `subset:` and the old allowlist.
- About 01:00 on 2026-10-20: the `platform-browser` items went to their own agent: the shared `execute` service (one SQLite load), `WebLock.hold` with `steal` and lazy wasm loading ([one SQLite, one leader](one-sqlite-one-leader.md)). The rest of L1's wiring items stay with the lead, after F4+F5 reports ([app wiring](app-wiring.md)).

- About 01:17 on 2026-10-20: **the wiring agent started** ([app wiring](app-wiring.md)). From L1 it takes the `Host` in `boot.ts` and `main.tsx` (persistence, outbox, lock, `isOnline`, storage) and the relay allowlist, now derived from a shared contract. The relayed scope doesn't name `subset:`, the turn wait or the benchmarks. Best guess `subset:` goes with "wire L1", and the other two stay open.
- 01:43 to 01:44, on disk, mid-edit: `src/boot.ts` changed (01:43). `src/main.tsx` is unchanged since 23:47 on 2026-10-19, and `worker/Chat.ts` still has `subset:` (line 190).

- 01:44 to 01:58 on 2026-10-20, on disk, mid-edit, unreported:
  - **`subset:` is gone, upstream.** `@smthrs/effect-electric`'s `ShapeProxy` drops `subset__*` like any parameter outside the protocol. `subset`, `SubsetPolicy`, `syncMode: "on-demand"` and the `keepOffset` workaround are removed (changeset `electric-proxy-drops-subsets.md`, 01:52, breaking). The app's proxies serve whole shapes, `repositories` included ([repo clone and view](repo-clone-and-view.md)).
  - **The turn wait exists (0002 §8 step 3)**, built by F4+F5 (`src/features/agent/flows.ts`, 01:13), though not as 0002's `WaitFor` over a `DurableDeferred`. `chat/LoadTurn` retries under `TURN_RETRY` while the `turn` answer route says `NotYourTurn`. An earlier `streaming` answer stops holding up later turns 90 seconds after its last write (`ANSWER_TURN_LIVE_SECONDS`, `worker/Answers.ts`). Migration 0008 (01:46) adds the `messages_streaming_position` index for it.
  - **`attempts` left the device schema:** `chat-messages` persists under `schemaVersion: 2` (01:44), after the wiring sub-agent A1 caught the break ([app wiring](app-wiring.md)).
  - `src/main.tsx` changed (01:44, 01:58) but still opens TanStack's own OPFS database ([one SQLite, one leader](one-sqlite-one-leader.md)).
  - **Red:** the local-first real-browser e2e (scratchpad `e2e-local-first.log`, 01:55 to 01:57) fails every case so far at "the app opens". Best guess the cause is `@smthrs/agent`'s root reaching `node:dns/promises` ([agent root in the browser](agent-root-browser-safe.md)).

- 02:29 to 02:43 on 2026-10-20: **the app opens in a real browser, but nothing on the device persists yet.** The tab no longer loads `@smthrs/agent`, so the `node:dns` error is gone ([app wiring](app-wiring.md)). Two blockers remain, each with its own agent:
  - the engine worker dies at load with `document is not defined`, from `@mdx-js/mdx` on the agent root's path ([agent root in the browser](agent-root-browser-safe.md));
  - about 02:36: statements sent to `SharedSqlite` are refused and TanStack fails to acquire leadership once a leader exists ([one SQLite, one leader](one-sqlite-one-leader.md)).
  - Until both are fixed the device store is in memory. On disk at 02:38 to 02:42, the app opens it in memory at once instead of after 30 s and says "Smithers can't run in this browser" with Reload ([app wiring](app-wiring.md)).
- 02:43 to 02:53 on 2026-10-20, on disk, unreported: **a fix for each blocker.** `SharedSqlite` refuses a statement with SQLite's own message, so TanStack DB's persistence recognizes a column it already added (02:43) ([one SQLite, one leader](one-sqlite-one-leader.md)). `Prompt.ts` loads MDX only on first compile, and the agent's real-Chromium worker test goes from 2 of 2 red to 2 of 2 green (02:52) ([agent root in the browser](agent-root-browser-safe.md)). No app run with both is on record, so the device store still has no proof it persists.

- **About 02:58 on 2026-10-20: the `SharedSqlite` blocker is fixed**, reported by the `platform-browser` agent; the app needs no change ([one SQLite, one leader](one-sqlite-one-leader.md)). The agent-root blocker's fix is on disk, unreported ([agent root in the browser](agent-root-browser-safe.md)).
- 02:56:58 to 03:06 on 2026-10-20, scratchpad `wiring/e2e-1.log`, unreported: **the local-first e2e runs in a real browser with the engine worker loading.** Passing: offline ask (two questions survive a reload offline and are answered in order), restart offline, late joiner, two tabs offline, concurrent asks, tab closes mid-answer, reload mid-answer, long outage, flapping network, sync down while asking, conflict. Failing:
  - "two tabs": a question asked in the tab that doesn't lead is sent once it leads, but it shows twice (5 messages where 4 were expected). Best guess a duplicate send across the leader handover, the "every question once" rule of 0002.
  - "Retry": the Connection pill's Retry button never appears within 60 s.
  - "two devices ask offline and come back in reverse order": device B's answer stays "Smithers is answering" for 60 s.

- **03:12 on 2026-10-20, scratchpad `wiring/e2e-1.log`: the run finished, 24 of 36 passed.** Four more local-first cases failed after 03:08, each with an answer that stays "Smithers is answering" for 60 s: "offline mid-answer", "Electric down at boot", "back/forward" and "duplicate ask". With "two devices ask offline and come back in reverse order" that makes five answers stuck streaming. So the local-first reds are seven: those five, "two tabs" (a question sent twice) and "Retry" ([app wiring](app-wiring.md)).
- 03:14 to 03:16 on 2026-10-20, on disk, unreported: **the wiring agent's fix for the stuck answers.** Best guess from its comments: an answer one test left streaming, with its devices closed, held up later answers in the shared conversation until it had been quiet for `ANSWER_TURN_LIVE_SECONDS`. The default drops from 90 to 30 s (`worker/Answers.ts`), and `e2e/devices.ts`' teardown settles any answer a test left streaming through the answer routes ([durable answering](durable-answering.md)). A rerun started about 03:16. "Two tabs" and "Retry" aren't touched on record.
- **About 03:20 on 2026-10-20: the lead's ruling to the wiring agent.** "Two tabs send a question twice" and Retry are product bugs in the outbox or the leader handoff, not test problems. Each fix names its root cause; none waits longer or loosens an assertion. A stuck answer settles as failed in the product, not only in the e2e teardown ([app wiring](app-wiring.md)).
- **03:22 on 2026-10-20, scratchpad `wiring/e2e-2.log`, unreported: the rerun.** Green: two devices in reverse order, offline mid-answer, back/forward and duplicate ask, with the 30 s bound and the teardown settling leftovers; the lead's rule still asks the product to settle them. Red:
  - "two tabs": the same duplicate, `handed-…` asked twice and answered once (5 messages where 4 were expected);
  - "Retry": no Retry button in the Connection pill within 60 s;
  - "Electric down at boot": the answer stays "Smithers is answering".
- About 03:28 on 2026-10-20, the lead to Will: still failing are two tabs sending a question twice, Retry, and starting while Electric is down. At 03:34 no edit on disk after 03:22 targets them; the wiring agent's 03:24 to 03:27 edits are the theme and the engine-failure message ([app wiring](app-wiring.md)).
- 03:23 on 2026-10-20: the wiring agent's sub-agent D1 took the 3 reds. Its brief's suspect for "two tabs": tab 2's persisted `unsent` row survives the resend, because the leading tab's worker died with the delete in flight (`SharedSqlite` fails such a statement with `ConnectionError`), and the conversation shows `messages ∪ unsent`.
- 03:25 to 03:39 on 2026-10-20, D1's single-case runs (scratchpad `d1/run*`), no product edit of D1's on disk at 03:46:
  - "two tabs": red at 03:25, `handed-…` shown twice (5 rows, 4 expected).
  - "Electric down at boot": green 5 of 5 alone at 03:33 to 03:35. Red in the 03:22 full run; no cause on record.
  - "Retry": green 3 of 4 alone at 03:37 to 03:39; one run found no Retry button within 60 s.
  - At 03:45 D1 is reading `SharedSqlite`'s statements and TanStack's persistence transactions.
- 03:46 to 03:54 on 2026-10-20, D1 on disk, unreported: a cause for "two tabs". The resend dropped the question's `unsent` copy, but TanStack DB failed that write because its coordinator tab closed mid-write, so the copy came back beside the synced row. This confirms the 03:23 suspect. The fixes: `SharedSqlite` carries an open transaction over to the next leader and never runs a commit twice; `effect-tanstack-db` logs and counts a write it can't store (`persistence_write_failures`); the conversation query hides an `unsent` copy that Postgres holds with this device's answer, with a `chat.test.ts` case that fails on the old query (03:54). No e2e rerun yet. "Retry" and "Electric down at boot" still have no named cause ([app wiring](app-wiring.md), [one SQLite, one leader](one-sqlite-one-leader.md)).
- 03:55 to 04:04 on 2026-10-20, D1's real-Chromium single cases after its fix, unreported (scratchpad `d1/run4` to `run7`): both two-tabs cases green 3 of 3 each at 04:00 (1 of 1 at 03:55). "Retry" green 3 of 3 at 04:01, after a 04:00 spec edit that settles the case's outside question at once; the 03:39 miss has no reported cause. "Electric down at boot" green 2 of 3 at 04:04:45 (`run7`): the third run's stored question still showed "Smithers is answering" after the 5 s check (`error-context.md`). "back/forward" green 3 of 3. No full run since 03:22, so the status stays.
- 04:11 to 04:12 on 2026-10-20, on disk, unreported: `docs/state.md`, decision 0002 and `docs/features/chat.md` document the fix: the conversation is `messages ∪ (unsent − messages) ∪ (asking − messages − unsent)`, so a delete the device store lost in a leader handover can't show a question twice. No e2e run since 04:04:45; "Electric down at boot" stays 2 of 3 with no named cause, and the Retry spec edit stays unreported ([app wiring](app-wiring.md)).
- 04:15 to 04:25 on 2026-10-20, the full serial run (scratchpad `wiring/e2e-3.log`): all 18 local-first cases pass, both two-tabs cases, Retry and Electric down at boot included. One run: Retry leans on the 04:00 spec edit, "Electric down at boot" (2 of 3 at 04:04) has no named cause, and 7 stuck answers were settled by hand before the run. Status stays; the rest of the Next step remains ([app wiring](app-wiring.md)).
- About 04:26 on 2026-10-20: the lead asked for named causes for Retry and "Electric down at boot" before a run counts. By 04:36 neither cause is reported; the full serial run started 04:29:48 (`wiring/e2e-4.log`) passes every local-first case it has reached, Retry included (late joiner skipped: the conversation fits one page) ([app wiring](app-wiring.md)).
- 04:43 on 2026-10-20, scratchpad `wiring/e2e-4.log` finished: 32 passed, 3 failed, 1 skipped in 13.9 minutes, unreported. All 17 local-first cases that ran pass, Retry and "Electric down at boot" included; "late joiner" skipped (the conversation fits one page). No cause for Retry or "Electric down at boot" is reported, so the status stays ([app wiring](app-wiring.md)).
- 04:45:23 to 04:55 on 2026-10-20, scratchpad `wiring/e2e-5.log`, one worker: 35 passed, 1 skipped, 0 failed in 9.9 minutes (exit 0), unreported. All 17 local-first cases that ran pass again on fresh state, Retry (19.2 s) and "Electric down at boot" (25.1 s) included; "late joiner" skipped. No cause for Retry or "Electric down at boot" is reported, so the status stays ([app wiring](app-wiring.md)).
- 05:29:08 to 05:38 on 2026-10-20, scratchpad `wiring/e2e-final.log`, the wiring agent's final full run (37 cases, one worker), unfinished: of the local-first cases run so far, 5 fail and the rest pass, Retry (17.0 s) and "late joiner" included. Red, from `test-results/*/error-context.md`:
  - "two tabs": tab 2's answer still reads "Smithers is answering" after 60 s;
  - "long outage": a question asked while away shows where the test expects none (count 1, expected 0);
  - "flapping network": `page.evaluate` lost its context to a navigation;
  - "sync down while asking": the question shows `done` where `queued` was expected.
  - "Electric down at boot": the answer still reads "Smithers is answering" after 5 s; it passed in `wiring/e2e-4` and `e2e-5`.
  - The dev database still holds 2 answers stuck `streaming` from an SDK defect, kept as evidence ([plan identity across deploys](plan-identity-across-deploys.md)), so the run isn't on fresh state. No cause is named ([app wiring](app-wiring.md)).
- 05:39 on 2026-10-20, `wiring/e2e-final.log` finished: 32 passed, 5 failed, all 5 the local-first cases above.
- **About 05:38 on 2026-10-20, the lead corrected its own instruction:** the 2 stuck answers kept as evidence block every later answer, because answers run in turn. Best guess: they caused the 5 reds, and the two "Smithers is answering" reds fit it. The wiring agent exports them and their journal events to a file, reruns on a fresh database and fresh Durable Object state, and names a cause for any red left ([app wiring](app-wiring.md)).
- 05:38 to 05:44 on 2026-10-20, unreported: the export is in scratchpad `evidence/` (05:38). The rerun (`wiring/e2e-fresh.log`, from 05:40:43) has 11 of 37 passed and none failed at 05:44, "offline ask" and "restart offline" included; none of the 5 reds has run yet.

## Next

From about 05:38 on 2026-10-20, first: the 5 local-first cases in `wiring/e2e-fresh.log`, on a fresh database and fresh Durable Object state. Green confirms the stuck answers as the cause; any red left gets a named cause and a fix. Then named causes for Retry and "Electric down at boot", the saved collections persisting across a reload in the app, and the §7 benchmarks.

Until the lead's correction about 05:38 on 2026-10-20 the next step was, first: the 5 reds of `wiring/e2e-final.log` fixed at a named cause, or the final run's result if they pass on a rerun. Then named causes for Retry and "Electric down at boot", the saved collections persisting across a reload in the app, and the §7 benchmarks.

Until 05:38 on 2026-10-20 the next step was, from about 03:25 on 2026-10-20, first: "two tabs" and "Retry" fixed at their cause in the outbox or the leader handoff, each with the cause named, in the [app wiring](app-wiring.md) step. If the duplicate comes from the handoff, it also touches [one SQLite, one leader](one-sqlite-one-leader.md). Then "Electric down at boot" green because the product settles an answer it can't finish ([durable answering](durable-answering.md)). Then saved collections persisting across a reload in the app, and the §7 benchmarks.

Until about 03:25 on 2026-10-20 the next step was, from about 03:16, first: the rerun's result for the five answers stuck streaming, after the 30 s turn bound and the teardown change. Then "two tabs" (a question sent twice across the leader handover, against 0002's "every question once") and "Retry" (no Retry button within 60 s), each fixed with its cause or explained, in the [app wiring](app-wiring.md) step. Then saved collections persisting across a reload in the app, and the §7 benchmarks. The agent-root report is in (03:15:18, [agent root in the browser](agent-root-browser-safe.md)).

Until about 03:16 on 2026-10-20 the next step was, from about 03:06, first: the "two tabs" duplicate send, the missing Retry button and the answer stuck streaming after two devices return in reverse order, each fixed with its cause or explained, in the [app wiring](app-wiring.md) step. Then the SDK agent's report on the agent root, saved collections persisting across a reload in the app, and the §7 benchmarks.

Until about 03:06 on 2026-10-20 the next step was, from about 02:43, first: the two engine-worker blockers fixed, so the device store persists in OPFS ([one SQLite, one leader](one-sqlite-one-leader.md), [agent root in the browser](agent-root-browser-safe.md)). Then the rest as below.

Until about 02:43 on 2026-10-20 the next step was, from 01:58 on 2026-10-20: the wiring agent's report, with the local-first e2e opening the app again and passing: L1's `Host` in the app, the allowlist derived from a shared contract with the two observability tests green, and GIFs ([app wiring](app-wiring.md)). Then the §7 benchmarks. `subset:` is gone, and the turn wait exists (see State). One SQLite and one leader is [its own item](one-sqlite-one-leader.md).

Until about 01:58 on 2026-10-20 the next step was: the wiring agent's report: L1's `Host` in the app, the allowlist derived from a shared contract with the two observability tests green, and real-browser e2e with GIFs ([app wiring](app-wiring.md)). Then the turn wait (0002 §8 step 3), the §7 benchmarks, and `subset:` if the wiring leaves it. One SQLite and one leader is [its own item](one-sqlite-one-leader.md).

Until about 01:17 on 2026-10-20 the next step was: the lead's wiring step, after F4+F5 and S1 report: pass L1's `Host` in `src/boot.ts`, add the record names and fields to the relay allowlist in `worker/Chat.ts` so the two observability tests pass, and delete `subset:` with ShapeProxy's subset policy. Then the turn wait (0002 §8 step 3) and the §7 benchmarks. Then the lead tells Will it's ready to test. One SQLite and one leader is [its own item](one-sqlite-one-leader.md).

Until 00:44 on 2026-10-20 the next step was: L1's report: the app on B1's `BrowserSqlite` (the replica as a second database file) and `WebLock`, with the redundant leaders gone; the [PWA](pwa.md); and the e2e suite (offline asks, a flapping network, an offline reload, two devices, no spinners). Then the lead wires local-first and F5 into the app and tells Will it's ready to test.

Until 23:44 the next step was: L1's report: the app side with one VFS and B1's leader wired in ([one SQLite, one leader](one-sqlite-one-leader.md)), the [PWA](pwa.md), and the e2e suite (offline asks, a flapping network, an offline reload, two devices, no spinners). Then 0002 §8 step 3 on the server, after W5.

Until 23:28 the next step was: L1's report, including the SQLite and leader coordination result. Then 0002 §8 step 3 on the server, after W5.

Until 23:01 the next step was: after the lead commits the packages, build 0002 through `@smthrs/effect-tanstack-db` and `@smthrs/effect-electric`, with an e2e test that asks offline, reloads, reconnects and gets the answer.

The service worker and the manifest ship together as the [PWA](pwa.md).

## Questions for Will

- Try the app offline, after a reload and in two tabs, and say what breaks? Asked about 22:00. (Will, 23:00: he tests the app once the feature list is finished; the lead tells him when.)
- The size cap is [its own item](lru-size-limit.md).
- Open for the lead, not Will (01:58 on 2026-10-20): the turn wait is a retried poll (`chat/LoadTurn` against the `turn` route, with a 90-second liveness), not 0002 §3's `WaitFor` over a `DurableDeferred`. Does 0002 change to match, or the code?
