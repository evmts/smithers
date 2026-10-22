---
title: Preserve legacy devices while enforcing ownership and queued authority
status: in-progress
area: app
owner: Opus device-identity security builder assigned by lead
updated: 2026-10-21 23:04 PDT
links: [../decisions/0023-device-ownership-and-queued-authority.md, device-data-migrations.md, local-first-migrations.md, agent-run-credentials.md, land-and-deploy-mvp.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 23:04 PDT

**What:** Preserve queued-write authority through device adoption and sign-in recovery.

**Why:** An earlier owner’s queued writes must never send as the next person.

**Current state:** At 22:54 the lead reports Track C works end to end: all four sign-in E2E tests pass with GIFs, covering initial-check recovery without reload, in-place adoption, earlier-owner write isolation and a sealed tab. The two commits are cleared to land immediately after the outbox security repair. Landing is not yet confirmed. Production recovered-device navigation remains a separate active failure.

**Next step:** Land the outbox fix before Track C, then verify the deployed ownership journeys and recovered-device navigation.

**Open questions for Will:** None newly required.

Evidence: script-filtered user-typed text and lead replies, approximately 21:04–23:04 PDT. Both requested transcript paths checked; continuation text is present in 6253ecf2, while the supplied 265921d3 path is absent. Current rulings and queue answers govern; surviving briefs and reports inform history. Reboot-wiped files are not unfinished work. Codex owns this tracker reconciliation; implementation ownership above is retained. Product results are lead-reported; this refresh runs the site build.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 21:34 PDT

**What:** Preserve queued-write ownership across reload, adoption and sign-in.

**Why:** A later device owner must never inherit authority over another person’s writes.

**Current state:** Surviving outbox-review-report.md identifies three confirmed gaps and fixes in unpushed e3768f0bbb99 atop 4636cb71c9f5: persisted unstamped-write eligibility, owner checks on upgrade/discard, and @none stamps for memory-only writes. Real red-to-green regressions and SDK 169/169 tests with full coverage pass. App checks report 230/231 with an unchanged shortcut cleanup failure; baseline and browser E2E remain unestablished.

**Next step:** Land after review and required checks; prove sign-in/reload ownership through real browser E2E and resolve the outstanding baseline comparison.

**Open questions for Will:** None newly required; existing product decisions and account provisioning remain in their owning workstreams.

Evidence: script-filtered user text and lead replies from the latest approximately two hours across both requested session paths, current rulings and queue answers, and surviving reports where named. Product checks are reported receipts. Implementation owner retained; Codex maintains this tracker entry. Earlier history below is preserved; reboot-wiped briefs are not missing work.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 17:14 PDT

**What:** Enforce device ownership and queued-write authority through sign-in recovery.

**Why:** An evicted store must not transfer queued writes to a later signed-in person.

**Current state:** At 17:09 Track C’s two commits are held pending sign-in E2E; its before/after unit comparison has no new failures. The lead identifies an older possible security gap: writes left from an evicted store may be sent as the person who later signs in. This is not reported fixed.

**Next step:** Resume local-first builder at 19:00 for the authority gap; pass the held sign-in E2E before landing Track C.

**Open questions for Will:** None; the security repair is assigned for the builder’s return.

Evidence: script-filtered user-typed text and lead replies in session 6253ecf2, approximately 15:14–17:14 PDT. Notifications, relayed agents, tools and compaction summaries excluded. Rulings and queue answers supersede older briefs/designs and docs. Execution owner retained; Codex curates the tracker only. Product results are lead-reported.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 16:43 PDT

**What:** Enforce verified ownership without wiping device work.

**Why:** Account boundaries and recovery must both hold.

**Current state:** At 16:38 the lead reports the device-identity fix on main 98702a02, describing it as no more wipe on owner change. MacBook landing checks ran; deployment and production isolation proof remain unreported.

**Next step:** Collect deploy and account-change/recovery E2E receipts before closing the workstream.

**Open questions for Will:** None.

Evidence: user-typed messages and lead text replies script-filtered from session 6253ecf2, 14:43–16:43 PDT; synthetic notifications, tools and compaction summaries excluded. Rulings and queue answers govern over historical briefs, panels, decisions, proposals, TODOs and rules. Implementation ownership retained; Codex curates this note. Product results are lead-reported.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 11:54 PDT

**What:** Enforce device ownership before serving saved data while allowing session recovery.

**Why:** A failed session check must not expose another account’s persisted data.

**Current state:** At 11:53 agent review confirms a new security finding assigned to the device-identity builder: a failed sign-in check still opens saved data, and a later valid session cannot reverse an earlier signed-out result. Earlier upgrade-test success does not close this finding. At 11:54 two raw fetches and one timer remain assigned to this builder for lint repair.

**Next step:** Repair authorization and recovery through injected services; retain regressions failing on the old code for failed initial checks, later valid sessions and account isolation. Land the fix before routing the slice to Will.

**Open questions for Will:** None.

Evidence: script-filtered user text and lead replies from session 6253ecf2, approximately 09:54–11:54 PDT; current rulings and queue answers take precedence over historical briefs, decisions, proposals, TODOs and rules. Product results are lead-reported; this tracker validates the site build only. Existing implementation ownership is retained; Codex curates documentation.

## Earlier tracker history (retained)


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
