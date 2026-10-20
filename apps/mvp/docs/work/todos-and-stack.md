---
title: TODOs and the stack (MVP 1, early feature 8c)
status: todo
area: app
owner: unassigned
updated: 2026-10-19
links: [../proposals/early-features.md, ../proposals/mvp-gaps.md, pr-review-and-merge.md, roles-and-labels.md]
---

## What

Ask Smithers for a TODO in an opened repo. It fills a form card, and Commit places it: Append, Before Tn or Amend Tn. The repo's stack lists TODOs in merge order with Move up, Move down and Drop. Each TODO runs the `todo` flow: a real Plan step reads the repo, then the run waits durably for a branch machine.

## Why

It is the product: people and agents turn TODOs into merged pull requests (mvp.md). Will's MVP cut keeps it as item 1. The old stack service is about 26,000 lines of Go on native jj that can't run on Cloudflare, so it is the longest pole.

## State

- Proposed in `early-features.md` (8c) and `mvp-gaps.md` (item 1). Not approved, not started.
- Only scripted models have ever merged a TODO; no real model has.
- 22:49 on 2026-10-19: a TODO's PR reaches main through the repository's configurable merge flow; by default Maintainers and Admins merge, and a person always does ([PR review and merge](pr-review-and-merge.md)). Pre-approving a TODO (M-39) stays a Maintainer act in 0007's catalog; the 22:56 MVP list cuts it until later.
- 22:56: the lead's MVP list keeps item 1 as: create a TODO from chat, the agent works it on its own branch, see its status, drop it. Cut until later: reordering a stack of TODOs, amending, TODOs from issues. Will hasn't approved it ([MVP scope cut](mvp-scope-cut.md)).
- 23:00: Will: "Don't worry about the mvp ... But yes it's more or less right". The MVP list is reference only; work follows his feature list ([MVP scope cut](mvp-scope-cut.md)). Nobody builds this now.

## Next

First slice after [repo clone and view](repo-clone-and-view.md). The second slice, where the agent works the branch and opens the PR, follows [connecting it all](connect-agents-sandboxes-forge.md).

## Questions for Will

- Approve MVP item 1 as trimmed: create, work, status, drop; no insert, amend or move yet? Asked again at 22:56 as part of "Is this the MVP?" ([MVP scope cut](mvp-scope-cut.md)). (Answered 23:00: "more or less right"; reference only.)
