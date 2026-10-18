---
title: effect-tanstack-db and effect-electric packages
status: done
area: sdk
owner: Electric and TanStack DB package agent (Opus, finished); Will (code review asked); the lead commits
updated: 2026-10-20
links: [app-wiring.md, ../state.md, ../decisions/0002-local-first.md, ../../../../docs/libraries.md, local-first.md, sync-service-di-test-seam.md, electric-client-bug-report.md, decisions-for-will.md, code-reviews.md]
---

## What

Two standalone Effect libraries that the app uses exactly as an outside user would:
- `@smthrs/effect-tanstack-db` (`packages/effect-tanstack-db`): collections as scoped services checked by an Effect `Schema` (`Collection.local`, `Collection.make`), reads and writes as Effects with typed errors, `changes()` and `LiveQuery` rows as `Stream`s, plus `setWindow`. It knows nothing about Electric or the app.
- `@smthrs/effect-electric` (`packages/effect-electric`): `ElectricCollection.make` decodes every synced row; a `sync` event stream, `reconnect`, `awaitTxId`, `awaitMatch`; `SyncPolicy` as a `Schedule` (1 s doubling to 10 s, jittered); `ShapeSource`, the sync service, with `ShapeSource.layerFaulty()` for tests; and `ShapeProxy` for the server.

Their only peers are Effect, TanStack DB and Electric; no `@smthrs/*` dependency beyond the core package.

## Why

Will: "So wouldn't the electric layer and tanstack db be better architecture here anyways?" And: "at the very end we will be moving it into it's own reusable package others can use so it should be generic and architected well".

## State

- Earlier on 2026-10-19: both packages existed with README, examples, changelog and license, and the app's `collections.ts` and `ShapeProxy.ts` were deleted.
- 21:18: a weekly usage limit stopped the agent; it resumed at 21:19.
- 21:23: the agent reported done. Uncommitted; the lead hasn't reviewed it yet.
  - Tests: `effect-tanstack-db` 40, `effect-electric` 109, the app 176, all at 100% coverage. Typecheck, eslint, dprint, the browser-bundle contract and docs targets pass.
  - `ShapeProxy` allowlists protocol parameters, parses `subset__*` with a strict grammar (anything else gets 400) and adds Electric's secret on the server.
  - Creation and mutation options are objects, so [local-first](local-first.md)'s persistence and outbox can be added without breaking callers.
  - Private for now; proposed public names `effect-tanstack-db` and `effect-electric`.
  - It added a "Local state and sync" section to `docs/libraries.md`.
- Left for others: two repo checks are red on other agents' work (`pnpm docs:check` on `platform-cloudflare`, and the publication check that reads `release.yml`).
- 21:29: the lead no longer lists this agent among the running ones. `pnpm docs:check` passes again. No report on the `release.yml` publication check. Still uncommitted.
- About 22:00: the lead asked Will to review both packages, fourth of five asks on [decisions for Will](decisions-for-will.md) and the one it called the most valuable code review: these are meant to be generic, publishable libraries, and every later feature reads and writes data through them. Suggested first file: `packages/effect-electric/src/ElectricCollection.ts`. About 20 minutes. The app at http://localhost:1337/app runs on these packages now, with compose Postgres, Electric and PgBouncer healthy. No review yet at 22:04.
- 23:00: Will moved his code review to after the current feature list ([land and deploy](land-and-deploy-mvp.md)).
- 23:01: L1 extends both packages with OPFS persistence and the offline outbox, through the option objects built for them ([local-first](local-first.md)). [Codex checkpoint review 2](code-reviews.md) found no defect in either package.

- 23:15 to 23:25: L1's additions are on disk with tests: the outbox and OPFS persistence in `effect-tanstack-db`, and restore-before-sync and fault switches in `effect-electric`. Will's requested review now covers this new code too ([local-first](local-first.md)).

- 00:44 on 2026-10-20: L1's report makes `ShapeProxy`'s subset policy deletable: once `subset:` leaves the ShapeProxy config in `worker/Chat.ts`, the subset policy and `internal/subset.ts` in `@smthrs/effect-electric` can go. It is on the lead's wiring checklist ([app wiring](app-wiring.md)). As of 00:54, `subset:` is still at `worker/Chat.ts` line 186.

## Next

Will reviews; the lead reviews and commits it. Then [local-first](local-first.md) adds persistence and the outbox through these packages.

## Questions for Will

- Review `packages/effect-tanstack-db` and `packages/effect-electric`, starting at `packages/effect-electric/src/ElectricCollection.ts`? Best done before the app moves to [durable answering](durable-answering.md), since the cutover builds on them.
- They stay private until the release Will described: "at the very end". No question there.
