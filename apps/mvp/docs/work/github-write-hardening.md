---
title: GitHub write hardening (merge base, triage pin, home roles)
status: in-progress
area: github
owner: github-writes builder (Claude Opus)
updated: 2026-10-21 21:00 PDT
links: [agent-review-finding-repairs.md, code-reviews.md, ../proposals/durable-external-effects.md, ../features/pulls.md, ../features/issues.md, ../features/home.md, ../features/sign-in.md, ../decisions/0007-roles-and-tags.md, ../decisions/0012-git-end-to-end.md, ../decisions/0018-issue-lifecycle.md]
---

Three findings from the agent review (PROC-21: Codex Astra and Claude Fable reviewed each slice; Codex Sol confirmed
each against the code). Each lands as one commit with a regression test that fails on the code before it.

## 1. A merge lands on a base the person never saw (`worker/github/Merge.ts`)

**What is wrong.** `pr/Merge/send` compares the pull request's `base.sha` with the `baseSha` the page sent. GitHub sets
`base.sha` when the pull request opens or its base changes and never moves it after: "If the branch is updated in the
future, GitHub does not update the base branch's commit" ([GitHub docs][base]). Both values are that snapshot, so the
check passes however far the base branch moved, and GitHub merges onto its head. The scripted GitHub hid this by
answering the branch's live head as `base.sha`. GitHub's merge fences only the head: `sha` is the "SHA that pull
request head must match"; neither `merge` nor `merge-async` takes a base precondition ([GitHub docs][merge]).

**Design.**

- The pulls projection's `base_sha` is the base branch's head when GitHub was last read: `fetchPull` reads
  `GitHub.Refs.getBranch(base.ref)`, and falls back to GitHub's snapshot when the branch is gone. The page binds what
  that row says.
- Inside the durable step, after the head, draft and state checks and immediately before the merge, the step reads the
  base branch's own head with the person's token (`liveBaseHeadOf`), never falling back to GitHub's snapshot. A head
  other than `baseSha`, or none it can read, is `base_moved`: nothing merges, and every open pull request on that branch still showing `baseSha` takes the head read, so the page shows the moved
  base and a second Merge binds it.
- The merge itself stays fenced by the head (`sha: headSha`).
- After a merge GitHub's base branch is the merge result, so every other open pull request on that branch still
  showing the base the merge checked takes `mergeSha` in the settle transaction. Merging a stack's pull requests one
  after another needs one press each, and a settlement that lands late never moves a row back over a newer base.
- The window GitHub can't close is one round trip: a push between the step's read and GitHub's merge. The step
  compares a squash with the base it checked (`GitHub.Commits.compare`: one commit ahead). Anything else still settles
  `done`, because GitHub merged it, and is logged Warn and counted as `smithers_pr_merges{outcome="done",base="moved"}`.
  Merge commits and rebases count `base="unchecked"`. Branch protection ("require branches to be up to date", or a
  merge queue) is the only full fence, as decision 0012 says.
