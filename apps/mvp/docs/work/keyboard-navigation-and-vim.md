---
title: Keyboard-first shell, pane navigation and Vim input
status: idea
area: app
owner: unassigned
updated: 2026-10-20
links: [old-app-feature-gaps.md, command-palette.md, chat-message-controls.md, ../rules.md, ../decisions/0003-flows-and-the-agent.md]
---

## What

The old app could be driven entirely by keyboard, with an optional Vim mode.

Old app:
- **Focus and lists:** roving ↑ ↓ Home End Esc in menus, lists and tables (`apps/app/src/mainview/RovingKeyDown.ts`); buttons show their `<kbd>` hint (`ShortcutButton.tsx`); focus returns to the last control when chat or the palette closes (`runtime/ComposerFocus.ts`); while a person drives a terminal, browser or editor, the rest of the app dims (`state/controller/controlFocus.ts`).
- **Panes:** in Vim mode, Ctrl+B then h j k l, `o`, `;`, or `q` and a number moves between panes such as Navigation, Timeline, Repository, Ask, Wiki, Flows, Settings and Notifications; `?` shows help (`KeyboardNavigation.tsx`, `runtime/KeyboardPanes.ts`, `runtime/KeyboardInput.ts`).
- **Vim input:** `m` opens the Normal or Vim menu (`InputModeMenu.tsx`, flow `input.mode` in `flows/entries/guide.ts`, saved by `state/InputMode.ts`). A status bar shows VIM NORMAL, INSERT or VISUAL. Text fields get motions, counts, `d` `c` `y`, visual mode, paste, undo and redo (`runtime/VimBuffer.ts`). The Markdown editor becomes a plain textarea in Vim mode.
- **Composer keys:** Alt+Enter queues a prompt, Alt+↑ restores one, Esc stops the running answer.
- Journey: `apps/app/e2e/real/keyboard-journeys.spec.ts`.

New app: ⌘K and Esc only.

## Why

- Spec mvp.md §6.4: "Normal and Vim input, keyboard-only throughout". M-48: weak keyboard access is a release bug.
- Every view the new app adds (repo view, renders, forms) needs one focus model, and adding it later means retrofitting each view.

## How it fits

- The generic parts (roving focus, a pane registry, `<kbd>` hints, the Vim buffer) go into `@smthrs/ui` with tests and docs, never into the app ([rules](../rules.md)).
- The input mode is a device preference like the theme: a client flow `app/input-mode/set { mode }`, a setter, so the agent can switch it too (decision 0003's parity law).
- Pane focus is local-only view state in a TanStack DB collection, with no `useEffect`.
- One end-to-end journey drives the whole app by keyboard and records a GIF.

## Size

M for panes, focus and shortcuts; another M for Vim mode (a port of `VimBuffer.ts`).

## Questions for Will

- Ship panes and shortcuts first and Vim mode second? Recommended: yes, since keyboard access is a release bug and Vim is a preference.
