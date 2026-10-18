---
title: Merge or delete the wip/ branches
status: todo
area: process
owner: unassigned
updated: 2026-10-19
links: [../../../../AGENTS.md]
---

## What

Merge each `wip/<role>/<topic>` branch into `main` or delete it: 30 in smithersai/smithers, 10 in plue, 3 in effectscript.

## Why

Will's standing rule: work lands on `main`, and no long-lived branches sit beside it. The lead broke it when it told the mini's agents to push unfinished work as `wip/` branches before Will left. Will: "is there no standing rule that talks about how we avoid branches?"

## State

- The branches exist on GitHub, each scanned for secrets. Everything else from the mini went to the private repo `smithersai/mini-archive`.
- The UI mock (about 390 files) lives on `wip/ui-mock-program-orchestrator/design-mocks`; Will called the mocks inspiration only.
- smithersai/smithers has about 1,183 branches in total.

## Next

Per branch: land what still matters on `main`, delete the rest, then delete the older stale branches.

## Questions for Will

None; the standing rule decides.
