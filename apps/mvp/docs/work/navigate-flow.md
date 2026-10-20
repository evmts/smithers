---
title: "The navigate flow (app/navigate): a person or the agent opens an app page"
status: done
area: app
owner: navigate agent; reported done 07:44:39 on 2026-10-20 (e2e 3 of 3 with three GIFs, 32 of 32 unit tests, navigation files at 100% coverage; `docs:check` never finished in three tries); it ran `pnpm db:migrate` on the dev database (0010 to 0012); nothing committed, so it lands in round 2 of the landing. Until 07:44: navigate agent; both e2e cases have GIFs from 06:37 on 2026-10-20, navigation files changed again 07:06 to 07:07, and its `pnpm docs:check` failed twice (07:05, 07:11) with a third try from 07:16; unreported. Until 06:37: navigate agent; building from about 06:09 on 2026-10-20 (`src/features/navigation/`, `src/flows/requests.ts`, the registry), unreported. Until 06:09: navigate agent (started about 05:58 on 2026-10-20 by the lead, at Will's request); researching from 05:58 to at least 06:04 (the flows folder, the tab engine and its tests, the e2e helpers and the dev script, the lint's bans, decisions 0003 and 0011); no source file changed, unreported
updated: 2026-10-20
links: [review-round-4-p3-cleanup.md, repo-view-branches-raw-clone.md, review-round-4.md, agent-repo-navigation.md, slash-commands.md, web-page-flow.md, flows-and-agent.md, repo-clone-and-view.md, durable-browser-engine.md, observability.md, e2e-suite-and-gifs.md, code-reviews.md, decisions-for-will.md, ../decisions/0003-flows-and-the-agent.md, ../decisions/0006-repo-clone-and-view.md, ../decisions/0011-the-agent-runs-in-the-browser.md, ../features/flows.md, ../features/agent.md, ../features/repo.md, ../rules.md, docs-check-flow-outcome.md, dev-stack-hygiene.md]
---

## What

One flow, `app/navigate` with payload `{ to }`, takes the asking tab to a page inside the app. A person and the agent call the same flow.

```
chat: "open octocat/Spoon-Knife"
  agent ── repo/tree, repo/read (find a path, if needed) ── app/navigate { to: "/octocat/Spoon-Knife" }
person: /navigate /octocat/Spoon-Knife   (the slash menu, once both land)
              │
              ▼
app/navigate { to }
  same-origin URL      ──▶ reduced to its path
  another origin       ──▶ typed refusal; the page stays put
  javascript:, data:   ──▶ typed refusal
              │
              ▼
router.navigate(to) in the tab that asked   (TanStack Router, called from the state layer)
other tabs and devices: don't move
```

Best-guess spec, from the lead's brief (about 05:58 on 2026-10-20):
- **Same-origin app paths only, for now.** Outside origins are refused, so a prompt hidden in a repository can't send a person to another site. Ordinary links a person clicks still work.
- **Router only.** TanStack Router's API, called from the state layer; never `history` or `location` (the lint bans them) and never `useEffect`.
- **Which tab moves.** The flow runs in the engine worker; the tab that started the request moves, which for the agent is the tab whose composer asked. If that tab is gone when the step runs, the flow settles without error and moves no other tab.
- **Agent use.** In the agent catalog with a clear description, for requests like "open octocat/Spoon-Knife", "show me README.md" or "go to line 12 of …". The repo routes are `/$owner/$repo`, `/tree/$ref/$` and `/blob/$ref/$` with `?L=` for lines.
- **Telemetry:** a log line, a span and the metric `smithers_web_navigations` by door and outcome, with no paths in attributes. The records go into the shared telemetry contract.
- **Proof:** unit tests at 100% (path normalization, refusals, the tab rule) and `e2e/navigate.spec.ts` with video and a GIF: the agent opens `octocat/Spoon-Knife`; an outside URL is refused and the page stays put; a second tab doesn't move. Then typecheck, the mvp `importRules` (one known red, [the repo-view import](repo-view-package-split.md)), `pnpm docs:sync`, `pnpm docs:check`, and `docs/features/flows.md` and `agent.md`.

