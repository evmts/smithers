---
title: Pull request list, and the conversation, commits and checks tabs
status: todo
area: app
owner: unassigned; from 13:21:12 on 2026-10-20 it waits for the [triage](issue-triage.md) builder, which edits the same GitHub write path and list view. Until 13:21: unassigned; designed in decision 0012 (Panel G reported 07:40:55 on 2026-10-20); not in slice G0, which started 07:40:55. Until 07:40: Panel G; decision 0012 written 06:58:11 on 2026-10-20 (status: proposed); no builder yet. Until 06:58: Panel G (Opus merges into decision 0012, the git flow end to end; started 06:41:56 on 2026-10-20). Sol's design done 06:46; Opus's independent design written 06:53. Until 06:41: unassigned
updated: 2026-10-20
links: [issues.md, ../decisions/0012-git-end-to-end.md, old-app-feature-gaps.md, pr-review-and-merge.md, github-source-of-truth.md, issue-triage.md, repo-view-branches-raw-clone.md, agent-ui-rendering.md, review-requests-and-revisions.md, roles-and-labels.md, sign-in.md, decisions-for-will.md, ../decisions/0007-roles-and-tags.md, ../decisions/0008-auth.md, ../proposals/mvp-gaps.md, ../proposals/early-features.md, docs-check-flow-outcome.md, no-github-actions.md, second-build-machine.md]
---

## What

GitHub's pull request pages, at GitHub's paths.

**From 06:39 on 2026-10-20 this note is part of the whole git flow.** Will: "Pull request list and generally finishing the entire git e2e flow of being able to create issues open prs or update branch resync etc." Panel G designs it as decision 0012, with [issue triage](issue-triage.md) added at 06:41. Best guess from both panel designs (scratchpad `final/panel-g-{opus,sol}.md`); the merge decides:

```
GitHub ──webhook──▶ github/Apply (re-reads the subject) ──▶ Postgres rows ──Electric──▶ device collections
   ▲                github/Reconcile (missed webhooks, 5-minute read trigger)
   │
   └── one remote flow per write ◀── route (sign-in, Authorize, bounds) ◀── outbox mutation with writeId
       issue/Create, issue/Comment, pr/Open, pr/Review, pr/Merge, branch/Create, branch/Update, repo/Pull
```

- **Truth:** GitHub owns issues, pull requests, reviews, checks, labels and published refs. Postgres holds a projection that only the server's GitHub flows write; diffs and files stay content-addressed reads (0006). The device never calls GitHub.
- **Writes:** each is one remote flow, admitted by a route from an outbox mutation keyed by a `writeId`, with an optimistic row until GitHub's read-back settles it.
- **Who GitHub shows (Opus):** a person's own act uses their GitHub token, so GitHub shows them and applies their permissions. Flows and the agent use an installation token and show as `smithers[bot]`, "Smithers for @maya". Sol uses the App installation token for all writes.
- **Merge:** `pr/Merge { pr, headSha, method }` runs the repository's merge flow: Maintainer and up by default, always a person, never an agent or a Guest (0007). It calls GitHub's `merge-async` fenced to the head the person saw; squash by default.
- **Branches:** `branch/Create`; `branch/Update` brings a branch up to its base by merge (default) or rebase (Opus: GraphQL `updatePullRequestBranch` with `expectedHeadOid`; REST `POST /merges` without a PR). Sol: never force-push silently; keep the old checkpoint. A `push` webhook starts `repo/Pull` to refresh the Code Storage mirror.
- **Routes:** `/$owner/$repo/issues`, `/issues/new`, `/issues/$n`, `/pulls`, `/pull/$n` with `/commits`, `/checks` and `/files`, `/compare/$base...$head` (open a PR) and `/branches`.
- **New `@smthrs/ui` components:** `ItemTimeline`, `CommentBox`, a commit list, a checks list, a merge box, `TriageBar` and `BranchPicker`, shared with [repo view extras](repo-view-branches-raw-clone.md).
- **Walking skeleton (Opus, G0):** one public repository the App covers; installation tokens, the webhook route, `github/Apply` and `github/Reconcile`; issue rows and shapes; `/issues` and `/issues/$n`; `issue/Create` and `issue/Comment` through the outbox. The PR list and pages come in workstreams W4 to W6 after it.
- **Superseded for checks at 13:21:27 on 2026-10-20** ([no GitHub Actions](no-github-actions.md)): Smithers mirrors no GitHub checks and has no checks list component. The Checks tab lists the Smithers flow runs on the PR's head SHA from the `runs` table, through `RunList` ([0012](../decisions/0012-git-end-to-end.md) decision 12). The old app's checks below are history.

