---
title: PR review and merge (MVP 2, early feature 8a)
status: todo
area: app
owner: unassigned
updated: 2026-10-19
links: [../proposals/early-features.md, ../proposals/mvp-gaps.md, ../decisions/0007-roles-and-tags.md, roles-and-labels.md, design-questions.md]
---

## What

Swap github.com for our domain in a public PR URL: `/owner/repo/pull/N` shows the changed files with Pierre diffs. Review, `/review owner/repo#N` or asking Smithers runs one durable review flow that pins verified findings to diff lines. A person merges; agents never approve or merge.

## Why

Reviewing agent output is the user's bottleneck (mvp.md §1.2), and Will's MVP cut keeps review and merge as item 2. It needs no machine, so nothing in features 1 to 7 blocks it.

## State

- Proposed (8a, MVP item 2). Not started.
- The old `/review` never finished on a real install: its branch machine image lacked bubblewrap (rc.4).
- The review pipeline has 16 seeded fixtures: offline precision 85.7%, recall 50%.
- `early-features.md` notes nothing yet shows people want `/review`.
- 22:49 on 2026-10-19, design question 10 of 14 (0007 Q2): **merging is a flow.** Will: "Merging into main is actually triggering a workflow and that workflow is configurable. By default maintainers and up obviously." The Merge button runs the repository's merge flow, which the repository can customize; by default Maintainers and Admins may merge. Whatever a repository customizes, a person merges, never an agent and never a Guest ([roles and labels](roles-and-labels.md)).
- 22:56: the lead's MVP list keeps item 2 as: see the PR's diff and checks; a Maintainer merges through the merge flow. Cut until later: evidence views, pre-approval, stack-order rules. Will hasn't approved it ([MVP scope cut](mvp-scope-cut.md)).
- 23:00: Will: "Don't worry about the mvp ... But yes it's more or less right". The MVP list is reference only; work follows his feature list ([MVP scope cut](mvp-scope-cut.md)). Nobody builds this now.
- About 23:06: 0007 is accepted. Its catalog: `repo:approve` needs a Maintainer; `repo:merge` needs the merge flow's minimum, Maintainer by default and never below Member. An agent asked to merge opens its person's own Review & merge confirmation ([roles and labels](roles-and-labels.md)).

## Next

First slice: open a public PR, press Review, see findings; reload or a second device shows the same run. Posting and Merge wait for [auth](auth.md). Merge runs the repository's merge flow, with the default allowing Maintainers and Admins (since 22:49).

## Questions for Will

- Approve MVP item 2 as trimmed: diff, checks and a Merge button only? Asked again at 22:56 as part of "Is this the MVP?" ([MVP scope cut](mvp-scope-cut.md)). (Answered 23:00: "more or less right"; reference only.)
