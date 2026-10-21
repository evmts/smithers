---
title: Docs truth pass (every doc, AGENTS.md, .specs and memory match Will's rulings)
status: in-progress
area: process
owner: lead and docs/memory owners
updated: 2026-10-20
links: [ops-vault-history-repair.md, will-decision-queue.md, decisions-for-will.md, self-host-install.md, todos-and-stack.md, no-github-actions.md, prompt-flows-are-code-flows.md, mvp-scope-cut.md, web-first-desktop-later.md, ../rules.md, ../todo.md, ../../../../AGENTS.md, ../../../../.specs/product/mvp.md, ../decisions/0010-web-first-desktop-later.md, ../decisions/0016-todos-and-the-stack.md, ../rulings.md, everything-is-a-plugin.md]
---

## Current specification — 2026-10-20, 17:34 PDT

**What:** Keep instructions, memory and docs consistent with latest rulings.

**Why:** Will’s 17:33 answer says contradicting personal instructions/memories must be changed or removed without asking.

**Current state:** The lead fixed personal review routing and jj workspace contradictions. Rulings §18 still lists the first deploy as undecided, despite the 17:32 approval. Root/app historical first-deploy blockers are superseded too. This tracker only edits work notes.

**Next step:** Owning docs lane reconciles the deploy approval and automatic contradiction cleanup across rulings, instructions and memory. Preserve historical decisions without presenting them as current blockers.

**Open questions for Will:** None.

Evidence: queue answers through 2026-10-21 00:34:14 UTC; script-filtered human text and lead replies from the latest two transcript hours through 00:33:48 UTC; current rulings, decisions, proposals, TODOs, rules and shared briefs. Latest answers supersede older blockers. Product tests are reported evidence; this tracker runs the maintainer-site build only.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 15:35 PDT

**What:** Reconcile repository docs, specs, memory, ops and stale queue questions with rulings.

**Why:** SCOPE-9 makes current product decisions authoritative.

**Current state:** At 15:27 PDT the lead reported the content truth pass complete across all three lanes. Memory: 418 stale memories removed, 47 updated, index reduced to 13 KB, and all remaining links resolve. Repository/spec reconciliation and 97 ops-file edits are reported complete; stale questions were removed. This completes the content pass, not landing: the ops vault has a pre-existing history conflict tracked separately in ops-vault-history-repair.md.

**Next step:** Collect repository landing receipts; finish the separately tracked ops history repair. Preserve the cleanup log and earlier records.

**Open questions for Will:** First deploy, hosted IaC location and tracker authority remain open in rulings §18; they do not block this completed reconciliation.

Evidence: last two hours of user-typed messages and lead text replies extracted from session `6253ecf2` through 15:34 PDT; queue answers through 14:36 PDT; current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Completion receipts are reported evidence; this tracker ran no product tests. Older briefs yield to later rulings.

## Earlier tracker history

## Current specification — 2026-10-20, 15:24 PDT

**What:** Align repository instructions, specs, memory, ops and queue with the rulings.

**Why:** Current apps/mvp and Will’s latest decisions supersede stale directions (SCOPE-9).

**Current state:** At 15:16:05 the lead reported repository instructions/docs reconciled, with M-53–57 and nineteen older decisions marked replaced, preserving history. At 15:23:55 the ops lane reported 97 vault files updated and 52 old org skills retired, but its commit failed on a pre-existing conflict. Memory cleanup has no completion receipt.

**Next step:** Finish memory cleanup, repair the ops history in an isolated workspace, collect landing receipts and recheck stale queue questions.

**Open questions for Will:** Rulings §18 still leaves first deploy, hosted IaC location and issue-claim versus maintainer tracker open.

Evidence: Will’s typed messages and lead text replies, extracted from session `6253ecf2` for its latest two hours through 15:23:55 PDT; [rulings](../rulings.md), queue answers through 14:36 PDT, shared briefs/designs and current decisions, proposals, TODOs and rules. Receipts above are reported, not fresh product tests run by this tracker.

## Earlier tracker history


## Current specification — 2026-10-20, 15:10 PDT

**What:** Align repository docs, ops, memory and queued questions with current rulings.

**Why:** SCOPE-9 establishes the current product and Will’s latest words as truth.

**Current state:** The three cleanup lanes remain in progress: repository docs, memory and ops. The lead reported 103 stale repository spots and 65 ops spots; of 836 memory files, 389 were slated for deletion and 78 for update/merge. The curator has removed eight settled/stale questions and added six questions plus one personal-file decision. A completed whole-pass receipt is not evidenced.

**Next step:** Collect completion receipts for each lane; retain sources and history. List personal-file contradictions for Will without editing his files.

**Open questions for Will:** First production deploy, hosted IaC location and issue-claim versus maintainer tracker remain open under rulings §18.

Evidence: recent user text and lead replies from session `6253ecf2`, extracted through 15:10 PDT; [rulings](../rulings.md) and queue answers through 14:36 PDT. Reported completion is distinguished from a test run by this tracker.

## Earlier tracker history


## Current specification — 2026-10-20, 14:55 PDT

**What:** Align repository docs, memory, ops and queue with the dated rulings.

**Why:** Current apps/mvp and Will’s latest words supersede the old stack.

**Current state:** Rulings file is written. At 14:53 the lead reports 103 stale repository spots, 65 ops spots, and 836 memory files with 389 slated for removal and 78 for update/merge. Three fix agents are running. At 14:54 the curator reports 8 stale/settled questions dropped and 7 genuine questions added; this supersedes the earlier planned count of 14.

**Next step:** Finish the three passes and preserve ruling/source receipts; list personal-file contradictions for Will without editing them.

**Open questions for Will:** First deploy, infrastructure-code location and issue-claim versus maintainer tracker remain unresolved in rulings §18.

Evidence: Will's typed messages and the lead's text updates in session `6253ecf2`, 12:54–14:55 PDT; [rulings](../rulings.md); queue answers through 14:36 PDT. These are reported receipts, not a new verification run by the tracker.

## Earlier tracker history

Previous owner record: rulings agent (Claude Opus), started by the lead about 14:25 on 2026-10-20; writes `apps/mvp/docs/rulings.md` and a stale inventory; then three fix agents (repository docs, Claude Code memory, `~/smithers-ops`); then the queue curator drops stale questions


## What

One pass that makes every written instruction agree with what Will has ruled in chat and in the queue, with the MVP being built now as the source of truth.

```
Will's chat + queue answers ──▶ apps/mvp/docs/rulings.md   (dated, quoted; latest ruling wins)
                                      │
                                      ├─▶ stale inventory: every contradicting line in
                                      │     root + scoped AGENTS.md, repo CLAUDE.md files,
                                      │     .specs, docs/, skills, ~/smithers-ops,
                                      │     Claude Code memory, stale queue questions
                                      ▼
         fix agent 1: repository docs   fix agent 2: memory   fix agent 3: ~/smithers-ops
                                      │
                                      ▼
                     curator drops the queue questions that only existed because a doc was stale
```

Marked out of date (the lead, 14:25:28): the old app, `packages/backend` as the only backend, the Mac mini install, GitHub Actions and the `mythical` stack. Will's global `~/.claude/CLAUDE.md` is his personal file: the agents only list its direct contradictions for him and don't edit it.

## Why

- **14:22:33 on 2026-10-20, Will (queue, on M-31):** "A lot of our docs are out of date we need to update them the source of truth is htis mvp. we are building and what we are doing now"
- **14:21:35, Will (queue, on 0016):** "Remove mythical history stuff we are adding that later not now"
- Stale docs cost Will time: several queue questions (M-31, the `mythical` stack, the self-hosted install) existed only because `AGENTS.md` and `.specs/product/mvp.md` still described another product.

## State

- **About 14:25 on 2026-10-20: the lead started the rulings agent** (to Will at 14:25:28: "I've started on bringing everything up to date, in two steps"). Step 1: one dated, quoted list at `apps/mvp/docs/rulings.md`, latest ruling wins, plus the stale inventory. Step 2: three fix agents in parallel, then the curator drops stale queue questions.
- 14:25 to 14:27, on disk: scratchpad `rulings-work/` holds the extracted main-session text (`main-session.txt`, `main-queued.txt`), text from 21 other sessions and their queue lines, and `queue-summary.txt`. `apps/mvp/docs/rulings.md` isn't on disk at 14:30.
- Covers two queue answers routed through `queue/dispatch.md` at 14:28: 0016's `mythical` history (removed for now; 0016 keeps the stack order in Postgres) and M-31 ([self-hosted install](self-host-install.md)).
- 14:30, the lead's update: "An agent is writing `apps/mvp/docs/rulings.md` and a stale inventory; three fix agents follow."

## Next

From 14:30 on 2026-10-20: `rulings.md` and the inventory; then the three fix agents, each change citing the ruling it applies; then the curator drops the stale queue questions. Expect root `AGENTS.md` (M-31, "One mythical stack", "`packages/backend` only"), `.specs/product/mvp.md` M-31, and the memory index to change.

## Questions for Will

None. The list of contradictions in `~/.claude/CLAUDE.md` comes to Will to edit himself.
