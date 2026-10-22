---
title: TODOs and the stack (MVP 1, early feature 8c)
status: in-progress
area: app
owner: TODO builder; lead assigns UI follow-up
updated: 2026-10-21 20:47 PDT
links: [todos-draft-commit-drop.md, agent-run-credentials.md, ../decisions/0016-todos-and-the-stack.md, ../proposals/early-features.md, ../proposals/mvp-gaps.md, pr-review-and-merge.md, roles-and-labels.md, mvp-scope-cut.md, connect-agents-sandboxes-forge.md, ../decisions/0012-git-end-to-end.md, ../decisions/0013-branch-workspace.md, ../decisions/0014-flows-authoring-debugging-and-home-view.md, ../decisions/0015-agent-status.md, no-github-actions.md, pull-request-list-and-tabs.md, decisions-for-will.md, docs-truth-pass.md, will-decision-queue.md, ../rulings.md, everything-is-a-plugin.md]
---

## Tracker reconciliation — 2026-10-21 20:47 PDT

**What:** Continue the existing workstream and preserve separate landing and production receipts.

**Why:** Passing prepared code does not prove the hosted journey.

**Current state:** At 20:37 the lead reports TODO steering landed on main 41ebbdd6. The full hosted issue-to-human-merge loop still lacks production acceptance and depends on permission and sandbox-image work. A landed steering fix does not close this broader workstream.

**Next step:** Retain the steering landing receipt; deploy and prove the full hosted loop with a person performing the merge.

**Open questions for Will:** No new product question; GitHub access restoration remains pending.

Evidence: script-filtered lead replies through 20:46 PDT, session 6253ecf2. Codex curates the note; implementation ownership is retained.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 17:34 PDT

**What:** Deliver TODO capture, stack execution and human-controlled PR completion.

**Why:** The full work loop must also be understandable to use.

**Current state:** Slice 1 previously passed its functional tests, but Will reopened its UI at 17:34: the demo is mostly empty and the TODO interface should look like GitHub issues. Execution-to-PR remains a separate outstanding scope.

**Next step:** Complete the UI correction in todos-draft-commit-drop.md, retain concurrency/keyboard/sync receipts, then finish the remaining execution and human merge loop.

**Open questions for Will:** None.

Evidence: queue answers through 2026-10-21 00:34:14 UTC; script-filtered human text and lead replies from the latest two transcript hours through 00:33:48 UTC; current rulings, decisions, proposals, TODOs, rules and shared briefs. Latest answers supersede older blockers. Product tests are reported evidence; this tracker runs the maintainer-site build only.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 16:14 PDT

**What:** Draft, commit, sync and drop TODOs, then execute them through a human-merged pull request.

**Why:** TODO-1 defines the full work loop; TODO-2 defers mythical history.

**Current state:** At 16:13:53 PDT the lead explicitly marked the first part done, supported by the 15:59 two-browser and keyboard receipts. That completed work is tracked in todos-draft-commit-drop.md. The parent remains in-progress: execution to PR is still unbuilt, and agent-run server authority remains a known gap.

**Next step:** Enforce agent-run authority on person-only actions, then implement execution to PR through durable flows.

**Open questions for Will:** None.

Evidence: lead text replies extracted by script from session 6253ecf2, latest two hours through 2026-10-20 23:13:53 UTC; current rulings and queue answers prevail over older briefs. Reported receipts only; this tracker ran no product tests.

## Prior tracker record (retained)


## Current specification — 2026-10-20, 16:04 PDT

**What:** Draft, commit, sync and drop TODOs in one Postgres-owned stack, then execute each TODO through a human-merged pull request.

**Why:** TODOs are the actionable work list; mythical history is deferred by Will.

**Current state:** At 15:59:51 PDT the lead reported passing two-browser draft/edit/commit/reload/drop and keyboard-only New/Commit/Drop. Twelve simultaneous commits lose nothing and numbers are never reused. Slice 1 works; the full workstream remains open because every TODO stays Queued until execution-to-PR is built. The server cannot yet distinguish an agent request from its signed-in person; see agent-run-credentials.md.

**Next step:** Close the server authority gap, then implement the execution-to-PR slice through durable flows while preserving one stack writer and human merge control.

**Open questions for Will:** None; browser flow allowlists alone do not prove server enforcement.

Evidence: user-typed messages and lead text replies extracted with a script from session 6253ecf2 for the latest two hours through 23:03:42 UTC; rulings, queue answers, shared briefs/designs and current decisions, proposals, TODOs and rules. Reported receipts only; this tracker ran no product tests. Later rulings supersede older proposals.

## Prior tracker record (retained)


## Current specification — 2026-10-20, 14:55 PDT

**What:** Draft, explicitly commit, list and drop TODOs in a synced Postgres stack; later run them through to a human-merged PR.

**Why:** Will wants actionable work in Smithers; mythical history is later.

