---
title: Shared branch prompt and file co-editing
status: in-progress
area: app
owner: collaboration builder assigned by lead
updated: 2026-10-20
links: [branch-sharing.md, branch-terminal.md, branch-workspace-clarity.md, ../decisions/0013-branch-workspace.md, ../rulings.md]
---

## Current specification — 2026-10-20, 18:18 PDT

**What:** Co-edit every shared branch or conversation input, plus working files, with CRDT convergence and visible named cursors.

**Why:** Will widened the request at 18:06 to the answer box on a run that needs a person.

**Current state:** The lead assigned the wider scope at 18:06; no completed co-editing receipt exists.

**Next step:** Extend the existing builder’s scope to shared answer inputs; prove two-person typing, cursors, reconnect, view-only refusal and revocation in tests and a chaptered recording.

**Open questions for Will:** None; the recorded requests settle product intent.

Evidence: script-filtered user text and lead replies from the latest two session hours; queue answers through 2026-10-21 01:16:08 UTC; current rulings, decisions, proposals, TODOs, rules and shared panel briefs/designs. Later rulings override historical proposals. Product receipts are reported evidence; this pass validates the site build only.

## Earlier tracker history (retained)

## What

Co-edit a branch composer draft and working-copy files with named, coloured cursors. Concurrent edits converge; sending is one person's act under their identity. Save uses the existing durable sandbox write flow.

## Why

Will's 17:41 queue answer asks to see both people editing the same prompt and file, and calls out code review.

## Current state

At 17:41:46 PDT the lead started implementation. Sharing, presence and terminal access previously passed; no co-editing test or implementation completion receipt exists.

## Next step

Choose the library from the catalog first; any missing CRDT capability belongs behind the SDK's Effect services. Enforce edit grants and revocation on every server update. Prove concurrent convergence with property tests and a real two-person browser journey with cursors, view-only refusal, reconnect and revocation. Return a chaptered recording and review the code alongside security.

## Open questions for Will

None. Prompt/file co-editing is explicitly requested; broader Pair restoration remains outside this work.

## History

2026-10-20 17:44 PDT: added from Will's queue ruling at 00:41:23 UTC and the lead's script-extracted 00:41:46 UTC reply. No product tests were run by this tracker.
