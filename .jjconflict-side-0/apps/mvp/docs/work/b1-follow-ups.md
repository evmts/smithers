---
title: "B1 follow-ups: browser docs, one liveness helper, one Crypto layer"
status: done
area: sdk
owner: items 1, 2 and 4 done by the SDK reds agent (reported 00:55 on 2026-10-20); items 3 and 5 done by the `platform-browser` follow-ups agent (started about 01:00, reported done about 02:05 on 2026-10-20)
updated: 2026-10-20
links: [app-wiring.md, durable-browser-engine.md, flows-root-platform-neutral.md, cloudflare-flow-host.md, web-standard-globals-rule.md, library-catalog.md, sdk-test-reds.md, platform-cloudflare-edge-cache.md, ../decisions/0011-the-agent-runs-in-the-browser.md, ../../../../docs/libraries.md, ../../../../AGENTS.md, one-sqlite-one-leader.md, local-first.md, pwa.md, repo-checks-green.md]
---

## What

Four cleanups B1 reported when the [durable browser engine](durable-browser-engine.md) was done:
1. **Docs:** engine-store's README and `Ownership` docs still say browsers can't run flows. Correct them.
2. **One liveness helper:** `BrowserRuntime.isAlive` in `platform-browser` duplicates `CloudflareHost.isAlive` in `platform-cloudflare`. One run-store helper replaces both.
3. **One `Crypto` layer:** three copies of a WebCrypto `Crypto` layer become one in `@smthrs/crypto`. Likely copies: `platform-browser/src/internal/WebCrypto.ts`, `platform-cloudflare/src/CloudflareHost.ts` and the sandboxed-flow guest (`SandboxedFlowGuest.ts`).
4. **Support matrix:** it still lists browsers as bundle-only; `docs/libraries.md` says so in its hosts paragraph. Browsers now run flows durably.

## Why

Root `AGENTS.md`: "never leave two implementations of one behavior." Docs that say browsers can't run flows contradict decision [0011](../decisions/0011-the-agent-runs-in-the-browser.md) and B1's own Chromium proof. A WebCrypto layer in `@smthrs/crypto` calls web-standard globals, which the lead ruled aren't platform code ([web-standard globals](web-standard-globals-rule.md)).

## State

- About 23:41 on 2026-10-19: B1 reported the four items with its done report.
- They wait until two agents finish, so no two agents edit the same files:
  - the Cloudflare child-flow agent, which owns `platform-cloudflare`, home of `CloudflareHost.isAlive` ([Cloudflare flow host](cloudflare-flow-host.md));
  - the [flows root](flows-root-platform-neutral.md) agent, which moves host code across the flows packages.
- Not started.

- 00:08 on 2026-10-20: both agents are still running. The flows-root agent edited `platform-node/src/internal/SandboxedFlowGuest.ts` (23:46), one of item 3's likely `Crypto` copies, so item 3 starts from that version.


- 00:07 on 2026-10-20: F4+F5 added a `/// <reference path="./internal/AccessHandlePoolVFS.d.ts" />` to `platform-browser/src/BrowserSqlite.ts` so `apps/mvp` typechecks. Best guess: a fifth item, so a consumer gets the wa-sqlite declaration without that patch ([flows and the agent](flows-and-agent.md)).

- 00:21 on 2026-10-20: the child-flow agent finished, so `platform-cloudflare` is free ([Cloudflare flow host](cloudflare-flow-host.md)).
- About 00:24: **started**, in one agent with two SDK reds ([SDK test reds](sdk-test-reds.md)):
  - **Item 1:** the engine-store README points browsers to `BrowserRuntime` instead of saying they "cannot execute durable flows", and the `Ownership.sameHostPidProbe` docs stop saying a browser keeps lease-only liveness.
  - **Item 2:** one run-store `Ownership` helper for "another instance of the same host is dead", used by `BrowserRuntime` and `CloudflareHost`, with both duplicates deleted.
  - **Item 4:** the support matrix stops listing browsers as bundle-only. At 00:19, `apps/site/docs/reference/support-matrix.md` still says "bundle only. No durable flows".
  - **Not now:** item 3, the one `Crypto` layer. The [flows root](flows-root-platform-neutral.md) agent still edits `platform-node`, so this agent must not touch the `@smthrs/flows` root or `platform-node`. Item 5, the wa-sqlite declaration, isn't in its brief.
  - Proof asked: typecheck, lint, tests and coverage gates for every touched package; `pnpm docs:sync` and `pnpm docs:check`, checking `df -h /` first and reporting rather than deleting anything if the disk is low.
