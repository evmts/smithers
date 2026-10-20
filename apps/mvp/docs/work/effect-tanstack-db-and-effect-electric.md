---
title: effect-tanstack-db and effect-electric packages
status: in-progress
area: sdk
owner: unassigned; reopened at 11:07 on 2026-10-20 by review round 4's R4-8 (P1: `ShapeProxy` passes Electric's public `cache-control` on per-person shapes) and R4-11 (an outbox tab that regains the lead re-sends delivered writes), both reproduced; the lead routes them after merging round 4. Until 11:07: Electric and TanStack DB package agent (Opus, finished); Will (code review asked); the lead commits
updated: 2026-10-20
links: [review-round-4.md, web-page-flow.md, land-to-main.md, app-wiring.md, ../state.md, ../decisions/0002-local-first.md, ../../../../docs/libraries.md, local-first.md, sync-service-di-test-seam.md, electric-client-bug-report.md, decisions-for-will.md, code-reviews.md]
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

- **07:44:34 on 2026-10-20: a fix in `@smthrs/effect-electric`,** from the [web page flow](web-page-flow.md) agent. Its extra `views` sync exposed a race: the connection pill missed an early sync failure. `ElectricCollection`'s `sync` stream now begins with the latest sync event for a subscriber that starts late, so a shape Electric stopped before anyone listened (a 4xx on its first request) is no longer reported as nothing. A regression test fails on the old code; changeset `.changeset/electric-sync-replays-latest.md` (patch). Uncommitted; it lands in round 2 of [land to main](land-to-main.md). Status stays done.
- 00:44 on 2026-10-20: L1's report makes `ShapeProxy`'s subset policy deletable: once `subset:` leaves the ShapeProxy config in `worker/Chat.ts`, the subset policy and `internal/subset.ts` in `@smthrs/effect-electric` can go. It is on the lead's wiring checklist ([app wiring](app-wiring.md)). As of 00:54, `subset:` is still at `worker/Chat.ts` line 186.

- **11:01 to 11:05 on 2026-10-20: [review round 4](review-round-4.md) found two defects here, both reproduced.**
  - **R4-8 (P1, Claude Opus P1-2, reproduced by a fork): `ShapeProxy` caches per-person shapes publicly.** `packages/effect-electric/src/ShapeProxy.ts:146-147` drops only `content-encoding`, `content-length` and `access-control-*`, and `:261-264` forwards the rest, including Electric's `cache-control: public, max-age=604800, s-maxage=3600, stale-while-revalidate=2629746` (the fork ran compose Electric 1.8.1 through `ShapeProxy.make` for two people; both responses carried it). The server adds each person's filter, so the browser URL carries no identity. After sign-out (the app's wipe misses the HTTP cache) or a revoked role, the browser can answer the previous person's conversation, runs and flows from cache for up to a week. Fix: replace upstream `cache-control` with `private, no-store` and drop `etag` unless the host opts a public shape in; `ShapeSource.fetchSource` passes `cache: "no-store"`; a test that a proxied per-person shape is never `public`.
  - **R4-11 (Claude Fable S-P1-2 as P1, Claude Opus P2-5 as P2, both reproduced): an outbox tab that loses the lead and regains it re-sends writes the other tab already delivered.** `packages/effect-tanstack-db/src/Outbox.ts:524-537` (`hold` calls `hold(false)` again after `held.lost`), `:373-376` (`onLeadershipChange` only records status) and `:568-576` (`take`): the library's executor keeps its in-memory pending list across `pause()`, never drops ids missing from storage, and `executeAll` sends them on regain. Fable, two executors over one storage: sends were `[A, B, A]`, and A's `Write.settled` never resolved while B led. Contradicts `docs/api.md:453-455`, which names only the mid-flight overlap as a duplicate. The app's asks absorb it (`200 existing`); a consumer without server idempotency would write twice. Fix: on regain, drop pending ids absent from storage and resolve their waiters; on losing the lead, drop writes not in flight; a two-executor regression test.
  - **P3s:** Fable S-P3-2: a lead lost between the admission check and persistence surfaces as `NotAdmitted("storage")` (`Outbox.ts:388`, `:414-417`). Fable S-P3-4: a broken table cell at `effect-electric/docs/api.md:294`.
  - **Verified clean by Fable:** `ShapeProxy`'s parameter allowlist, ordering, header handling and secret redaction; `ImmutableCache`, `Persistence`, `Collection`, `LiveQuery`; the `repo-targets` SDK import rules on both packages; the Outbox suite 18/18 on the working copy.
- **Status moved from done to in-progress** under the round 4 tracker rule: a P1, or a reproduced P2 every finder rates P2, reopens a done note ([review round 4](review-round-4.md)).
- **11:54:51 on 2026-10-20: R4-11 fixed** by the client agent, uncommitted. A queued write another tab already sent settles as `sent_elsewhere` instead of a second send. `Outbox.Lock.hold` takes a steal option and returns `lost`, a breaking change (changeset `outbox-lock-leader-take`). `smthrs docs //packages/effect-tanstack-db:docs` passes; the package is at 100% coverage ([Fable review 2 fixes](fable-review-2-fixes.md)). R4-8's `ShapeProxy` change is on disk since 11:49, unreported ([review round 4](review-round-4.md)).
- **13:04:55 on 2026-10-20: part of `@smthrs/effect-electric` landed on `main`** in round 2 as `8359ef179e` "🐛 fix(effect-electric): a sync replays only the latest event per key; ShapeProxy serves only listed columns" (changesets `electric-sync-replays-latest` and `electric-proxy-columns`) ([land to main](land-to-main.md)). Not in it: R4-8's `no-store` change (`electric-shapes-no-store`) and R4-11's outbox changes (`outbox-lock-leader-take`, `outbox-withdraw`). Status stays `in-progress` until R4-8 reports.

## Next

From 11:55 on 2026-10-20: R4-8's report ([review round 4](review-round-4.md)). Then this item is done again. Will's own review stays open.

Until 11:55 on 2026-10-20 the next step was, from 11:07 on 2026-10-20: the lead rules on R4-8 and R4-11 and routes the fixes, each with a test that fails on the old code ([review round 4](review-round-4.md)). Then this item is done again. Will's own review stays open.

Until 11:07 on 2026-10-20 the next step was: Will reviews; the lead reviews and commits it. Then [local-first](local-first.md) adds persistence and the outbox through these packages.

## Questions for Will

- Review `packages/effect-tanstack-db` and `packages/effect-electric`, starting at `packages/effect-electric/src/ElectricCollection.ts`? Best done before the app moves to [durable answering](durable-answering.md), since the cutover builds on them.
- They stay private until the release Will described: "at the very end". No question there.
