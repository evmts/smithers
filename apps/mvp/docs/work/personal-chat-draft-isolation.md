---
title: Personal chat drafts stay private across tabs and members
status: in-progress
area: app
owner: co-editing continuation builder assigned by lead; Codex tracker curator records evidence
updated: 2026-10-21 00:06 PDT
links: [branch-coediting.md, local-first-conflicts.md, local-first-conflict-coverage.md, release-burn-down.md, ../decisions/0013-branch-workspace.md]
---

## Tracker reconciliation — 2026-10-21 00:06 PDT

**What:** Keep unshared composers private and shared-branch prompts collaborative.

**Why:** The previous change exposed personal drafts and mirrored typing across tabs.

**Current state:** At 23:58 the lead reports the fix: only owner-shared branches have shared prompts; all other drafts remain on the device. Branch-coediting.md records the mini e2e pass and unit regression evidence. The lead reports the fix, but there is no 4d landing receipt.

**Next step:** Obtain 4d landing receipt and retain the personal/shared and first-share/last-unshare regressions. Do not claim the separate real-model two-tab journey passed.

**Open questions for Will:** None.

Evidence: script-filtered human text and lead replies from the last two session hours, through 00:05 PDT; queue answers through 00:05:48 PDT; current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Product checks are reported receipts, not checks executed by this tracker. Existing execution owners and history retained; Codex curates documentation only.

## Earlier tracker history (retained)


## What

Keep personal chat drafts private while shared-branch prompts converge with named cursors.

## Why

The recording sweep found a second tab opening with the first tab’s draft. Branch co-editing may also have exposed the home conversation’s prompt to all Members.

## Current state

At 22:22 PDT the lead identifies the scope concern; at 22:24 a fresh co-editing agent takes over to check and restrict sharing. The relationship between the two bugs is unconfirmed. No fix or passing regression receipt is reported.

## Next step

Trace draft ownership and text IDs, restrict shared editing to authorized shared branches, and retain a real multi-tab/personal-versus-shared regression. Hand any fix to the burn-down lander; this adds no new feature scope.

## Open questions for Will

None. This is a scope and isolation fix, not a request to restore broader Pair features.

## History

2026-10-20 22:24 PDT: added by Codex tracker curator from script-filtered lead replies at 22:16, 22:22 and 22:24. Existing workstreams retain their own owners. No product tests were run by this tracker.
