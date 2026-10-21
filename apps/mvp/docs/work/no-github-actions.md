---
title: No GitHub Actions; a PR's checks are Smithers workflow runs
status: done
area: process
owner: docs agent (Claude Opus), finished 13:32:34 on 2026-10-20 (0012, `rules.md`, a `PACKAGE.test.ts` scan); spec agent finished 13:39:22 (`.specs/product/mvp.md` M-52); the lead fixed the root `AGENTS.md` line (13:39:41). Nothing committed. Until 13:46: docs agent (Claude Opus), started by the lead at 13:23:25 on 2026-10-20; decision 0012 and `rules.md` unchanged at 13:27
updated: 2026-10-20
links: [../decisions/0012-git-end-to-end.md, ../rules.md, pull-request-list-and-tabs.md, pr-review-and-merge.md, github-source-of-truth.md, todos-and-stack.md, notifications-and-live-work.md, agent-status.md, issue-triage.md, decisions-for-will.md, import-rules-and-jev-lint.md, ../../../../.specs/product/mvp.md, ../../../../AGENTS.md]
---

## What

Smithers has no GitHub Actions support: no view, no ingestion, no tab and no App permission for check runs, commit statuses or Actions. Smithers workflows do that job and run on Smithers' servers. A pull request's Checks tab lists the Smithers workflow runs on the PR's head SHA, read from the app's one run index (the `runs` table, migration `0013_runs`).

```
before (0012 as written 06:58)            after (Will, 13:21 on 2026-10-20)
GitHub check_run/status webhooks          no Actions, checks or statuses read
  -> checks table -> Checks tab           runs (0013_runs) where head = PR head SHA
App permission: Checks, statuses read       -> Checks tab
```

A merge GitHub refuses because of its own required checks shows GitHub's refusal as it comes; Smithers doesn't read why.

## Why

Will, 13:21:27 on 2026-10-20: "Githubactions we don't support those at all we should not have any view or support for github actions. We support smithers workflows however which are very similar but run on our servers".

He wrote it as an answer to item 1 of the lead's 13:19:52 "waiting on you" list, "your GitHub actions show as you". That item meant 0012 Q1, whether what a person posts through Smithers appears under their own GitHub account. The ruling stands on its own; Q1 was asked again in plain words at 13:23:33 ([decisions for Will](decisions-for-will.md)).

## State

- 13:21:35 to 13:21:55 on 2026-10-20: the lead searched the app and 0012 for Actions and checks references and saved the ruling as a memory. Nothing for checks was built; the change is to the design only.
- 13:22:27: the lead added "No GitHub Actions" to the rules every builder reads (scratchpad `final/BUILD-COMMON.md`).
- **13:23:25: the lead started a docs agent** (Claude Opus). Its brief:
  - Remove from 0012 the `checks` row of the sync table, the `check_run` and `status` webhook events, checks freshness, the `checks` table, and the Checks and Commit statuses permissions; rewrite the "required checks" note to show GitHub's refusal as it comes.
  - Redefine the Checks tab (routes, mock, `ChecksList`, workstream W5) as Smithers workflow runs on the head SHA from the one run index.
  - Add a short "No GitHub Actions" rule under 0012's Decision, with Will's quote and date, and the rule in `docs/rules.md`.
  - If `apps/mvp/PACKAGE.ts` ImportRules or Jev can cheaply ban `/actions/`, `check-runs`, `check-suites` and `/statuses/` API paths in app source, add the check with a test; otherwise list the rule as documented-only.
  - Fix other places in `apps/mvp/docs` that promise Actions or checks support, leaving history with a dated superseded line.
  - It doesn't touch 0012 §5, which the [triage](issue-triage.md) builder is editing.