- **The merge goes through `Action.once` with `GitHub.Once.merge`** (durable external effects): its commit message ends
  with `Smithers-Write: <key>`, the key SHA-256 of the write id, and a lost answer is found by that trailer. A merge
  someone else made at the same head is `merged`, never ours, which also closes the review's attempt-counter finding
  (the old code counted the attempt before the first read and took a stranger's merge after a failed read). A rebase
  writes no message to carry the key, so a rebase whose answer was lost settles `merged`, never claimed as ours.
- In the same slice: a projection that fails after a merge is logged and skipped (a savepoint) instead of rolling back
  the settlement, so give-up never settles a merged pull request `failed`; give-up on a write another run settled
  answers that run's status.

## 2. Automated triage overwrites a person's labels (`worker/github/Write.ts`)

**What is wrong.** A person's Accept or Not accepted labels the issue on GitHub, reads it back, and only then pins it, in
the settle transaction. The triage flow's label step checks the pin and GitHub's labels, then writes. A flow label step
that passed its checks before the person's labels landed can land after them, and the flow's label stands.

**Design.** Two writers, the person (P) and the flow (F), share Postgres; GitHub's labels API has no precondition.

- **A person's pending write pins the issue.** The route records P's write before its flow starts. `itemTriage`'s
  `pinned` is `triage_pinned` or a person's `issue/triage` write on the issue still pending, so F's read and label steps
  drop the decision `pinned` from the moment P is admitted.
- **P waits for F's writes already past the check.** F's label and comment steps record when they start
  (`label_started_at`, `comment_started_at`, migration `0049_triage_write_claims`) before they check the pin, and mark
  the decision labeled, commented or failed only after the write landed. Before any GitHub call, P looks for a flow write
  on the issue that started and hasn't finished, within its step's retries and a minute (31 minutes for the label, 61
  for the comment); a step that never started will find the pin when it does. While one is in flight, P's step fails
  `WriteUnavailable` and the engine retries it (1 s doubling). So either F's check sees P's write and stops, or P sees
  F's start and writes after it. Whatever order the requests are sent in, the person's labels land last. The first
  version measured the window from when the decision was recorded; Codex Astra's review showed a label step delayed
  past it could still overwrite.
- A refused or failed write is no longer pending, so it pins nothing; a `done` one pins in its settle transaction, as
  before.
- The flow's rejection comment checks the same pin and posts nothing under a person's decision.
- **Issues and comments go through `Action.once`** with `GitHub.Once.issue` and `GitHub.Once.comment`, keyed by the
  write id (`{ key: write.id }`), so the marker the projection joins on is unchanged.
- In the same slice: give-up on a write another run settled answers that run's status, and counts the token kind `send`
  counts (`none` for the settings writes).

## 3. Home applies a role from another repository (`worker/home/Api.ts`)

**What is wrong.** A session carries one role: the person's permission on `GITHUB_REPOSITORY` (sign-in.md). The home
route applied it to whatever repository the path named, so a Maintainer of the deployment's repository saw
`Effect-TS/effect`'s maintainers' sections.

**Design.** `HomeApi.make` takes the repository roles are read on, as the secrets and GitHub routes do. The role counts
only when the requested repository is that one (names without case); anywhere else the asker has no role (`everyone`,
or `contributor` on a home open to anyone). Local development's people hold their roles on the dev server's
`GITHUB_REPOSITORY` too. `e2e/home-effect.spec.ts` proves both sides: with the default repository, a Member and a
Maintainer see Effect's landing page only; started with `GITHUB_REPOSITORY=Effect-TS/effect`, they see their sections
and New branch.

## Over the curator's projection fences

The curator's fix for the same review (3314ec3a: projection fences and merge outcomes, decision 0027) lands first. This
change keeps its fences and its projection-failure count, and replaces its merge recovery (a `merge_unknown` flag and a
match on the person's GitHub id) with the key in the merge commit's message; migration `0050_drop_merge_unknown` drops
the flag.

## The lint rule

`durable.external-writes-once` forbids `GitHub.Pulls.mergePull`, `GitHub.Issues.createIssue`, `findIssueByWrite`,
`createComment` and `findCommentByWrite` in the app as well: `GitHub.Once` makes merges, issues and comments.

## Plans and versions

`github/Write/send` and `pr/Merge/send` become `irreversible` with the write id as `idempotencyKey`, as the proposal
asks of a step whose writes go through `once`, and take implementation versions `github-write/send/v2` and
`pr-merge/send/v2`; triage's label and comment steps take `triage/label/v2` and `triage/comment/v2`. A run parked on a v1 plan across the deploy stops
with `plan_changed`, as the TODO run's do, and its write stays pending; while there are no users that is the
trade the `todo` rule chose.

## Not done here

- Per-repository roles (decision 0007 phase 2) are still unbuilt: Effect's maintainers see its maintainer view only on a
  deployment whose `GITHUB_REPOSITORY` is Effect.
- Astra's review of this change also asked for these paths against the real GitHub. The scripted GitHub is the git
  loop's test seam (docs/features/issues.md#tests); a live merge needs a scratch repository and the test account, which
  `worker/github/Live.test.ts` would gain.
- One window no lease closes: a step's request already sent when its host died can reach GitHub after the step's retry
  found the pin and stopped. It is the length of one request in flight.

[base]: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/changing-the-base-branch-of-a-pull-request
[merge]: https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request
