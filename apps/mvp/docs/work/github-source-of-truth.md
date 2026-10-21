---
title: GitHub as the source of truth (MVP 3)
status: in-progress
area: app
owner: the triage builder (from about 12:54 on 2026-10-20) continues 0012 after slice G0, which 0012's builder reported built at 12:52:55 with R4-7 and R4-15 fixed; G0's live proof waits on Will's GitHub App setup. Until 12:54: 0012's builder, resumed by the lead at 10:42 on 2026-10-20 from where it stopped (the Claude usage limit stopped it from about 08:15 to 10:40); unreported by 10:44. Until 10:42: 0012's builder, slice G0 from 07:40:55 on 2026-10-20 (tokens, the webhook, `github/Apply` and `github/Reconcile`); unreported. Until 07:40: Panel G; decision 0012 written 06:58:11 on 2026-10-20 (status: proposed); no builder yet. Until 06:58: Panel G (Opus merges into decision 0012, the git flow end to end; started 06:41:56 on 2026-10-20). Until 06:41 on 2026-10-20: unassigned
updated: 2026-10-20
links: [review-round-4.md, issues.md, ../decisions/0012-git-end-to-end.md, pull-request-list-and-tabs.md, issue-triage.md, pr-review-and-merge.md, decisions-for-will.md, ../proposals/mvp-gaps.md, ../decisions/0008-auth.md, mvp-scope-cut.md, docs-check-flow-outcome.md, land-and-deploy-mvp.md, no-github-actions.md]
---

## What

Pull requests live on GitHub. Smithers opens the PR on GitHub and shows when it is merged or closed there.

## Why

Spec M-22: GitHub keeps main, issues, pull requests, reviews and checks. Will's MVP cut keeps this as item 3, trimmed: no conflict screens, review-comment steering, outside-push handling or full issue and check sync.

## State

- Proposed (MVP item 3). Not started.
- The old app's sync (`plue/apps/github-sync`) never synced 145 of 156 connected repos, so it is reference only.
- Opening a PR needs the Smithers GitHub App's token, which [auth](auth.md) decides.
- 22:56 on 2026-10-19: the lead's MVP list keeps item 3 as: open the PR on GitHub; show merged or closed. Cut until later: conflict screens, steering from review comments, full issue sync. Will hasn't approved it ([MVP scope cut](mvp-scope-cut.md)).
- 23:00: Will: "Don't worry about the mvp ... But yes it's more or less right". The MVP list is reference only; work follows his feature list ([MVP scope cut](mvp-scope-cut.md)). Nobody builds this now.
- **06:39:05 on 2026-10-20: in Will's priorities.** "Pull request list and generally finishing the entire git e2e flow of being able to create issues open prs or update branch resync etc." Panel G's brief asks that the design stay consistent with GitHub as the truth: webhooks or polling into Postgres and Electric, conflicts and outside pushes. Status moved from `todo` to `designing`.
- Both panel designs (Sol 06:46, Opus 06:53): GitHub owns issues, pull requests, reviews, checks, labels and published refs; Postgres holds a projection only the server's GitHub flows write. A verified webhook starts `github/Apply`, which re-reads the subject from GitHub; `github/Reconcile` catches missed deliveries, since GitHub never redelivers. A `push` webhook refreshes the Code Storage mirror (`repo/Pull`). Details: [pull requests](pull-request-list-and-tabs.md).
- 06:58:11: decision 0012 written (status: proposed) with these rules. Its first question for Will, whether a person's writes show on GitHub as them, blocks G0's first write ([decisions for Will](decisions-for-will.md)).
- 07:08:32 on 2026-10-20: Panel G is waiting on its last `pnpm docs:check`; no report ([docs check outcome](docs-check-flow-outcome.md)). Decision 0012 is unchanged since 06:58:11.
- **07:40:55 on 2026-10-20, Panel G done; the lead to Will:** "The git design is done (decision 0012), and building its first slice has started." "**GitHub stays the truth.** The server mirrors issues and PRs into the database, which syncs to your devices. Webhooks only trigger a fresh read from GitHub, and a reconcile run catches anything missed." G0 builds that loop for issues ([issues](issues.md)).
- 07:40:55: the lead relayed 0012 Q1 and Q2 ([decisions for Will](decisions-for-will.md)); the build uses the recommended answers, "but changing the App's settings needs you".
- **Status moved from designing to in-progress** at the 07:40:55 start.
- 07:51 to 08:04 on 2026-10-20, on disk, unreported: G0's server loop, `worker/github/` (`Reconcile`, `Apply`, `Write`, `Tokens` and others) and migration `0016_github_issues.ts`; details in [issues](issues.md). Kept out of landing round 2 at 07:53:57 as still in flight ([land to main](land-to-main.md)).
- 08:09 to 08:12 on 2026-10-20: G0's tests against a scripted GitHub (`worker/github/test/`, `Flows.test.ts`). **About 08:15 to 10:40: the Claude usage limit stopped the builder; the lead resumed it at 10:42** from where it stopped ([issues](issues.md)). No report by 10:44.

