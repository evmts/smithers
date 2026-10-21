---
title: TODO draft, commit and drop (slice 1)
status: in-progress
area: app
owner: TODO UI builder assigned by lead
updated: 2026-10-20
links: [todos-and-stack.md, agent-run-credentials.md, land-to-main.md, ../decisions/0016-todos-and-the-stack.md, ../rulings.md]
---

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
