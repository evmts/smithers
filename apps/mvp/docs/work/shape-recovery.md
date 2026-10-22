---
title: Shape outage recovery and access
status: blocked
area: live-data
owner: Codex shape-recovery
updated: 2026-10-22
links: [../observability.md, ../decisions/0002-local-first.md]
---

Reproduce transient shape failures before fixing recovery, add content-free request and browser load diagnostics, and stop non-Admin alert subscriptions. Libraries: catalog entries `@smthrs/effect-electric` (shape proxy, injected ShapeSource and retry policy), `@smthrs/effect-tanstack-db` (collections), Effect telemetry through the existing app exporter. Core transport repair, not a new product feature.

The shared proxy records access/database/Electric outcomes without content. Browser recovery requires decoded data and the actual installed cursor, including a shared-device watcher; transient failures retain the existing SyncPolicy backoff. Admin subscriptions wait for confirmed access and a newer confirmation can reconnect a shape stopped by 403. No UI copy was added.

Real streaming-response regression also exposed the source replacing its caller's abort signal: preserve both signals so collection closure cancels bodies after headers. Test hosts refuse new requests and drain request scopes before dropping isolated schemas. The persistence-only late-snapshot test disables its unused agent.

SDK validation: effect-electric 82 tests and effect-tanstack-db 175 tests passed with 100% statements, branches, functions and lines; SDK source/test typechecks passed. Astra reviewed the installed receipts, access fencing, cancellation and fixture teardown with no remaining findings. Fable could not authenticate through the configured local Claude accounts; their OAuth credentials are expired and refresh failed.


App validation: 234 tests across 19 suites passed; all 10 targeted production modules have 100% statements, branches, functions and lines. TestDatabase endpoint guards passed 15 tests with 100% coverage. All four apps/mvp typecheck projects and the executed importRules target passed. Documentation sync completed and docs:check passed 51 published package tarballs.

Isolated local Playwright passed both shape-recovery cases with one worker: three injected 503s followed by real Electric data, exactly one main-frame navigation, usable composer and recovery telemetry; Member pages make no Admin shape requests and direct requests answer 403 without Retry-After. Both GIFs and videos passed the media checks. Initial dev-server attempts exposed a stale Vite optimizer cache and then its first compilation reload before the app started; those failed artifacts are retained separately, and the unchanged strict test passed after regenerating and warming the cache. These browser cases make no model calls; the local dev stack uses an unusable model credential to satisfy its startup configuration.

Implementation and local validation are finished. Only the required Fable review is blocked by expired local Claude authentication. No production deployment, production rerun or push was performed.
