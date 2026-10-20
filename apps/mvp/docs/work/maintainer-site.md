---
title: Maintainer site and work board
status: done
area: process
owner: lead (smithers-b3); work-tracker loop every 10 minutes. The old-app audit agent finished at 06:15:52 on 2026-10-20; the loop now keeps its 20 notes current. Until 06:15: lead (smithers-b3); work-tracker loop every 10 minutes; from about 06:03 on 2026-10-20 an old-app feature audit agent writes `idea` notes for unplanned features plus the index `old-app-feature-gaps.md`, which it owns. Until 06:03: lead (smithers-b3); work-tracker loop
updated: 2026-10-20
links: [../todo.md, ../../../../README.md, design-questions.md, decisions-for-will.md, old-app-feature-gaps.md, fable-review-2-fixes.md, self-host-install.md, web-page-flow.md, model-endpoint.md]
---

## What

A local, dependency-free site at `~/Desktop/smithers-maintainer`: a gallery of every e2e flow GIF, an Obsidian-like knowledge base of the app's docs with backlinks, a graph and search, a TODO page, and a Work board (`#/work`) with one card per note in this folder.

## Why

Will: "Can you make me a maintainer website that I can look at that simply is the host for all these gifs and an obsidian like knowledge base?" Then: "In the maintainer app anything that is being worked on can we add it right away but just marked as todo or whatever ... IN fact I think we should start a /loop of another agent to go ahead and every 10 minutes reading this chat and reading the progress by the other agents and updating the app".

## State

- Built and committed locally (`6abeec80b3`); the TODO page followed in `202c3efc59`.
- The Work board reads each note's frontmatter: one column per status, an area filter, and the open count in the nav.
- The first tracker run finished at 21:22 on 2026-10-19, after the weekly usage limit interrupted it: 48 notes, 40 open. A screenshot check failed on a stale link in decision 0008; the lead fixed the link. Board work is uncommitted.
- A tracker loop (cron job `b5c182f1`, every 10 minutes) rereads the chat and the agents' progress and updates these notes. It skips a tick while the previous run is still going, and the job expires after 7 days.
- 21:31: Will asked whether the design questions are in the app; they are, as the [design questions](design-questions.md) card in Blocked.
- 21:35: a tracker refresh added one note ([model-host Effect boundary](model-host-effect-boundary.md)). The build reports 50 work items, 40 open.
- About 21:45: a tracker refresh moved the [sync service seam](sync-service-di-test-seam.md) and the [e2e suite](e2e-suite-and-gifs.md) to done, moved [repo clone and view](repo-clone-and-view.md) to blocked on Will's Code Storage organization, and added [route ban on any receiver](route-ban-any-receiver.md) and [decisions for Will](decisions-for-will.md), one card with every open question for Will. The build reports 52 work items, 40 open.
- The flow gallery's GIFs date from 18:45; `pnpm e2e:gifs` hasn't run since the e2e rewrite.
- About 21:55: a tracker refresh moved [`ModelStep`](model-step.md) and [route ban on any receiver](route-ban-any-receiver.md) to done, [model-host Effect boundary](model-host-effect-boundary.md) to in-progress and [infrastructure as code](infrastructure-as-code.md) to blocked on Will's Cloudflare token, and added [Code Storage spend caps](code-storage-spend-caps.md).

- About 22:05: a tracker refresh added the lead's ranked "Next for Will" table to [decisions for Will](decisions-for-will.md), the packages review ask to [the packages](effect-tanstack-db-and-effect-electric.md), the `ModelStep` catalog rows, and on-disk progress from W1, the SDK defects agent and the spend caps agent. No status changed.
- **06:02 on 2026-10-20, Will:** "Can you have an agent look at our mvp app and look at the more feature complete app we built before in apps (just hte frontend is really necessary to look at) and add to the maintainer app every feature we haven't implemented yet and isn't planned. Generally make sure that maintainer app is up to date".
- **06:03 on 2026-10-20: the audit agent started.** The lead to Will: each missing feature "gets a card in the maintainer site with a short spec, its size, and how it fits the new design. Features already planned or in progress, including the 17 in the MVP gaps proposal, aren't repeated." An index card, "Old app feature gaps", ranks them most useful first; features cut on purpose (Pair, marketplace, themes and the rest) go in a separate section with the reason, never as to-dos. "The 10-minute tracker keeps updating the existing cards."
  - Its brief: one note per gap (`status: idea`, `owner: unassigned`), the index `old-app-feature-gaps.md` (`status: todo`, area `product`), a build, and edits to existing notes only to add links. In-flight work counts as planned: [slash commands](slash-commands.md), [navigate](navigate-flow.md) and the [web page flow](web-page-flow.md).
  - 06:03 to 06:04: three Explore sub-agents inventory the old app's cards, its state behaviors, and its shell, repository views and palette. No note written by 06:05.
  - The build accepts only the areas `app`, `sdk`, `infra`, `design` and `process`, so area `product` will warn until the agent picks one of them.
- The tracker leaves the audit's notes to it, and adds no `old-app-feature-gaps` note of its own, so the two never collide.
- **06:10:26 on 2026-10-20: the lead corrected the audit agent's area.** "The maintainer site accepts only these `area` values: `app`, `sdk`, `infra`, `design` and `process`. Use `process` for the index note `old-app-feature-gaps.md`, and pick from those five for every gap note, usually `app`. Don't use `product`; the build warns on it." The lead to Will: "I also told the audit agent which area labels the maintainer site accepts, so its gap cards build without warnings."
- 06:10 to 06:15 on 2026-10-20, on disk, unreported: the audit's index [old app feature gaps](old-app-feature-gaps.md) (`status: todo`, `area: process`) links 19 gap notes, from [command palette](command-palette.md) to [Effect code conversion](effect-code-conversion.md). The audit agent hasn't reported.
- 06:15 on 2026-10-20: a tracker refresh added [Fable review 2 fixes](fable-review-2-fixes.md), one card with each finding and its owner.
- **06:15:52 on 2026-10-20: the audit agent finished.** 06:15:58, the lead to Will: "The index card is 'Old app feature gaps' at `~/Desktop/smithers-maintainer/index.html#/work`." It found 19 gaps, each an `idea` note, plus "18 features cut on purpose, each with its reason, and 26 old features that existing plans already cover" ([old app feature gaps](old-app-feature-gaps.md)). Its one question for Will, hosted only for now, is row 4 of [decisions for Will](decisions-for-will.md).
- 06:21:41 on 2026-10-20, the lead to Will: "The model endpoint reopened in the tracker until the budget race is fixed, and a card tracks all 12 Fable findings by owner. The tracker also caught a security gap in the web-page flow, which I sent to that agent." The lead's fix for that gap went to the web page agent at 06:21:32 ([web page flow](web-page-flow.md)).
- 06:26 on 2026-10-20: a tracker refresh added the self-hosting row to [decisions for Will](decisions-for-will.md) and closed the web page frame's security look in [code reviews](code-reviews.md). No status changed.

## Next

From 06:16 on 2026-10-20: none; the loop keeps the notes current, the 20 audit notes included. When Will picks a gap, its note moves from `idea` to `todo`.

Until 06:16 on 2026-10-20 the next step was, from about 06:03 on 2026-10-20: the audit agent's report (how many gaps, the top 5, how many deliberately cut) and its notes on the Work board. The loop keeps the other notes current.

Until about 06:03 on 2026-10-20 the next step was: None; the loop keeps the notes current.

## Questions for Will

None.
