---
title: Message controls (copy, times, reasoning, queued prompts, saved draft)
status: todo
area: app
owner: message controls builder; Will approved replacement
updated: 2026-10-21 12:54 PDT
links: [land-to-main.md, dev-stack-hygiene.md, old-app-feature-gaps.md, local-first.md, conversations-and-history.md, keyboard-navigation-and-vim.md, fable-review-2-fixes.md, slash-commands.md, agent-status.md, ../features/chat.md, ../features/agent.md, ../decisions/0002-local-first.md, cerebras-rate-limits.md, review-round-4-p3-cleanup.md, will-decision-queue.md, ../rulings.md, chaptered-review-videos.md]
---

## Tracker reconciliation — 2026-10-21 12:54 PDT

**What:** Persist edits made through message controls.

**Why:** An edited draft must survive saving and reload.

**Current state:** At 12:53 PDT the lead reports a real local E2E failure: an edited draft remains unsaved. This reopens the completed workstream; Will’s earlier approved recording remains in history. The failure is queued for the next panel-then-build batch once the sweep finishes; no fix or assigned repair is reported.

**Next step:** Keep the failing draft-save test, assign the repair through the announced batch, and prove edit/save/reload locally and live before marking done again.

**Open questions for Will:** None.

Evidence: script-filtered human text and lead replies for the latest approximately two hours of session 6253ecf2 through 12:54 PDT; automated notifications, relayed agents and tool blocks excluded. Current rulings and queue answers govern over older briefs, panels, decisions, proposals, TODOs and rules. Product receipts are lead-reported; Codex curates tracker documentation and runs the site build. Existing execution owners are retained.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 17:44 PDT

**What:** Reveal message time, Copy and Edit on hover, focus or tap without layout movement.

**Why:** Will requested hidden controls until interaction.

**Current state:** Both browser tests previously passed; Will explicitly approved the replacement recording at 17:30:36 PDT.

**Next step:** Retain behavioral and keyboard regression coverage.

**Open questions for Will:** None for this update.

Evidence: queue answers through 2026-10-21 00:42:06 UTC and script-filtered human text/lead replies from 22:43–00:43 UTC; current rulings and decision 0017 supersede historical briefs. Product checks are reported evidence; this tracker validates the site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 17:34 PDT

**What:** Reveal message time and actions on hover, focus or touch.

**Why:** Will requested unobtrusive controls.

**Current state:** Will approved the revised message-controls recording at 17:30:36. Earlier real browser and app regression receipts cover hover, focus, touch, layout stability and reduced motion.

**Next step:** Retain approved recordings and behavioral tests; land with the current round.

**Open questions for Will:** None.

Evidence: queue answers through 2026-10-21 00:34:14 UTC; script-filtered human text and lead replies from the latest two transcript hours through 00:33:48 UTC; current rulings, decisions, proposals, TODOs, rules and shared briefs. Latest answers supersede older blockers. Product tests are reported evidence; this tracker runs the maintainer-site build only.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 15:44 PDT

**What:** Hide Copy, Edit and time until hover, keyboard focus or touch activation without layout shifts.

**Why:** Will requested hidden message controls in his 14:27 queue answer.

**Current state:** At 15:26 the lead reported the final docs check; at 15:28:50 the lead reported the completed hover/focus/tap behavior and fresh copy/edit recordings returned as a verify item. Earlier lock and Postgres waits are superseded. Completion is reported; Will has not accepted the revised recording.

**Next step:** Collect Will’s re-check and a landing receipt; retain his original feedback and previous recordings.

**Open questions for Will:** Feedback on the revised copy/edit walkthroughs.

Evidence: user-typed text and lead replies extracted from session 6253ecf2’s latest two hours through 22:43:59 UTC; current rulings, queue answers, shared briefs/designs, decisions, proposals, TODOs and rules. These are reported receipts; this tracker ran no product tests. Later rulings supersede older briefs.

## Earlier tracker history


## Current specification — 2026-10-20, 14:55 PDT

**What:** Hide Copy, Edit and time until hover, keyboard focus or touch activation, without layout shifts.

