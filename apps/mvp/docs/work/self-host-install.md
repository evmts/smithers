---
title: Self-hosted install on a Mac (deferred until after ship)
status: idea
area: infra
owner: unassigned; deferred by Will at 13:31:14 on 2026-10-20 ("Built for hosted only now yes cut scope in that way"); a docs agent records the ruling (the lead, 13:32:34). Until 13:46: unassigned
updated: 2026-10-20
links: [old-app-feature-gaps.md, web-first-desktop-later.md, host-agnostic-flows.md, infrastructure-as-code.md, settings-screen.md, ../decisions/0010-web-first-desktop-later.md, ../decisions/0011-the-agent-runs-in-the-browser.md, ../../../../AGENTS.md, decisions-for-will.md, ../../../../.specs/product/mvp.md, mvp-scope-cut.md, ../todo.md, docs-truth-pass.md, will-decision-queue.md, native-app-di-plan.md]
---

## Current specification — 2026-10-20, 20:14 PDT

**What:** Keep the deferred install history and track the newly requested native-app design separately.

**Why:** Will’s latest native planning request warrants design work while the hosted app remains the current implementation.

**Current state:** The earlier 13:31 hosted-only ruling remains the baseline. At 20:13 the lead starts native-app planning after Will’s Telegram request, quoted in the shared native brief. Sol is planning; Opus and the merge are queued. No native build or install receipt exists.

**Next step:** Use native-app-di-plan.md for the active DI design. Reconcile its merged decisions with hosted-only docs before any implementation; do not extend old app product code.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and assistant replies in session 6253ecf2, 18:15–20:14 PDT on 2026-10-20; queue answers through 19:38 PDT; current rulings, decisions 0001–0020, proposals, TODOs, rules and shared briefs/designs. Later Will text and queue answers prevail. Product checks are reported receipts; this tracker validates the site build. Execution ownership is retained.

## Earlier tracker history (retained)

## What