- 00:30 to 00:33 on 2026-10-20, on disk, unreported:
  - **Item 2:** `run-store/src/Ownership.ts` (00:30) and its test (00:31) add `Ownership.singleIncarnationLiveness`. `BrowserRuntime.ts` and `CloudflareRuntime.ts` (00:31) pass it as `isAlive`, and `CloudflareHost.isAlive` is gone. A consumer typecheck logged at 00:32 (scratchpad `consumer-check.log`) still failed `platform-cloudflare/test/CloudflareHost.test.ts` on the removed `isAlive`; by 00:36 that test no longer names it. No later typecheck result is on record.
  - **Item 1:** the engine-store `README.md`, `docs/installation.md` and `docs/concepts/ownership-and-fencing.md` changed at 00:33.
  - Docs for both hosts: `platform-browser`'s `docs/api.md`, `durable-browser-engine.md` and `PACKAGE.ts` (00:32), and `platform-cloudflare`'s `README.md`, `CHANGELOG.md`, `docs/api.md` and `execution-lifecycle.md` (00:32).
  - About 00:35: the [edge cache](platform-cloudflare-edge-cache.md) agent started in `platform-cloudflare` too, in different files.


- 00:35 on 2026-10-20, on disk, unreported: **item 4 looks done.** `apps/site/docs/reference/support-matrix.md`'s Browsers row now reads "Durable flows in a dedicated worker through `BrowserRuntime` in `@smthrs/platform-browser`, over wa-sqlite in OPFS, one leader per origin by Web Lock. A run resumes after Chromium is killed." The catalog's hosts paragraph in `docs/libraries.md` (00:35) names the browser host and its `browserTest` evidence ([library catalog](library-catalog.md)).
- 00:39 on 2026-10-20: **the flows-root agent is done** ([flows root](flows-root-platform-neutral.md)), so item 3, the one `Crypto` layer, can start. Nobody has it yet. That agent left `platform-browser` and `platform-cloudflare` untouched and reported `platform-cloudflare` tests still naming the removed `CloudflareHost.isAlive`, which is item 2 in progress.
- 00:44 on 2026-10-20: L1's report adds three `platform-browser` items ([local-first](local-first.md)). The lead put them on the wiring checklist (scratchpad `final/WIRING.md`), and [one SQLite, one leader](one-sqlite-one-leader.md) tracks the first two:
  - an `execute` service, so TanStack's persistence shares B1's SQLite;
  - `WebLock.hold` with `steal`, so the focused tab leads;
  - tree-shaking: importing the `platform-browser` root pulls the engine's modules into dev, and the production build emits a 1.1 MB wasm it never loads.
- As of 00:47: no report from the SDK reds agent on items 1, 2 and 4.

- 00:46 to 00:54 on 2026-10-20, scratchpad runs, best guess this agent's:
  - `run-store` alone (`runstore-test.log`, 00:46) failed its gate at 99.45% branches. The SQLite and Postgres matrix (`runstore-matrix.log`, 00:48) passes 624 tests at 100% on all four measures, so item 2's helper is covered on both stores.
  - `platform-cloudflare` 57 pass at 100% (00:47, 00:50) and `platform-browser` 199 pass at 100% (00:47). The [edge cache](platform-cloudflare-edge-cache.md) agent edits both packages too, so these runs may be its.
  - `pnpm docs:sync` (00:53) and a repo-wide `pnpm docs:check` (00:54) pass, exit 0.
  - No report on items 1, 2 and 4.
- After 00:47: the lead's [app wiring](app-wiring.md) step holds L1's three `platform-browser` items (the `execute` service, `WebLock.hold` with `steal`, tree-shaking the 1.1 MB wasm), and the lead took [one SQLite, one leader](one-sqlite-one-leader.md) for after this agent leaves `platform-browser`.

- **About 00:55 on 2026-10-20: items 1, 2 and 4 are done**, reported by the SDK reds agent with the [SDK test reds](sdk-test-reds.md), at 100% coverage:
  - **Item 1, docs:** the engine-store and run-store docs say browsers and Cloudflare run flows durably.
  - **Item 2, one liveness helper:** `Ownership.singleIncarnationLiveness` in `run-store` replaces both `isAlive` copies, `BrowserRuntime.isAlive` and `CloudflareHost.isAlive`, which are deleted.
  - **Item 4, support matrix:** browsers are no longer listed as bundle-only.
  - The lead then corrected the flow runtime's README (`packages/smithers/flows/README.md`, 00:55), which still said browsers can't run flows durably.
- 00:58: the lead held the shared-SQLite work in `platform-browser` until the [edge cache](platform-cloudflare-edge-cache.md) agent, which also edits that package, reported.
- **About 01:00: items 3 and 5 started**, in one agent with L1's `platform-browser` items ([one SQLite, one leader](one-sqlite-one-leader.md)). Its scope, as the lead put it: "The other makes the app load SQLite once and adds crypto and bundle cleanups."
  - **Item 3:** one WebCrypto `Crypto` layer in `@smthrs/crypto`, replacing the copies.
  - **Item 5:** the `BrowserSqlite.ts` lint fix, best guess the wa-sqlite declaration reference F4+F5 added.
  - With them: one SQLite load (an `execute` service forwarded over `TabChannel`), `WebLock.hold` with `steal`, and lazy loading of the engine and its wasm, so the main bundle carries no 1.1 MB wasm.
  - 01:05, scratchpad `mvp-build-before/`, best guess this agent's baseline: the production build emits `wa-sqlite-*.wasm` (1,129,661 bytes), `opfs-worker-*.js` (1,698,634 bytes) and `index-*.js` (1,314,553 bytes). No report.