**Why:** Will requested this in the 14:27 queue answer.

**Current state:** Assigned at 14:28. Docs sync passed; the lead at 14:51 says its browser rerun is waiting on the shared lock after Postgres recovery. The earlier passing copy/edit tests do not prove this change.

**Next step:** Restore Postgres, run the remaining browser checks and re-record both walkthroughs; return the fix to the queue.

**Open questions for Will:** None; the lead can settle implementation details.

Evidence: Will's typed messages and the lead's text updates in session `6253ecf2`, 12:54–14:55 PDT; [rulings](../rulings.md); queue answers through 14:36 PDT. These are reported receipts, not a new verification run by the tracker.

## Earlier tracker history

Previous owner record: unassigned at 14:30 on 2026-10-20: Will's 14:27:56 change request (Copy and the time show only on hover) isn't in `queue/dispatch.md` yet. Until 14:30: message controls builder, reported done at 13:33:09 on 2026-10-20 (relayed by the lead); uncommitted, lands in round 3; three P2 follow-ups queued for the cleanup pass. Until 13:46: message controls builder; its e2e passed at 13:15:50 on 2026-10-20 after the dev budget was raised; the GIF and report are pending at 13:17, and the work is uncommitted. Until 13:15: message controls builder; at 13:03 on 2026-10-20 waiting on its unit suite before rerunning its e2e and recording the GIF (the lead), with test 1's "Couldn't answer" failures being checked against the Cerebras rate limit; unreported by 13:06. Until 13:03: message controls builder; chat files and `e2e/message-controls.spec.ts` changed to 12:52:24 on 2026-10-20, then test 1 failed four times from 12:53 to 12:58; unreported by 12:59. Until 12:52: message controls builder; `e2e/message-controls.spec.ts` on disk at 12:39:34 on 2026-10-20; its draft test failed at 12:45:30; unreported by 12:45. Until 12:24: message controls builder, started by the lead about 12:00 on 2026-10-20; the chat store, actions, schema, steps and view changing 12:18 to 12:23; unreported by 12:23. Until 12:23: message controls builder; `src/flows/askingTab.ts` (12:12:43) and `src/clipboard.ts` (12:13:26) on disk; unreported by 12:14. Until 12:00: unassigned; queued by the lead at 06:43 on 2026-10-20 to start after the chat-store (Fable fix) and composer (slash commands) agents land. Until 06:43: unassigned


## What

Small controls on each message and on the queue, all daily use in the old app.

Old app:
- **Copy** a message ("Copied") and **Retry turn** (`apps/app/src/mainview/TranscriptMessage.tsx`, flow `chat.copy-message`).
- **Time** on each message, and a collapsible **Reasoning** section (`TranscriptMessage.tsx`, `SharedConversation.tsx`).
- **Prompt queue:** a Queue button and Alt+Enter; the composer shows "Queued · N" or "Paused · N" with **Edit** (the text goes back to the composer), **Remove**, and **Restore** all into the composer. A failed send pauses the queue until resumed (`state/controller/promptQueue.ts`, flows `chat.queue`, `chat.queue.edit`, `chat.queue.remove`, `chat.queue.restore`).
- **The draft survives a reload** (`state/DraftRecovery.ts`).
- Tool-call JSON that the model wrote as prose is hidden from the bubble (`state/MessageScrub.ts`).

New app ([chat](../features/chat.md)): asks queue in the outbox; a refused question has Edit and Discard; a failed answer has Retry. No copy, times, reasoning, editing a queued question, or saved draft.

Already planned, so not part of this gap: Stop, and removing a queued question, through steer and cancel outbox mutations (decision 0002 §5, "later"; decision 0003 item 8). The agent's flow calls already stream as steps ([agent](../features/agent.md)).

## Why

Each is small, people use them every day, and the old app had them.

## How it fits

- Copy: a client flow over the browser host's clipboard (the repo feature already has `apps/mvp/src/features/repo/clipboard.ts`).
- Draft: a local-only persisted collection.
- Edit a queued question: an outbox mutation before it is sent.
- Times: `created_at` is already on `messages`.
- Reasoning: only if the model endpoint returns it. Records still never carry answer text.

