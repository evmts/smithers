---
title: Review requests, revisions and the diff since my review
status: idea
area: app
owner: unassigned
updated: 2026-10-20
links: [old-app-feature-gaps.md, pr-review-and-merge.md, pull-request-list-and-tabs.md, notifications-and-live-work.md, auth.md, ../proposals/mvp-gaps.md]
---

## What

After an agent pushes again, a reviewer sees only what changed since they last looked, and asks the right person to review.

Old app:
- Flows `review.since-mine` (open a change's diff since my last review), `review.request` and `review.unrequest` (`apps/app/src/mainview/flows/entries/review.ts`).
- The change card's facets (`cards/ChangeCards.tsx`, `cards/DiffSurface.tsx`):
  - Diff, with from and to revision pickers, "Diff since my review" and "whole diff";
  - Checks per revision;
  - Review, with a verdict strip, request and unrequest, and suggested reviewers;
  - History, with each revision's provenance;
  - Owners, when ownership is known;
  - Walkthrough, when the agent recorded one.
- Journeys: `apps/app/e2e/real/changes-reviews.spec.ts`, `changes-reviews-owned.spec.ts`.

Already planned, so not part of this gap: findings with Please fix and Not useful, checks, and a person's merge ([PR review and merge](pr-review-and-merge.md), `mvp-gaps.md` item 2). In-app line comments and threads are deferred (mvp.md §16) and are listed as cut in the [index](old-app-feature-gaps.md).

Superseded for checks at 13:21:27 on 2026-10-20 ([no GitHub Actions](no-github-actions.md)): the planned checks are the Smithers flow runs on the PR's head SHA, never GitHub's check runs or statuses.

Not planned: requesting reviewers, suggested reviewers and owners, revision-to-revision diffs, history per revision, and the walkthrough.

## Why

- Re-reading a whole diff after every agent push wastes the reviewer's time, which is the user's bottleneck (mvp.md §1.2).
- A review request is the "needs you" a reviewer acts on (decision 0009).

## How it fits

- Revisions: 8a's review flow records the head it reviewed. "Since my review" is a Pierre diff between that SHA and the current head, read from Code Storage.
- Requests: GitHub's requested-reviewers API through `@smthrs/integrations`, since GitHub keeps reviews (M-22). It is a write, so it waits for the [auth design](auth.md).
- Owners: CODEOWNERS parsed by a pure function. Suggested reviewers come from owners and recent authors.
- A request becomes a notification row for the reviewer (decision 0009).

## Size

M.

## Questions for Will

None.