- 01:15 to 01:16 on 2026-10-20, on disk, unreported: **item 3 is underway.**
  - `@smthrs/crypto` has a new `src/WebCrypto.ts` (01:16): "Effect's `Crypto` service over the global WebCrypto object", one implementation for Node, Bun, browsers and Workers. It reads randomness only when asked, never at module scope, because Cloudflare refuses a script that calls `crypto.getRandomValues` at module scope (upload error 10021). Its `index.ts`, `package.json` (01:15) and `test/WebCrypto.test.ts` (01:16) changed with it.
  - `platform-cloudflare/src/CloudflareHost.ts` now provides `WebCrypto.layer` from `@smthrs/crypto`.
  - Not yet deleted: `platform-browser/src/internal/WebCrypto.ts` (unchanged since 22:45 on 2026-10-19). Whether the sandboxed-flow guest's copy moved isn't on record.
  - Item 5: `BrowserSqlite.ts` changed at 01:16, alongside the shared-SQLite work ([one SQLite, one leader](one-sqlite-one-leader.md)).
  - No report.

- By 01:59 on 2026-10-20, on disk, unreported:
  - **Item 3, the copies are gone:** `platform-browser/src/internal/WebCrypto.ts` is deleted. The `platform-browser` engine, `platform-cloudflare`'s `CloudflareHost.ts` and `platform-node`'s `SandboxedFlowGuest.ts` use `WebCrypto` from `@smthrs/crypto`. The changeset (`crypto-webcrypto-layer.md`, 01:23) is a major bump for `@smthrs/platform-cloudflare`, since `CloudflareHost.layerCrypto` is removed. It also fixes a sandboxed-flow guest's request for more than 65,536 random bytes, which failed with `QuotaExceededError`.
  - **Item 5:** best guess `platform-browser/src/internal/AccessHandlePoolVFS.d.ts` (01:16), a local declaration for the wa-sqlite VFS module.
  - The API baseline check at 01:45 named `@smthrs/crypto`, `platform-browser`, `platform-cloudflare` and `platform-node` among five packages with declaration drift. The baseline was recorded again at 01:52 ([repo checks green](repo-checks-green.md)).
  - No report.

- **About 02:05 on 2026-10-20: items 3 and 5 are done**, reported by the `platform-browser` follow-ups agent with the SDK half of [one SQLite, one leader](one-sqlite-one-leader.md):
  - **Item 3, one `Crypto` layer:** one `WebCrypto` layer in `@smthrs/crypto`; the three copies are gone.
  - **Item 5:** the triple-slash fix, F4+F5's `/// <reference path=…>` in `BrowserSqlite.ts`.
  - `platform-browser`: 221 tests at 100% coverage; real Chromium 9 of 9.
- **All five items are done**, so this note is closed. The lead asked for it to close if every item was done.

## Next

None. Every item is done; the app's use of them is [app wiring](app-wiring.md).

Until about 02:05 on 2026-10-20 the next step was: the agent's report on items 3 and 5: one `Crypto` layer in `@smthrs/crypto` with the copies deleted, and the `BrowserSqlite.ts` declaration fixed, each tested on every host it touches, with 100% coverage, `pnpm docs:sync` and `pnpm docs:check`. L1's items report with it ([one SQLite, one leader](one-sqlite-one-leader.md)).

Until about 01:00 on 2026-10-20 the next step was: the agent's report on items 1, 2 and 4. Assign item 3, the one `Crypto` layer, now that the flows root is done, and item 5, the wa-sqlite declaration, each with tests on every host it touches, 100% coverage, `pnpm docs:sync` and `pnpm docs:check`. L1's three `platform-browser` items go to the lead in the [app wiring](app-wiring.md) step once this agent leaves the package.

Until 00:47 on 2026-10-20 the next step was: the agent's report on items 1, 2 and 4. Assign item 3, the one `Crypto` layer, now that the flows root is done, and item 5, the wa-sqlite declaration, each with tests on every host it touches, 100% coverage, `pnpm docs:sync` and `pnpm docs:check`. The tree-shaking item from L1 needs an owner too.

Until 00:39 on 2026-10-20 the next step was: the agent's report on items 1, 2 and 4. Then item 3, the one `Crypto` layer, after the flows-root agent reports, and item 5, the wa-sqlite declaration, each with tests on every host it touches, 100% coverage, `pnpm docs:sync` and `pnpm docs:check`.

Until about 00:24 on 2026-10-20 the next step was: when both agents report, one agent takes all four, with tests for the shared helper on both hosts, 100% coverage, `pnpm docs:sync` and `pnpm docs:check`.

## Questions for Will

None.
