---
title: "Immutable cache service: edge, browser and memory layers"
status: done
area: sdk
owner: edge-cache agent (started about 00:35 on 2026-10-20, done by 01:00); the R3 to R5 agent uses it ([repo clone and view](repo-clone-and-view.md))
updated: 2026-10-20
links: [../decisions/0006-repo-clone-and-view.md, ../../../../docs/libraries.md, repo-clone-and-view.md, code-storage-spend-caps.md, durable-answering.md, integrations-browser-safe-root.md, gitremote-unicode-branches.md, cloudflare-flow-host.md, b1-follow-ups.md, integrations-effect-httpclient.md, durable-browser-engine.md, observability.md]
---

## What

One platform-neutral, immutable cache service, keyed by content address, with three layers:
- `@smthrs/platform-cloudflare`: the Workers Cache API, the edge cache;
- `@smthrs/platform-browser`: the browser's Cache Storage;
- memory, for tests and fault cases.

RepoApi uses it as the SHA cache: tree and blob responses never change at a commit SHA, so RepoApi checks the cache before Code Storage. A hit costs nothing and is served even when the month's read budget is spent. Its metrics carry no paths or file content.

Until about 00:35 on 2026-10-20 the What was: an injected Effect service in `@smthrs/platform-cloudflare` over the Workers Cache API only: get and put a response by key, with a test layer for faults. The title was "Edge cache service in @smthrs/platform-cloudflare".

## Why

Decision 0006, "Capacity and spend": "The Cache API is platform code, so `@smthrs/platform-cloudflare` must add it as an injected service before R3." Root `AGENTS.md` keeps platform code in host packages and lets every other package reach it only as an injected service. It is the last SDK piece before feature 2's backend (R3) can be built ([repo clone and view](repo-clone-and-view.md)).

## State

- 2026-10-19, about 22:02: named as an R3 prerequisite by the [spend caps](code-storage-spend-caps.md) design.
- 22:06: the lead told Will the clone flow needs "a Cloudflare edge cache service" first.
- On disk, `packages/smithers/flows/platform-cloudflare/src` has `CloudflareHost`, `CloudflareRuntime` and `ExecutionObject`, and no Cache API use. Not started.

- 23:25: **still unassigned, by the lead's choice.** The child-flow agent owns `@smthrs/platform-cloudflare` until it finishes ([Cloudflare flow host](cloudflare-flow-host.md)); the lead assigns this service then, so two agents never edit the package at once. That agent is writing `src/internal/Routing.ts` and `src/ExecutionObject.ts` (23:24 to 23:25). `src` still has no Cache API use.

- 23:37: **still unassigned.** The child-flow agent is still writing in `platform-cloudflare` (`Routing.ts`, `ExecutionObject.ts` and tests, 23:31 to 23:37). The [integrations root](integrations-browser-safe-root.md) is done (23:27), so this is the last SDK piece before R3.

- 00:21 on 2026-10-20: **the child-flow agent is done**, so `platform-cloudflare` is free ([Cloudflare flow host](cloudflare-flow-host.md)). By 00:25 the [`HttpClient` move](integrations-effect-httpclient.md) is done too, so this is the last SDK piece before R3 ([repo clone and view](repo-clone-and-view.md)). Still unassigned at 00:27.
- About 00:24: item 2 of the [B1 follow-ups](b1-follow-ups.md) started. It replaces `CloudflareHost.isAlive` in this package with a run-store helper, so an edge-cache agent would share the package with it, in different files.
- 00:31 to 00:33: on disk, the B1 follow-ups agent changed `platform-cloudflare`'s `CloudflareHost.ts`, `CloudflareRuntime.ts`, `CloudflareHost.test.ts`, `README.md`, `CHANGELOG.md` and two docs pages ([B1 follow-ups](b1-follow-ups.md)).
- 00:32: the lead told Will: "I've also started the edge cache: the last SDK piece before repository cloning goes into the app. It caches file reads by commit, with one interface and a separate implementation for Cloudflare, the browser and tests."
- About 00:35: **started**, with the wider scope above: one platform-neutral service and three layers, not a Cloudflare-only service. Metrics carry no paths or content.
- About 00:36: no cache code on disk yet. No file in `platform-cloudflare`, `platform-browser` or the flows packages uses `caches.default`, `caches.open` or `CacheStorage`. No report.


- 00:41 to 00:46 on 2026-10-20, on disk, unreported: **the service and two of its three layers.**
  - `@smthrs/artifacts` gains `ImmutableCache` (`src/ImmutableCache.ts`, 00:41, exported from its root): `get` and `put` over bytes stored under a content address, and `readThrough`, the usual call. A failure is never stored, and a failing cache never fails the read. An entry holds up to 8 MiB (`maxEntryBytes`) and 1,024 bytes of JSON metadata; a larger `put` answers `too_large`. The backend is anything with the Web Cache API's `match` and `put`; `layerMemory` serves Node and tests. Each call is one span and counts by backend, key namespace, operation and outcome, never a key's parts or an entry's content.
  - `test/ImmutableCache.test.ts` (00:43), 25 cases.
  - `@smthrs/platform-cloudflare`'s `EdgeCache.ts` (00:44): `EdgeCache.layer({ name })` over `caches.default` or `caches.open(name)`, with `caches` injectable so tests can give it a cache that refuses. Its docs say a Worker's cache is per data center and each call counts toward the Worker's subrequest limit.
  - `@smthrs/platform-browser`'s `BrowserCache.ts` (00:46), the Cache Storage layer. Both platform packages now depend on `@smthrs/artifacts`.
  - Not yet: a test result, the workerd and real-browser runs, the catalog rows and a report.