**Current state:** Decision 0016 and slice 1 are in progress. Will explicitly removed mythical history at 14:21; this is no longer a question about overriding an old rule. No new passing slice-1 browser receipt is in the recent lead replies.

**Next step:** Prove draft/commit/drop across devices; PR execution follows dependencies. Express replaceable feature surfaces through the reviewed plugin interface.

**Open questions for Will:** None; the lead can settle implementation details.

Evidence: Will's typed messages and the lead's text updates in session `6253ecf2`, 12:54–14:55 PDT; [rulings](../rulings.md); queue answers through 14:36 PDT. These are reported receipts, not a new verification run by the tracker.

## Earlier tracker history

Previous owner record: slice 1 Track A builder (the stack), started about 13:45 on 2026-10-20; stopped by the usage limit at 14:16 and resumed at 14:19; migration `0022_todos` applied to the shared dev database at 14:26; unreported at 14:30. Until 14:30: slice 1 Track A builder (the stack), started by the lead about 13:45 on 2026-10-20; no stack file on disk by 13:51. Decision 0016 by Panel T (13:44:12). Until 13:45: unassigned; designed in decision 0016 (proposed, 13:44 on 2026-10-20) by Panel T (Opus lead and merger, Codex Sol). Until 13:44: Panel T, started by the lead at 13:23:17 on 2026-10-20: Claude Opus leads and merges; Codex Sol designs independently (`codex-rr` account codex-2, launched about 13:23, output scratchpad `final/panel-t-sol.md`). Unreported by 13:24. Until 13:23: unassigned


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
- 13:27:52 on 2026-10-20: Sol's design finished (scratchpad `final/panel-t-sol.md`, 24.8 KB, exit 0). 13:29: the Opus lead's own draft (`final/panel-t-opus.md`), written before reading Sol's.
- **13:44:12: decision 0016, "TODOs and the stack: one writer, one run per attempt, and GitHub branches without jj"** (`docs/decisions/0016-todos-and-the-stack.md`, status: proposed, 34 KB). Its positions:
  - a TODO is Smithers' row, and its branch and PR are GitHub's (M-22); `T<n>` counts per repository;
  - one writer, `worker/stack/Stack.ts` `apply(op)`, changes the stack, one transaction holding the repository's `stacks` row `FOR UPDATE`;
  - one `todo` run per attempt;
  - git without jj;
  - a PR's checks are Smithers runs.
