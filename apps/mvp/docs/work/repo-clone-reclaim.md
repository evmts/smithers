---
title: Reclaim cloned copies without the Smithers app
status: todo
area: app
owner: unassigned
updated: 2026-10-20
links: [repo-view-branches-raw-clone.md, ../features/repo.md, ../decisions/0006-repo-clone-and-view.md]
---

**What:** A durable flow frees a reclaimable copy in Code Storage when the storage budget needs room, re-checking the App's installation first; the App's installation webhook clears `repositories.reclaimable` when the App is installed later.

**Why:** Will, 18:22: "until the repo has smithers app installed into it it could be reclaimed for space." Never delete anything without a flow.

**Current state:** Settle marks a ready copy `reclaimable` when the App isn't installed (migration 0028), and the page shows the note with Install ([repo.md](../features/repo.md#reclaiming)). Nothing deletes a copy, and nothing clears the mark.

**Next step:** design `repo/Reclaim` (which copy goes first, how the row and its feed entry read after) and the webhook's clearing write.