## Size

S.

## State

- 06:10 on 2026-10-20: the old-app audit wrote this note as gap 3 (`status: idea`).
- **06:39:05:** Will: "Message controls is important."
- 06:39:34: the lead put it in Will's priorities as "Build next ... After the chat-store and composer agents land". Status moved from `idea` to `todo`.
- 06:43:26, the lead to Will: "Message controls: starts when the chat fixes land, since they touch the same files."
- By 06:55: not started. The chat store (`src/features/chat/store.ts`, 06:52) and the composer's commands (`src/features/commands/`, 06:49) are still being edited by the [Fable fix](fable-review-2-fixes.md) and [slash command](slash-commands.md) agents.
- 07:06:06 on 2026-10-20: the [slash command](slash-commands.md) agent reported done, so the composer is free. The chat store still waits on the client [Fable fix](fable-review-2-fixes.md) agent, unreported by 07:20.
- **A shared rule since 07:01:52 on 2026-10-20:** `messages` syncs only the columns in `SYNCED_MESSAGE_COLUMNS` (`worker/Chat.ts`). A column this work adds to `messages` reaches devices only once it's listed there ([local-first](local-first.md)).
- 11:54:51 on 2026-10-20: the client [Fable fix](fable-review-2-fixes.md) agent reported done, uncommitted, so the chat store is free. Per the lead's 06:43 rule this starts when those fixes land (round 3 of [land to main](land-to-main.md)); no builder is assigned.
- **About 12:00 on 2026-10-20 the lead started a builder** (to Will at 12:05): all 12 [Fable fix](fable-review-2-fixes.md) findings are fixed, so the chat files are free. Its list: copy a message; timestamps; editing a queued question before it sends, safe against the outbox; a draft that survives a reload. The agent can run each too, for example "copy the last answer". Reasoning is not on the list. **Status moved from `todo` to `in-progress`.**
- The same builder merges the duplicate "ask the tab that asked" channel, which [navigate](navigate-flow.md) and `repo/copy` each had, into one `src/flows` helper.
- On disk by 12:14: `src/flows/askingTab.ts` (12:12:43). Its header: every client flow runs in the leader tab's engine worker, and a step that acts on the tab that asked (moving it, writing its clipboard, queueing its write) asks over one `TabChannel`; only the requesting tab answers, and silence means that tab is gone. Navigation, Copy, the issue writes and chat's Copy and Edit each ask on a channel of their own. `src/clipboard.ts` (12:13:26) is new at the app root. No e2e run or report yet.
- **12:15:36 on 2026-10-20, decided by the lead:** leave out the Reasoning section until the model endpoint actually returns reasoning (NO INVENTION). Not a question for Will.
- 12:18 to 12:23:56 on disk, unreported: `src/features/chat/` `flows.ts`, `metrics.ts`, `contract.ts`, `schema.ts`, `steps.ts`, `store.ts`, `actions.ts`, `tab.ts`, `chat.ts`, `queries.ts` and `view.ts`; `src/flows/askingTab.test.ts` (12:19:22); `src/features/repo/copy.ts` (12:16:49), moving to the shared helper. No e2e in `e2e/` for these controls yet.
- 12:24 to 12:45 on 2026-10-20, on disk, unreported: `src/features/chat/` `contract.ts` (12:26:10), `steps.test.ts` (12:27:19), `actions.ts` (12:29:32), `store.ts` (12:40:55) and the new `controls.test.ts` (12:43:26); `docs/features/chat.md` (12:35:37) gains a "Message controls" section; `branch/conversation.test.ts` (12:41:30) and `web/web.test.ts` (12:42:06).
- **12:39:34: the new `e2e/message-controls.spec.ts`**, real app, Worker, Postgres, Electric and model, no mocks. Test 1: Copy puts an answer on the clipboard, and every message shows its time. Test 2: Edit takes a question queued offline back to the composer before the outbox sends it, and a draft survives a reload. 12:44:04: a throwaway `e2e/zz-draft-probe.spec.ts` ran and was removed.
- **12:45:30 on 2026-10-20: test 2 failed** (`test-results/.last-run.json`): after the reload the composer held the edited queued question ("Reply with exactly the word: tpyo-…") instead of the saved draft ("half a thought …"). No report. Status stays `in-progress` until the e2e passes.
- 12:50 to 12:52 on 2026-10-20, on disk, unreported: `src/features/chat/` `schema.ts`, `store.ts` and `components/Composer.tsx` (12:50:42), `actions.ts` and `e2e/message-controls.spec.ts` (12:51:24), `controls.test.ts` and `docs/features/chat.md` (12:52:24).
- 12:52:55: the issues builder's full app suite lists `chat/controls.test.ts` among 3 failures outside its slice ([issues](issues.md)).
- **12:53:57 to 12:58:04 on 2026-10-20: test 1 ("Copy puts an answer on the clipboard, and every message shows its time") failed on its first try and three retries** (`test-results/.last-run.json` failed at 12:58:04). The answer to "Reply with exactly the word: copy-…" showed "Couldn't answer" with Retry instead of the word, so the model answer failed before Copy was tried. No report by 12:59. Status stays `in-progress` until the e2e passes.
- **13:03:18 on 2026-10-20, the lead to Will:** "Message controls is waiting on its unit tests; after they pass it will rerun its browser test and record the GIF." The lead also had test 1's "Couldn't answer" failures (12:53 to 12:58) checked against the Cerebras rate limit, which failed the [agent status](agent-status.md) live-model e2e twice ([Cerebras rate limits](cerebras-rate-limits.md)). No chat file changed and no e2e result by 13:06; `test-results/.last-run.json` still reads failed (12:58:04). Status stays `in-progress` until the e2e passes.

