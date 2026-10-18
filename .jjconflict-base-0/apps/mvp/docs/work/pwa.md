---
title: The app is a PWA
status: done
area: app
owner: L1 agent (started 23:01 on 2026-10-19), as 0002's app step 4; reported done 00:44 on 2026-10-20
updated: 2026-10-20
links: [../decisions/0011-the-agent-runs-in-the-browser.md, ../decisions/0002-local-first.md, local-first.md, durable-browser-engine.md, web-first-desktop-later.md, one-sqlite-one-leader.md, b1-follow-ups.md, land-and-deploy-mvp.md]
---

## What

The app installs as a progressive web app:
- A web app manifest: name, icons, start URL and display mode.
- The service worker from decision [0002](../decisions/0002-local-first.md) precaches the app shell, fonts, the wa-sqlite WASM and the OPFS worker, so the app opens offline after one earlier visit. It never caches `/api/*`.
- The service worker never runs the flow engine. A leader tab's dedicated worker does ([durable browser engine](durable-browser-engine.md)).
- At boot the app calls `navigator.storage.persist()` and records the grant as a metric (0002's risk table).

## Why

Will, 22:29 on 2026-10-19: "The app should be a pwa to go along with it's local-firstness btw". Decision [0011](../decisions/0011-the-agent-runs-in-the-browser.md) §5.

## State

- Decided in 0011 at 22:31. Not built: `apps/mvp` has no manifest, no service worker and no `vite-plugin-pwa` dependency yet.
- 0002 already lists `vite-plugin-pwa` among its new dependencies and puts the service worker in its app step 4.
- Nobody is assigned.
- 23:01: **L1 builds it** with [local-first](local-first.md): `vite-plugin-pwa`, an installable web app manifest, and a service worker that serves the shell offline and never runs the flow engine (0011). The e2e suite reloads offline after one online visit.
- 23:07: `apps/mvp` still has no manifest or service worker on disk.
- 23:15: still no manifest or service worker in `apps/mvp`; L1's first files are in `packages/effect-tanstack-db` ([local-first](local-first.md)).

- 23:25: `apps/mvp/package.json` (changed 23:16) now lists `vite-plugin-pwa` 2.0.0, most likely L1's. `vite.config.ts` is unchanged since 14:33, and there is still no manifest or service worker on disk.

- 23:28: the lead told L1 the PWA must land in this run ([one SQLite, one leader](one-sqlite-one-leader.md)).
- 23:30 to 23:34, **configured on disk**, unreported:
  - `vite.config.ts` (23:31) registers `VitePWA` with `autoUpdate` and a manifest: name "Smithers", `start_url` `/app`, `display` `standalone`, and four icons, one maskable.
  - Workbox precaches the shell, with a 4 MiB file limit for the OPFS worker. Navigation falls back to `index.html` except under `/api/`. Same-origin `GET`s outside `/api/` are network-first from a `smithers-shell` cache, so an offline reload still has every module. The dev server runs the service worker too.
  - Icons: `public/icon.svg`, `icon-192.png`, `icon-512.png` and `icon-maskable-512.png`, rendered by a new `scripts/render-icons.mjs` (23:30). `index.html` changed (23:31).
  - `src/main.tsx` asks for persistent storage at boot, and `src/features/chat/metrics.ts` records the grant ([local-first](local-first.md)).
  - No e2e result yet for an offline reload after one online visit.

- 00:08 on 2026-10-20: the PWA files are unchanged since 23:31. L1's new e2e helper (`e2e/devices.ts`, 00:00) takes a device offline; no offline-reload result is on record yet ([local-first](local-first.md)).

- 00:22 on 2026-10-20: L1's `e2e/devices.ts` waits for the service worker to control the page before a device goes offline. The offline reload had failed at 00:11 and 00:13 with `GET /src/main.tsx net::ERR_FAILED` ([local-first](local-first.md)). The PWA files are unchanged since 23:31. No offline-reload pass is on record.

- 00:29 on 2026-10-20: a production build in the scratchpad's `mvp-build/` holds the PWA output: `sw.js`, a Workbox runtime, `registerSW.js`, `manifest.webmanifest`, and the 192, 512 and maskable 512 icons. Best guess L1's. No offline-reload result is on record ([local-first](local-first.md)).


- 00:44 on 2026-10-20: **done, reported by L1** ([local-first](local-first.md)), uncommitted. The manifest, the icons and a service worker that never touches `/api/*` ship. A reload works offline after one online visit: 0002 §7's e2e cases E1 to E10 all pass. Installability isn't reported as its own check.
- Left, tracked elsewhere: the production build emits a 1.1 MB wasm it never loads ([B1 follow-ups](b1-follow-ups.md)).
- About 01:00 on 2026-10-20: the unused 1.1 MB wasm has an owner: lazy loading of the engine and its wasm is part of [one SQLite, one leader](one-sqlite-one-leader.md). The build at 01:05 (scratchpad `mvp-build-before/`) still emits `wa-sqlite-*.wasm`, 1,129,661 bytes.

## Next

None for this note. It ships with the app wiring and the first deploy ([land and deploy](land-and-deploy-mvp.md)).

Until 00:44 on 2026-10-20 the next step was: L1's report, with the e2e proof: the manifest is valid and installable, and an offline reload after one online visit opens the shell.

Until 23:30 the next step was: build it with 0002's app step 4 ([local-first](local-first.md)): the manifest, the service worker and the persistence request. Test it end to end: the manifest is valid and installable, and an offline reload opens the shell.

## Questions for Will

None.