- **11:01 to 11:04 on 2026-10-20: [review round 4](review-round-4.md)'s R4-15 (P2, Claude Opus P2-3 and Claude Fable P3-5, source-verified): any Guest can post on GitHub as the App bot.** `worker/github/Api.ts:262` admits any role, and `:276` checks for a session only when the client says `via: "person"`; `via: "agent"` makes `github/Write` use the installation token with "acting for `<login>`" attribution (`Write.ts:148-151`, `:160-163`). `Actor.act` is never set by sign-in. Every GitHub user has read on a public repository and maps to Guest, so any of them can POST `{ via: "agent", op: "issue/comment", ... }` and post as `smithers[bot]`, around a block, an interaction limit or their own rate limit. Fix: derive `via` on the server: `agent` only from an agent actor, Member or above; otherwise run the write with the person's own token. Unrouted by 11:07.
- Also round 4: R4-7, the issues shapes serve a private repository's issues to anyone ([issues](issues.md)).
- **12:52:55 on 2026-10-20: slice G0 built** ([issues](issues.md)). A webhook delivery only starts a re-read from GitHub; a read that finds the sync older than 5 minutes starts a reconcile; writes go through the outbox and the remote `github/Write` flow with a hidden marker; people write with their own `ghu_` token and the agent as the App. R4-15 fixed: an agent write from a Guest is 403. The create and comment e2e and the live tests haven't run: the App isn't configured.
- **12:54:04, the lead asked Will to set up the GitHub App:** Issues read and write; the Issues and Issue comment events; a new private key; installs on the wrapped repository and a scratch repository. The webhook URL waits for a deploy. The lead also started the triage builder ([issue triage](issue-triage.md)).

- 13:19:52 on 2026-10-20: the lead's list: "Pull request list, review and merge; branch update and resync: not started (rest of 0012)". 13:21:12: they wait for the [triage](issue-triage.md) builder, which edits the same GitHub write path and list view.
- **13:21:27: Will ruled out GitHub Actions** ([no GitHub Actions](no-github-actions.md)). GitHub still owns issues, pull requests, reviews, labels and published refs; Smithers no longer mirrors check runs or commit statuses, and checks are Smithers workflow runs. A docs agent removes 0012's `checks` table, `check_run` and `status` webhooks and the Checks and statuses permissions from 13:23:25.
- 13:23:33: the lead asked 0012 Q1 again in plain words, since Will read "your GitHub actions show as you" as Actions: should what a person posts through Smithers appear on GitHub under their own account, rather than the App's? Recommended: yes ([decisions for Will](decisions-for-will.md)). G0 already builds it that way.
- 13:25:53 on 2026-10-20: Will answered 0012 Q1: a person's writes through Smithers appear on GitHub under their own account ("yes should appear under your account is better ux"); recorded in 0012.
- 13:32:34 to 13:39:45: no GitHub Actions in 0012, `rules.md` (`github.no-actions`) and mvp.md M-52: GitHub keeps `main`, issues, pull requests and reviews, and a PR's checks are Smithers flow runs ([no GitHub Actions](no-github-actions.md)).

## Next

From 13:21 on 2026-10-20: Will's GitHub App setup, then G0's create and comment e2e and live tests ([issues](issues.md)); the triage slice ([issue triage](issue-triage.md)); then pull requests and branch update and resync ([pull requests](pull-request-list-and-tabs.md)), with no Actions, checks or statuses sync. The webhook URL and secret follow the first deploy ([land and deploy](land-and-deploy-mvp.md)).

Until 13:21 on 2026-10-20 the next step was, from 12:54 on 2026-10-20: Will's GitHub App setup, then G0's create and comment e2e and live tests ([issues](issues.md)); the triage slice ([issue triage](issue-triage.md)); then pull requests ([pull requests](pull-request-list-and-tabs.md)). The webhook URL and secret follow the first deploy ([land and deploy](land-and-deploy-mvp.md)).

Until 12:54 on 2026-10-20 the next step was, from 11:07 on 2026-10-20: G0's report as before ([issues](issues.md)), and the lead's routing of round 4's R4-15 and R4-7 ([review round 4](review-round-4.md)). R4-15 touches Will's open question on GitHub actions showing as him ([decisions for Will](decisions-for-will.md)).

Until 11:07 on 2026-10-20 the next step was, from 07:40 on 2026-10-20: G0's report ([issues](issues.md)): a verified webhook starts `github/Apply`, `github/Reconcile` catches a missed delivery, and both reach two devices. Pull requests follow in 0012's parallel workstreams ([pull requests](pull-request-list-and-tabs.md)).

Until 07:40 on 2026-10-20 the next step was, from 06:55 on 2026-10-20: Opus merges Panel G into `0012-git-end-to-end.md`; its walking skeleton G0 builds the webhook, `github/Apply`, `github/Reconcile` and issue writes on one App-covered repository.

Until 06:41 on 2026-10-20 the next step was: After [TODOs](todos-and-stack.md) open a branch: open the PR through the App, then reflect merged and closed through webhooks into Postgres and Electric.

## Questions for Will

- Approve MVP item 3 as trimmed? Asked again at 22:56 as part of "Is this the MVP?" ([MVP scope cut](mvp-scope-cut.md)). (Answered 23:00: "more or less right"; reference only.)