- **13:08 to 13:13 on 2026-10-20: test 1's "Couldn't answer" was very likely our dev server's spent daily model budget, not Cerebras** ([Cerebras rate limits](cerebras-rate-limits.md)). 13:09:31, the lead: the local dev server "had used up its daily model budget of 1 million tokens", about half held by killed tests' reservations; "this is also the likely cause of the 'Couldn't answer' errors in the message-controls test". 13:13: the lead raised the budget to 10 million, restarted the dev server and told this builder to rerun its live-model test ([dev stack hygiene](dev-stack-hygiene.md)).
- 13:05:22 to 13:14:40, on disk: `src/features/chat/` `chat.test.ts` (13:05:22), `store.ts` (13:05:59), `controls.test.ts` (13:11:06) and `actions.ts` (13:13:38); `e2e/message-controls.spec.ts` (13:14:40).
- **13:14:45 to 13:15:50 on 2026-10-20: the e2e passed, both tests** (`test-results/.last-run.json`: passed, no failed tests): "Copy puts an answer on the clipboard, and every message shows its time" (a live-model answer) and "Edit takes a question queued offline back to the composer before it is sent, and a draft survives a reload". Each recorded a video (`test-results/message-controls-*/videos/`); no GIF under `~/Desktop/smithers-mvp/gifs/` yet.
- **Status moved from in-progress to done** on the passing e2e, this note's stated bar. Still open: the builder's report, the GIF, and landing in the lander's app round ([land to main](land-to-main.md)).
- **13:33:09 on 2026-10-20, the lead to Will, "Message controls work":** "Every message shows its time. Finished answers have Copy, also available as `/copy` or through the agent. A queued question has Edit, also `/edit`, and edit can't race with send in the same tab. Drafts survive a reload. Both browser tests pass." GIFs: `~/Desktop/smithers-mvp/gifs/message-controls-message-copy.gif` (13:15:53) and `message-controls-message-edit.gif` (13:15:54). The duplicate "ask the tab that asked" channel is merged into `src/flows/askingTab.ts`.
- **Three P2 follow-ups for the cleanup pass** (scratchpad `final/WIRING.md`, "Message controls done"):
  1. **A draft is lost on a reload right after typing.** The device-store write lands a moment after the keystroke; the e2e waits on `data-draft="saved"`, which hides it. Fix: flush on `pagehide` or `visibilitychange`, or write synchronously, with an e2e that reloads with no wait.
  2. **`Outbox.withdraw` locks only its own tab.** If a second tab takes over sending as you press Edit, that tab can still send the question. Withdraw and send must share the cross-tab leader lock, with a two-tab test.
  3. **Two chat tests fail only in the full run** ("the composer always sends" and the telemetry connection test), from load or isolation. Fix before landing round 3.
  Also: recheck the repo "browse" copy-permalink e2e against the merged helper.
