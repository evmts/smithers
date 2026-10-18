---
title: GitHub as the source of truth (MVP 3)
status: todo
area: app
owner: unassigned
updated: 2026-10-19
links: [../proposals/mvp-gaps.md, ../decisions/0008-auth.md, mvp-scope-cut.md]
---

## What

Pull requests live on GitHub. Smithers opens the PR on GitHub and shows when it is merged or closed there.

## Why

Spec M-22: GitHub keeps main, issues, pull requests, reviews and checks. Will's MVP cut keeps this as item 3, trimmed: no conflict screens, review-comment steering, outside-push handling or full issue and check sync.

## State

- Proposed (MVP item 3). Not started.
- The old app's sync (`plue/apps/github-sync`) never synced 145 of 156 connected repos, so it is reference only.
- Opening a PR needs the Smithers GitHub App's token, which [auth](auth.md) decides.
- 22:56 on 2026-10-19: the lead's MVP list keeps item 3 as: open the PR on GitHub; show merged or closed. Cut until later: conflict screens, steering from review comments, full issue sync. Will hasn't approved it ([MVP scope cut](mvp-scope-cut.md)).
- 23:00: Will: "Don't worry about the mvp ... But yes it's more or less right". The MVP list is reference only; work follows his feature list ([MVP scope cut](mvp-scope-cut.md)). Nobody builds this now.

## Next

After [TODOs](todos-and-stack.md) open a branch: open the PR through the App, then reflect merged and closed through webhooks into Postgres and Electric.

## Questions for Will

- Approve MVP item 3 as trimmed? Asked again at 22:56 as part of "Is this the MVP?" ([MVP scope cut](mvp-scope-cut.md)). (Answered 23:00: "more or less right"; reference only.)
