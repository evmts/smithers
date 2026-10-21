---
title: Publish VibeLang 0.0.2
status: in-progress
area: process
owner: VibeLang migration owner; release deferred
updated: 2026-10-20
links: [../rulings.md, effect-code-conversion.md]
---

## Current specification — 2026-10-20, 19:56 PDT

**What:** Prepare VibeLang for publication from smithersai/vibelang while preserving repository and website history.

**Why:** Will selected that public home and asked for publish readiness.

**Current state:** At 19:52 the owning VibeLang session is preparing an append-only repository move and scanning the previously private history for secrets. At 19:55 the lead identifies docs/ as the website source, resynced hourly from another checkout; the plan preserves it under site/. npm remains 0.0.1; no repository-push or 0.0.2 publication receipt exists.

**Next step:** Coordinate the website source and resync before the move, then hand off approved docs and release links. Retain clean-install and publication receipts; the lead says npm publishing waits for Will’s command.

**Open questions for Will:** Point the existing docs-resync session at site/ or stop its resync when back; see vibelang-website-continuity.md.

Evidence: script-filtered user-typed text and lead replies, session 6253ecf2, latest approximately two hours through 2026-10-21 02:55 UTC; queue answers through 02:38 UTC; rulings, decisions 0001–0020, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Later rulings supersede older proposals. Builder receipts are reported evidence; tracker verification is the site build. Execution ownership retained; reconciled by Codex tracker curator.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 19:34 PDT

**What:** Release VibeLang first under the chosen public repository; confirm the release version from the release owner.

**Why:** The public-home decision no longer blocks release.

**Current state:** Queue option 1 at 19:30 chooses smithersai/vibelang. At 19:31 the lead confirms the VibeLang session owns replacing the prototype with current code. Keeping prototype history as a tag/branch is a lead suggestion, not a new Will ruling. No release or clean-install receipt is reported.

**Next step:** Coordinate the repository move with the owning session, finish approved docs, and retain publication plus clean-install evidence. Historical 0.0.2 remains a title, not proof of the intended release version.

**Open questions for Will:** None.

Evidence: script-extracted user-typed messages and lead text replies from session 6253ecf2, 2026-10-21 00:34–02:34 UTC (17:34–19:34 PDT); queue answers through 02:33:47 UTC; current rulings, decisions, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Latest Will text and queue answers prevail. Product receipts are reported, not rerun by this tracker. Existing execution owners are retained.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 19:14 PDT

**What:** Release VibeLang first; reconfirm the version rather than treating the historical 0.0.2 title as a new release decision.

**Why:** Will explicitly requested the VibeLang release before Smithers.

**Current state:** At 19:14 the lead identifies the public repository choice as the release blocker. Documentation drafts exist and verified examples pass, but no npm publication or clean-install receipt exists. The VibeLang session owns code, packages and release.

**Next step:** Obtain the public-home decision through the queue, finish release validation with the owning session, and retain publication/install receipts. Keep unpublished local links out of Smithers main.

**Open questions for Will:** Which repository is the public home? The lead and VibeLang session recommend reusing smithersai/vibelang with the current implementation.

Evidence: latest approximately two hours of user-typed messages and lead text replies extracted by script from session 6253ecf2, through 2026-10-21 02:14:18 UTC; queue answers through 01:57:13 UTC; rulings, shared briefs/designs, decisions, proposals, TODOs and rules. Later Will answers supersede older proposals. Product validation is reported evidence; this pass verifies the site build only. Reconciled by Codex; execution owners retained.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 19:07 PDT

**What:** Prepare VibeLang for release before announcing Smithers.

**Why:** At 19:02 Will said he is going to release VibeLang first and requested a custom README, contributor and maintainer pages and a high-quality coding factory. This supersedes treating publication as indefinitely deferred.

**Current state:** No npm publication receipt is reported. The lead’s 19:05 README brief assigns scratch-only drafts to a separate writer; another session owns the VibeLang repository. The intended release version is not reconfirmed, so the historical 0.0.2 staging record is not a current release claim.

**Next step:** Coordinate the docs drafts and verified commands with the owning VibeLang session; finish migration validation and review there, then retain publication/install receipts. Track release documentation in vibelang-release-docs.md. Do not revive the old OTP request without current evidence.

**Open questions for Will:** None.

Evidence: session 6253ecf2 user text and assistant replies extracted by script for the latest approximately two hours, through 2026-10-21 02:07 UTC; queue answers through 01:57 UTC; current rulings and shared briefs. Latest answers supersede older proposals. Receipts below are lead-reported; this tracker verifies only the maintainer-site build. Execution owners are retained; reconciliation by Codex.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 15:10 PDT

**What:** Publish VibeLang after the package migration and its validation.

**Why:** OTHER-1 and OTHER-2 supersede the old standalone 0.0.2 release request.

**Current state:** Deferred by Will’s 14:00 ruling: use the latest local VibeLang via npm link, migrate one package with passing tests, then pause for review. The historical OTP request below is no longer a current blocker. No new publication receipt is evidenced.

**Next step:** Complete the first-package migration and Will’s review; publish at the end of the authorized migration effort. Preserve the staged release record as history.

**Open questions for Will:** None.

Evidence: recent user text and lead replies from session `6253ecf2`, extracted through 15:10 PDT; [rulings](../rulings.md) and queue answers through 14:36 PDT. Reported completion is distinguished from a test run by this tracker.

## Earlier tracker history


## What

Publish the tested VibeLang 0.0.2 build (11 packages, commit `8a67c2ec`) to npm under `fucory`, then install it with npm and Bun and build a test app.

## Why

Will: "hwo do I publish vibelang make it really easy for me". The VibeLang benchmark and effeck.dev waited on it, and the benchmark falls back to 0.0.1 after 12:00 on 2026-10-19.

## State

- Staged on this Mac: `sh ~/effectscript/dist-npm/publish-0.0.2.sh`. All 11 files match the release checksums, and a dry run passed.
- `npm view vibelang version` still returns 0.0.1 at 21:10 on 2026-10-19.

## Next

Will runs the script in his own terminal and types the npm one-time password.

## Questions for Will

- Still wanted, or does 0.0.2 wait for the next release?
