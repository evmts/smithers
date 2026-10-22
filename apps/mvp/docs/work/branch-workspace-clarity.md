---
title: Clear branch workspace and understandable walkthrough
status: in-progress
area: app
owner: Codex Sol branch-page repair owner
updated: 2026-10-21 21:34 PDT
links: [branch-terminal.md, branch-sharing.md, chaptered-review-videos.md, ../decisions/0013-branch-workspace.md]
---

## Tracker reconciliation — 2026-10-21 21:34 PDT

**What:** Repair branch connection, first theme paint and offline-reopen chrome.

**Why:** Branch pages must show accurate state online and offline.

**Current state:** At 21:30 the lead confirms all three regression tests pass import rules and still fail on old code. The fixes are queued for the next lander push; no landing or production acceptance receipt is reported.

**Next step:** Collect landing receipts and verify the branch journey on the deployed revision.

**Open questions for Will:** None newly required; existing product decisions and account provisioning remain in their owning workstreams.

Evidence: script-filtered user text and lead replies from the latest approximately two hours across both requested session paths, current rulings and queue answers, and surviving reports where named. Product checks are reported receipts. Implementation owner retained; Codex maintains this tracker entry. Earlier history below is preserved; reboot-wiped briefs are not missing work.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 20:47 PDT

**What:** Repair branch-page state and retain meaningful walkthroughs.

**Why:** Branch views must be understandable online and offline.

**Current state:** At 20:37 prepared fixes are held because their tests import React from non-TSX files. Codex Sol is fixing those tests. Landing and production acceptance remain pending.

**Next step:** Repair the test structure, run checks on the remote runners, land and verify the branch journey live.

**Open questions for Will:** None.

Evidence: script-filtered human text and lead replies, 18:46–20:46 PDT, session 6253ecf2; current rulings and queue answers prevail. Runner results are recovered report receipts. Codex curates this update; existing implementation ownership is retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 14:54 PDT

**What:** Repair branch connection, theme and offline header behavior.

**Why:** Branch pages must identify their state accurately.

**Current state:** At 14:51 the lead moves three straightforward repairs to Codex Sol: Offline pill, initial theme, and branch header after reopening offline with storage cleared. No fix acceptance yet.

**Next step:** Keep each failing regression, fix and prove branch pages online/offline locally and live.

**Open questions for Will:** None for this repair. Existing pending decisions remain in the retained history.

Evidence: script-extracted user-typed text and lead replies from session 6253ecf2, 12:54–14:54 PDT; automated notifications excluded. Rulings and queue answers govern over historical briefs and proposals. Product receipts are lead-reported; this pass verifies only the maintainer-site build. Implementation owners remain assigned; Codex maintains tracker documentation.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 14:35 PDT

**What:** Show a usable branch workspace online and offline.

**Why:** Branch chrome must accurately show connection, theme and identity.

**Current state:** At 14:33 the lead assigns three production E2E regressions to the branch-workspace owner: connection pill never says Offline, theme is unset until chosen, and reopening offline after cleared storage loses the branch header. Earlier done status is reopened.

**Next step:** Repair all three with failing-before/passing-after browser regressions, then retain local and production receipts.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies, approximately 12:34–14:34 PDT on 2026-10-21, session 6253ecf2. Automated notifications, tool records and generated summaries excluded. Current rulings and queue answers prevail over historical briefs/designs and planning docs. Product receipts are lead-reported; this pass verifies the maintainer-site build only. Existing engineering ownership retained.

## Earlier tracker history (retained)


## Current specification — 2026-10-21, 00:25 PDT

**What:** Make the branch, conversation, terminal, views and people immediately recognizable, and make every recording say what it shows.

**Why:** Will rejected the replacement video at 17:30: most of it looked empty and its purpose was unclear.

**What was on screen:** a 1280 px page with a small header, a Code view that rendered nothing for an uncloned repository, a Terminal view with a small button and seconds of nothing while the machine woke, and a conversation that was the animated wordmark or loose bubbles under the view. The recordings showed 560 px device windows that were scaled up, and their captions were URLs and ids.

**Built (code-complete, unit-tested):**
- The branch page is two columns: the view (Code or Terminal) beside the conversation, with the composer at the conversation's foot. The chrome shows the branch name, the person's access (`Owner`, `Can edit`, `Can view`), everyone on the branch with this person first, and the Code and Terminal tabs (only the current one is marked).
- Empty states: `Not cloned` and `Cloning` in the Code view, `No messages yet` in an empty branch conversation, and `No access` in the conversation's place. The Terminal view always shows its screen: Open terminal in the middle, a spinner while the machine wakes, or `No terminals`.
- The terminal panel shows a terminal that turns up after it found none, so a reload on a loaded machine no longer leaves the view blank (`terminal/actions.ts` `show`).
- Recordings: a 2 s title card (feature, test name, one line from a `summary` annotation or the title), captions in product words, harder cuts of idle waits, 1280×800 windows at 1:1, about half in dark mode by a hash of spec and title, and `status` and `theme` in `<test>.chapters.json`.

**Proof (2026-10-21 00:16, Mac mini, HTTPS dev default):** `pnpm e2e branch-workspace.spec.ts branch-sharing.spec.ts`: 6 passed. `pnpm e2e:gifs`: 6 videos and GIFs, 0 fail the check. Every frame was reviewed. The videos are at `~/Desktop/smithers-mvp/videos/branch-workspace/{branch-conversation,branch-terminal,branch-views,second-branch-terminal}.mp4` and `~/Desktop/smithers-mvp/videos/branch-sharing/branch-sharing-{shared-to-view-ben-watches-maya-s-terminal-an,anyone-in-the-repository-with-the-link-reache}.mp4`, each with its `.chapters.json`.

**Follow-ups (todo, other owners):**
- A branch conversation stays blank for seconds until its shape first syncs (decision 0002: blank, never the empty state). On the mini it was 5 to 10 s.
- The full-screen view page shows only "Back to chat" until the framed page loads.
- The notifications pill sits over the repository header's Stack and Clone buttons at 1280 px.

**Open questions for Will:** None.
