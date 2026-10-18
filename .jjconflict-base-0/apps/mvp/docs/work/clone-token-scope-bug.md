---
title: Clone token not scoped to one repo (old backend)
status: todo
area: infra
owner: unassigned
updated: 2026-10-19
links: [../decisions/0006-repo-clone-and-view.md]
---

## What

A security bug in the old smithers.sh backend: a temporary git clone token isn't tied to one repository, so a leaked token can read every repo its user can access, for an hour.

## Why

The Freestyle research agent found it on 2026-10-19 while checking our git hosting. Root `AGENTS.md` makes security rules hard rules even for a prerelease.

## State

- Reported in chat only: no issue, fix or test exists.
- The new app doesn't use this token; it clones through Code Storage ([feature 2](repo-clone-and-view.md)). The old backend still serves smithers.sh.

## Next

Open a GitHub issue, then scope the token to one repo with a test that a token for repo A can't read repo B, or retire the old backend.

## Questions for Will

- Fix it in the old backend, or retire that backend? See [legacy smithers.sh](legacy-smithers-sh.md).