## Why

The app has no link to a repository; Will had to type the URL. Will, 05:57 on 2026-10-20: "Can I open a repo via the chat from the home page though or do I have to travel directly to the url?" Then, 05:58: "Let's add a flow called navigate that navigates to a url and make sure the agent can call it too". It also adds a door from chat to the repository view that [agent repo navigation](agent-repo-navigation.md) (feature 4) builds on.

## State

- **05:56 on 2026-10-20: Will is testing the app.** "how do I view a repo?" The lead: "Swap `github.com` for the app's address, as on GitHub: `http://localhost:1337/<owner>/<repo>`. I just opened http://localhost:1337/octocat/Spoon-Knife for you." And: "Only public repositories work for now. The app has no link to a repository yet, so you have to type the URL."
- **05:57 on 2026-10-20: not yet.** The lead: "The agent's only flows today are switching the theme and reading a repository's tree and files, so it can tell you what's in `octocat/Spoon-Knife` but can't take you to the page. Opening and navigating the repository view is feature 4, which isn't built yet." It offered an `open repository` flow with an `/open owner/repo` command.
- **05:58 on 2026-10-20: Will asked for `navigate`;** the lead started a subagent. The lead to Will: "You or the agent call it with a path, for example asking in chat 'open octocat/Spoon-Knife', and only the tab you asked from moves. It also shows up in the new slash menu as `/navigate`." And: "it only goes to pages inside the app. Outside URLs are refused ... Tell me if you want outside URLs allowed, for example with a confirmation step." ([decisions for Will](decisions-for-will.md)).
- 05:58 to 06:04 on 2026-10-20, unreported: the agent read `src/flows/` (the registry, `FlowDispatch`, the tab engine and `engine.test.ts`), `src/test/device.ts` and `src/test/chatApi.ts`, the screens, `playwright.config.ts`, `e2e/agent.spec.ts` and `e2e/devices.ts`, the dev and e2e scripts in scratchpad `wiring/`, the lint bans in `PACKAGE.ts`, and decisions 0003 and 0011. No source file changed.
- **Coordination:** the [slash commands](slash-commands.md) agent edits the composer and maybe `src/flows/registry.ts`; the [web page flow](web-page-flow.md) agent edits the registry too. Each re-reads shared files before an edit.
- 06:09 to 06:15 on 2026-10-20, on disk, unreported:
  - **The flow:** `src/features/navigation/` (contract, paths, schema, metrics, `flows.ts`, `tab.ts` and `navigation.test.ts`). `flows.ts`: "`app/navigate { to }` ... takes the tab that asked to a page of the app. A person's door and the agent's cell run this one declaration." Its one step runs in the leader tab's engine worker and asks over the engine's navigation channel for the tab that started the request.
  - **Which tab moves:** `src/flows/requests.ts` (06:09:30): each tab remembers its latest 1,024 dispatches (`TabRequests`, filled by `FlowDispatch`), so "no other tab or device claims them, and a tab that closed or reloaded claims nothing".
  - **Registered:** `src/flows/registry.ts` and `declarations.ts` (06:11:45) list `app/navigate`, as `/navigate` for anyone; `registrations.ts` and `engine.worker.ts` changed at 06:11:59, and the agent catalog `src/flows/catalog.ts` at 06:15:04.
