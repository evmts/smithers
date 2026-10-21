---
title: "The code viewer moves to its own package, @smthrs/repo-view (Will chose B)"
status: done
area: sdk
owner: repo-view builder; Will reviews recordings
updated: 2026-10-20
links: [repo-view-branches-raw-clone.md, repo-clone-and-view.md, deep-import-migration.md, declared-import-exceptions.md, import-rules-and-jev-lint.md, decisions-for-will.md, library-catalog.md, ../rules.md, ../decisions/0006-repo-clone-and-view.md, ../../../../docs/libraries.md, ../../../../AGENTS.md, branch-terminal.md, api-baseline-rerecord.md]
---

## Current specification — 2026-10-20, 15:54 PDT

**What:** Publish the repository viewer and framed terminal through package root APIs.

**Why:** Remove deep imports and keep expensive editors and highlighting lazy.

**Current state:** At 15:44 PDT the lead reported @smthrs/repo-view and @smthrs/terminal-frame extracted, old exception removed, browser tests passing 3/3 including repaired copy permalink, and lazy-loading enforced by a test. The lead also reported reaching 100% coverage and fixing two bugs.

**Next step:** Keep the reported receipts with the package change and review the queued walkthroughs. The separate CLI NodeControl exception remains SDK cleanup work.

**Open questions for Will:** None.

Evidence: lead text replies extracted from the latest two hours of session 6253ecf2; current rulings and queue answers take precedence over older briefs. No product tests rerun by this tracker.

## Prior tracker record (retained)


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
- **13:26:18 on 2026-10-20: asked again** as quick question 1 of 4: "Move the heavy code viewer into its own package, `@smthrs/repo-view`, so the app needs no exception to the root-imports rule? Recommended: yes. Until then the app's import lint check stays red."
- **13:31:14: Will answered B:** "Yes move code viewer to it's own package."
- **13:32:34: the lead started an agent:** "it moves into its own package, `@smthrs/repo-view`, and the old import path is deleted. That turns the app's import lint check green." **Status moved from blocked to in-progress.**
- **13:42:00: an exception landed in the working copy anyway.** The [branch terminal](branch-terminal.md) builder gave `rootImportsOnly` in `packages/repo-targets` an `allow` list (tested, README updated) and set `allow: ["@smthrs/ui/adapters/*"]` in `apps/mvp/PACKAGE.ts` (line 80), citing the exception in `rules.md` (line 105), "so the deep imports in `TerminalPanel.tsx` and `RepoPage.tsx` no longer fail". That is answer A, which Will's B replaces. Two app files import adapter subpaths: `src/features/repo/components/RepoPage.tsx:14` (`@smthrs/ui/adapters/repo-view`) and `src/features/terminal/components/TerminalPanel.tsx:2` (`@smthrs/ui/adapters/terminal-frame`, xterm). The general `allow` option can stay; the app's entry and the `rules.md` exception go.
- By 13:46: no `packages/**/repo-view` on disk.
- **Correction (14:08 on 2026-10-20):** the package's first files were on disk at 13:44:20 under `packages/smithers/ui/repo-view/`, which the 13:46 check missed.
- On disk 13:44 to 14:05, unreported:
  - `packages/smithers/ui/repo-view`, named `@smthrs/repo-view`: `CodeFileView.tsx`, `PierreDiffView.tsx`, `MarkdownEditor.tsx` (14:04), `paths.ts`, `grammars/`, a generated Crepe theme, `PACKAGE.ts` (13:59) and tests (code view, diff view, Markdown editor hydration, read-only and WYSIWYG, styles, repo view).
  - `packages/smithers/ui/terminal-frame`, named `@smthrs/terminal-frame` (13:57 to 13:58): `TerminalFrame.tsx`, `frame.ts`, `protocol.ts`, a generated runtime and a browser test.
  - `@smthrs/ui/src/adapters/repo-view` is gone; `adapters/terminal.tsx` and `xtermCss.ts` remain.
  - The app: `RepoPage.tsx` imports `RepoView` from `@smthrs/repo-view` (13:55) and `TerminalPanel.tsx` imports `TerminalFrame` from `@smthrs/terminal-frame` (13:58). `apps/mvp/PACKAGE.ts` (14:04) still has `allow: ["@smthrs/ui/adapters/*", "@smthrs/cli/NodeControl"]` (line 81).
- 14:15 to 14:17 on 2026-10-20: the session usage limit stopped the repo-view package agent with 12 others; the lead resumed all 13 at 14:19.
- 14:19: scratchpad `importrules.log` (an `importRules` run). No report by 14:30.

## Next

From 14:08 on 2026-10-20: the agent's report, with the app's `allow` entry for `@smthrs/ui/adapters/*` and the `rules.md` exception removed and `//apps/mvp:importRules` green with no exception; the rest of the proof below.

Until 14:08 on 2026-10-20 the next step was, from 13:32 on 2026-10-20: the agent's report. Proof: `@smthrs/repo-view` holds `RepoView`, `CodeFileView` and the Markdown view, imported from its root; `@smthrs/ui/adapters/repo-view` is deleted with no alias; the app's `allow: ["@smthrs/ui/adapters/*"]` and the `rules.md` exception are removed; `TerminalFrame` (xterm) leaves its adapter subpath too, the same way; `//apps/mvp:importRules` passes with no exception; `docs/libraries.md`, the browser contract, the export-map check and the [API baseline](api-baseline-rerecord.md) list the package; the repo e2e passes unchanged.

Until 13:46 on 2026-10-20 the next step was: Will's answer. On B: an SDK agent builds the package test first; proof is `importRules` green with no exception, the browser contract and export-map checks passing, and the repo e2e unchanged. On A: the lead writes the exception into `rules.md` and `apps/mvp/PACKAGE.ts` with Will's words.

## Questions for Will

None. Answered 13:31:14 on 2026-10-20: B. The terminal frame's adapter import follows the same rule; that is the lead's call, not a question.

Until 13:31:

- A (one exception) or B (its own package, imported from its root)? Recommended: B.
