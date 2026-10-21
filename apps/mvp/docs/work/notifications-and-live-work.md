---
title: Notifications and live work (MVP 4 and 6, early feature 8b)
status: in-progress
area: design
owner: notifications builder; live GitHub webhook follow-up
updated: 2026-10-20
links: [agent-status.md, flow-debugging.md, ../decisions/0009-notifications-and-live-work.md, mvp-scope-cut.md, ../proposals/early-features.md, ../proposals/mvp-gaps.md, design-questions.md, ../decisions/0011-the-agent-runs-in-the-browser.md, durable-browser-engine.md, ../decisions/0002-local-first.md, local-first.md, durable-answering.md, ../decisions/0015-agent-status.md, token-spend-alerts.md, branch-terminal.md, issue-triage.md, local-dev-sync-connections.md]
---

## Current specification — 2026-10-20, 18:26 PDT

**What:** Use one top-bar notification entry point with unread count and a distinct needs-you mark, plus expandable notifications and shared toasts.

**Why:** Will requested a general top-bar route to agent status at 18:23, after requesting useful notification clicks.

**Current state:** At 18:24 the lead assigned one entry point to replace the separate status pill. Existing live-work multi-device receipts remain valid; the new navigation and expansion are unfinished. Repository-event browser proof still awaits deployed webhook.

**Next step:** Implement click/key to the notification panel and one more step to the waiting run. Prove counts, needs-you, expansion, Answer/Retry, cross-device read state and clone progress with the common toast stack.

**Open questions for Will:** None.

Evidence: latest two session hours extracted by script as human text/lead replies; queue answers through 2026-10-21 01:24:15 UTC, current rulings, shared briefs/designs, decisions, proposals, TODOs and rules. Latest rulings override historical proposals. Product results are reported receipts; this pass verifies the maintainer-site build only.

## Follow-up (todo) — 2026-10-20, 22:15 PDT

