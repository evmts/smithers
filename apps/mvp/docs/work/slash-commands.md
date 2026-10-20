---
title: Slash-command autocomplete in the composer
status: done
area: app
owner: slash-commands agent; reported done 07:06:06 on 2026-10-20 (e2e 3 of 3 twice, three GIFs, `docs/features/slash-commands.md`); left: a Guest e2e, which needs a composer for Guests. Until 07:06: slash-commands agent; from 06:30:52 on 2026-10-20 the lead told the web page agent to coordinate with it so `commands.test.ts` takes the command list from the registry, not a fixture; by 06:34:17 the test does. `e2e/slash-commands.spec.ts` exists from 06:36:18 with no run or GIF; no `docs/features/slash-commands.md` yet; unreported. Until 06:30: slash-commands agent; from about 06:08 on 2026-10-20 wiring `apps/mvp` too (`src/features/commands/`, the composer, `chat/shortcuts.ts`), unreported. Until 06:08: slash-commands agent; from 06:01 on 2026-10-20 building the `@smthrs/ui` half (`src/slash-commands.ts`, `src/chat/CompletionList.tsx`, `src/chat/ChatComposer.tsx`, `src/uiCss.ts`, the root exports, and the tests `slash-commands.test.ts` and `chat-composer-completions.test.tsx`), no `apps/mvp` file yet, unreported. Until 06:01: slash-commands agent (started about 05:53 on 2026-10-20 by the lead, at Will's request); still researching at 05:59 (`@smthrs/ui`'s exports, docs and composer tests, the app's `boot.ts`, chat queries and e2e helpers), no source file changed, unreported
updated: 2026-10-20
links: [flows-and-agent.md, roles-and-labels.md, sign-in.md, app-wiring.md, e2e-suite-and-gifs.md, agent-ui-rendering.md, code-reviews.md, decisions-for-will.md, ../decisions/0003-flows-and-the-agent.md, ../decisions/0007-roles-and-tags.md, ../decisions/0011-the-agent-runs-in-the-browser.md, ../features/flows.md, ../features/agent.md, ../rules.md, ../../../../AGENTS.md, ../../../../docs/libraries.md, navigate-flow.md, web-page-flow.md, repo-view-branches-raw-clone.md, docs-check-flow-outcome.md, fable-review-2-fixes.md, ../features/slash-commands.md, land-to-main.md]
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
- 05:56 to 05:59 on 2026-10-20: it read `@smthrs/ui`'s root exports, export map, API docs, composer keyboard tests and barrel tests, and the app's `src/boot.ts`, `src/features/chat/queries.ts`, `e2e/devices.ts`, `e2e/agent.spec.ts` and `e2e/gifs.mjs`. No file under `packages/smithers/ui` or `apps/mvp` changed since the e2e run ended at 05:53:06.
- **What exists to build on:** `@smthrs/ui` has `command-line.ts` (`parseCommand`, `parseSubmit`, `canonicalCommandName`) and the `flow-arguments` and `flow-form` schema helpers; the new app has its flow registry and `FlowDispatch` in `src/flows/` (`registry.ts`, `dispatch.ts`, `catalog.ts`).
- The [Fable review](code-reviews.md), started about 05:54, was told slash commands may land while it reviews, so it covers them lightly.
- **06:01 on 2026-10-20: building started.** The agent: "Research done. The e2e run finished (36 passed). I'll start with the `@smthrs/ui` component work, which doesn't touch `apps/mvp`."
- 06:01 to 06:04 on 2026-10-20, on disk, unreported: `packages/smithers/ui/src/slash-commands.ts` and `src/chat/CompletionList.tsx` (new), `src/chat/ChatComposer.tsx`, `src/uiCss.ts` and `src/index.ts` (changed), and the tests `tests/slash-commands.test.ts` and `tests/chat-composer-completions.test.tsx`. A full `@smthrs/ui` run at about 06:04 (scratchpad `ui-tests.log`): 2,131 passed, 0 failed, across 158 files. No file under `apps/mvp` changed.
- **05:58 to 05:59 on 2026-10-20: two more flows join the menu.** The [navigate](navigate-flow.md) and [web page](web-page-flow.md) agents expect `/navigate` and `/web` to appear once the menu lists registry flows; all three agents edit near `src/flows/registry.ts`.
- 06:04 to 06:15 on 2026-10-20, on disk, unreported:
  - **`@smthrs/ui`:** `src/slash-commands.ts` (06:06), its test (06:06), `src/chat/CompletionList.tsx` and `tests/chat-composer-completions.test.tsx` (06:09).
  - **`apps/mvp`:** a new feature folder, `src/features/commands/` (contract, schema, catalog, queries, store, metrics, `commands.ts`, `actions.ts`, `components/CommandsContext.tsx` and `commands.test.ts`, 06:08 to 06:13), plus `src/features/chat/components/Composer.tsx` (06:09:41) and `chat/shortcuts.ts` (06:10:05). The contract's copy includes "`/<name>` isn't a command" and "`/<command>` needs <fields>".
  - **The registry gives each flow its command and minimum role** (`src/flows/registry.ts`, 06:11:45): `app/navigate` is `/navigate` for anyone, and `app/web/open` is `/web` for Members and up.
  - A full `@smthrs/ui` run at 06:15:05 (scratchpad `full.log`): 2,202 passed, 0 failed, across 161 files. Both this agent and the web page agent edit `@smthrs/ui`, so the run isn't attributed.
  - No `e2e/slash-commands.spec.ts` yet.
- 06:15 to 06:23 on 2026-10-20: `src/features/commands/actions.ts` (06:18:02) and `commands.test.ts` (06:20:45) changed. A full app unit run from 06:18:34 to 06:23:08 (scratchpad `nav-unit.log`): 485 passed, 48 failed and 4 skipped, with 18 of 53 files failing. It failed 11 `commands.test.ts` cases on the command list: one expected `/theme` alone and got `/theme` and `/navigate`, and another's diff involved the `/web` entry (`app/web/open`, minimum Member). The test file changed again at 06:20:45, after that run started. No `e2e/slash-commands.spec.ts` yet.
- **06:30:52 on 2026-10-20: the lead, through the web page agent.** "The full app unit run now fails `commands.test.ts`, because the slash list now includes `/navigate` and `/web`. If that test hard-codes the command list, coordinate with the slash-command agent: the list should come from the registry, not a fixture copy" ([web page flow](web-page-flow.md)).
- 06:25 to 06:34 on 2026-10-20, on disk, unreported:
  - A full app unit run from 06:25:04 to 06:29:21 (scratchpad `nav-unit.json`) failed 2 `commands.test.ts` cases, down from 11: "a slash lists the commands with their descriptions" got `/theme, /navigate` where it expected `/theme, /navigate, /web`, and "/theme dark runs app/theme/set through dispatch" counted 0 slash dispatches, not 1.
  - `src/features/commands/catalog.ts` (06:33:29): `COMMANDS` is `commandsOf` over the registry's `names`, in the registry's order. A row shows the first sentence of its flow's description, and its arguments come from the flow's payload schema.
  - `commands.test.ts` (06:34:17): the expected list is `listed(viewer)`, which is `commandsFor(viewer)` over the registry; only the `/theme` row is spelled out. The lead's ask is met on disk. Which agent made the edit isn't reported, and no run since is on record.
  - **`e2e/slash-commands.spec.ts`** (06:36:18), three real-browser cases: "complete and run: / lists the commands, typing filters, the keyboard completes, and /theme dark sets the theme"; "escape: Escape closes the list and keeps the draft, and a second Escape hides the composer"; and "roles: signed out, there is no composer, so no command is offered", skipped off localhost. No run or GIF is on record; the site build warns on the three missing GIFs. The spec has no Guest case, which the brief asked for.
  - Still missing: `docs/features/slash-commands.md`, which `catalog.ts` cites.
- **06:37:21 on 2026-10-20, the lead to Will:** two corrections went to agents; for this one, "that agent still owes the test showing Guests don't see member-only commands".
- 06:40:15 on 2026-10-20 (scratchpad `slash/e2e-1.log`): `e2e/slash-commands.spec.ts` passed 3 of 3 in a real browser (1.3 min). Its roles case now reads "a member-only command is offered to an Admin, never to a signed-out person, and typing one does nothing". 07:05:41 (`slash/e2e-2.log`): 3 of 3 again (53.4 s). GIFs at 07:05:44 to 07:05:48 in `~/Desktop/smithers-mvp/gifs`: `slash-commands-complete-and-run.gif`, `slash-commands-escape.gif` and `slash-commands-roles.gif`.
- **07:06:06 on 2026-10-20: the agent reported done.**
  - **Component:** `@smthrs/ui` gains `slashMenu` and `slashSubmit`, which read a command's arguments from the flow's payload schema through `formFieldsFor`. `ChatComposer` takes `completions`: a listbox with `aria-activedescendant`, while the input stays a textbox. Its suite passes 2,214 to 0, the new files at 100%, with a guide (`packages/smithers/ui/docs/guides/complete-slash-commands.md`) and `api.md` entries.
  - **App:** `src/features/commands/`; a registry entry opts in with `slash: { command, minimum }`, which the navigate and web page agents already use. 19 unit tests at 100% coverage, including the web agent's `/web` branch. Escape closes the list first and the composer second; `boot.test.ts`'s listener list matches. Feature doc: `apps/mvp/docs/features/slash-commands.md`.
  - **Guest gap:** the e2e covers signed-out people only: no list, and a typed `/web …` does nothing. Guest filtering and refusal are unit-tested only, because Guests and signed-out people get no composer. A Guest e2e needs two calls the agent didn't make: a composer for non-members, which overrides Will's "Asking needs sign-in" gate, and a Guest sign-in under `alchemy dev`.
  - **Not added:** `/clone`, because cloning wasn't a registered flow then. The [repo view extras](repo-view-branches-raw-clone.md) agent adds it.
  - **Reds it names as other agents':** typecheck in `web.test.ts`; `importRules` on the known repo-view import and on `ExecutionHost.test.ts` importing `@smthrs/platform-cloudflare`; two storage-persistence tests in `boot.test.ts`; the telemetry contract's `execute_tool app/web/open`.
  - **Docs:** `pnpm docs:sync` and `docs:check` exit 0, but their flow runs (run-207, run-211) returned only `Accepted`, and "`smthrs runs show` needs a browser session" ([docs check outcome](docs-check-flow-outcome.md)). Nothing is committed.
- **07:06:16 on 2026-10-20, the lead to Will:** "Slash-command autocomplete is ready to try at http://localhost:1337/app: 1. Press ⌘K, type `/them`, press Tab, ↓ and Enter, and the page turns dark. 2. Type `/theme light`, then `/nope` to see an unknown command refused. 3. Press Escape twice: the first closes the list, the second the composer." And: "`/navigate` and `/web` appear too, for Members and up."
- **Status moved from in-progress to done** on the 07:06 report.
- By 07:20, `src/flows/registry.ts` (07:14:12) offers `/theme` and `/navigate` to anyone, and `/web` and `/clone` to Members and up. So `/navigate` isn't Members-only, as the lead's 07:06:16 line reads.
- 07:27:39 on 2026-10-20, the lead to Will: "`/navigate` is offered to everyone, not only Members. That's fine, because it only moves within the app."
- 07:44 on 2026-10-20: [navigate](navigate-flow.md) and the [web page flow](web-page-flow.md) reported done; `/navigate` and `/web` run through this menu in their e2e specs. The web page agent reports `commands.test.ts` passes.
- 07:49:53 on 2026-10-20: [Jev](agent-jev.md) has no slash command, on purpose: its flows return verdicts as data, and "a slash command run would have nowhere to show them".
- **13:04:55 on 2026-10-20: the `@smthrs/ui` half landed on `main`** in round 2 as `6815e1ba7c` "✨ feat(ui): slash-command completions in ChatComposer; WebPageView and WebLinkCard" ([land to main](land-to-main.md)). The app's `src/features/commands/` is still uncommitted; it lands in the lander's app round.

## Next

From 13:04 on 2026-10-20: done; the app's commands land in the lander's app round. Left as before: a Guest e2e once Guests get a composer, and a docs check whose outcome an agent can read ([docs check outcome](docs-check-flow-outcome.md)).

Until 13:04 on 2026-10-20 the next step was: Done. Left: a Guest e2e once Guests get a composer (question below), and a docs check whose outcome an agent can read ([docs check outcome](docs-check-flow-outcome.md)). `/clone` comes with the [repo view extras](repo-view-branches-raw-clone.md).

Until 07:06 on 2026-10-20 the next step was, from 06:01 on 2026-10-20: the `@smthrs/ui` component with tests and docs, then the composer wiring in `apps/mvp`, `e2e/slash-commands.spec.ts` with its GIF and the checks above, then the agent's report with what to try. Once [navigate](navigate-flow.md) and the [web page flow](web-page-flow.md) land, `/navigate` and `/web` work through the menu. Then the lead tells Will what to try at http://localhost:1337/app.

Until about 06:01 on 2026-10-20 the next step was: The agent's report, in at most 8 lines, with what to try: the `@smthrs/ui` component with tests and docs, the composer wiring, `e2e/slash-commands.spec.ts` green with its GIF, and the checks above. Then the lead tells Will what to try at http://localhost:1337/app.

## Questions for Will

None yet. Open for the lead, not Will:
- Does `/` list only flows that are `modelInvocable`, or every flow a person may start, user-only ones included?
- Does the old app's palette behavior carry over, where `/` is one mode of a single search palette, or does the new app keep a composer-only menu?
- Answered on disk by 07:06 on 2026-10-20, for the two questions above: the menu lists every registry flow that opts in with `slash`, whether or not the agent may run it, and it is a composer-only menu, opened with ⌘K and `/`.
- Open for the lead (Will's call if pursued): should Guests get a composer to run the commands they may, such as `/theme` and `/navigate`? Today Guests and signed-out people have none, under "Asking needs sign-in", so the Guest case is unit-tested only. Not asked of Will yet.
