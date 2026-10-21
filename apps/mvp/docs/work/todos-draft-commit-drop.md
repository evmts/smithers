---
title: TODO draft, commit and drop (slice 1)
status: in-progress
area: app
owner: TODO UI builder assigned by lead
updated: 2026-10-20 23:34 PDT
links: [todos-and-stack.md, agent-run-credentials.md, land-to-main.md, ../decisions/0016-todos-and-the-stack.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-20 23:34 PDT

**What:** Keep the issues-style TODO UI and expose its actual implementation work.

**Why:** A TODO should make active implementation visible.

**Current state:** Round 4b landed at 1f758104 with GitHub-style TODOs and Make TODO from an issue; reported suite, docs, imports and typecheck pass. Will requested changes at 23:33: link to the running flow, slow-blinking activity, and watching/steering (TODO-3). TODO-to-PR execution remains switched off.

**Next step:** Keep this slice in progress for the new review request; implement the linked active-run view after the execution prerequisite is proven.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead text replies in session 6253ecf2, approximately 21:34–23:34 PDT; queue answers through 23:33:36, current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Notifications and teammate messages excluded from human evidence. Product receipts are lead-reported; this tracker verifies the site build. Existing execution ownership retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-20 23:25 PDT

**What:** Provide GitHub-style TODO lists, detail, Commit and confirmed Drop.

**Why:** Follow Will’s issue-style UI request.

**Current state:** At 23:25 the lead reports round 4b on main at 1f758104 with GitHub-style TODOs and Make TODO from an issue. The suite exits green and docs:check, import rules and typecheck pass. Earlier returned walkthrough still awaits Will’s verification; a broad suite receipt does not replace the previously missing live issue-journey proof.

**Next step:** Retain landing receipts and obtain targeted live issue-to-TODO and recording verification; track disabled coding execution separately.

**Open questions for Will:** Verify the returned TODO walkthrough.

Evidence: script-filtered human messages and lead text replies through 23:25 PDT; queue answers through 23:16, current rulings, decisions, proposals and shared briefs/designs. Automated notifications excluded. Product receipts are lead-reported; tracker validation is the site build. Execution owner retained; Codex curates the note.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-20, 22:05 PDT

**What:** Provide GitHub-style TODO Open/Closed lists, issue pages and confirmed Drop.

**Why:** Will requested the familiar issue layout and a visible, usable walkthrough.

**Current state:** At 21:56–21:58 the lead returns the revised walkthrough to the queue at priority 968. The stack header now renders immediately; Drop sits behind a confirming menu. The old recording was overwritten, so before shows only the original note. Broader execution and issue-to-TODO proof remain separate.

**Next step:** Collect Will’s verification and the round-4b pushed receipt; finish the live issue journey separately without claiming a skipped test passed.

**Open questions for Will:** Verify the returned TODO walkthrough.

Evidence: script-filtered human text and lead replies in session 6253ecf2, approximately 20:04–22:04 PDT; synthetic notifications, compaction summaries and tool blocks excluded. Rulings and queue answers through 19:38 prevail over historical briefs, decisions and proposals. Execution ownership retained; Codex curates this note. Product checks are reported evidence; tracker validation is the site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 21:43 PDT

**What:** Provide an issues-style TODO list and detail page with draft, Commit and Drop.

**Why:** Will requested GitHub-issues-style UI after rejecting the empty-screen recording.

**Current state:** At 21:39 PDT the lead reports the GitHub-style TODO changes handed to the round-4 lander. Two Drop-icon recordings still wait on the mini dev-server fix. The earlier shared outbox failure and missing successful corrected browser receipts remain limitations; a handoff is not completion.

**Next step:** Obtain passing keyboard and commit/drop journeys and both corrected recordings, resolving any remaining outbox failure before declaring the slice done.

**Open questions for Will:** None.

Evidence: lead text replies and human-typed messages extracted by script from session 6253ecf2 for 19:43–21:43 PDT; synthetic notifications and compaction summaries excluded. Rulings and queue answers through 19:38 PDT take precedence over older briefs, designs, decisions, proposals, TODOs and rules. Product results are reported receipts; this tracker validates the site build. Execution ownership is retained; reconciliation by Codex tracker curator.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 20:57 PDT

**What:** Provide an issues-style TODO list and detail page for draft, commit and drop.

**Why:** Will rejected the empty-screen recording and requested GitHub-issues-style UI.

**Current state:** At 20:27 PDT the lead reports the redesign built: Open/Closed tabs, an issue-style TODO page and Make TODO. Two videos are being rerecorded with the new Drop icon before lander handoff. The builder’s earlier record retains a commit-drop failure on an unregistered co-edit outbox mutation. No later passing browser/recording receipt is evidenced; the latest mini startup blocker delays waiting recordings.

**Next step:** Obtain passing keyboard and commit/drop journeys, fix any remaining shared outbox failure, and produce the two corrected recordings before declaring the slice done.

**Open questions for Will:** None.

Evidence: script-filtered human messages and lead text replies from session 6253ecf2, approximately 18:57–20:57 PDT; current rulings and queue answers, decisions through 0021, proposals and shared briefs/designs. Transport details additionally use its final builder report. Product checks are reported evidence; this pass runs the maintainer-site build. Execution ownership retained.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 17:55 PDT

**What:** Present TODO capture, commit and drop as an issues-style list and detail page.

**Why:** Will requested GitHub-issues-like UI and rejected the empty-screen demo.

**Current state:** At 17:34:35 PDT the lead assigned a redesign using the existing issues list component: state icon, title, number, person/time, branch or PR link, stack order, Open/Closed counts, and Drop in row/detail menus. At 17:54 the lead confirms this owner resumed after the session limit. No corrected UI completion receipt exists.

**Next step:** Complete the shared list/detail UI and diagnose Ann’s empty opening screen. Retain keyboard, concurrency and multi-device tests, then record a passing chaptered journey.

**Builder receipt, 2026-10-20 19:50 PDT:** built. The stack page is `@smthrs/ui` `IssuesView` (Open and Closed tabs with counts, `?state=closed`; state icon, title, `T<n>`, who and when, issue, branch and PR links; Drop in the row's `⋯` menu, confirmed in a dialog); one TODO is `ItemConversation` (state pill, prompt and criteria, timeline, side column with links and Drop). `StackList` and `TodoCard` are deleted. The page's frame paints at once; the opening blank was the recording sitting on two cold dev-server page loads while a device opens, which the recording builder cuts. `e2e/todos.spec.ts` keyboard test passes on the mini; commit-drop passed at 18:12 and now fails on the coedit builder's unregistered `text-update` outbox mutation.

**Open questions for Will:** None for this update.

Evidence: script-extracted user-typed text and lead replies for the latest two session hours through 2026-10-21 00:54:49 UTC; queue answers through 00:42:06 UTC; current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Later rulings prevail. Product and landing receipts are lead-reported; this tracker validates the maintainer-site build only.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 17:34 PDT

**What:** Create, commit and drop TODOs with a recognizable issues-style interface.

**Why:** Will’s 17:34 queue answer rejects empty-screen demo sections and expects the interface to resemble GitHub issues.

**Current state:** The prior slice’s keyboard, multi-device and concurrent commit tests remain reported passing. The latest changes request reopens UI quality; no assignment or corrected build receipt is evidenced yet.

**Next step:** Assign the TODO page/recording correction, improve the list and empty states using the shared UI, add behavioral regression coverage, then rerecord the new/commit/drop journey.

**Open questions for Will:** None.

Evidence: queue answers through 2026-10-21 00:34:14 UTC; script-filtered human text and lead replies from the latest two transcript hours through 00:33:48 UTC; current rulings, decisions, proposals, TODOs, rules and shared briefs. Latest answers supersede older blockers. Product tests are reported evidence; this tracker runs the maintainer-site build only.

## Earlier tracker history (retained)

## What

Ask Smithers for a TODO, edit its draft, commit it to the numbered Postgres stack and drop it; support keyboard use and sync across devices.

## Why

Deliver the first executable part of Will’s TODO work loop without mythical history.

## Current state

Done per the lead at 16:13:53 PDT. At 15:59:51 the lead reported two-browser draft/edit/commit/reload/drop and keyboard-only New/Commit/Drop passing. Twelve concurrent commits lose nothing and numbers are never reused. This completion covers slice 1, not execution to PR, production deployment or resolution of the agent identity gap. No new landing receipt is reported.

## Next step

Land with the current commit round. Follow execution in todos-and-stack.md and server authority in agent-run-credentials.md; known security holes remain switched off under the trust ruling.

## Open questions for Will

None.

## History

2026-10-20 16:14 PDT: separated the completed first slice from its unfinished parent, preserving the parent history.

Evidence: lead text replies extracted by script from session 6253ecf2, latest two hours through 2026-10-20 23:13:53 UTC; current rulings and queue answers prevail over older briefs. Reported receipts only; this tracker ran no product tests.
