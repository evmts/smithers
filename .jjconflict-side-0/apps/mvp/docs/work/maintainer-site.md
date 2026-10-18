---
title: Maintainer site and work board
status: done
area: process
owner: lead (smithers-b3); work-tracker loop
updated: 2026-10-19
links: [../todo.md, ../../../../README.md, design-questions.md, decisions-for-will.md]
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

## Next

None; the loop keeps the notes current.

## Questions for Will

None.
