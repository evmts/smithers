---
title: Preserve legacy devices while enforcing ownership and queued authority
status: in-progress
area: app
owner: Opus device-identity security builder assigned by lead
updated: 2026-10-21 09:17 PDT
links: [../decisions/0023-device-ownership-and-queued-authority.md, device-data-migrations.md, local-first-migrations.md, agent-run-credentials.md, land-and-deploy-mvp.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 09:17 PDT

**What:** Preserve returning-device data while enforcing account ownership and queued authority.

**Why:** An upgrade must not wipe a returning person’s conversations, drafts or pending writes.

**Current state:** At 09:15 PDT the lead reports device identity finished in its workspace and the upgrade test passing after resetting the Mac mini’s Electric. This supersedes the missing upgrade-test receipt. The change is with the lander; main remains cf6bd457, so neither landing nor production rollout is confirmed.

**Next step:** Retain the upgrade and account-isolation receipts on the landed revision, reconcile decision 0023 with the safe migration actually implemented, then verify the deployed upgrade.

**Open questions for Will:** None new; engineering validation and landing do not need another decision.

Evidence: script-filtered session 6253ecf2 human text and lead replies through 09:15 PDT, including Will’s human-origin queued request at 09:10:54. Rulings and queue answers take precedence over the shared briefs/designs, decisions, proposals, TODOs and rules reviewed for this pass. Product validation is lead-reported; this tracker runs the site build only. Execution ownership retained; documentation curator: Codex.

## Earlier tracker history (retained)

## Tracker reconciliation — 2026-10-21 03:54 PDT

**What:** Verify returning device owners without erasing their local data.

**Why:** Account isolation and safe upgrades must both hold.

**Current state:** The 02:56 PDT lead update explicitly assigns an Opus security builder in its own workspace; the owner is no longer unassigned. No successful upgrade test or completed repair is reported. The decision-0023 discrepancy remains engineering work.

**Next step:** Prove trusted same-person recovery and cross-account refusal with pending writes preserved, reconcile the decision and implementation, and pass the retained-device upgrade test before landing.

**Open questions for Will:** None new.

Evidence: lead text replies extracted by script from session 6253ecf2, 01:53–03:53 PDT; no user-typed messages in this window. Automated notifications and tools excluded. Current rulings and queue answers through 01:19 PDT take precedence over historical briefs, panels, decisions, proposals, TODOs and rules. Product receipts are lead-reported; this pass only rebuilds the maintainer site. Execution ownership retained; Codex curates the notes.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 03:04 PDT

**Current state:** At 02:56 PDT the lead started an Opus security job to verify returning device owners without wiping their data. The excluded check has no repaired upgrade receipt; the previously recorded decision-0023 identity discrepancy still needs safe reconciliation.

**Next step:** Preserve pending writes through a trusted same-person upgrade, refuse cross-account access, and pass the retained-device upgrade test before landing.

**Open questions for Will:** None new; existing unresolved questions remain in the retained history.

Evidence: lead text replies through 03:03 PDT, extracted by script from the latest approximately two session hours; automated notifications and tool blocks excluded. Current rulings and queue answers take precedence over briefs and designs. Execution ownership retained; documentation reconciled by Codex tracker curator. Product receipts are reported, not independently rerun here.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 01:05 PDT

**What:** Repair the excluded ownership check without erasing upgraded devices.

**Why:** Device recovery and account isolation must both hold.

**Current state:** At 01:04 the lead says no agent claims identity.ts; the run-credentials builder explicitly disclaims it. It remains excluded from tonight’s landing. A Claude agent is planned after deploy because this is security code. The lead requests same-session recovery, while decision 0023 rejects login-only identity adoption; this discrepancy remains unresolved engineering work.

**Next step:** Establish trustworthy same-person legacy recovery with regression tests, preserving pending writes and refusing cross-account access. Reconcile decision 0023 before claiming the fix ships.

**Open questions for Will:** None yet; determine a safe migration first.

Evidence: script-filtered user-typed text and lead replies from session 6253ecf2, latest two hours through 01:04 PDT; current rulings, queue answers, shared briefs/designs, decisions, proposals, TODOs and rules. Product checks are lead-reported, not executed by this tracker. Execution owners retained; Codex curates documentation only.

## Earlier tracker history (retained)


## What

Repair the excluded device-ownership activation check without losing saved device data. Preserve account isolation, stable ownership and the original authority of queued agent writes.

## Why

The production upgrade must retain conversations, drafts and queued writes while refusing another account’s access or impersonation.

## Current state

At 00:48 PDT the lead reports that a check added at 00:44 treats every device upgrading from current production as a different owner and wipes it. The check is excluded from tonight’s landing; the lander reruns the final upgrade proof before pushing. The lead is finding its owner and asks for same-session legacy recovery with a regression test in a later round. No repaired-check receipt exists.

Decision 0023 describes the intended stable-person authorization boundary, original signed proof renewal at delivery, and coordinated cross-tab wipes. Its statement that a matching legacy login is insufficient conflicts with the lead’s latest request that a matching saved login/session avoid a wipe. A lead instruction does not amend Will’s rulings or authorize unsafe identity adoption; the owner must reconcile this engineering discrepancy with a safe migration and document the actual shipped policy.

## Next step

Identify the lane owner, retain a failing regression from the current production build, and establish trustworthy same-person migration that preserves pending writes. Prove account changes still refuse access and stale queued writes cannot act as the new person. Deliver separately after tonight’s excluded-check deployment, with tests and decision documentation reconciled.

## Open questions for Will

None yet; engineering owners must first determine a safe migration and resolve the evidence discrepancy.

Evidence: lead text reply at 00:48 PDT, script-extracted from session 6253ecf2’s last two hours; decision 0023; current rulings and queue answers through 00:17:42 PDT. No product test was run by this tracker.
