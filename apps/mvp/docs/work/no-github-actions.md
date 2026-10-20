---
title: No GitHub Actions; a PR's checks are Smithers workflow runs
status: in-progress
area: process
owner: docs agent (Claude Opus), started by the lead at 13:23:25 on 2026-10-20; decision 0012 and `rules.md` unchanged at 13:27
updated: 2026-10-20
links: [../decisions/0012-git-end-to-end.md, ../rules.md, pull-request-list-and-tabs.md, pr-review-and-merge.md, github-source-of-truth.md, todos-and-stack.md, notifications-and-live-work.md, agent-status.md, issue-triage.md, decisions-for-will.md, import-rules-and-jev-lint.md]
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

## Next

From 13:23 on 2026-10-20: the docs agent's report (under 8 lines): what changed in 0012 and `rules.md`, whether a lint check bans the Actions and checks API paths, and the other docs it fixed.

## Questions for Will

None. The question his ruling answered by mistake is reworded on [decisions for Will](decisions-for-will.md).