- 13:23:33, the lead to Will: "Nothing for checks was built yet, so this only changes the design. The Checks tab will show Smithers workflow runs for the pull request's latest commit."
- Affected notes: [pull requests](pull-request-list-and-tabs.md) (the Checks tab), [PR review and merge](pr-review-and-merge.md) (the diff and checks), [GitHub source of truth](github-source-of-truth.md) (GitHub no longer owns checks for us), 0012 Q2's App permissions, and [TODOs and the stack](todos-and-stack.md) (a TODO's checks).
- At 13:27, `0012-git-end-to-end.md` (06:58), `rules.md` (12:18) and `PACKAGE.ts` (12:18) are unchanged. No report.
- **13:32:34 on 2026-10-20: the docs agent finished.** Decision 0012 (13:28:23): the `checks` sync row, the `check_run` and `status` events, checks freshness, the `checks` table, `ChecksList`, W5's `checks-list` and the Checks and Commit statuses permissions are gone; the required-checks note shows GitHub's refusal as it comes; decision 12, "No GitHub Actions", carries Will's quote; the Checks tab lists Smithers runs on the head SHA from `runs`, drawn with `RunList`. **`runs` gains `repo_id` and `sha`**, which migration `0013_runs` lacks; added to 0012 §6 and W4. Q1 marked decided with Will's 13:25 quote.
- **The rule `github.no-actions`** (`rules.md`, 13:31:09) is enforced two ways: a Jev rule in `apps/mvp/PACKAGE.ts`, which doesn't run yet because the build CLI lacks `JevReviewLive`; and a test in `apps/mvp/PACKAGE.test.ts` (13:29:36) that fails if app source contains GitHub `/repos/…/actions/`, `check-runs`, `check-suites`, `/statuses/`, a commit's `/status`, `check_run` or `workflow_run`, or the SDK's `CheckRun`. ImportRules can't ban strings.
- Other docs: dated superseded lines in `proposals/mvp-gaps.md`, `work/mvp-scope-cut.md` and `work/review-requests-and-revisions.md`; the checks permissions dropped from Q2 in `work/issues.md` and `work/pull-request-list-and-tabs.md`; `features/issues.md:183` fixed. 0014's `/$owner/$repo/actions` route stays: it lists Smithers flow runs.
- **13:33:09, the lead to Will:** "No GitHub Actions is now in decision 0012 and in a new lint rule. A test fails if app code calls the GitHub Actions or checks APIs." The lead then started a spec agent on `.specs/product/mvp.md`.
- **13:39:22: the spec agent finished:** new decision **M-52** in `.specs/product/mvp.md` (13:39:04) with Will's quote and a falsifier. Twelve places that promised GitHub checks (lines 142, 187, 288, 298, 320, 394, 463, M-22, M-39, 547, 577, 616) now say a pull request's checks are the Smithers flow runs on its head SHA, each with "(Superseded by M-52, 2026-10-20.)"; M-44's "GitHub keeps … checks" is fixed the same way. Line 298 now reads "Missing: the automerge path still reads GitHub checks." Left as is: the deferred "Deploy previews (via Actions or integrations)" row near line 686.
- 13:39:41: the root `AGENTS.md` Maintainer workflow line now reads "no GitHub Actions support; a pull request's checks are Smithers flow runs (M-52)" (lines 184 to 185). 13:39:45, the lead to Will: "The old backend's auto-merge path still reads GitHub checks; the new app replaces that path."
- **Status moved from in-progress to done.**

## Next

None. The Checks tab builds with [pull requests](pull-request-list-and-tabs.md), reading `runs` by `repo_id` and `sha`. Jev enforcement starts when the build CLI gains `JevReviewLive` ([ImportRules and Jev](import-rules-and-jev-lint.md)).

Until 13:46 on 2026-10-20 the next step was, from 13:23 on 2026-10-20: the docs agent's report (under 8 lines): what changed in 0012 and `rules.md`, whether a lint check bans the Actions and checks API paths, and the other docs it fixed.

## Questions for Will

None. The question his ruling answered by mistake is reworded on [decisions for Will](decisions-for-will.md).
