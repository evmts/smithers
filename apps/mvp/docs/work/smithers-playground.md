---
title: Smithers Playground (try every API in every package)
status: todo
area: sdk
owner: paused at 14:24 on 2026-10-20 to free an agent slot; production comes first. Design accepted in part (choices 1 and 2). Until 14:24: playground agent (Claude Opus), started 13:32:34, building the flows playground's host and server; stopped by the usage limit at 14:17 and resumed at 14:19. Until 14:30: playground agent (Claude Opus), started by the lead at 13:32:34 on 2026-10-20; design relayed to Will at 13:54; building the flows playground's host and server since 13:52; no e2e by 14:08. Until 13:54: playground agent (Claude Opus), started by the lead at 13:32:34 on 2026-10-20; design mock and design doc on disk 13:49 to 13:51; unreported by 13:52. Until 13:49: playground agent; `apps/playground/catalog/extract.ts` on disk from 13:34
updated: 2026-10-21 00:14 PDT
links: [will-decision-queue.md, flow-authoring.md, flow-debugging.md, library-catalog.md, model-step.md, model-endpoint.md, effect-tanstack-db-and-effect-electric.md, agent-ui-rendering.md, e2e-suite-and-gifs.md, maintainer-site.md, decisions-for-will.md, ../decisions/0014-flows-authoring-debugging-and-home-view.md, ../../../../docs/libraries.md]
---

## Tracker reconciliation — 2026-10-21 00:14 PDT

**What:** Provide API playgrounds connected by a shelf of saved typed artifacts.

**Why:** Let a person author, run and inspect the public Smithers APIs.

**Current state:** Will approved the shelf at 00:09:55 and all three designs at 00:10 (flows, catalog/API, agent/search). At 00:10 the lead confirms it remains paused behind production. These are design approvals, not a completed implementation.

**Next step:** Resume after production priority permits; prove flows author/run/inspect and recovery, then the catalog and cross-playground artifact handoff.

**Open questions for Will:** None for the shelf or these three designs; prior questions below are historical.

Evidence: script-filtered user text and lead replies through 00:13 PDT; queue answers through 00:10 PDT, current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Product checks are reported receipts; tracker validation is the site build. Execution ownership retained; Codex curates documentation only.

## Earlier tracker history (retained)


## What

An internal web app, `apps/playground`, for trying and testing every public API in every Smithers package (about 65). Each package gets its own playground page, designed for that package. Where it makes sense, something made in one playground feeds another: a flow built in the flows playground runs in the engine's, and its output shows in the views playground.

```
apps/playground
  catalog/extract.ts   every library under packages/, its root exports, grouped as docs/libraries.md groups them
                       -> served at /api/catalog; a new package or export appears with no hand work;
                          an export that builds an Effect Schema gets a generated form
  /                    the catalog: ~65 packages
  /<package>           that package's playground page
  /<package>/<api>     one API: inputs, run, result
  shared artifacts     made in one playground, picked up in another
```

Order (the lead, 13:32:34 on 2026-10-20):
1. **Design first.** The agent lists all 65 packages and their APIs, then mocks the catalog, a page for each API, the flows playground, and how one playground's output is used in another. The mock is `apps/playground/design/playground.html`, opened for Will.
2. **Flows get the deepest treatment:** build, run, inspect each step, replay, pause and resume, retry and fault injection.
3. **Then build and prove it** with browser e2e: flows first, then model calls, then the data packages.

Best guesses for the build, from standing rules: pages call each package through its root entry only; faults come from test Effect services injected by DI, never request interception or module mocks; model calls go through the metered endpoint and its budget, so [spend alerts](token-spend-alerts.md) see them. As an app, it may use `node:*` and the DOM directly; the packages it exercises may not.

## Why

Will, 13:31:14 on 2026-10-20: "Flows are the most important part of oour product and technology and should be supported very very well but we should be thoughtful and high quality with adding support to flows. One way that will help make getting that good easy is to have a seperate opus agent start working on building an app we will use internally but will also have some functionality we can use as reference code examples or even pull into our app. And this is smithers playground. Smithers playground is a UI that allows us to try out and test every API in every package in smithers. Each package would have it's own playgroudn page design and in some cases you might be able to use things made in one playground in another playgorund. This agent should try it's hardest to design a high quality playground ui first and then after designing it hook it up and test that everything works e2e. I will then use the playgroudn myself and it will help me inspire more features and how to polish existing features"

Three uses: Will tries every API to find features and polish; the pages are reference code examples; pieces of it can move into the app.

## State

