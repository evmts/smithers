---
title: The old smithers.sh and the Tuesday launch
status: blocked
area: infra
owner: Will (decision)
updated: 2026-10-19
links: [../proposals/mvp-gaps.md]
---

## What

The old product on smithers.sh (Go backend on Google Cloud, plue) and the Tuesday launch the org was working toward.

## Why

Will, after walking the ask-to-PR flow step by step: "I think it's fair to say nothing works." Then: "We are going to build this app from scratch." On its git hosting: "All hosted git lives on a single server? We have 0 redundancy?"

## State, as of 2026-10-19 afternoon

- Sign-in works. Opening a repo works only for the demo copy; import worked once, on Oct 15. Hosted coding has never completed on production.
- All hosted git is one pod with one zonal disk; memory hits its 4 GB cap daily.
- Open items from the morning: rename the GitHub App from SmithersPreviewRelease, create the walk accounts, rotate exposed keys, release candidate 16, and the launch post rewrite.
- The mini's agents handed off; `main` matches GitHub, and unfinished work sits on `wip/` branches ([cleanup](wip-branches-cleanup.md)).

## Next

Will decides what happens to the old stack.

## Questions for Will

- Does any Tuesday launch of the old stack still happen, or does the new app replace it?
- Retire the old backend once the new app opens repos?