- **Slice 1, the walking skeleton:** "ask Smithers for a TODO, commit it, and see it merge". Track A, the stack (migration, `worker/stack/{Stack,Api}.ts` with Append and Drop, shapes, `src/features/todos/**`, `/$owner/$repo/stack`, `StackList`, `TodoCard`, `TodoDraftCard`, `StepStrip`), needs nothing unbuilt. Track B, the run, needs 0012 W1, W2 and W8 and the two questions. Later slices: lanes and stacked bases (2), the branch machine's tools and verify runs (3), rebase and conflict resolution (4), pre-approval M-39 and a repository's own `todo` flow (5).
- **13:45:10, the lead to Will:** "The TODOs design is written as decision 0016". It works this way: a TODO lives in Smithers, and its branch and PR on GitHub; one writer changes the stack's order; one durable run per attempt takes a TODO to a PR, and a person merges it; when `main` moves, later items merge `main` in rather than rebase.
- **"One change you should know about"** (the lead): "the stack's order is kept in Postgres, with no `mythical` ref. That departs from the "one mythical stack" rule in `AGENTS.md`. Every TODO still reaches `main` as one squash-merged pull request." 0016 §Decision 2: "Order lives in Postgres, and the history is the chain of TODO branches on GitHub. No `mythical` ref exists."
- **The lead settled 0016's two questions** instead of asking: Q1, a TODO's run happens on Cloudflare ("Decision 0011 already says work that must keep going while every device is off runs remotely"); Q2, slice 1's agent "writes changes from reading the code, until the agent can run code on the branch's machine". 0016 still lists them under "Questions for Will" at 13:51.
- **Building now: Track A**, "which needs nothing unbuilt. The agent drafts a TODO, you commit it, the stack page shows it, and you can drop it, with changes syncing to every device." Track B, the run through to a merged PR, waits for the [pull request](pull-request-list-and-tabs.md) work, which starts when [triage](issue-triage.md) finishes. **Status moved from designing to in-progress.**
- **14:21:35 on 2026-10-20, Will (queue, on "Keep the TODO stack order in Postgres, with no mythical ref?"):** "Remove mythical history stuff we are adding that later not now". 0016's design stands: order in Postgres, no `mythical` ref. The `mythical` history comes out of the docs for now (`queue/dispatch.md`, 14:28: the [docs truth pass](docs-truth-pass.md) removes it from root `AGENTS.md` and the rest).
- 14:15 to 14:17 on 2026-10-20: the session usage limit stopped the Track A builder with 12 others; the lead resumed all 13 at 14:19.
- 14:26: `0022_todos` applied to the shared dev database ([dev stack hygiene](dev-stack-hygiene.md)).
- Queue items still open at 14:30: 0016 Q1 (a TODO's run goes on Cloudflare, priority 720) and Q2 (the agent writes from reading code, 715), both settled by the lead at 13:45 and shown to Will to override.
- **15:41 on 2026-10-20: Track A built** ([todos.md](../features/todos.md)). The one writer `worker/stack/Stack.ts` (one transaction on the repository's `stacks` row, no network or model call), its route `POST /api/repos/<owner>/<name>/stack` and the two shapes (`ShapeProxy`, default `no-store`, Member and above), migration `0022_todos`, `src/features/todos/**`, the stack pages, and `StackList`, `TodoCard` and `TodoDraftCard` in `@smthrs/ui`. The agent drafts under its answer; only a person commits or drops: the route takes who acts from the session, never the body, and the step refuses the agent's call. Track B's seam is `TodoRuns` (`start`, `stop`); until a host provides it, every TODO stays Queued. E2e `e2e/todos.spec.ts` passes locally (two people, and keyboard only); GIFs `todos-todo-commit-drop.gif` and `todos-todo-new-keyboard.gif`. No step strip: nothing runs a TODO yet.

## Next

From 14:30 on 2026-10-20: Track A's report, with e2e and GIFs: the agent drafts a TODO, a person commits it, the stack page shows it on every device, and Drop removes it. Track B after the pull request work. The [docs truth pass](docs-truth-pass.md) removes the `mythical` stack from root `AGENTS.md`.

Until 14:30 on 2026-10-20 the next step was, from 13:45 on 2026-10-20: Track A's report, with e2e and GIFs: the agent drafts a TODO, a person commits it, the stack page shows it on every device, and Drop removes it. Track B (the `todo` run on Cloudflare to a merged PR) after the pull request work. Root `AGENTS.md`'s "One mythical stack" line should match 0016 once Will accepts the change.

Until 13:46 on 2026-10-20 the next step was, from 13:44 on 2026-10-20: a builder for slice 1's Track A (decision 0016 §8), which needs no answer. Track B waits for Will's two answers and 0012's `pulls` projection, webhook and mirror pull.

From 13:23 on 2026-10-20: Panel T's report (under 12 lines): the decision in 5 rules, slice 1, and at most 3 questions for Will about slice 1 only (his 2026-10-19 rule: defer questions about later slices). Then a builder for slice 1.

Until 13:23 on 2026-10-20 the next step was: first slice after [repo clone and view](repo-clone-and-view.md). The second slice, where the agent works the branch and opens the PR, follows [connecting it all](connect-agents-sandboxes-forge.md).

## Questions for Will

None. Answered 14:21:35 on 2026-10-20: keep the order in Postgres and take the `mythical` history out for now ("we are adding that later not now"). 0016 Q1 and Q2 are queue items Will may override (the lead settled them at 13:45:10).

Until 14:30:

- **New (the lead flagged it at 13:45:10 on 2026-10-20):** 0016 keeps the stack's order in Postgres with no `mythical` ref, departing from root `AGENTS.md`'s "One mythical stack; append-only main" ("only the stack service writes" the `mythical` stack). Every TODO still reaches `main` as one squash-merged PR a person merges. Accept, and update `AGENTS.md` to match? Recommended by the panel: yes.
- 0016 Q1 and Q2 below: settled by the lead at 13:45:10 on the recommended answers (Cloudflare; write from reading the code). Will may overrule.

From decision 0016 (13:44:12 on 2026-10-20), before the lead settled them:
- **Q1:** should a TODO's run (plan it, write the change, open the PR, wait for the merge) run on Cloudflare instead of in the committer's browser? Recommended: Cloudflare. A TODO is the team's work and must keep going with every laptop shut. It blocks Track B.
- **Q2:** may slice 1's agent write a TODO's change from reading the code, without running it, before branch machines run agents? Recommended: yes; every change still reaches `main` only through a PR a person merges. If no, slice 1 stops at Queued and Track B waits for feature 7.

Until 13:44:

- Approve MVP item 1 as trimmed: create, work, status, drop; no insert, amend or move yet? Asked again at 22:56 as part of "Is this the MVP?" ([MVP scope cut](mvp-scope-cut.md)). (Answered 23:00: "more or less right"; reference only.)
- Should a TODO's run (plan, write the change, open the PR, wait for the merge) run on Cloudflare instead of in the committer's browser? Recommended: Cloudflare, because a TODO is the team's work and must keep going with every laptop shut (0011's third reason to run remotely). Blocks Track B. Asked in decision 0016, 13:44 on 2026-10-20.
- May slice 1's agent write a TODO's change from reading the code, without running it, before branch machines run agents? Recommended: yes; a person still merges every PR, and slice 3 adds the machine's tools. Blocks Track B. Asked in decision 0016, 13:44 on 2026-10-20.