- **About 14:31 on 2026-10-20, Will's review finding** after watching `message-controls-message-copy.gif`: "copy should not be visible nor should the timestamp unless you are already hovering over the message". Fixed in `@smthrs/ui`, so every surface gets it: `ChatMessage` takes `actions` (the time, Copy, a queued question's Edit), hidden with opacity until the pointer is over the message (`hover: hover`) or focus is inside it; a message with actions is `tabindex="-1"`, so a tap shows them on a touch screen. Their space is kept; the fade is 120 ms, none under reduced motion. `Queued`, `Not sent` and the recovery buttons stay in `meta`, always shown. Regression: `packages/smithers/ui/browser/chat-message.browser.test.ts` (real Chromium: hover, keyboard Tab, touch, reduced motion; fails on the old `ChatMessage`); `e2e/message-controls.spec.ts` hovers before Copy and Edit and checks both hidden first. Its first run (14:45 to 14:48) failed on the dev stack, not the change: Postgres commits waited 48 s on `WALWrite`, so `/api/questions` and every shape timed out with 500s. Rerun at 15:25: both tests passed; GIFs re-recorded (`message-controls-message-copy.gif`, `message-controls-message-edit.gif`).
- **14:27:56 on 2026-10-20, Will (queue, on the message controls GIF):** "copy should not be visible nor should the timestamp unless you are already hovering over the message". A change to built work: Copy and the time appear only while the pointer is over a message. Keyboard and touch need an equivalent (best guess: on focus, and on tap for touch), so Copy stays reachable without a mouse.
- **Status moved from done to todo:** the change isn't assigned or in `queue/dispatch.md` by 14:30.

## Next

From 14:30 on 2026-10-20: the lead assigns the hover change; it lands with an e2e that checks Copy and the time are hidden until hover or focus, and a new GIF; the curator queues a `verify` item. The three P2 follow-ups stay with the [P3 cleanup](review-round-4-p3-cleanup.md), and round 3 commits the rest ([land to main](land-to-main.md)).

Until 14:30 on 2026-10-20 the next step was, from 13:33 on 2026-10-20: the lander commits it in round 3 ([land to main](land-to-main.md)); the three follow-ups go to the [P3 cleanup](review-round-4-p3-cleanup.md) pass, and follow-up 3 must pass before round 3 lands.

Until 13:46 on 2026-10-20 the next step was, from 13:15 on 2026-10-20: the builder's report and GIF; the lander commits it in its app round with the chat client fixes. Reopen if the report names a red or the e2e fails again.

Until 13:15 on 2026-10-20 the next step was, from 13:03 on 2026-10-20: the unit suite, then the e2e rerun and its GIF, then the builder's report; this note moves to `done` when the e2e passes. Whether test 1 failed on Cerebras's limit or on a bug decides whether the fix is capacity or code.

Until 13:03 on 2026-10-20 the next step was, from 12:15 on 2026-10-20: the builder reports copy, times, queued-question edit and saved draft with an e2e; no Reasoning section (the lead's decision). Until 12:15, from 12:00 on 2026-10-20: the builder reports; this note moves to `done` when its e2e passes. Until 12:00: when both agents report, the lead starts a builder on this note's list: copy, times, editing a queued question, a saved draft, and reasoning if the endpoint returns it.

## Questions for Will

None. The Reasoning question was decided by the lead at 12:15:36 on 2026-10-20: leave it out until the endpoint returns reasoning.

Until 12:15:
- Reasoning: the 12:00 list leaves out the collapsible Reasoning section. Build it once the model endpoint returns reasoning, or drop it?

Until 12:14: None.