Built by the notifications builder: clicking a toast opens its subject (a run's conversation at `#<run id>`); the notifications panel (newest first, unread dots, scrolls; an entry expands to its last steps, its question with Answer, or its failure with Retry); the top bar's bell on every page, with the unread count and `◆ Needs you`, replacing agent status's header pill; keys Alt+T, Alt+N, O, E, A, H, R. Proof: the attention and status suites pass on the Mac mini (36 of 36), 100% of the new lines; `@smthrs/ui`'s tests and a phone-width browser probe pass; `pnpm docs:check` passed.

- **todo:** the updated `e2e/notifications.spec.ts` and `e2e/status.spec.ts` haven't passed yet: the shared dev server and the mini's Worker bundle were broken by other work, then the 22:05 test pause began. Run them after the pause, then `pnpm e2e:gifs`. A failed run at 21:37 overwrote `~/Desktop/smithers-mvp/gifs/notifications-live-work.gif` and its video; the passing run replaces them.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 17:44 PDT

**What:** Make notifications fast, navigable and expandable with useful actions.

**Why:** Will requested click-to-expand interaction and called the walkthrough slow at 17:36.

**Current state:** Live-work sync and shared toast behavior previously passed. Two owners now cover transport performance and notification interaction; repository-event browser proof still needs the deployed webhook.

**Next step:** Make toasts open their subject; add newest-first unread entries with step/question/failure expansion, Answer/Retry and keyboard access; rerun real multi-device tests.

**Open questions for Will:** None for this update.

Evidence: queue answers through 2026-10-21 00:42:06 UTC and script-filtered human text/lead replies from 22:43–00:43 UTC; current rulings and decision 0017 supersede historical briefs. Product checks are reported evidence; this tracker validates the site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 17:14 PDT

**What:** One live-run index, synced personal feed and shared toast stack.

**Why:** People must see real work outcomes and answer waits across devices.

**Current state:** At 17:13 the lead reports passing real browser coverage for Ann’s two devices and Ben on the shared branch, including needs-you, Answer, Hide and stacked toasts. Read/Hide/Dismiss sync across devices; toasts name the initiator and share the spend-alert stack. Push/release feed entries have unit tests only: browser proof requires the deployed GitHub webhook. The full workstream remains in progress for that acceptance gap.

**Next step:** Retain notifications-live-work.gif/video; test repository events through the real webhook after deploy. Add Unwatch and resolve local-dev feed contention. Lead conventions: opening a branch auto-watches it; failed toast hides after four seconds while Retry remains in conversation and feed.

**Open questions for Will:** None.

Evidence: script-extracted human text and lead replies from session 6253ecf2, latest two hours through 2026-10-21 00:13:56 UTC; queue answers through 00:06:34 UTC; current rulings, decisions, proposals and shared briefs. Queue answers supersede older design proposals. Test results are lead-reported; this tracker runs the site build only.

## Earlier tracker history (retained)


## What

One run index, one personal feed, and views of both. Runs, watches and per-person records are separate things; toasts are views. You watch what you start. Any run joins the index wherever it runs: local, Cloudflare, a sandbox or an attached machine, with remote hosts pushing ordered, fenced batches. Each run shows status, progress, deadlines, liveness, "needs you", outcome, Retry (a new linked run) and Cancel (shown as Stopping until confirmed). Toasts follow the 300 ms rule and settle only from the real outcome; failures persist.

## Why

Will: "Notifications are on the menu but it seems like a feature an agent on the side can design." "what is a robust way to watch live work know what timeouts it has?" "Do we want notifications scoped to certain workflows scoped to user scoped to repository etc and how do those notifications all tie together?"

## State

- Decision 0009 is proposed; Opus merged its design with Sol's. Nothing is built.
- Early feature 8b (run chip, Run card, background work list) folds in here.
- 21:21 on 2026-10-19: the lead asked Will to accept the recommended answers below in one batch ([design questions](design-questions.md)). No answer yet.
- 22:31 on 2026-10-19: decision 0011 adds the browser as a flow host whose step record lives in OPFS, not Postgres. 0009 writes run rows in the same transaction as the engine's journal entry and has attached machines push their journal; how a browser-hosted run joins the index isn't designed yet. The attached-machine path is the closest fit.
- 22:36: 0009's three questions are still open; they come after 0005 and 0007 in Will's order ([design questions](design-questions.md)).

- 22:42: **the browser-run path is being written into 0009.** The lead's 0011 docs agent adds a short section: the leader tab's engine writes run and progress rows through the same write path as other local writes ([0002](../decisions/0002-local-first.md)'s outbox, [local-first](local-first.md)), so they sync to other devices; remote hosts keep pushing ordered, fenced batches. This closes the 22:31 gap. At 22:46, 0009 hadn't changed since 21:16.
- 22:43: Will is answering 0005.3; 0009's three questions follow 0007's ([design questions](design-questions.md)).

- 22:49: **0009 is revised for 0011.** Its status line says decision 5 and §2's browser runs were revised the same day. Decision 5 now reads: "a browser engine also writes its folded rows, through 0002's outbox". §2's "Browser runs": the leader tab's engine folds its journal with the same `RunFacts.fold` and writes `runs` and progress rows through the outbox, so they sync to the person's other devices; the server admits each write in one transaction that routes notifications and skips a write at or below the row's `seq`; with every tab closed, other devices show `No signal since` until the run resumes. Its plan's first step now rides on HOST-PLAN W5 (c), which wires the Cloudflare flow host into `worker/`. This closes the 22:31 gap.
- 22:49: 0005 and 0007 Q1 and Q2 are settled; Will is on 0007 Q3, question 11 of 14. 0009's three questions are the last 3 of the 4 still open ([design questions](design-questions.md)).
- 22:54: the lead reported the 0011 docs revision finished: 0003, 0009 and HOST-PLAN match the browser-agent decision, and `pnpm docs:check` passes.
- 22:56: **0009's three questions are settled by the lead**, after Will called question 11 "thinking too far ahead". The lead took the simplest choice for each, recorded in 0009 §8; Will may override any of them:
  1. **A finished run disappears after its `Done`.** Its result lives in the conversation. A failed run stays visible and retryable until someone retries or dismisses it. The `Earlier` list is not built. (This differs from the recommendation, which kept it for 7 days.)
  2. **No toasts for someone else's run.** It shows in the shared conversation.
  3. **Built-in routing only.** A repository's own notification policy waits until sandboxes exist.
- With its questions settled, this item moves from designing to todo. 0009's file status still reads "proposed". Nothing is built.
- 22:56: the lead's MVP list makes this MVP items 4 and 6: toasts for your runs, "Needs you", and failures that stay; the `Earlier` list and repository notification rules are cut until later ([MVP scope cut](mvp-scope-cut.md)).
- 22:58: **Will overrode the lead's second choice.** "Some toasts you should see for other people's runs if they are on same branch as you for sure this goes back to what I said about feeds being tied to user, branch repository etc. Main changing is tied to repository for example or a new release tied to repositry." Recorded in 0009 §8: every event belongs to one scope, and you get it through your watch on that scope (0009 decision 8):

  ```
  person      → your runs, anything that needs you
  branch      → every run on a branch you're on (teammates' and the agent's)
  repository  → main changed, new release: everyone watching the repo
  ```

  A conversation's runs show in that conversation. Choices 1 (a finished run disappears after `Done`) and 3 (built-in routing only) stand.
- 23:00: Will: "Don't worry about the mvp". The MVP item numbers above are reference only ([MVP scope cut](mvp-scope-cut.md)); this work stays on the feature list as early feature 8b. Not started; the lead's 23:02 board doesn't list it as building.
- **06:42 to 06:43 on 2026-10-20: two designs build on 0009.** [Agent status](agent-status.md) (decision 0015, a designer since 06:43:04) maps working, needs you, waiting, failed and done onto 0009's toasts, Needs you and run rows. [Flow debugging](flow-debugging.md) (Panel F, decision 0014) reuses 0009's `runs`, `run_commands` and shapes for its run list and adds a run page that reads each engine's journal.

- 13:19:52 on 2026-10-20: the lead's list puts "TODOs and the stack; notifications" under "Your feature list, not started yet".
- 13:21:12: the lead: the designs for TODOs and for notifications can start now, "documents only". 13:21:41: Will: "start the ones that can start now we are trying to ship faster".
- **13:23:06: the lead started a builder, not a designer, on slice 1** (Claude Opus, scratchpad `final/BUILD-COMMON.md`), since 0009 is designed and its questions are settled. It builds on what finished today and adds no second run index or toast system: [agent status](agent-status.md) (0015: the `runs` table from migration `0013_runs`, `worker/Runs.ts`, the header pill, the card, the needs-you toast, the tab-title count and their `@smthrs/ui` components), the runs page (`src/features/runs/`, `docs/features/runs.md`) and the shared toast stack. Slice 1:
  - 0009's one run index as the source;
  - a personal feed (needs me, finished, failed) with read state synced across devices;
  - live-work toasts for runs on my branch, including other people's;
  - the repository events `main` changed and new release, as feed entries;
  - an e2e with two people on two devices.
- The [branch terminal](branch-terminal.md) builder still edits branch and conversation files and the [triage](issue-triage.md) builder edits issues files, so `AppShell` and the router take only small, additive edits.
- 13:23:33, the lead to Will: "your feed (needs you, finished, failed), toasts for runs on your branch including other people's, and `main` changed or new release".
- **Status moved from todo to in-progress.**
- Open against 0009 §8: choice 1 says a finished run disappears after `Done`, while slice 1's feed lists what finished. Best guess: the feed entry is the person's record, and the run row still leaves the live list; the builder's report should say which.
- On disk by 13:46 on 2026-10-20, unreported: `db/migrations/0020_notifications.ts` (13:39:19).
- 14:15 to 14:17 on 2026-10-20: the session usage limit stopped the notifications builder with 12 others; the lead resumed all 13 at 14:19.
- 14:26: `0020_notifications` applied to the shared dev database ([dev stack hygiene](dev-stack-hygiene.md)). No report by 14:30.

- 14:45 on 2026-10-20: **slice 1 built** by the notifications builder ([notifications.md](../features/notifications.md)): migration `0020_notifications` (the run index's scope, `watches`, `notifications`); the fold in the run report's and the answer's transaction (`worker/Notifications.ts`, `@smthrs/notifications`' new `Inbox`); GitHub's `push` to `main` and published releases as repository entries; `watch/set` from each conversation a tab shows; Read, Hide and Dismiss synced across devices (`notification/ack`); the one toast stack reads the feed (the shell's, beside spend alerts, and a floating one on other pages; `@smthrs/ui` `ToastStack` `more`, `Toast` `update`/`word`/`unread`). A second local person for e2e: `smithers_dev_person=teammate`.

## Next

From 13:23 on 2026-10-20: the builder's report: the feed and its synced read state, the branch-scoped toasts, the repository events, and the two-person e2e with its GIF.

Until 13:23 on 2026-10-20 the next step was: first slice: each answer's run chip opens a live Run card, and its toast settles from the run's outcome. Since 22:58 the toast stack reads the person, branch and repository watches, not only your own runs.

## Questions for Will

- None open. Will may override any of the lead's three choices in 0009 §8. (22:58: he overrode the second; toasts follow scope.)
- Keep a finished run as a quiet `Earlier` entry for 7 days? Recommended: yes. (Settled by the lead 22:56: no; a finished run disappears after `Done`, a failed one stays.)
- Should someone else's live run in a shared conversation toast for you? Recommended: no. (Settled by the lead 22:56: no. Overridden by Will 22:58: yes when it's on a branch you're on; toasts follow person, branch and repository scope.)
- Ship built-in routing now and repository notification policy with sandboxes? Recommended: yes. (Settled by the lead 22:56: built-in routing only.)
