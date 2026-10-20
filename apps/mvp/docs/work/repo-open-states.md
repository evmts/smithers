---
title: Repo open states (what each URL shows)
status: todo
area: app
owner: unassigned (feature 2 owner after the first slice)
updated: 2026-10-19
links: [../decisions/0006-repo-clone-and-view.md, ../decisions/0008-auth.md]
---

## What

What `/owner/repo` shows in every case, never claiming an import that didn't happen (spec M-46):
1. Imported and our App installed: it opens, and people with access can ask for changes.
2. Public, App not installed: clone and view it; most features wait for the App or a fork into the person's account.
3. Private or missing while signed out: one "Not found" that offers sign-in, since we can't tell them apart.
4. App on the org but not on this repo: link to that App setting. Org needs owner approval: say so.
5. Renamed on GitHub: follow the redirect. Made private or deleted after cloning: stop showing our copy to people without access.
6. GitHub down or rate-limiting us: say so, and keep working on repos already imported.

## Why

Will: "if github is down we should show some UI that mentions github is down and smithers will continue to work for repos that are already imported. Same for rate limiting." "Our server should support anything that github supports?" "we would have no idea of knowing if the repo is truly 404 or if it's private unless we were signed in."

## State

Spec only. Case 2 is [feature 2](repo-clone-and-view.md)'s first slice; cases 3 to 5 need [auth](auth.md).

## Next

One live e2e test per case, written failing first.

## Questions for Will

None.
