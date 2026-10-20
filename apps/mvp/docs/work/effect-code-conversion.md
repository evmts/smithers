---
title: Convert code to Effect from chat
status: idea
area: app
owner: unassigned
updated: 2026-10-20
links: [old-app-feature-gaps.md, agent-ui-rendering.md, ../features/remote-flows.md]
---

## What

The old app's `convert <source>` sent code to a conversion service and showed the result in the conversation.

Old app:
- Flow `convert`, "Convert Effect code" (`apps/app/src/mainview/flows/entries/chat.ts`), and `state/controller/conversion.ts`.
- The result is compiled, diagnostics, refused or failed. It appears in the transcript and survives a reload.
- Errors read "Conversion failed." or "Open a repository."
- Each request carries a source label (`hn`, `x`, `discord`, `telegram`, `share`): it served a launch funnel.

New app: none, and no plan names it.

## Why

Unclear. It served the Effeck launch, not the Smithers loop.

## How it fits

A [remote flow](../features/remote-flows.md) `convert/Run` over the conversion service, with its result shown as a decision 0004 view ([agent UI](agent-ui-rendering.md)).

## Size

S, if the conversion service still runs.

## Questions for Will

- Keep it in Smithers, move it to Effeck, or drop it? Recommended: drop it from Smithers; Effeck owns it.
