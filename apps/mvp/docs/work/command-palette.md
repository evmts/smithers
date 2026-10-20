---
title: Search and command palette (go to anything)
status: idea
area: app
owner: unassigned
updated: 2026-10-20
links: [old-app-feature-gaps.md, slash-commands.md, navigate-flow.md, keyboard-navigation-and-vim.md, ../proposals/mvp-gaps.md, ../decisions/0003-flows-and-the-agent.md]
---

## What

The old app had one overlay above the composer, opened with ⌘K, where the draft is the query. It found any subject or action and ran it as a flow.

```
⌘K ▏#412                       prefixes: (none) everything · path · :120 line · / slash tree
┌───────────────────────────┐            wiki: · history: · run: · change: · # issues · secret: · ? help
│ Ask Smithers              │  first row, always
│ Recent  ...               │  last 7 days, only while the query is empty
│ Issues  #412 Retry hooks  │  → opens the item's actions panel; ↵ open; ⌘↵ primary action
└───────────────────────────┘  ⌘⇧K reopens with the last query
```

Old app:
- `apps/app/src/mainview/SearchPalette.tsx`, with the prefix table in `apps/app/src/mainview/flows/SearchQuery.ts`.
- Flows `palette.open`, `palette.actions` and `palette.recent` in `apps/app/src/mainview/flows/entries/palette.ts`.
- Groups, in order: Recommended, Recent, Flows, Files, Wiki, History, Runs, Changes, Issues, Boxes, Secrets, People. Every action in the actions panel is a registered flow.

New app: ⌘K toggles the composer (`apps/mvp/src/features/chat/shortcuts.ts`). [Slash commands](slash-commands.md), in progress, list flows only, not subjects.

## Why

- It is the old app's single way to reach anything by keyboard, and spec mvp.md §6.4 says "⌘K opens the composer and palette".
- A person finds a file, issue or run without knowing a command name.
- Weak keyboard access is a release bug (M-48).

## How it fits

- One `@smthrs/ui` palette component (combobox and listbox), shared with the slash menu. The composer's draft is the query.
- Rows come from local TanStack DB collections (repositories, files already read, conversations, and runs once [notifications and live work](notifications-and-live-work.md) lands) plus the flow registry (`apps/mvp/src/flows/registry.ts`). Local rows need no network. Code and wiki search stay with `mvp-gaps.md` item 16.
- Choosing a row dispatches a flow: [`app/navigate`](navigate-flow.md) to open a page, or the row's own action flow. The dispatch span carries `door: palette`.
- Recent items are a local-only collection on the device.

## Size

M. The shell over `app/navigate` and the slash rows is S; each prefix grows as its subject lands.

## Questions for Will

- Is `/` one mode of the palette, as in the old app, or a separate composer menu? The [slash commands](slash-commands.md) note asks the same for the lead. Recommended: one palette, with `/` as a mode.