**Deferred until after ship** (Will, 13:31:14 on 2026-10-20: "Built for hosted only now yes cut scope in that way"). The app targets the hosted deployment only ([decision 0010](../decisions/0010-web-first-desktop-later.md#hosted-only-will-2026-10-20)); every service stays behind a Layer so this install stays possible. The hosted-only question is answered.

The old app ran as one install on one Apple Silicon Mac, set up from the browser.

Old app:
- `/setup`, the "Set up Smithers" checklist: sign in; repository (owner and name, mirror); machine (build the image); address (This Mac only, or Network with a bind address and the origins teammates use); model access (Coding, Fast and Decisions keys, "Key not accepted") (`apps/app/src/mainview/cards/SetupCard.tsx`, `cards/views/SetupView.tsx`, `cards/views/SetupFields.tsx`).
- Install settings in `/settings`: address, health, GitHub App callbacks and machine capacity (`cards/views/SettingsView.tsx`).
- Journeys: `apps/app/e2e/real/j1.spec.ts`, `setup.spec.ts`, `install-origins.spec.ts`.

The scope expects it:
- The root `AGENTS.md`: Smithers "runs hosted and as one install on one Apple Silicon Mac". M-28 and M-31: Smithers' own development moves to the install on Will's Mac mini.
- Self-hosting must not depend on private files or services.

New app: Cloudflare Workers through Alchemy, Neon Postgres, Electric and Code Storage. Decision 0010 is web first, with a desktop app only when a feature needs one. No note or decision designs a self-hosted install.

## Why

- This is the largest scope question in the gap list: M-31's dogfooding plan assumes a Mac mini install.
- Teams that can't send code to a hosted service need it.

## How it fits

Decision 0011 already keeps the code host-agnostic, so each hosted service is a Layer to swap:
- flows on `@smthrs/platform-node` or `-bun`;
- local Postgres and Electric, as `pnpm db:up` already runs for development;
- a local git store behind the Code Storage service;
- local sandboxes behind `Sandbox.Provider`.

A setup flow replaces the old checklist.

## Size

L; more than 3 weeks with sandboxes.

## State

- 06:10 to 06:15 on 2026-10-20: written by the old-app audit as gap 18 of 19, "a scope decision for Will before any build" ([old app feature gaps](old-app-feature-gaps.md)).
- **06:15:58 on 2026-10-20: the lead asked Will.** "One question it raises for you: the self-hosted install on a Mac. Should the new app target hosted only for now, leaving the Mac install for later? The audit recommends yes." Row 4 of [decisions for Will](decisions-for-will.md).
- By 06:26: no answer. Nothing builds a Mac install; the new app keeps building against hosted services.
- **06:43:26 on 2026-10-20: asked again**, fourth of the lead's four "Blocked on you today" asks: "Hosted only: should the app target hosted only for now, leaving the self-hosted Mac install for later? I recommend yes." No answer by 06:55.
- **13:26:18 on 2026-10-20: asked again** as quick question 2 of 4: "Build for hosted only now, and add the self-hosted Mac install later? Recommended: yes."
- **13:31:14, Will:** "Built for hosted only now yes cut scope in that way." The new app builds against hosted services only; the Mac install is deferred, not cut. Each service keeps its Layer (0011), so the install stays possible.
- **13:32:34, the lead:** "Hosted only: the Mac install is deferred. It conflicts with `AGENTS.md` M-31, which plans our own development on the install on your Mac mini; I'll leave that line for you." A docs agent records the ruling in the decision docs; no decision doc mentions it by 13:46 (0010 unchanged since 21:15 on 2026-10-19).
- The conflict on disk: root `AGENTS.md` says Smithers "runs hosted and as one install on one Apple Silicon Mac" and, under M-31, that Smithers' own development moves onto the install on Will's Mac mini; `.specs/product/mvp.md` M-31 says the same.
- Status stays `idea`: deferred by Will. The maintainer site has no `deferred` status (`apps/maintainer-site/build.mjs`), so the title says it.
- **14:04 on 2026-10-20: the docs agent recorded the ruling** in decision 0010 ("Hosted only", with the M-31 conflict for the lead) and added "the self-hosted install, after ship" to [`todo.md`](../todo.md#the-self-hosted-install-after-ship). Root `AGENTS.md` is unchanged.
- **14:22:33 on 2026-10-20, Will (queue, on "M-31: dogfood on hosted until the Mac mini install returns?"):** "A lot of our docs are out of date we need to update them the source of truth is htis mvp. we are building and what we are doing now". The [docs truth pass](docs-truth-pass.md) (from about 14:25) rewrites root `AGENTS.md`, `.specs/product/mvp.md` M-31 and the rest to describe the hosted MVP; the Mac mini install is marked out of date.

## Next

From 14:30 on 2026-10-20: none until after ship, or until Will brings it back. The [docs truth pass](docs-truth-pass.md) brings M-31 and root `AGENTS.md` in line with hosted only.

Until 14:30 on 2026-10-20 the next step was, from 14:04 on 2026-10-20: none until after ship, or until Will brings it back. Will decides what root `AGENTS.md` and mvp.md M-31 say now (row 4 of [decisions for Will](decisions-for-will.md)).

Until 14:04 on 2026-10-20 the next step was, from 13:31: none until Will brings it back. The docs agent records the deferral; Will decides what root `AGENTS.md` and mvp.md M-31 say now.

Until 13:46 on 2026-10-20 the next step was: Will's answer. If hosted only: this stays an `idea`, and each new service keeps a Layer so the install stays possible. If the install stays in this release: a design record (setup flow, local Postgres and Electric, a local git store, local sandboxes), then a plan.

## Questions for Will

None. The M-31 question was answered 14:22:33 on 2026-10-20: the docs follow the MVP being built now.

Until 14:30:

- **New (the lead left it for Will at 13:32:34 on 2026-10-20):** root `AGENTS.md` and mvp.md M-31 move Smithers' own development onto the install on your Mac mini. With the install deferred, should M-31 change now (for example, dogfood on the hosted app), or stay as the later target? Best guess: dogfood on hosted until the install returns, and say so in M-31.
- Answered 13:31:14 on 2026-10-20: hosted only now; the install is deferred.

Until 13:31:

- Does the new app keep the self-hosted Mac install in this release, or stay hosted-only for now? Recommended: hosted-only now, with every service kept behind a Layer so self-hosting stays possible.
