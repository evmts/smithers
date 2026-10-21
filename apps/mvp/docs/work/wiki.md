---
title: Wiki (the maintainer app's future home, and wiki-backed memory)
status: idea
area: product
owner: none
updated: 2026-10-21
links:
  - ../rulings.md#plugin-5
  - ../rulings.md#agent-5
  - ../rulings.md#plugin-4
---

## What

A repository wiki in the app. The maintainer app's work tracker and notes (`apps/maintainer-site`, outside the review queue) will most likely become this feature. When it's added, it also implements memory for the wiki: the agent recalls wiki pages and inserts the useful ones at the start of its context, as the old app's memory did.

## Why

Will, 2026-10-21 (PLUGIN-5): "our maintainer app will likely eventually become the wiki feature that we did not include in the mvp. Note this wiki feature was a major part of the previous memory solution but it doesn't exist yet so it will be on the wiki feature when added to also implement memory for the wiki".

## Current state

- **Not in the app.** The old app had the concept, and `.smithers/wiki/` exists in this repository.
- **The review queue isn't part of this.** It's a product feature now under PLUGIN-4, decision 0022 (proposed).
- **Memory (AGENT-5) ships without the wiki.** It ports Jev-ranked recall from `@smthrs/memory` plus skill filtering, with memory sources as an injected service so the wiki plugs in later as one more source.

## Next step

None until Will schedules it. When he does, design the wiki as a first-party plugin (PLUGIN-1), and add it as a memory source behind the existing service.

## Open questions for Will

None now.