- 06:19:08 on 2026-10-20, on disk, unreported: `e2e/navigate.spec.ts` with two real-browser cases, "navigate by the agent: asking to open octocat/Spoon-Knife takes the tab that asked there, and the other tab stays" and "navigate refused: asking the agent to open an outside site is refused, and the page stays put". No run or GIF of them is on record yet.
- 06:17 to 06:21 on 2026-10-20, on disk, unreported: `navigation.test.ts` (06:17:47), `src/router.tsx` (06:20:03), and `src/flows/catalog.ts` and `requests.ts` (06:21:44).
  - **The docs:** `docs/features/flows.md` (06:20:50) gains a navigation section. The step runs in the leader tab's engine worker and asks over `<name>/navigate` for the tab that started the run; "Every other tab, and every other device, stays." A tab that doesn't answer within 5 seconds (`NAVIGATE_WITHIN`) settles `moved: false`. The agent's client flows are now `app/theme/set`, `app/navigate`, `repo/tree` and `repo/read`.
- 06:18 to 06:23 on 2026-10-20: A full app unit run from 06:18:34 to 06:23:08 (scratchpad `nav-unit.log`): 485 passed, 48 failed and 4 skipped, with 18 of 53 files failing. Among the failures shown: a 30-second timeout in `navigation.test.ts`, "the agent's call moves the tab whose composer asked, and no other", one in `repo.test.ts`, and 11 in `commands.test.ts` ([slash commands](slash-commands.md)). Five agents edit the app at once, so the failures aren't attributed. No run of `e2e/navigate.spec.ts` is on record.
- 06:25 to 06:29 on 2026-10-20: a full app unit run from 06:25:04 to 06:29:21 (scratchpad `nav-unit.json`) still times out `navigation.test.ts`'s "the agent's call moves the tab whose composer asked, and no other" at 30 seconds; the test file changed again at 06:26:51. `registry.test.ts` fails 2 cases on the registered and agent-invocable flow lists, which now include `app/web/open` ([web page flow](web-page-flow.md)). No run of `e2e/navigate.spec.ts` is on record.
- 06:37:33 to 06:37:35 on 2026-10-20: `navigate-navigate-by-the-agent.gif` and `navigate-navigate-refused.gif` in `~/Desktop/smithers-mvp/gifs`, so both real-browser cases ran; no pass count is on record. 06:45:17: `pnpm docs:sync`, whose flow returned only `Accepted` (run-201).
- 06:56 to 07:07 on 2026-10-20, on disk: `navigation.test.ts` (06:56:02), then `tab.ts`, `metrics.ts`, `paths.ts` and `flows.ts` (07:06:25 to 07:07:52).
- **Its `pnpm docs:check` through the `docs-sync` flow failed twice** (scratchpad `nav-docs-check.log`, `nav-docs-check2.log`): at 07:05:33, "All fibers interrupted without error" after 16 package `PASS` lines; at 07:11:16, run-218 `failed`, "/control/LaunchFailed: The accepted run was not published as running before its driver admission budget expired". A third try started 07:16:24 ([docs check outcome](docs-check-flow-outcome.md)).
- **07:06:06:** the [slash commands](slash-commands.md) agent reported done; `/navigate` is in the menu through the registry's `slash` field. The registry (07:14:12) offers `/navigate` to anyone, while the lead's 07:06:16 line to Will says `/navigate` and `/web` appear "for Members and up".
- 07:22 on 2026-10-20: a third GIF, `navigate-navigate-by-a-person.gif`. 07:27:39, the lead to Will: "`/navigate` is offered to everyone, not only Members. That's fine, because it only moves within the app."
- **07:44:39 on 2026-10-20: the agent reported done.** Nothing is committed.
  - **Both doors work in a real browser:** asking the agent to "open octocat/Spoon-Knife" moves only the tab that asked, and typing `/navigate /octocat/Spoon-Knife` does the same. An outside URL, `javascript:` or `data:` is refused and the page stays put. The tab moves through `router.navigate`; if that tab is gone, the step settles without moving any other tab. Code: `apps/mvp/src/features/navigation/` and `src/flows/requests.ts`.
  - **Records:** `web.navigate` (log and span) and `smithers_web_navigations` by door and outcome, with no paths. `flows.md`, `agent.md` and `observability.md` updated.
  - **Proof:** typecheck clean in its files; `importRules` shows only the known repo-view red; 32 of 32 unit tests in navigation, requests and dispatch, the navigation files at 100% coverage; `e2e/navigate.spec.ts` 3 of 3, with `navigate-navigate-by-the-agent.gif`, `navigate-navigate-by-a-person.gif` and `navigate-navigate-refused.gif`.
  - **Not finished:** `pnpm docs:sync` passed, but `pnpm docs:check` didn't complete "in about an hour across three tries (timeout, launch failure, very slow)". It checks package docs only, which this agent didn't touch ([docs check outcome](docs-check-flow-outcome.md)).
  - **Reds it names as other agents':** ChatApi answered 503 to every question, so every agent-run unit test failed, its own device-level agent test included, which passed earlier. `registry.test.ts` and `telemetry.test.ts` didn't list `app/web/open` yet; views and repo typecheck errors.
  - **The dev database:** it ran `pnpm db:migrate`, which applied migrations 0010 to 0012 from other agents. "Without them ChatApi answered every question 503" ([dev stack hygiene](dev-stack-hygiene.md)).
