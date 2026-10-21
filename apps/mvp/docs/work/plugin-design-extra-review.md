---
title: Extra Fable and Astra review of the plugin design
status: done
area: design
owner: Astra and Fable reviewers; final edits completed by design owner
updated: 2026-10-20
links: [everything-is-a-plugin.md, maintainer-app-plugins.md, personal-code-flow-sandbox.md, agent-run-credentials.md, ../decisions/0017-everything-is-a-plugin.md, ../rulings.md]
---

## Current specification — 2026-10-20, 18:04 PDT

**What:** Complete Will’s additional Astra/fixes/Fable review of decision 0017.

**Why:** Will requested another review before the approved interface was built.

**Current state:** At 17:56:53 PDT the lead reported Fable’s additions recorded and the design ready to build. Slice 0 started. The extra design review is complete; runtime security remains to be implemented.

**Next step:** Retain review dispositions in 0017. Track credential implementation separately and enforce frame attribution, host-owned person-only controls and no-exfiltration tests before untrusted plugin UIs ship.

**Open questions for Will:** None.

Evidence: lead text replies extracted by script from the latest two transcript hours through 2026-10-21 01:03:57 UTC; queue rulings through 00:42:06 UTC; current rulings and decision 0017 override historical panel proposals. Product checks and landing receipts are reported evidence; this tracker runs the maintainer-site build only.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 17:44 PDT

**What:** Reconcile the extra Astra and Fable reviews of decision 0017.

**Why:** Will approved the design conditional on another review round.

**Current state:** At 17:40 PDT the lead reported Fable ready-to-build after two additions: host-owned person-only controls and one authoritative run/actor/action list. Frame attribution and exfiltration prevention remain release gates. The review file contains further findings; a completion receipt for the final edits is absent.

**Next step:** Record every Fable disposition in 0017, verify the final edits, then begin slice 0. Design review is not runtime security proof.

**Open questions for Will:** None for this update.

Evidence: queue answers through 2026-10-21 00:42:06 UTC and script-filtered human text/lead replies from 22:43–00:43 UTC; current rulings and decision 0017 supersede historical briefs. Product checks are reported evidence; this tracker validates the site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 17:34 PDT

**What:** Adversarially review decision 0017 before plugin construction.

**Why:** Will explicitly requested extra Astra and Fable review.

**Current state:** At 17:27 the lead confirms all 13 Astra findings addressed with checked citations, none rejected. Fable is now reviewing the revised design, especially framed React apps, QuickJS flow execution and server-minted credentials. No Fable completion receipt.

**Next step:** Reconcile Fable findings before implementation. Keep design corrections distinct from tested runtime enforcement.

**Open questions for Will:** None.

Evidence: queue answers through 2026-10-21 00:34:14 UTC; script-filtered human text and lead replies from the latest two transcript hours through 00:33:48 UTC; current rulings, decisions, proposals, TODOs, rules and shared briefs. Latest answers supersede older blockers. Product tests are reported evidence; this tracker runs the maintainer-site build only.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 17:24 PDT

**What:** Review and correct decision 0017 before building the plugin slices.

**Why:** Will explicitly requested extra Astra and Fable review with his approval.

**Current state:** The current decision marks Astra review fixed and Fable review pending. All 13 Astra findings were accepted with a design fix and checked code citations; none was rejected. This supersedes the earlier fix-pass-in-progress description, without claiming implementation or Fable completion.

**Next step:** Have Fable review the revised decision and reconcile its findings. Verify run identity, attenuated authority, per-plugin grants, fail-closed hooks and the reduced first-slice acceptance tests.

**Open questions for Will:** None.

Evidence: script-extracted user-typed text and lead replies from session 6253ecf2, latest two hours through 2026-10-21 00:23:43 UTC; queue answers through 00:06:34 UTC; current rulings and decision 0017, including its Astra fixes. Older briefs and proposals yield to these rulings. Completion and tests are reported evidence; this tracker validates the site build only.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 17:14 PDT

**What:** Recheck decision 0017 and fix findings before implementation.

**Why:** Will explicitly requested the extra review with his approval.

**Current state:** Astra review is complete: four serious and nine medium findings. Serious findings concern server agent/person identity, unenforced capability intersection, repository-wide rather than per-plugin secret grants, and restriction-skipping fallback. The lead assigned a fix pass incorporating all queue answers. Fable completion is not reported.

**Next step:** Address or reject each finding with evidence in 0017, then send the corrected design to Fable. Keep runtime enforcement evidence separate from a design recommendation.

**Open questions for Will:** None.

Evidence: script-extracted human text and lead replies from session 6253ecf2, latest two hours through 2026-10-21 00:13:56 UTC; queue answers through 00:06:34 UTC; current rulings, decisions, proposals and shared briefs. Queue answers supersede older design proposals. Test results are lead-reported; this tracker runs the site build only.

## Earlier tracker history (retained)


## What

Review decision 0017 once more with Fable and Astra, then reconcile concrete findings before the first implementation slice.

## Why

Will approved the merged design at 17:03:52 PDT with “Looks good but you should have fable and astra review this one extra time”.

## Current state

The lead’s 17:05 PDT PLUGIN-REVIEW-BRIEF.md exists. It asks for code-claim verification, secret and identity boundaries, person-only actions, system-flow protection, public-interface parity and an end-to-end first slice with deletion of replaced code. No completed review receipt is available. In-progress records review preparation, not a claim both reviewers have started.

## Next step

Collect both reviews, rank and reconcile findings, and update the implementation brief. Preserve the approval and review history. Check the existing agent/person credential gap explicitly; recommendations alone do not prove server enforcement.

## Open questions for Will

None now. Return only unresolved product choices found by the reviews; approval is already recorded.

## History

2026-10-20 17:03:52 PDT: approval in queue answer design:plugins-merged@1f45. At 17:05 the lead prepared the extra review brief. This tracker did not run or dispatch those reviews.
