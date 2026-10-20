---
title: TODOs and the stack (MVP 1, early feature 8c)
status: todo
area: app
owner: unassigned; designed in decision 0016 (proposed, 13:44 on 2026-10-20) by Panel T (Opus lead and merger, Codex Sol). Until 13:44: Panel T, started by the lead at 13:23:17 on 2026-10-20: Claude Opus leads and merges; Codex Sol designs independently (`codex-rr` account codex-2, launched about 13:23, output scratchpad `final/panel-t-sol.md`). Unreported by 13:24. Until 13:23: unassigned
updated: 2026-10-20
links: [../decisions/0016-todos-and-the-stack.md, ../proposals/early-features.md, ../proposals/mvp-gaps.md, pr-review-and-merge.md, roles-and-labels.md, mvp-scope-cut.md, connect-agents-sandboxes-forge.md, ../decisions/0012-git-end-to-end.md, ../decisions/0013-branch-workspace.md, ../decisions/0014-flows-authoring-debugging-and-home-view.md, ../decisions/0015-agent-status.md, no-github-actions.md, pull-request-list-and-tabs.md, decisions-for-will.md]
---

## What

Ask Smithers for a TODO in an opened repo. It fills a form card, and Commit places it: Append, Before Tn or Amend Tn. The repo's stack lists TODOs in merge order with Move up, Move down and Drop. Each TODO runs the `todo` flow: a real Plan step reads the repo, then the run waits durably for a branch machine. Since 13:44 on 2026-10-20, decision [0016](../decisions/0016-todos-and-the-stack.md) (proposed) has slice 1's run write the change, open the PR on GitHub and wait for a person's merge, with no machine wait.

From 13:23 on 2026-10-20, Panel T's brief (scratchpad `final/PANEL-T-BRIEF.md`) asks the design to answer:

1. A TODO as data: its tables (Postgres, Electric and TanStack DB, or local-first only), its states, and how it maps to a branch, a PR and a run.
2. The stack on Cloudflare without native jj: an ordered list of TODOs or a chain of stacked branches; what Append, Before, Amend, Move and Drop do to branches and PRs; restacking when `main` moves.
3. Who writes the stack: root `AGENTS.md`'s "only the stack service writes" as one writer flow, serialized per repository.
4. The `todo` flow at `.smithers/flows/todo/flow.ts` (M-49, `Flow.make`): plan, implement on the TODO's branch, open a PR, run checks as Smithers workflow runs (no GitHub Actions, [no GitHub Actions](no-github-actions.md)), wait for a person to merge or a pre-approval (M-39), then advance.
5. The UI: the stack pane, the TODO card and the form card from `@smthrs/ui`, naming missing components.
6. A walking skeleton that works in `apps/mvp` today, explicit about what waits on sandboxes and agents running code.
7. Failure and recovery: merges or closes on GitHub, force pushes, restack conflicts; observability and tests.
8. At most 3 questions for Will, each blocking slice 1 only, with a recommendation.

The output is a decision at the next free number (best guess 0016), `NNNN-todos-and-the-stack.md`, status proposed, under 300 lines.

## Why

It is the product: people and agents turn TODOs into merged pull requests (mvp.md). Will's MVP cut keeps it as item 1. The old stack service is about 26,000 lines of Go on native jj that can't run on Cloudflare, so it is the longest pole.

## State