The original gap, as the audit wrote it at 06:10:

Old app (`apps/app/src/mainview/repository/PullViews.tsx`, `cards/LandingCards.tsx`, `flows/entries/prs.ts` with `prs.tab`, slash `/pr`):
- **List:** a filter box (`is:open`, `is:closed`, `is:draft`, `is:merged`, `author:`, `label:`), Open and Closed counts, and Author and Label menus.
- **Detail:** Draft, Open, Merged or Closed, and "into base from head" links.
- **Tabs:**
  - Conversation: the body, reviews, "Checks passed.", "Merge on GitHub ↗", and Labels and Reviewers.
  - Commits: message, author, time and id.
  - Checks: each check and its state.
  - Files changed: collapsible diffs with counts.
- A tab that needs a GitHub account offers sign-in; read limits and failures offer Retry.
- Journey: `apps/app/e2e/real/pull-requests.spec.ts`.

Already planned, so not part of this gap:
- [PR review and merge](pr-review-and-merge.md) (early feature 8a): `/owner/repo/pull/N` shows the changed files with Pierre diffs and pinned findings.
- `mvp-gaps.md` item 2 adds checks.
- [GitHub as the source of truth](github-source-of-truth.md) shows merged or closed.

Not planned: the `/owner/repo/pulls` list, the Conversation and Commits tabs, and the filters.

## Why

- `/pulls` and `/pull/N/commits` are GitHub paths, so the domain swap must open them.
- A reviewer reads the discussion and the commits, not only the files.

## How it fits

- GitHub reads through `@smthrs/integrations` with the deployment's read-only token, which makes them remote flows by decision 0011's need rule. Results are cached.
- A `ui/pulls` template beside feature 3's `ui/issues` ([agent UI](agent-ui-rendering.md)), so the list renders inline in chat and full screen. One list component serves issues and pull requests.
- Routes `/$owner/$repo/pulls` and `/$owner/$repo/pull/$n/$tab`.

## Size

M.

## State

- 06:10 on 2026-10-20: the old-app audit wrote this note as gap 7 (`status: idea`).
- **06:39:05:** Will put it in his priorities: "Pull request list and generally finishing the entire git e2e flow of being able to create issues open prs or update branch resync etc."
- 06:40 to 06:41:56: the lead wrote `PANEL-G-BRIEF.md`, started Sol at 06:40 and again at about 06:41:49 with triage added, and started Panel G's Opus member and merger at 06:41:56. Status moved from `idea` to `designing`.
- 06:46: Sol's design finished (exit 0). Its decisions: GitHub owns refs, issues, PRs and triage labels; every write a server-side flow on the App installation token; main only through a PR; merge from base by default; no question for Will.
- 06:53: Opus's design written (`panel-g-opus.md`), with two questions for Will (below). By 06:55 `0012-git-end-to-end.md` isn't written.
- **06:58:11: decision 0012 written** ("Git end to end: issues, triage, pull requests and branches, with GitHub as the truth", status: proposed). Its walking skeleton G0 is issues on `GITHUB_REPOSITORY`: installation tokens, the webhook, `github/Apply`, `github/Reconcile`, `/issues` and `/issues/$n`, and `issue/Create` and `issue/Comment` from a button and the agent. Spike S0 (half a day) adds a fourth question: does GraphQL `expectedHeadOid` fence the PR's head? One integrator owns the shared files (migrations, `worker/ChatApi.ts`, the registry, the router). It keeps both of Opus's questions for Will.
- 07:08:32 on 2026-10-20: Panel G is waiting on its last `pnpm docs:check`; no report ([docs check outcome](docs-check-flow-outcome.md)). Decision 0012 is unchanged since 06:58:11.
- **07:40:55 on 2026-10-20, Panel G done; the lead to Will:** "The git design is done (decision 0012), and building its first slice has started." Its first slice is issues: "list, view, create and comment on issues, across two devices" ([issues](issues.md)). The PR list and pages are 0012's workstreams W4 to W6, built after G0.
- **Status moved from designing to todo:** designed in 0012, not in the first slice.
- 12:52:55 on 2026-10-20: slice G0 (issues) built; its create and comment e2e wait on Will's GitHub App setup ([issues](issues.md)).
- 13:19:52: the lead's list: "Pull request list, review and merge; branch update and resync: not started (rest of 0012)".
- 13:21:12: the lead: these "use the same GitHub write path and list view the triage agent is editing. Start them when triage finishes." Not in the 13:22 batch Will approved at 13:21:41.
- **13:21:27: Will ruled out GitHub Actions** ([no GitHub Actions](no-github-actions.md)). The Checks tab lists the Smithers workflow runs on the PR's head SHA from the one run index (`runs`, migration `0013_runs`), not GitHub check runs or statuses. 0012's `checks` table, `check_run` and `status` webhooks and `ChecksList` over GitHub checks go; a docs agent rewrites 0012 from 13:23:25. 0012 Q2's "Checks and Commit statuses read" permissions drop out ([decisions for Will](decisions-for-will.md)).