- **13:31:14 on 2026-10-20: Will asked for it** (above), in the same message that answered three of the lead's quick questions.
- **13:32:34: the lead started a Claude Opus agent** on the order above and told Will it "opens the mock for you, then builds `apps/playground` and proves it with browser tests: flows first, then model calls, then the data packages."
- 13:33: `apps/playground/` with empty `catalog/`, `design/`, `docs/`, `e2e/`, `server/` and `src/`.
- 13:34:03 to 13:39:59: `catalog/extract.ts` (14.6 KB), run as `node apps/playground/catalog/extract.ts [out.json]`. It reads every workspace library through `packages/repo-targets/scripts/workspace-packages.mjs`, parses each root entry syntactically with `typescript` ("reads all ~65 packages in about a second"), and records each export's name, kind, summary, signature, source line and whether it builds an Effect Schema.
- By 13:46: no mock in `design/`, no package page and no report.
- **13:49:29 to 13:50:56 on 2026-10-20: the design is on disk**, unreported: the mock `apps/playground/design/playground.html` (455 KB), screenshots of seven screens in light and dark (`01-catalog`, `02-api-derivekey`, `03-flows-author-run`, `04-flows-inspector-waiting`, `05-flows-inspector-retry-kill`, `06-agent-handoff`, `07-search`; `design/shots.mjs`), and `apps/playground/docs/design.md`. From the design doc:
  - **Inventory:** 67 workspace libraries, 9,417 root exports and 89 example files on 2026-10-20. Most packages get a generic page generated from their exports; six get their own: Flows, Agent, Model, Views, UI and Data.
  - **Routes:** `/` catalog; `/p/$pkg`; `/p/$pkg/$export` (signature, doc, runner, history, examples); `/flows` (author, run, runs); `/flows/$flow/runs/$runId` (inspector); `/agent`, `/model`, `/views`, `/ui`, `/data`; `/shelf`. The URL holds the journal frame, step and tab.
  - **Runner:** every run is a small TypeScript module; a Schema input becomes a form (`formFieldsFor`, `FlowFormView`), and Copy gives the module byte for byte. Durable runs run on the host (they need SQL); Cloudflare-only APIs (`ExecutionObject`, `EdgeCache`) are disabled until a local workerd host exists.
  - **Flows, deepest:** author, run with injected faults, scrub the journal frame by frame, fork, and **Kill host** mid-run to watch the run resume.
  - **The shelf** joins playgrounds: `⌘S` saves a typed artifact (`flow:`, `role:`, `view:`, `collection:`, `run:`, `input:`) as a row on the host's SQLite, served through `@smthrs/effect-tanstack-db`; any slot whose schema decodes it takes it.
  - **Look:** the Paper theme in light and dark, 13 px Inter, mono API names, labels as nouns, no explanatory prose; model keys shown only as present or absent.

- **13:54 on 2026-10-20, the lead to Will:** "The Playground design is ready for you. The mock is `/Users/williamcory/smithers/apps/playground/design/playground.html`, with light and dark screenshots beside it. It covers all 67 packages and about 9,400 public APIs, picked up automatically." Its three main choices, "which the agent is building on unless you object": the code is the truth; the flow inspector works through time, with Kill host; a shelf connects the playgrounds (`⌘S`). "The agent is now building it."
- 14:03:47: the three choices are items 4 to 6 in [Will's decision queue](will-decision-queue.md) (priority 870 to 866), under the GitHub App visit, a Latitude server and the fleet cap.
- On disk, unreported, 13:52 to 14:08: `apps/playground/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`; the server `server/main.ts`, `host.ts`, `devHost.ts`, `budget.ts`, `source.ts`; the flows `server/flows/registry.ts`, `ask.ts`, `triage.ts` and `faults.ts`; the first client file `src/features/host/contract.ts`. `e2e/` is empty.
- **14:11:48 on 2026-10-20, Will (queue): choice 1, "the code is the source of truth, not the form", option 1.** 14:12:55, the lead: "accepted, and the agent was already building it that way."
- **14:12:55, the lead: the app outranks internal tools.** The curator ranks the app being released and its SDK above the Playground and the maintainer site; Playground items now follow every app item of the same kind.
- 14:17: the usage limit stopped the playground agent; resumed at 14:19.
- **14:19:59, Will (queue): choice 2, the time-first run inspector with Kill host, option 1.**
- **14:24: the lead paused the Playground** to free an agent slot. 14:30: "Playground paused at 14:24 to free an agent slot. Production comes first." **Status moved from in-progress to todo.**
- Open in the queue at 14:30: choice 3, the shelf (`decision:playground-shelf`, priority 313), and three Playground designs (310 to 312).

## Next

From 14:30 on 2026-10-20: resumes when an agent slot frees and the app's work allows; then the build as below, flows playground first, each step with an e2e and GIF.

Until 14:30 on 2026-10-20 the next step was, from 13:54 on 2026-10-20: the build, each step with a browser e2e and its GIF: the flows playground first (author, run, inspect, Kill host and resume), then model calls, then the data packages. Will's answers to the three design choices come through the queue.

Until 13:54 on 2026-10-20 the next step was, from 13:50 on 2026-10-20: the agent's report and the mock opened for Will (`apps/playground/design/playground.html`). Then the build, each step with a browser e2e and its GIF: the flows playground first, then model calls, then the data packages.

Until 13:50 on 2026-10-20 the next step was, from 13:32: the design mock at `apps/playground/design/playground.html`, opened for Will. Then the build, each step with a browser e2e and its GIF: the flows playground first, then model calls, then the data packages.

## Questions for Will

- Choice 3: a shelf of saved artifacts (`⌘S` on a flow, model role, view or run) that any other playground can pick up? In the queue at priority 313; the agent builds on it unless Will objects.
- Choices 1 and 2: answered 14:11:48 and 14:19:59 on 2026-10-20, both accepted.

Until 14:30:

The design doc's three "Decisions for Will" (13:50:56 on 2026-10-20); the agent builds on them unless Will overrules:
1. The code is the source of truth, not the form: every run is a TypeScript module, the form edits its `input`, and Copy gives the module byte for byte.
2. The inspector is time-first: one journal scrubber drives the waterfall, step detail and graph (`[`, `]`, `L`), and Kill host ends the real host mid-run so the resume is shown.
3. A shelf of typed artifacts joins the playgrounds (`⌘S` to save; any matching slot takes it).

Not asked; the agent proceeds on the best guess:
- Does the playground run only on this Mac (`pnpm dev`), or deploy beside the app? Best guess: local only for now, since it's internal.
- May a playground page spend real model tokens and Code Storage reads? Best guess: yes, through the same metered endpoint and daily budget as the app, so the any-spend alert covers it.
