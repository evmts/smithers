---
title: One SQLite build and one leader tab in the browser
status: done
area: app
owner: none; review round 4's R4-25 and Fable S-P3-6 fixed by the SDK batch 2 agent, reported 12:52:09 on 2026-10-20. Until 12:52: SDK half done, reported about 02:58 on 2026-10-20 by the `platform-browser` agent (the `SharedSqlite` refusal fixed, test first, in Node and real Chromium); the app's proof comes with the wiring agent's report, after the [agent root](agent-root-browser-safe.md) fix. Until about 02:58: `platform-browser` agent, resumed about 02:36 on 2026-10-20 to reproduce and fix refused `SharedSqlite` statements and TanStack's failed leadership in real Chrome, test first (a `SQLiteError`-shaped refusal and a real-Chromium TanStack test on disk 02:43, unreported; still running at 02:55); the wiring agent holds the app half. Until 02:36: SDK half done: `platform-browser` follow-ups agent (started about 01:00, reported done about 02:05 on 2026-10-20), with B1 follow-ups items 3 and 5; app half: the wiring agent (handed over about 02:05; `src/main.tsx` on `SharedSqlite.open` by 02:07, unreported); before that: the app half is in `src/main.tsx`, the wiring agent's file; the lead held it for the app wiring step from after 00:47 until then; unassigned from 00:44, when L1 finished with half of it; ruled by the lead 23:28 on 2026-10-19; B1 switched the engine store (done about 23:41)
updated: 2026-10-20
links: [review-round-4.md, agent-root-browser-safe.md, app-wiring.md, platform-cloudflare-edge-cache.md, sdk-test-reds.md, durable-browser-engine.md, local-first.md, pwa.md, library-catalog.md, ../decisions/0011-the-agent-runs-in-the-browser.md, ../decisions/0002-local-first.md, b1-follow-ups.md, flows-and-agent.md]
---

## What

The app ships one SQLite build and one leader tab.
- **One build, `@journeyapps/wa-sqlite`.** B1's engine store switches to it from `@effect/wa-sqlite`, and the app opens one OPFS VFS for both the TanStack DB replica and the engine's step record.
- **One leader.** B1's Web Locks leader is the only one. The app injects it into L1's outbox through the outbox's `leader` option.
- **Refined by 23:44:** one SQLite service, B1's `BrowserSqlite`, holds two database files: the engine's step record and the replica. B1's `WebLock` is the one leader, and the redundant leaders go.

```
before (23:25)                               ruling (23:28)
replica  ── @journeyapps/wa-sqlite           replica ──┐
engine   ── @effect/wa-sqlite                engine  ──┴── @journeyapps/wa-sqlite, one OPFS VFS
outbox   ── TanStack WebLocksLeader          outbox  ──┐
engine   ── B1's Web Locks leader            engine  ──┴── B1's Web Locks leader
```

## Why

The lead's reason: TanStack DB's browser persistence requires `@journeyapps/wa-sqlite`, so it is the build both can share. Two builds would also mean two WASM downloads and two VFS pools on one origin's OPFS, and two elections could put the outbox and the engine in different tabs.

## State

- 23:01 on 2026-10-19: L1 was asked to check both questions with B1 ([local-first](local-first.md)).
- 23:25: L1's packages chose `@journeyapps/wa-sqlite` 1.7.2 beside B1's `@effect/wa-sqlite` 0.2.1. L1's outbox already took a `LeaderElection` option ([durable browser engine](durable-browser-engine.md)).
- 23:28: **the lead settled it** as above and told Will. L1 was also told the app side and the [PWA](pwa.md) must land in this run.
- 23:30 to 23:31, B1, on disk, unreported: `platform-browser/package.json` lists `@journeyapps/wa-sqlite` 1.7.2 and no longer `@effect/wa-sqlite`; `src/BrowserSqlite.ts` opens the database through its synchronous build and `AccessHandlePoolVFS`.
- 23:35, the app, on disk, unreported: `src/main.tsx` still opens TanStack's own database (`openBrowserWASQLiteOPFSDatabase`, `smithers.sqlite`) and gives the outbox TanStack's `WebLocksLeader("smithers-outbox")`. One VFS and B1's leader aren't wired in yet.

