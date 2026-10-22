---
title: Writes on any repository the App is installed on
status: in-progress
area: app
owner: Codex GPT-6.1 Sol
updated: 2026-10-23
links: [../decisions/0079-roles-per-repository.md, ../decisions/0007-roles-and-tags.md, roles-and-labels.md, ../features/issues.md, ../features/todos.md, ../features/sign-in.md]
---

## What

A deployment writes issues and TODOs to any repository the Smithers GitHub App is installed on, with the person's role on that repository, not only to `GITHUB_REPOSITORY`. smithers.sh (`GITHUB_REPOSITORY=smithersai/smithers`) can then open issues and TODOs on `smithersai/vibelang`, the north star, and on `roninjin10/smithers-github-tests`.

## Why

The lead's brief (2026-10-22): the writes route answered `404 not_found` for any repository but the deployment's own, and the session's role is computed for that one repository. The stack's route and TODO shapes also applied that one role to any repository, a silent widening (GH-4).

## State

- Designed twice (Opus and Codex Sol) and merged: [decision 0079](../decisions/0079-roles-per-repository.md).
- Slice 1 built: `worker/github/RepoRoles.ts`; the writes route takes `issue/create` and `issue/comment` on any allowed repository; the stack's route and shapes resolve the role per repository; `github_repo_roles` (migration 0051); `GITHUB_ALLOWED_REPOSITORIES`; refusal codes `app_not_installed`, `rate_limited`, `github_unavailable`.
- Not yet: the issues' shapes, webhook and Reconcile for other repositories, so an issue opened on another repository settles on GitHub but the device's list shows it as Requested until it syncs (slice 1b).

## Next

1. Slice 1b: the issues' shapes take `?repo=` with the role on that repository, the device keeps one collection per repository, the webhook starts `github/Apply` for any allowed repository, and a stale read reconciles that repository.
2. Slice 2: triage, commitments and merging on any allowed repository.

## Questions for Will

- None.