- About 00:40 to 01:00 on 2026-10-20: **built.** The neutral service is `ImmutableCache` in `@smthrs/artifacts` (catalog row "Store large blobs by content hash"; the new row "Cache content that never changes"), beside the content-addressed store, so no new package. Its hosts are `EdgeCache.layer` in `@smthrs/platform-cloudflare` (the Workers Cache API) and `BrowserCache.layer` in `@smthrs/platform-browser` (Cache Storage); `ImmutableCache.layerMemory` serves Node and tests. One adapter over the Web Cache API's `match` and `put` serves all three. Proven in local workerd (`test/EdgeCache.workerd.test.ts`), in Chromium (`test/browser/Cache.test.ts`, an entry survives a killed browser) and from Node over workerd's real caches; faults by an injected `WebCache` or `CacheStorage`; 100% coverage in each package.

- 00:47 to 00:54 on 2026-10-20, on disk, no report to the lead:
  - The "built" entry above was written into this note at 00:52, best guess by this agent; the lead still lists the edge cache as running.
  - **Changeset** `.changeset/immutable-cache.md` (00:52): minor bumps for `@smthrs/artifacts`, `@smthrs/platform-cloudflare` and `@smthrs/platform-browser`. Telemetry counts `immutable_cache_requests` and `immutable_cache_bytes`.
  - **Docs:** decision 0006's SHA-cache paragraph (00:52) names `ImmutableCache.readThrough` provided by `EdgeCache.layer`, "built 2026-10-20". `docs/libraries.md` has the new row "Cache content that never changes at its key". The artifacts, `platform-cloudflare` and `platform-browser` READMEs and docs changed at 00:51.
  - **Tests:** `test/ImmutableCache.test.ts` and `platform-cloudflare/test/EdgeCache.workerd.test.ts` (00:48 to 00:49); `platform-browser/test/browser/Cache.test.ts` (00:47). Scratchpad runs, attribution best guess: `platform-cloudflare` 57 pass, 4 skip, 100% coverage (00:47 and 00:50); `platform-browser` 199 pass, 100% (00:47). A repo-wide `pnpm docs:check` passed at 00:54 (`docs-check.log`), whose run isn't on record.

- **By 01:00 on 2026-10-20: done**, reported to the lead and accepted. The lead to Will: "The edge cache is done too, so I've started two more agents. One builds repository cloning and viewing in the app." Summary: `ImmutableCache` in `@smthrs/artifacts` with `readThrough(key, read)`; `EdgeCache.layer` (Workers Cache API), `BrowserCache.layer` (Cache Storage) and a memory layer; entries capped at 8 MiB; tested in workerd and Chromium at 100% coverage.
- About 01:00: R3 to R5 started, the first consumer ([repo clone and view](repo-clone-and-view.md)). `platform-browser` is free for the [one SQLite, one leader](one-sqlite-one-leader.md) work, which the lead held until this agent reported.

## Next

None for this note. R3 is the first consumer ([repo clone and view](repo-clone-and-view.md)).

Until about 01:00 on 2026-10-20 the next step was: R3 uses it: RepoApi's tree and blob routes and the `repo/tree` and `repo/read` flows call `ImmutableCache.readThrough(ImmutableCache.key("repo.tree", repoId, sha) | ImmutableCache.key("repo.blob", repoId, sha, path), read)`, where `read` checks the read budget (failing with `capacity`, which is never stored), reads Code Storage and meters `bytesRead`; a hit skips all three. The Worker provides `EdgeCache.layer({ name: "repo" })`; the browser may provide `BrowserCache.layer()`.

Until about 01:00 on 2026-10-20 the next step was the agent's report:
- the service designed against the [library catalog](../../../../docs/libraries.md) first, with its catalog row;
- test first: a hit skips the backing read, a miss fills the cache, and the memory layer drives the fault cases;
- the Workers layer tested in workerd and the Cache Storage layer in a real browser;
- 100% coverage, docs and a changeset;
- the browser-bundle contract still passing for the platform-neutral service.

Then R3 in [repo clone and view](repo-clone-and-view.md).

Until about 00:35 on 2026-10-20 the next step was: the lead assigns it now, and tells its agent that the B1 follow-ups agent edits `CloudflareHost.ts` in the same package. Then design it against the catalog first ([library catalog](../../../../docs/libraries.md)), test first, with 100% coverage and docs, then register it in the browser-bundle contract.

Until 00:21 on 2026-10-20 the next step was: after the child-flow agent reports, the lead assigns it. Then design it against the catalog first ([library catalog](../../../../docs/libraries.md)), test first, with 100% coverage and docs, then register it in the browser-bundle contract. It doesn't wait on W1 or W5.

## Questions for Will

None.