- About 23:41: **B1 is done** on `@journeyapps/wa-sqlite` 1.7.2, with `BrowserSqlite` and `WebLock.hold` injectable ([durable browser engine](durable-browser-engine.md)).
- By 23:44: **L1 was told** to wire its persistence and outbox to B1's `BrowserSqlite`, as a second database file on the shared service, and to `WebLock`, removing the redundant leaders.
- 23:47: `apps/mvp/package.json` lists `@smthrs/platform-browser` (changed 23:46). `src/main.tsx`, unchanged since before 23:36, still opens TanStack's own database and `WebLocksLeader("smithers-outbox")`.

- 23:47 on 2026-10-19, on disk, unreported: **half the ruling is in.** `src/main.tsx` gives the outbox B1's `WebLock` (`WebLock.make(navigator.locks)`) instead of TanStack's `WebLocksLeader`. The replica still opens TanStack's own database (`openBrowserWASQLiteOPFSDatabase`, `smithers.sqlite`), coordinated between tabs by TanStack's `BrowserCollectionCoordinator`, not as a second file on B1's `BrowserSqlite`. Unchanged at 00:08 on 2026-10-20.
- 00:02 on 2026-10-20: F4's flow engine runs on B1's `BrowserEngine` in the leader tab's worker (`src/flows/engine.ts`) ([flows and the agent](flows-and-agent.md)).

- 00:26 on 2026-10-20: `src/main.tsx` is still unchanged since 23:47. The outbox is on B1's `WebLock`; the replica isn't on `BrowserSqlite` yet ([local-first](local-first.md)).


- 00:44 on 2026-10-20: **L1 finished with half the ruling** ([local-first](local-first.md)).
  - **One leader, for the outbox only:** the outbox runs on B1's `WebLock` through a new `Outbox.lockLeader`, and a waiting tab takes over when the leader closes. TanStack's tab coordinator keeps its own `navigator.locks` election per collection, because it can't take an injected lock service without reimplementing about 2,800 lines.
  - **Not one SQLite:** TanStack's persistence takes an injected `{ execute, close }`, so no fork is needed. But B1's `BrowserSqlite` lives only in the engine leader's dedicated worker, and its pool is exclusive. Pointing TanStack at it needs a new `execute` service in `@smthrs/platform-browser`: local in the leader, forwarded over `TabChannel` from other tabs, on its own connection. That isn't built, so the app still opens TanStack's own OPFS worker and loads `@journeyapps/wa-sqlite` 1.7.2 a second time.
  - **The cost of no steal:** a question asked in a tab that isn't leading shows `Not sent` until that tab leads, then sends itself. 0002's focused-tab behaviour needs `WebLock.hold` to support `steal`.
- 00:44: the lead put these on the wiring checklist (scratchpad `final/WIRING.md`): the `execute` service, `WebLock.hold` with `steal`, and "Consider an upstream PR to TanStack DB" for the injectable lock. No agent is assigned ([B1 follow-ups](b1-follow-ups.md)).

- After 00:47 on 2026-10-20: **the lead took it**, for when the SDK reds agent, which edits `platform-browser` for the [B1 follow-ups](b1-follow-ups.md), leaves the package. It is part of the [app wiring](app-wiring.md) step.
- As of 00:54: `src/main.tsx` is unchanged since 23:47 on 2026-10-19. `platform-browser` has no `execute` service and `WebLock.hold` no `steal`. Its newest file, `src/BrowserCache.ts` (00:46), is the [edge cache](platform-cloudflare-edge-cache.md) agent's.

- About 00:55 on 2026-10-20: the SDK reds agent reported and left `platform-browser` ([SDK test reds](sdk-test-reds.md)). 00:58: the lead held this work until the [edge cache](platform-cloudflare-edge-cache.md) agent, which also edits that package, reported.
- **About 01:00: started**, in its own agent, not the lead, once the edge cache was done. The lead to Will: "The other makes the app load SQLite once and adds crypto and bundle cleanups." Its scope:
  - **One SQLite load:** an `execute` service in `@smthrs/platform-browser`, local in the leader and forwarded over `TabChannel` from other tabs, so TanStack's persistence uses B1's `BrowserSqlite`.
  - **One leader:** `WebLock.hold` with `steal`, so the focused tab leads.
  - **Lazy loading:** the engine and its wasm load lazily; the main bundle carries no 1.1 MB wasm.
  - **With it:** the `BrowserSqlite.ts` lint fix and one WebCrypto `Crypto` layer in `@smthrs/crypto`, items 5 and 3 of the [B1 follow-ups](b1-follow-ups.md).
