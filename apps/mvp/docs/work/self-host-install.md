---
title: Self-hosted install on a Mac
status: idea
area: infra
owner: unassigned
updated: 2026-10-20
links: [old-app-feature-gaps.md, web-first-desktop-later.md, host-agnostic-flows.md, infrastructure-as-code.md, settings-screen.md, ../decisions/0010-web-first-desktop-later.md, ../decisions/0011-the-agent-runs-in-the-browser.md, ../../../../AGENTS.md, decisions-for-will.md]
---

## What

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

## Next

Will's answer. If hosted only: this stays an `idea`, and each new service keeps a Layer so the install stays possible. If the install stays in this release: a design record (setup flow, local Postgres and Electric, a local git store, local sandboxes), then a plan.

## Questions for Will

- Does the new app keep the self-hosted Mac install in this release, or stay hosted-only for now? Recommended: hosted-only now, with every service kept behind a Layer so self-hosting stays possible.
