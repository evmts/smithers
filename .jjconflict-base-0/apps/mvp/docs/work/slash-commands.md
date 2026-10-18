---
title: Slash-command autocomplete in the composer
status: in-progress
area: app
owner: slash-commands agent (started about 05:53 on 2026-10-20 by the lead, at Will's request); researching the old app and `@smthrs/ui` at 05:54, no file changed, unreported
updated: 2026-10-20
links: [flows-and-agent.md, roles-and-labels.md, sign-in.md, app-wiring.md, e2e-suite-and-gifs.md, agent-ui-rendering.md, code-reviews.md, decisions-for-will.md, ../decisions/0003-flows-and-the-agent.md, ../decisions/0007-roles-and-tags.md, ../decisions/0011-the-agent-runs-in-the-browser.md, ../features/flows.md, ../features/agent.md, ../rules.md, ../../../../AGENTS.md, ../../../../docs/libraries.md]
---

## What

Typing `/` in the chat composer opens a list of the flows this person may run. Typing filters the list, the keyboard completes a row, and running it dispatches the same typed flow a button or the agent would, through `FlowDispatch`. Arguments come from the flow's payload schema.

```
composer: /th▏
          ┌──────────────────────────────┐
          │ ▸ /theme  dark | light        │   ↑ ↓ move · Tab or Enter complete · Esc close
          │   /clone  owner/repo          │   (Member and up only)
          └──────────────────────────────┘
/theme dark ⏎ ──▶ FlowDispatch.dispatch("app/theme/set", { mode: "dark" })   door = slash
                  same flow as the header button and the agent's ctx.call
```

Best-guess spec, from the lead's brief (about 05:53 on 2026-10-20):
- **Rows:** every registered flow the person may start from the composer, with its description. Roles filter the list: Guests and signed-out people see only what they may run ([roles and labels](roles-and-labels.md), [sign-in](sign-in.md)).
- **Arguments:** parsed against the flow's payload schema with `@smthrs/ui`'s `flow-arguments` or `flow-form` helpers; for example `/theme dark` and the repo clone flow.
- **Keyboard and access:** `/` opens, typing filters, arrow keys move, Enter or Tab completes, Escape closes and keeps the draft. ARIA combobox and listbox semantics; weak keyboard access is a release bug (M-48).
- **Where the code goes:** a reusable command menu or autocomplete component goes into `@smthrs/ui` with tests and docs, never into the app. App state lives in local-only TanStack DB collections, with no `useState` or `useEffect`, and logic stays out of `.tsx` files ([rules](../rules.md)).
- **Telemetry:** each dispatch is the `flow.dispatch` span with `door: slash`, as decision 0003 §6 already names.
- **Text:** no explanatory prose in the menu (MINIMAL TEXT).
- **Proof:** unit tests at 100% coverage, and a real-browser spec `e2e/slash-commands.spec.ts` with video and a GIF: `/` shows the list, typing filters, the keyboard completes, `/theme dark` changes the theme, a Guest doesn't see member-only commands, and Escape closes the menu. Then typecheck, the mvp `importRules` (one known red, [the repo-view import](repo-view-package-split.md)), `pnpm docs:sync` and `pnpm docs:check`, and `docs/features/flows.md` or a new `docs/features/slash-commands.md`.

## Why

Will, 05:52 on 2026-10-20: "The old app supports autocompleting / commands can you add that feature". Then: "Just have a subagent do it you don't have to do it yourself".

The product rule says a button, slash command, agent action, CLI command and API call all run the same typed flow. Decision 0003's parity law already counts `slash` as one of the doors, and its dispatch span carries `door: slash`, but the new app has no slash door yet. The old app's composer (`apps/app/src/mainview/Composer.tsx`) has one: a bare `/` lists the slash tree (`registry.slashTree`) inside its single search palette.

## State

- **05:52 to 05:53 on 2026-10-20: Will asked for it; the lead started a subagent.** The lead to Will: "Typing `/` lists the flows you can run, typing filters the list, the keyboard completes, and running one dispatches the same flow a button would, for example `/theme dark`. Guests see only what they may run. It works on the shared UI component first and waits to edit the app until the final browser test run finishes."
- **The wait:** the brief keeps the agent out of `apps/mvp` until `wiring/e2e-fresh.log` ends with Playwright's summary and no newer `wiring/e2e-*.log` is written, because editing the app hot-reloads the dev server mid-run. That run finished 05:53:06 (36 passed, 1 skipped, exit 0), and the wiring agent reported at 05:54:14 ([app wiring](app-wiring.md)), so the wait is over.
- 05:53 to 05:54 on 2026-10-20: the agent read the old app's `Composer.tsx` and `SearchPalette.tsx`, the old app's flow registry, `@smthrs/ui`'s `command-line.ts`, `flow-arguments.ts`, `flow-form.ts` and `ChatComposer.tsx`, decision 0007 and the app's auth feature. No file changed, unreported.
- **What exists to build on:** `@smthrs/ui` has `command-line.ts` (`parseCommand`, `parseSubmit`, `canonicalCommandName`) and the `flow-arguments` and `flow-form` schema helpers; the new app has its flow registry and `FlowDispatch` in `src/flows/` (`registry.ts`, `dispatch.ts`, `catalog.ts`).
- The [Fable review](code-reviews.md), started about 05:54, was told slash commands may land while it reviews, so it covers them lightly.

## Next

The agent's report, in at most 8 lines, with what to try: the `@smthrs/ui` component with tests and docs, the composer wiring, `e2e/slash-commands.spec.ts` green with its GIF, and the checks above. Then the lead tells Will what to try at http://localhost:1337/app.

## Questions for Will

None yet. Open for the lead, not Will:
- Does `/` list only flows that are `modelInvocable`, or every flow a person may start, user-only ones included?
- Does the old app's palette behavior carry over, where `/` is one mode of a single search palette, or does the new app keep a composer-only menu?