- Proposed in `early-features.md` (8c) and `mvp-gaps.md` (item 1). Not approved, not started.
- Only scripted models have ever merged a TODO; no real model has.
- 22:49 on 2026-10-19: a TODO's PR reaches main through the repository's configurable merge flow; by default Maintainers and Admins merge, and a person always does ([PR review and merge](pr-review-and-merge.md)). Pre-approving a TODO (M-39) stays a Maintainer act in 0007's catalog; the 22:56 MVP list cuts it until later.
- 22:56: the lead's MVP list keeps item 1 as: create a TODO from chat, the agent works it on its own branch, see its status, drop it. Cut until later: reordering a stack of TODOs, amending, TODOs from issues. Will hasn't approved it ([MVP scope cut](mvp-scope-cut.md)).
- 23:00: Will: "Don't worry about the mvp ... But yes it's more or less right". The MVP list is reference only; work follows his feature list ([MVP scope cut](mvp-scope-cut.md)). Nobody builds this now.
- 13:19:52 on 2026-10-20: the lead's list puts "TODOs and the stack; notifications" under "Your feature list, not started yet".
- 13:21:12: the lead: the designs for TODOs and the stack can start now, "documents only; building waits for the designs".
- **13:21:27: Will ruled that Smithers has no GitHub Actions support at all;** Smithers workflows do that job ([no GitHub Actions](no-github-actions.md)). A TODO's PR checks are Smithers workflow runs.
- **13:21:41: Will: "start the ones that can start now we are trying to ship faster".**
- **13:23:17: the lead started Panel T** under Will's rule for important planning (Opus plus Codex Sol, then a merge). The Opus lead writes its own design, runs Sol on the same brief (probing `gpt-6-astra` on a usage limit, else continuing alone), checks every adopted claim against code and docs, and writes the decision with a slice plan whose first slice is a walking skeleton. Prior art: the old app `apps/app` and `packages/backend/internal/services/mythical*.go`. It builds on 0012, 0013, 0014 and 0015.
- About 13:23: Sol's launcher (`final/launch-sol-t.py`) started on the `codex-rr` account codex-2.
- 13:23:33, the lead to Will: "design only; Opus and Codex Sol each design it, then the two are merged".
- **Status moved from todo to designing.**
- 13:27: Sol finished its design (scratchpad `final/panel-t-sol.md`): create, sync and Drop first; the agent loop in the browser; restacks replayed in a sandbox.
- **13:44 on 2026-10-20: decision [0016](../decisions/0016-todos-and-the-stack.md) written (status: proposed).** Its rules: a TODO is Smithers' row and its branch and PR are GitHub's; one writer (`worker/stack/Stack.ts`, one transaction on the repository's `stacks` row) changes the stack, with no `mythical` ref; one durable `todo` run per attempt on Cloudflare; commits leave through the host with `createCommitOnBranch`, fenced, never by force; forward restacks are GitHub merges, and only removals reset with `updateRefs`; people merge, in order, and a close on GitHub drops the TODO.
- Its slice 1, the walking skeleton: "ask Smithers for a TODO, commit it, and see it merge", one TODO at a time. Track A (draft, Commit, the stack page, Drop) needs nothing unbuilt; Track B (the run to a PR on GitHub, merged there) needs 0012 W1, W2 and W8 and Will's two answers.
- **Status moved from designing to todo:** designed, not started.

## Next

From 13:44 on 2026-10-20: a builder for slice 1's Track A (decision 0016 §8), which needs no answer. Track B waits for Will's two answers and 0012's `pulls` projection, webhook and mirror pull.

From 13:23 on 2026-10-20: Panel T's report (under 12 lines): the decision in 5 rules, slice 1, and at most 3 questions for Will about slice 1 only (his 2026-10-19 rule: defer questions about later slices). Then a builder for slice 1.

Until 13:23 on 2026-10-20 the next step was: first slice after [repo clone and view](repo-clone-and-view.md). The second slice, where the agent works the branch and opens the PR, follows [connecting it all](connect-agents-sandboxes-forge.md).

## Questions for Will

- Approve MVP item 1 as trimmed: create, work, status, drop; no insert, amend or move yet? Asked again at 22:56 as part of "Is this the MVP?" ([MVP scope cut](mvp-scope-cut.md)). (Answered 23:00: "more or less right"; reference only.)
- Should a TODO's run (plan, write the change, open the PR, wait for the merge) run on Cloudflare instead of in the committer's browser? Recommended: Cloudflare, because a TODO is the team's work and must keep going with every laptop shut (0011's third reason to run remotely). Blocks Track B. Asked in decision 0016, 13:44 on 2026-10-20.
- May slice 1's agent write a TODO's change from reading the code, without running it, before branch machines run agents? Recommended: yes; a person still merges every PR, and slice 3 adds the machine's tools. Blocks Track B. Asked in decision 0016, 13:44 on 2026-10-20.
