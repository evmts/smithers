---
title: Scratch branches (fork, add to stack, archive)
status: idea
area: app
owner: unassigned
updated: 2026-10-20
links: [old-app-feature-gaps.md, todos-and-stack.md, sandboxes.md, github-source-of-truth.md, roles-and-labels.md, ../decisions/0005-sandboxes-secrets-and-the-forge.md, ../proposals/mvp-gaps.md]
---

## What

A person forks a TODO's branch to try another approach by hand, then turns the better attempt into a TODO.

Old app:
- `/branch.fork` (a scratch branch from a TODO's current revision), `/branch.add-to-stack` (the scratch branch becomes a new TODO after the one it forked from) and `/branch.rebase` (rebase now), in `apps/app/src/mainview/flows/entries/branch.ts`.
- `/branch.archive`: archives a scratch branch; the request survives a reload, "Archiving branch", then "Archived" (`state/controller/branchArchive.ts`).
- The Branch card's Fork, Add to stack, Rebase now, Diff and Keep for now, and the TODO card's Fork and Open branch (`cards/BranchCard.tsx`, `cards/views/BranchView.tsx`, `cards/TodoCard.tsx`).
- Journeys: `apps/app/e2e/real/fork-add-to-stack.spec.ts`, `fork-drop-install.spec.ts`.

Spec J7 (P0, Plan and fork): fork T2's branch, work by hand, Add to stack after T2, drop T2, and lose nothing.

Already planned, so not part of this gap:
- Branches, one sandbox each, with `branch.create` ([sandboxes](sandboxes.md), decision 0005).
- Branch modes (decision 0007).
- The stack ([TODOs and the stack](todos-and-stack.md)).
- Rebasing when `main` moves (`mvp-gaps.md` item 3).

Not planned: forking from a TODO's revision, turning a scratch branch into a TODO, and archiving a branch.

## Why

J7 is a P0 journey: a person takes over from the agent without throwing away its work.

## How it fits

- Flows `branch/fork { from, at }`, `branch/add-to-stack { branch, after }` and `branch/archive { branch }`.
- Each writes Code Storage refs through `@smthrs/effect-code-storage` (decision 0005 §8 adds branch operations), fenced by the expected SHA.
- Add to stack reuses the stack's placement state machine from 8c.
- A person and the agent call the same flows. Branch write rules come from decision 0007.

## Size

M, after the stack and sandboxes.

## Questions for Will

None.
