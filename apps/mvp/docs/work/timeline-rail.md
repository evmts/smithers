---
title: Timeline rail beside the conversation
status: idea
area: app
owner: unassigned
updated: 2026-10-20
links: [old-app-feature-gaps.md, conversations-and-history.md, notifications-and-live-work.md, model-endpoint.md, ../decisions/0009-notifications-and-live-work.md]
---

## What

A rail beside a long conversation, one short line per entry, to find your place and jump.

Old app (`apps/app/src/mainview/Timeline.tsx`, `TimelineZoom.ts`, `TimelineSummary.ts`, `ShellRail.tsx`):
- One line per entry, with a 3- to 8-word summary written by the fast model ("Switch to dark mode", "Quickstart opened").
- Live entries pulse, Needs you is gold, failures are ember.
- A band marks the entries on screen; clicking a line scrolls to it.
- Past 60 entries, distant lines fold into groups ("12 entries · 11:48 – 12:05") with summaries of their own.
- Shown on desktop only, at 1180 px and up.
- The rail's home line reads "<repo> · N need you · M working".
- Journey: `apps/app/e2e/real/timeline.spec.ts`.

Spec mvp.md §6.4, Timeline (Will).

Already planned, so not part of this gap: decision 0009 names "the timeline (later)" as one view of its notification rows, and its §4 covers the edges that show live work scrolled out of view.

Not planned: the rail, the summaries and the folding.

## Why

`main`'s shared conversation is long (spec §6.4). Without the rail, a person scrolls to find where they left off.

## How it fits

- Summaries: one fast-model `ModelStep` per entry, through the model endpoint under a `summary` role ([model endpoint](model-endpoint.md)), stored as rows that sync to every device.
- Folding is a pure function of entries and the visible band.
- An `@smthrs/ui` component, desktop only.

## Size

L.

## Questions for Will

- Build it after [several conversations](conversations-and-history.md)? It pays off only once conversations are long and shared. Recommended: yes, after.
