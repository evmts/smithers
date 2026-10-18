---
title: Notifications and live work (MVP 4 and 6, early feature 8b)
status: todo
area: design
owner: Panel N (Opus lead, Sol); the 0011 docs agent wrote the browser-run path into 0009 (22:49)
updated: 2026-10-19
links: [../decisions/0009-notifications-and-live-work.md, mvp-scope-cut.md, ../proposals/early-features.md, ../proposals/mvp-gaps.md, design-questions.md, ../decisions/0011-the-agent-runs-in-the-browser.md, durable-browser-engine.md, ../decisions/0002-local-first.md, local-first.md, durable-answering.md]
---

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

## Next

First slice: each answer's run chip opens a live Run card, and its toast settles from the run's outcome. Since 22:58 the toast stack reads the person, branch and repository watches, not only your own runs.

## Questions for Will

- None open. Will may override any of the lead's three choices in 0009 §8. (22:58: he overrode the second; toasts follow scope.)
- Keep a finished run as a quiet `Earlier` entry for 7 days? Recommended: yes. (Settled by the lead 22:56: no; a finished run disappears after `Done`, a failed one stays.)
- Should someone else's live run in a shared conversation toast for you? Recommended: no. (Settled by the lead 22:56: no. Overridden by Will 22:58: yes when it's on a branch you're on; toasts follow person, branch and repository scope.)
- Ship built-in routing now and repository notification policy with sandboxes? Recommended: yes. (Settled by the lead 22:56: built-in routing only.)