## Next

From 13:21 on 2026-10-20: when the [triage](issue-triage.md) builder finishes, W4 to W6 build `src/features/pulls`, the PR components and screens; the Checks tab reads Smithers workflow runs for the head SHA. A [second build machine](second-build-machine.md), if Will names one, could take it sooner.

Until 13:21 on 2026-10-20 the next step was, from 07:40 on 2026-10-20: G0 ([issues](issues.md)) and spike S0 first; then W4 to W6 build `src/features/pulls`, the PR components and screens, with one integrator owning the shared files.

Until 07:40 on 2026-10-20 the next step was, from 06:58 on 2026-10-20: Will answers 0012's two questions (below); question 1 blocks G0's first write. Then G0 and spike S0 build, and the PR list and pages follow in 0012's parallel workstreams.

Until 06:58 the next step was: Opus merges into `apps/mvp/docs/decisions/0012-git-end-to-end.md` (status: proposed) and runs `pnpm docs:check`. Then the walking skeleton G0, with a half-day spike on the Code Storage mirror: does `pullUpstream` re-sync a public-mode repository, and can a repository switch to App mode?

## Questions for Will

Until 06:41 on 2026-10-20: none.

From 0012 (06:58), the same two as Opus's 06:53 draft:
- **Q1, blocks G0's first write:** should a person's issues, comments, reviews and merges show on GitHub as that person, or as `smithers[bot]` "for @maya"? Recommended: as the person, through their own GitHub token; agents and flows stay `smithers[bot]`. (Sol's alternative, the App for everything, is simpler, but a person's review then never counts as their GitHub approval.) (Relayed 07:40:55 on 2026-10-20; built on yes.)
- **Q2:** may we change the Smithers GitHub App: Issues, Pull requests and Contents read and write; Checks and Commit statuses read; a webhook and secret; its ID and private key as deploy secrets, with Code Storage's organization registering the same App? Each installation owner must accept. Recommended: yes. (Relayed 07:40:55 on 2026-10-20; changing the App's settings needs Will.) (Checks and Commit statuses read dropped at 13:21:27 on 2026-10-20: [no GitHub Actions](no-github-actions.md).)

From Opus's draft at 06:53, before the merge, which may change them:
- Should a person's issues, comments, reviews and merges show on GitHub as them, through their own GitHub token, or as `smithers[bot]` "for @maya"? Opus recommends: as them; agents and flows stay `smithers[bot]`.
- May we change the Smithers GitHub App: Issues, Pull requests and Contents read and write, Checks and statuses read, plus a webhook URL and secret? Each installation owner must accept the new permissions. Opus recommends yes.
