---
title: CI parity: GitHub events start repository flows
status: todo
area: sdk
owner: none
updated: 2026-10-20 22:50 PDT
links: [../proposals/ci-cd-parity.md, issues.md, no-github-actions.md, ../features/issues.md, ../decisions/0017-everything-is-a-plugin.md]
---

## What

The webhook route starts each active repository flow whose trigger matches a push, pull request, tag, issue, comment, label or review, for every repository the GitHub App is installed on.

## Why

Today `POST /api/github/webhook` starts only `github/Apply` and `triage/Run`, for one synced repository (`worker/github/Api.ts:323-405`; `worker/github/Config.ts:1-5`). Pushes to the default branch and releases become notifications only (`worker/Notifications.ts:261-290`). 28 of the 44 live workflows start on these events.

## Repositories

Smithers, Tevm, Effect.

## Smallest slice

Push and pull request first. Match `on`, `branches`, `tags` and `types`; start with `{ repo, sha, ref, event, pr }` under execution id `<repo>:<flow>:<delivery>`. Triggers come from the default branch's active snapshot; a pull request's body loads at its head unless the trigger says `trust: "base"` (GitHub's `pull_request_target`). Fork pull requests, and pull requests from people below Member, run without secrets. Then tags, issues, comments, labels and reviews, with `contains`, `startsWith` and `minimum` role filters for comment commands (Tevm's `@claude`, Effect's `/effect-bot` and `/rebase`). The Smithers agent answers a mention, replacing claude-code-action.

## Disposition

Build now, 4 of 18. Matrix rows 1 to 6 and 31. Design: [the CI/CD parity proposal](../proposals/ci-cd-parity.md).

## History

2026-10-20 22:50 PDT: written by the Claude Opus merger from the merged CI/CD parity proposal (Opus and Codex Sol designs, ruling FLOW-8).
