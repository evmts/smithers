---
title: "The repo view's deep import: an exception (A) or its own package (B)"
status: blocked
area: sdk
owner: Will (decision); asked 02:35, 02:36 and again 05:49 on 2026-10-20 (third of the lead's three asks); the lead recommends B; no builder named. Until 05:49: Will (decision); asked 02:35 and 02:36 on 2026-10-20; the lead recommends B; no builder named
updated: 2026-10-20
links: [repo-view-branches-raw-clone.md, repo-clone-and-view.md, deep-import-migration.md, declared-import-exceptions.md, import-rules-and-jev-lint.md, decisions-for-will.md, library-catalog.md, ../rules.md, ../decisions/0006-repo-clone-and-view.md, ../../../../docs/libraries.md, ../../../../AGENTS.md]
---

## What

The app's repo page imports `RepoView` from `@smthrs/ui/adapters/repo-view`, a subpath (`src/features/repo/components/RepoPage.tsx:4`). The subpath keeps the heavy renderers, the Shiki code viewer (about 10 MB) and the Milkdown Markdown editor, out of pages that show no code. It breaks Will's root-imports-only rule.

```
A. allow this one subpath as an exception      (written in rules.md)
B. move the heavy renderers into their own package, e.g. @smthrs/repo-view,
   imported from its root   (recommended: no exception to your rule)
```

Best-guess spec for B:
- A new public package, for example `@smthrs/repo-view`, holds `RepoView`, `CodeFileView` and the Markdown view, with their CSS, tests and docs. `@smthrs/ui`'s root keeps the light pieces (`FileTree`, `Breadcrumbs`, `DirectoryListing`).
- The app imports it from its root; `@smthrs/ui/adapters/repo-view` goes, with no alias left behind.
- `docs/libraries.md` gains its row; the browser contract, the export-map check and the API baseline list it.

## Why

Will: "I don't like that we are doing deep imports import only from the root if something is not public that should be public make it public" ([deep-import migration](deep-import-migration.md)). Root `AGENTS.md`: "consumers import only from a package's root entry".

## State

- 21:36 on 2026-10-19: `RepoView` shipped at `@smthrs/ui/adapters/repo-view`, about 14 MB bundled ([repo clone and view](repo-clone-and-view.md)).
- From 21:44 on 2026-10-19 to 02:35 on 2026-10-20 the question was "allow `@smthrs/ui/adapters/*` as the one exception?", recommended yes ([decisions for Will](decisions-for-will.md)).
- 02:18 and 02:32 on 2026-10-20: the app's import rules find this one violation in 218 files (`rootImportsOnly`).
- **02:35 on 2026-10-20: the lead asked Will A or B and recommended B.** 02:36: "Still open from my last message: should the heavy code viewer move into its own package (B)?" No answer by 02:43.
- `//apps/mvp:importRules` stays red on this one import until Will answers.
- **05:49 on 2026-10-20, asked again.** Will came back, and the lead's third ask: "One question: should the heavy code viewer move into its own package (`@smthrs/repo-view`)? I recommend yes, so the repository view needs no exception to your root-imports rule." No answer by 05:55 ([decisions for Will](decisions-for-will.md), row 3).
- 05:54:14 on 2026-10-20, the wiring agent's report: "`importRules` now reports only the `RepoPage.tsx` deep import awaiting Will's ruling." It is the app's last `importRules` red ([app wiring](app-wiring.md)).
- **06:43:26 on 2026-10-20: asked again**, third of the lead's four "Blocked on you today" asks: "Heavy code viewer: should it move into its own package (`@smthrs/repo-view`)? I recommend yes." No answer by 06:55. Meanwhile the [repo view extras](repo-view-branches-raw-clone.md) builder works in the same files from 06:42:16, with this red excepted.

## Next

Will's answer. On B: an SDK agent builds the package test first; proof is `importRules` green with no exception, the browser contract and export-map checks passing, and the repo e2e unchanged. On A: the lead writes the exception into `rules.md` and `apps/mvp/PACKAGE.ts` with Will's words.

## Questions for Will

- A (one exception) or B (its own package, imported from its root)? Recommended: B.
