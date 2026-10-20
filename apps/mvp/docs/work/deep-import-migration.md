---
title: Deep-import migration (627 files)
status: todo
area: sdk
owner: unassigned
updated: 2026-10-20
links: [repo-view-package-split.md, declared-import-exceptions.md, repo-checks-green.md, ../rules.md, ../../../../docs/libraries.md, repo-clone-and-view.md, decisions-for-will.md]
---

## What

Move every import of `@smthrs/rpc/*` and other package subpaths to the package root, then ban subpath imports repo-wide.

## Why

Will: "I don't like that we are doing deep imports import only from the root if something is not public that should be public make it public".

## State

- 627 files still deep-import `@smthrs/rpc/*`. They work, because `@smthrs/rpc` now exports all 92 modules from its root ([SDK cleanup](sdk-cleanup.md)).
- `apps/mvp` already allows only root imports through `ImportRules`.
- [Repo clone and view](repo-clone-and-view.md) asks for one exception: the heavy `@smthrs/ui/adapters/*` renderers.
- 21:36 on 2026-10-19: `RepoView` shipped at `@smthrs/ui/adapters/repo-view`, about 14 MB bundled. At 21:44 `apps/mvp/PACKAGE.ts` has no `adapters` exception yet; the app's repo screens (R4) need it or a split package. The question is on [decisions for Will](decisions-for-will.md).

- 22:15: the lead asked again, with the Markdown question, as one 10-second ask; second in line on [decisions for Will](decisions-for-will.md) after the design questions Will is answering one at a time. No answer at 22:24.

- About 02:06 on 2026-10-20: the [repo checks](repo-checks-green.md) pass with two deep imports declared as known exceptions in `PACKAGE.ts`: `@smthrs/model-host` → `@smthrs/cli/Catalog` and `@smthrs/cli/CatalogRequest`, and `@smthrs/rpc` → `@smthrs/canonical/Record` and `@smthrs/canonical/Serializer`. They have their own note ([declared import exceptions](declared-import-exceptions.md)). Nine new deep subpaths were removed in favor of root exports in the same pass.
- 02:18 and 02:32 on 2026-10-20: the app's import rules have one violation in 218 files: `src/features/repo/components/RepoPage.tsx:4` imports `@smthrs/ui/adapters/repo-view` (`rootImportsOnly`). The wiring agent's sub-agent A2b saw it at 02:18 and the R3 to R5 agent at 02:32. The `adapters` exception question is still open, and it now holds the repo screen's import rules red ([repo clone and view](repo-clone-and-view.md)).
- **02:35 on 2026-10-20: the question changed.** The lead asked Will A (allow this one subpath as an exception) or B (move the heavy renderers into their own package such as `@smthrs/repo-view`, imported from its root), and now recommends B. `importRules` stays red on that one import until he answers. Its own note: [repo-view package split](repo-view-package-split.md).

## Next

A codemod over the 627 files, package by package, each package's tests green, then a repo-wide `ImportRules` entry.

## Questions for Will

- Allow `@smthrs/ui/adapters/*` as the one exception, or split each heavy renderer into its own package? Recommended: B, its own package (from 02:35 on 2026-10-20; until then: allow it). Asked as A or B at 02:35 ([repo-view package split](repo-view-package-split.md)).
