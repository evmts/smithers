---
title: Complete production GitHub App setup
status: in-progress
area: infra
owner: Will configures the App; lead validates production
updated: 2026-10-21 21:24 PDT
links: [land-and-deploy-mvp.md, sign-in.md, github-source-of-truth.md, will-decision-queue.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 21:24 PDT

**What:** Verify hosted GitHub sign-in and authorized write-only Commit statuses.

**Why:** The live factory needs correct access at the production origin.

**Current state:** Will approves Commit statuses Read and write at 20:58 in the queue. Later lead updates remove the callback request because GitHub already redirects to smithers.sh. Routing code is pushed at 21:21, but the first deploy and live sign-in/status-write acceptance remain unreported.

**Next step:** After the designated cutover deploy, verify live sign-in, installation permissions and a real status write.

**Open questions for Will:** None currently; do not repeat answered permission or callback requests.

Evidence: script-filtered human messages and lead text replies in the latest approximately two hours across both requested transcript paths; continuation path is absent, but continuation-era replies appear in 6253ecf2. Current rulings and queue answers prevail. Surviving briefs/reports used where cited; wiped scratch files are not missing work. Execution ownership retained; Codex curates this note. Product checks are reported receipts, not rerun here.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 20:47 PDT

**What:** Complete GitHub App callback and write permissions for hosted work.

**Why:** New-origin sign-in and required statuses must work live.

**Current state:** At 20:46 the lead still requests the smithers.sh callback, Commit statuses Read and write, and acceptance of updated installation permissions. Earlier setup completion is historical and does not cover these new settings. GH-10 permits write-only statuses; older blanket status bans are superseded.

**Next step:** Verify callback additions preserve workers.dev, accept permission updates and run live sign-in and status-write acceptance.

**Open questions for Will:** GitHub App settings and installation permission acceptance remain pending.

Evidence: script-filtered human text and lead replies, 18:46–20:46 PDT, session 6253ecf2; current rulings and queue answers prevail. Runner results are recovered report receipts. Codex curates this update; existing implementation ownership is retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 10:34 PDT

**What:** Provide real production test access and GitHub integration.

**Why:** Production journeys need an authenticated Member.

**Current state:** Will sent both Write invitations at 10:13. At 10:23 the lead reports codeplanesmithers accepted both and signs into production as Member. Sandbox, steering and remote-flow builders share the session. Spoon-Knife clone is requested but waits on remote migration recovery.

**Next step:** Complete clone and integration verification after host repair; do not re-request invitations.

**Open questions for Will:** None newly identified; retain unrelated unresolved questions in the live queue.

Evidence: script-filtered user-typed messages and lead text replies from session 6253ecf2, latest approximately two hours through 10:33 PDT; current rulings and queue answers through 10:31 PDT, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules. Product receipts are reported evidence; this tracker runs only the site build. Execution ownership is retained; Codex curates documentation.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 02:34 PDT

**What:** Verify production GitHub sign-in and webhook setup.

**Why:** Installation coverage, callback configuration and event delivery need distinct evidence.

**Current state:** Will selected Installed for smithersai/vibelang at 01:16 PDT. At 01:38 the lead independently confirmed, using the App's credentials, installation across the smithersai organization and all repositories. Installation is settled. No successful production callback or webhook smoke receipt appears in the latest two-hour window; deployment is still running at 02:32. Status remains in-progress.

**Next step:** After deployment completes, validate production sign-in, webhook delivery and VibeLang import. Resolve this workstream from those receipts; do not repeat the installation request.

**Open questions for Will:** None now; validate the configured service before asking for further setup.

Evidence: queue answer question:vibelang-app-install at 2026-10-21T08:16:40.579Z; script-filtered lead replies at 01:38 and 02:32 PDT. Current rulings override historical briefs and proposals. Codex curates documentation only; execution ownership and all earlier history retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-20 23:14 PDT

**What:** Complete production GitHub App callback and webhook setup.

**Why:** Production sign-in and GitHub event delivery require the configured App.

**Current state:** Will’s queue answer at 23:13 explicitly says setup is not done yet, but he is working on it and expects a few minutes. No completion or successful production smoke receipt is present.

**Next step:** Wait for Will’s completion receipt, then have the lead smoke-test production sign-in and webhook and repeat after tonight’s deployment.

**Open questions for Will:** Confirm setup completion; never request credential values in the tracker.

Evidence: session 6253ecf2 user-typed text and lead text replies, script-filtered for the latest two hours through 23:13 PDT; rulings FE-16 and PROC-18; queue answers through 23:13 PDT. Synthetic notifications and relayed agent messages excluded. Current rulings supersede historical briefs and proposals. Product checks are lead-reported, not rerun by the tracker. Execution ownership retained; reconciliation by Codex tracker curator.