- 01:05, scratchpad `mvp-build-before/`, best guess this agent's baseline of today's production build: `wa-sqlite-*.wasm` 1,129,661 bytes, `opfs-worker-*.js` 1,698,634 bytes (TanStack's own OPFS worker) and `index-*.js` 1,314,553 bytes. `platform-browser/src` is unchanged since 00:46. No report.

- 01:06 to 01:16 on 2026-10-20, on disk and in the scratchpad, unreported, best guess this agent's:
  - **Lazy loading:** a disposable Vite prototype, scratchpad `lazywasm/` (01:06), best guess checking how a lazily imported module's wasm is emitted and loaded.
  - **One SQLite load:** a new `platform-browser/src/internal/Statements.ts` (01:14), "the one statement loop `BrowserSqlite.make` and the shared database's connection both use". It runs each statement with bound parameters and collects the rows. Best guess the start of the `execute` service. `BrowserSqlite.ts` changed at 01:16.
  - `platform-browser/CHANGELOG.md` changed at 01:07. Item 3 of the [B1 follow-ups](b1-follow-ups.md), one `Crypto` layer, is underway too.
  - Not yet: `WebLock.ts` is unchanged since 23:04 on 2026-10-19, so no `steal`; `src/main.tsx` is unchanged since 23:47 on 2026-10-19. No report.
- 01:12: Codex Astra review 3 passes lightly over `platform-browser`, since it's still landing ([code reviews](code-reviews.md)).

- 01:16 to 01:24 on 2026-10-20, on disk, unreported:
  - **One leader:** `platform-browser/src/WebLock.ts` changed at 01:16: "A context can also take a lock with `steal`, so the tab a person focuses" leads. (The 01:14 entry above read it as unchanged.)
  - **One SQLite load:** `internal/SqlConnection.ts` (01:20) is "the leader's one connection to the app's database, shared by every tab". A tab that opens a transaction holds the connection until it ends, as SQLite's autocommit flag says, so another tab's statement never runs inside it or reads rows it didn't commit. `SqlProtocol.ts` and `Leader.ts` (01:24), `Engine.ts`, `BrowserRuntime.ts` and `index.ts` (01:20 to 01:21) and `BrowserSqlite.ts` (01:24) changed with it.
  - `src/main.tsx` is unchanged. No report.

- 01:45 to 01:58 on 2026-10-20, on disk and in the scratchpad, unreported: **the SDK half is in.**
  - **One SQLite load:** `SharedSqlite` (`platform-browser/src/SharedSqlite.ts`, 01:46) is the app's own database, opened by the engine's leader beside its store and reached from every tab with `execute`. `SharedSqlite.open` is the `{ execute, close }` that TanStack DB's browser persistence takes. A transaction stays one tab's own until it ends, and the leader rolls back the open transaction of a tab that closes (changeset `browser-shared-sqlite.md`, 01:51).
  - **One leader:** `WebLock.hold(name, { steal: true })` takes a lock at once from whichever context holds it, and the held lock's `lost` tells that context.
  - **Lazy loading, a breaking change:** `BrowserRuntime.run` and `layerHost` take the SQLite build as lazy imports, `sqlite: { module, wasm }`, instead of `wasm` bytes. The root imports neither the build nor the engine eagerly.
  - **Tests:**
    - real-browser `test/browser/SharedSqlite.test.ts` (01:47): two tabs' statements run on one database with the build loaded once; when the leader tab closes, the lead moves to the follower, committed rows stay and an open transaction is rolled back; rows survive a killed browser;
    - `test/browser/WebLock.test.ts` (01:48);
    - `test/BrowserBundle.test.ts` (01:46): the root bundle loads no engine and no `wa-sqlite/dist/` file.
  - **Docs:** README, `api.md`, the durable-engine concept, the run-flows-in-a-tab guide, installation and troubleshooting (01:50 to 01:58).
  - **The app:** `src/flows/engine.worker.ts` (01:48) passes the lazy `sqlite` build. `src/main.tsx` (01:58) still calls TanStack's `openBrowserWASQLiteOPFSDatabase`, not `SharedSqlite.open`.
  - **The production build** (scratchpad `mvp-build-after/`, 01:49, compared with `mvp-build-before/` from 01:05):

    ```
    file                               before (bytes)   after (bytes)
    wa-sqlite-*.wasm                   1,129,661        1,129,661   (one copy)
    opfs-worker-*.js (TanStack's)      1,698,634        1,698,634   (still emitted)
    emscripten-module.browser-*.js     -                ~686,000 x 2
    engine.worker-*.js                 -                1,981,371
    index-*.js (main)                  1,314,553        2,668,301
    ```

- **About 02:05 on 2026-10-20: the SDK half is done**, reported by the `platform-browser` agent with [B1 follow-ups](b1-follow-ups.md) items 3 and 5. The lead to Will: "The app and the browser engine now share one SQLite load, the focused tab can take leadership, the engine and its 1.1 MB wasm load only in the worker, and the three WebCrypto copies are now one."
  - **`SharedSqlite`:** the app's `app.db` sits beside the engine's `engine.db` in the leader's worker, reached from every tab over a `<name>/sql` channel. A tab that closes mid-transaction has its transaction rolled back.
  - **`WebLock.hold(name, { steal })`:** the focused tab can take the lead.
  - **Lazy loading:** the engine and its wasm load only in the worker.
  - **Tests:** 221 at 100% coverage; real Chromium 9 of 9.
  - **Handover to the wiring agent:** `main.tsx` calls `SharedSqlite.open`; then delete `DEVICE_FILES` and the `opfs-worker` vite config, about 1.7 MB less; the device wipe must stop the engine worker before it deletes.
  - **It also found the blocker:** since the wiring edit the app doesn't open in a real browser, because the page imports `@smthrs/agent`, whose root reaches `node:dns` ([agent root in the browser](agent-root-browser-safe.md)).
- 02:05:43, `apps/mvp/dist`: a production build from before the app half still emits TanStack's `opfs-worker-*.js` (1,698,634 bytes), `wa-sqlite-*.wasm` (1,129,661 bytes, one copy), `engine.worker-*.js` (2,022,045 bytes) and `index-*.js` (2,676,670 bytes).
- 02:07 on 2026-10-20, on disk, unreported: **the app half is in `src/main.tsx`.**
  - The device store opens with `SharedSqlite.open({ name: ENGINE_NAME })`, "the app's shared SQLite database in the engine worker's OPFS pool … reached by every tab through the leading tab's worker". `openBrowserWASQLiteOPFSDatabase` is gone.
  - `DEVICE_FILES` appears nowhere in `src/` or `worker/`, and `vite.config.ts` (02:07) no longer names TanStack's OPFS worker.
  - **The wipe:** "A worker's open handle blocks deleting an OPFS file, so a wipe only marks itself and has every tab reload." The next boot's `finishWipe` deletes the engine's OPFS directory and the outbox's IndexedDB under an exclusive Web Lock, before anything opens. Best guess this meets "stop the engine worker first".
  - TanStack's `BrowserCollectionCoordinator` still runs its own election, as ruled.
  - No production build after 02:07 is on record, so the 1.7 MB saving is unmeasured.
- 02:31 on 2026-10-20, A2a's report to the wiring agent: in a real browser the engine worker dies at load (`document is not defined`). With no worker leading, `SharedSqlite.open` waits 30 s and falls back to memory, so `/app` renders after about 31 s and nothing persists. A2a's `Host` gains `engineWorker` and `wipe`; in Node tests, tabs on one device share an engine store ([app wiring](app-wiring.md)).
- No production build measuring the wa-sqlite copies is on record by 02:35; A3's build at 02:33 passed, size not reported.

- **About 02:36 on 2026-10-20: the SDK half has a bug in the real app**, found by the wiring agent. Once the engine worker starts, every saved collection fails: statements sent to `SharedSqlite` are refused (`Statements.ts:16`). And once a leader exists, TanStack fails to acquire leadership. The lead to Will: "I sent it back to the agent that built the shared SQLite service, to reproduce it in real Chrome and fix it at the source with a test that fails first." The `platform-browser` agent was resumed. Status stays in progress; the 02:05 "SDK half done" no longer holds.
- 02:38 to 02:43 on 2026-10-20, on disk, unreported: in `packages/smithers/flows/platform-browser`, `package.json` (02:38), `test/browser/Harness.ts` (02:42), `src/SharedSqlite.ts` (02:43:00), `src/internal/Leader.ts` (02:43:12), `test/browser/TanStack.test.ts` (02:43:13) and `test/SharedSqlite.test.ts` (02:43:55) changed. `src/internal/Statements.ts` is unchanged since 01:15. Best guess: a real-Chrome TanStack reproduction and the fix in progress.
- Meanwhile the wiring agent's engine-failure path opens the device store in memory at once, not after 30 s, and says "Smithers can't run in this browser" ([app wiring](app-wiring.md)).
- 02:43 to 02:55 on 2026-10-20, on disk, unreported: **best guess the cause and the fix of the refused statements.**
  - **The cause, per the new test's doc:** "TanStack adds a column and treats SQLite's own 'duplicate column name' message as 'already there', so a refusal must carry that message." The wiring agent saw the 02:05 code refuse with `effect/sql/SqlError: Failed to execute statement`, not SQLite's own message.
  - **The fix:** `src/SharedSqlite.ts` (02:43:00) adds `SharedSqlite.SqliteError`, shaped as wa-sqlite's `SQLiteError`: "`message` is SQLite's own, such as `duplicate column name: replay_json`, which TanStack DB's persistence reads to tell a column it already added, and `code` is SQLite's result code." `src/internal/Leader.ts` (02:43:12) carries SQLite's code and message back for a refused statement, "never logged", and counts statements by outcome. `src/internal/Statements.ts` is unchanged since 01:15.
  - **Tests:** a new real-Chromium `test/browser/TanStack.test.ts` with `test/browser/app/tanstack.ts` (02:43:13) runs several persisted collections on one persistence with TanStack's tab coordinator and the engine's leader running every statement. `test/SharedSqlite.test.ts` (02:43:55) expects `{ name: "SQLiteError", message: "duplicate column name: c", code: 1 }`. The `CHANGELOG.md` entry (file last changed 02:52:45) says the same.
  - **Not on record:** a run of the new tests before or after the fix, and whether TanStack's "Failed to acquire leadership" has the same cause.
  - No change in the package after 02:43:55 except the changelog and `docs/api.md` (02:53), and the SDK agent's `test/browser/app/agent.ts` ([agent root in the browser](agent-root-browser-safe.md)).

- **About 02:58 on 2026-10-20: the refusal is fixed, reported by the `platform-browser` agent.** The 02:43 best guess holds.
  - **The cause:** TanStack DB's persistence runs `ALTER TABLE applied_tx ADD COLUMN replay_json` on every boot. It treats a failure as "already exists" only if the message contains "duplicate column name". `SharedSqlite` rejected with a generic `SqlError` ("Failed to execute statement"), so a normal boot step failed every persisted collection.
  - **The fix:** `Database.execute` rejects with `SharedSqlite.SqliteError`, which carries SQLite's own message and code, with the `SqlError` as its cause. The leader logs a refused statement at debug.
  - **Tests, both failing first:** one in Node, and one in real Chromium with the app's exact composition (TanStack DB 0.15.1 and its persistence 0.2.36, as dev-only dependencies of `platform-browser`). The real-Chromium suites pass 10 of 10.
  - **The app needs no change.**
  - The lead to Will (02:58): "One blocker is left before the app runs end to end: the agent library loading page code in the worker. Its fix is in progress."
  - **Status: done for the SDK.** The app's proof (collections persist across a reload; one wa-sqlite wasm in the production build) comes with the wiring agent's report, after the [agent root](agent-root-browser-safe.md) fix.
- 02:56 to 03:05 on 2026-10-20, scratchpad `wiring/e2e-1.log`, unreported: the first real-browser e2e run of the app with the engine worker loading. The local-first cases that persist through reloads and restarts pass (offline ask, restart offline, two tabs offline, reload mid-answer). The "two tabs" case fails: a question asked in the tab that doesn't lead was sent twice (5 messages where 4 were expected) ([local-first](local-first.md), [app wiring](app-wiring.md)). The run's saved browser logs (`apps/mvp/test-results`) show no TanStack "Failed to acquire leadership" error and no `SqlError`.
- About 03:20 on 2026-10-20: the lead to the wiring agent: the "two tabs" duplicate and the missing Retry are product bugs "in the outbox or the leader handoff" ([app wiring](app-wiring.md)). 03:22, scratchpad `wiring/e2e-2.log`: "two tabs" still fails the same way ([local-first](local-first.md)). No cause is named yet, so this item stays done for the SDK.
- 03:46 to 03:50 on 2026-10-20, on disk, unreported: the wiring agent's sub-agent D1 changed `SharedSqlite` for the "two tabs" duplicate ([local-first](local-first.md)). Before, a transaction open when the leading tab closed failed with `ConnectionError`. Now the tab runs the transaction's statements again on the next leader and carries on if each reads the same. The leader records commits in `shared_sqlite_commits`, so a commit is never run twice. Changed: `src/SharedSqlite.ts`, `internal/Leader.ts`, `internal/SqlProtocol.ts`, `internal/Metrics.ts`, `docs/troubleshooting.md`, `docs/concepts/durable-browser-engine.md` and the `browser-shared-sqlite` changeset. The Node suite passed 235 of 235 at 03:49. No real-Chromium run of the change is on record. The status stays done for the SDK until D1 reports.
- 03:55 to 04:00 on 2026-10-20, unreported: with D1's `SharedSqlite` handover change on disk, the app's two-tabs cases pass in real Chromium, 3 of 3 each (scratchpad `d1/run5`). Still done for the SDK ([local-first](local-first.md)).

- **11:10:58 on 2026-10-20: [review round 4](review-round-4.md), Claude Fable's flow-hosts sub-review, unrouted by 11:15.**
  - **R4-25 (P2, code-path analysis, not reproduced): the shared SQLite's commit receipt fails open, so a transaction can land twice across a leader handover.** `packages/smithers/flows/platform-browser/src/internal/Leader.ts:318-336` (`prepareCommits`) and `:408-420` (the `INSERT OR REPLACE INTO shared_sqlite_commits` inside the opening statement) catch every failure, log `outcome: "unrecorded"` and keep serving. If the receipt write fails (`SQLITE_FULL`, an I/O error, the table never created) and leader L1 commits a tab's `BEGIN … COMMIT` but loses the lock before replying, L2 answers the resend with `TransactionLost`, and `SharedSqlite.ts:206-225` replays the whole transaction; the replay guard compares returned rows, which an `INSERT` has none of both times. So the device store (chat's `unsent`, auth's `confirmed`, the engine's own tables) applies it twice and the caller sees success. Fix: `ROLLBACK` and answer `Failed` when the receipt insert fails; answer `DatabaseUnavailable` when `prepareCommits` fails.
  - **P3s:** S-P3-6: a failing statement that opened a transaction (`BEGIN; <failing>`) leaves the leader holding it with no `watch`, and the `Failed` reply carries no `open` (`SqlConnection.ts:97-104`, `Leader.ts:407, 421, 441-447`), so the tab runs later statements inside a transaction it doesn't know about. S-P3-7 (latent): a stolen OPFS pool stops the engine for good after about 4 s (`BrowserSqlite.ts:166-195`, `Engine.ts:139-151`); nothing steals the engine lock today. S-P3-8: `failureType` and `resultCodec` are duplicated across `platform-cloudflare` and `platform-browser`. S-P3-9: hand-rolled backoff loops in `BrowserSqlite.ts:166-172` and `TerminalSocket.ts:206-219` (and `jj`'s `retryGitIndexLock`).
  - Status stays done: a P2 seen only in source waits for the lead's ruling (round 4 tracker rule).
- **12:52:09 on 2026-10-20: R4-25 and S-P3-6 fixed** by [review round 4](review-round-4.md)'s SDK batch 2 agent, each with a test that failed on the old code (the new test saw a transaction land twice across a handover); uncommitted, changeset `shared-sqlite-receipt-fails-closed`. If the commit receipt can't be written, the leader rolls back and fails the statement. A receipt the next leader can't read fails without running anything. A failing statement rolls back any transaction it opened itself. Deviation from the brief: when `prepareCommits` fails, the leader still serves reads and single statements; it just can't open a transaction. `platform-browser` is at 100% coverage. Status stays done.

## Next

From 12:52 on 2026-10-20: nothing here. The fix lands in round 3 of [land to main](land-to-main.md); the leader P3s S-P3-7 to S-P3-9 go to the [P3 cleanup](review-round-4-p3-cleanup.md).

Until 12:52 on 2026-10-20 the next step was, from 11:15 on 2026-10-20: the lead's ruling on round 4's R4-25 and the leader P3s ([review round 4](review-round-4.md)).

Until 11:15 on 2026-10-20 the next step was, from about 02:58 on 2026-10-20, this item is done for the SDK. What's left is the app's proof, in the wiring agent's report ([app wiring](app-wiring.md)): saved collections persist across a reload; a second tab's TanStack coordinator settles as a follower; a production build emits one wa-sqlite wasm and no TanStack `opfs-worker`. The "two tabs" duplicate send belongs to [local-first](local-first.md) until shown to come from `SharedSqlite` or `WebLock.hold`'s steal; from 03:20 the lead names the outbox or the leader handoff as its place, and the wiring agent finds which.

Until about 02:58 on 2026-10-20 the next step was, from about 02:55: the `platform-browser` agent's report. Proof: the real-Chromium TanStack test fails on the 02:05 code and passes now, a second tab's coordinator settles as a follower with no acquire error, and 100% coverage. Then, once the engine worker loads in the app ([agent root in the browser](agent-root-browser-safe.md), fix on disk 02:52:43), the app's saved collections persist across a reload, and a production build emits one wa-sqlite wasm and no TanStack `opfs-worker` ([app wiring](app-wiring.md)).

Until about 02:55 on 2026-10-20 the next step was, from about 02:36: the `platform-browser` agent's report. Proof: a real-Chrome test that failed on the 02:05 code shows a tab's statements accepted by the leader's `SharedSqlite`, and a second tab's TanStack coordinator settling as a follower without an acquire error; then the app's saved collections persist across a reload. After it, the wiring agent's report on the app half, with the proof below.

Until about 02:36 on 2026-10-20 the next step was, from about 02:05: the wiring agent's report on the app half ([app wiring](app-wiring.md)). Proof: a production build emits one wa-sqlite wasm and no TanStack `opfs-worker`; one tab leads both the engine and the outbox, and when it closes both move to the same follower; sign-out's wipe deletes the device's databases with no worker holding them. The SDK half needs nothing more.

Until about 02:05 on 2026-10-20 the next step was, from 01:58: the app half. `src/main.tsx` passes `SharedSqlite.open` to TanStack's persistence and drops `openBrowserWASQLiteOPFSDatabase`, so the build stops emitting TanStack's OPFS worker. That file is the wiring agent's ([app wiring](app-wiring.md)). Then the agent's report, with the proof below.

The agent's report. Proof: wa-sqlite loads once and the build emits one copy, loaded lazily; one tab leads both the engine and the outbox, and when it closes both move to the same follower; the focused tab takes the lead with `steal`; 100% coverage, with the shared `execute` service tested in a real browser across two tabs. TanStack's own election stays until TanStack DB takes an injectable lock.

Until about 01:00 on 2026-10-20 the next step was: the lead, after the SDK reds agent leaves `platform-browser`, in the [app wiring](app-wiring.md) step: an `execute` service, so TanStack's persistence uses B1's `BrowserSqlite` as a second database file, and `WebLock.hold` with `steal`, so the focused tab leads. Proof: wa-sqlite loads once, one tab leads both the engine and the outbox, and when it closes both move to the same follower. TanStack's own election stays until TanStack DB takes an injectable lock.

Until the lead took it, after 00:47 on 2026-10-20, the next step was: assign the `platform-browser` work: an `execute` service, so TanStack's persistence uses B1's `BrowserSqlite` as a second database file, and `WebLock.hold` with `steal`, so the focused tab leads. Proof: wa-sqlite loads once, one tab leads both the engine and the outbox, and when it closes both move to the same follower. TanStack's own election stays until TanStack DB takes an injectable lock.

Until 00:44 on 2026-10-20 the next step was: L1's report: the replica as a second database file on B1's `BrowserSqlite`, the outbox on B1's `WebLock`, and TanStack's own leader gone from `main.tsx`. Proof: one tab leads both the engine and the outbox, and when it closes, both move to the same follower.

Until 23:44 the next step was: B1 exposes its leader and VFS; L1 passes them to the persistence and the outbox in `main.tsx`. Proof: one tab leads both the engine and the outbox, and when it closes, both move to the same follower.

## Questions for Will

None. Open for the lead: send TanStack DB an upstream PR for an injectable lock? Why did the main bundle double, to 2,668,301 bytes, between 01:05 and 01:49? (Still 2,676,670 bytes at 02:05.) (Answered about 02:05 on 2026-10-20: who switches `src/main.tsx` to `SharedSqlite`? The wiring agent, by the `platform-browser` agent's handover.)
