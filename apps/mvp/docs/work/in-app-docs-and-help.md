---
title: In-app docs, command help and first-sight hints
status: idea
area: app
owner: unassigned
updated: 2026-10-20
links: [old-app-feature-gaps.md, slash-commands.md, command-palette.md, landing-and-chat.md, ../todo.md]
---

## What

Docs and help inside the app.

Old app:
- **`/docs`:** a table of contents, the page and its anchors, and "Page not found" (`apps/app/src/mainview/cards/DocsCard.tsx`, `cards/views/DocsView.tsx`, `state/controller/docs.ts`).
- **`/help`:** every command by group, with its synopsis and description and the tags "Asks first" and "Only you". An Advanced section is collapsed (`cards/CommandsContainer.tsx`, `cards/views/CommandsView.tsx`).
- **Hints:** lightbulb tips, one at a time, each dismissed for good, such as "Press ⌘K or Ctrl+K for Chat and commands." (`HelpBubble.tsx`, `FirstSightHint.tsx`, flow `app.hint.dismiss`).
- Journeys: `apps/app/e2e/playwright/spec/A-DOCS.spec.ts`, `A-HELP.spec.ts`.

New app: none. [Slash commands](slash-commands.md), in progress, list flows with their descriptions. `todo.md` says the app is "also our GitHub front page and our docs", but no note plans the docs.

## Why

- Signed-out visitors browse freely, and the app is meant to be the docs (`todo.md`).
- The agent answers how-to questions better from the same pages.

## How it fits

- Docs come from the repository's Markdown (each package's colocated `docs/`, gathered by `pnpm docs:sync`). They render with the repo view's Markdown renderer at `/docs/...`.
- `/help` is generated from the flow registry, so it can't drift.
- Hints use a local-only collection of dismissals.
- The agent gets a `docs/read` flow.

## Size

M.

## Questions for Will

- Do the docs live at the app's `/docs` route, or on a separate docs site? Recommended: the app.