- **07:44:43 on 2026-10-20, the lead to Will:** "`navigate` is done, and its 3 browser tests pass, with GIFs." What to try at http://localhost:1337/app: ask "open octocat/Spoon-Knife", and only the asking tab moves; type `/navigate /octocat/Spoon-Knife/blob/main/README.md?L=3` to open the file with line 3 highlighted; ask it to open `https://example.com`, refused, "because `navigate` stays inside the app; `/web` is for outside pages". And: "The dev database also needed new migrations from other agents. Without them, questions were briefly answered with errors. That's applied now."
- **Status moved from in-progress to done** on the 07:44 report.

- **10:52 on 2026-10-20: a duplicate of this flow's tab channel.** The [repo view extras](repo-view-branches-raw-clone.md) agent's `repo/copy` writes the asking tab's clipboard "over a channel modelled on `app/navigate`'s", so "ask the tab that asked" is implemented twice. The lead queued the merge (scratchpad `final/WIRING.md`): "Extract one helper in `src/flows` and use it in both. Batch it with the review-round-4 fixes." Status stays done: the merge is a cleanup batched with [review round 4](review-round-4.md).

- **11:19:51 on 2026-10-20, the lead to Will:** "A late note from the `navigate` agent changes nothing. Its stuck docs check was one of the three I stopped, and `navigate` itself was already done and tested" ([docs check](docs-check-flow-outcome.md)). The tab-channel merge is now in the [P3 cleanup](review-round-4-p3-cleanup.md) pass.

## Next

From 10:52 on 2026-10-20: one `src/flows` helper for the tab channel, shared with `repo/copy`, batched with the [review round 4](review-round-4.md) fixes.

Until 10:52 on 2026-10-20 the next step was: Done. It lands in round 2 of [land to main](land-to-main.md). Its `docs:check` counts once the [docs check outcome](docs-check-flow-outcome.md) fix lands and a run passes. [Agent repo navigation](agent-repo-navigation.md) builds file tabs and synced highlights on top of it.

Until 07:44 on 2026-10-20 the next step was, from 07:16 on 2026-10-20: a docs check that passes, then the agent's report, in at most 6 lines, with what Will should try: "open octocat/Spoon-Knife" in chat, an outside URL refused, a second tab unmoved, and `/navigate` in the slash menu (live since 07:06). Then the lead tells Will.

Until 07:16 on 2026-10-20 the next step was: The agent's report, in at most 6 lines, with what Will should try: "open octocat/Spoon-Knife" in chat, an outside URL refused, a second tab unmoved, and `/navigate` in the slash menu once both land. Then the lead tells Will.

## Questions for Will

- Should `app/navigate` allow outside URLs, for example after a confirmation step? Asked 05:58 on 2026-10-20. Building proceeds on same-origin only; outside pages go through the [web page flow](web-page-flow.md), which always shows the address. As of 07:53 on 2026-10-20, built that way and unanswered; the web page flow, done 07:44, covers outside pages.
