---
title: Preserve the VibeLang website during the public repository move
status: in-progress
area: process
owner: VibeLang release session and lead; resync-session steering awaits Will
updated: 2026-10-20
links: [vibelang-0-0-2-publish.md, vibelang-release-docs.md, ../rulings.md]
---

## Current specification — 2026-10-20, 21:43 PDT

**What:** Preserve vibelang.sh source and prevent stale resync writes across the repository move.

**Why:** The chosen public language repository already hosted website source.

**Current state:** The suspected resync writer was stopped at 20:02 PDT and its watch ended after 30 minutes without commits. At 21:36 the lead reports the language repository move done with prototype-final preserving the prototype. No post-move website build or deployment receipt is reported, so website continuity remains open.

**Next step:** Verify preserved website source and history, then obtain a real post-move website build and deployment receipt; investigate any recurring stale resync writes.

**Open questions for Will:** None; stopping the suspected writer was already authorized.

Evidence: lead text replies and human-typed messages extracted by script from session 6253ecf2 for 19:43–21:43 PDT; synthetic notifications and compaction summaries excluded. Rulings and queue answers through 19:38 PDT take precedence over older briefs, designs, decisions, proposals, TODOs and rules. Product results are reported receipts; this tracker validates the site build. Execution ownership is retained; reconciliation by Codex tracker curator.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 20:57 PDT

**What:** Preserve vibelang.sh source and stop stale resync writes during the repository move.

**Why:** The chosen public repository already contains the website source.

**Current state:** At 20:02 PDT the lead stopped the suspected hourly resync session following Will’s Telegram reply. At 20:32 it reports no new commits in 30 minutes and ends the watch. This supports stopping that writer; it does not establish a completed repository move or a working site/ migration.

**Next step:** Coordinate with the release owner, retain website history and source, and obtain a real website build/deployment receipt after the move. Investigate if resync writes recur.

**Open questions for Will:** None; stopping the suspected writer is already authorized and reported.

Evidence: script-filtered human messages and lead text replies from session 6253ecf2, approximately 18:57–20:57 PDT; current rulings and queue answers, decisions through 0021, proposals and shared briefs/designs. Transport details additionally use its final builder report. Product checks are reported evidence; this pass runs the maintainer-site build. Execution ownership retained.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 20:02 PDT

**What:** Preserve the website source and prevent stale hourly resync writes during the public repository move.

**Why:** The selected public repository carries the vibelang.sh source under docs/.

**Current state:** At 20:02 PDT the lead reports receiving Will’s Telegram “stop it” and stopping the suspected two-day codex-acct-2 session in ~/vibelang-release. The lead is watching for further docs: resync commits. Attribution remains inferred; preservation under site/, a completed repository move and a working website are not yet evidenced.

**Next step:** Coordinate the website-preserving move with the release owner, watch for another resync commit and verify the site build and source history. Investigate any recurring writer.

**Open questions for Will:** None currently. The lead interpreted “stop it” as the hourly resync and invited correction; the earlier request to choose redirect versus stop is superseded.

Evidence: script-filtered user-typed text and assistant text replies in session 6253ecf2, 18:02–20:02 PDT; queue answers through 19:38 PDT; rulings, decisions 0001–0020, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Timeline validation also uses its builder report. Latest Will text and queue answers prevail. Product receipts are reported evidence; this tracker verifies the site build. Execution owner retained; reconciled by Codex tracker curator.

## Earlier tracker history (retained)


**What:** Preserve the website source and stop the hourly resync from overwriting the new repository layout.

**Why:** The chosen public repository currently hosts the source for vibelang.sh in docs/.

**Current state:** At 19:55 PDT the lead reports an hourly resync from ~/vibelang, most likely a Codex desktop session in ~/vibelang-release, with no scheduled job found. The source’s move to site/ is a plan, not a completed receipt; attribution to that session is an inference. The lead sent the blocker to Will through the authorized private Telegram chat.

**Next step:** Coordinate with the owning release session, preserve website history under site/, confirm the actual writer and prevent stale resync writes. Verify the site builds and the public move preserves its source before declaring continuity complete.

**Open questions for Will:** Redirect that existing Codex session to site/ or stop its resync when back. Do not silently stop an unrelated session based on inferred attribution.

Evidence: script-filtered user-typed text and lead replies, session 6253ecf2, latest approximately two hours through 2026-10-21 02:55 UTC; queue answers through 02:38 UTC; rulings, decisions 0001–0020, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Later rulings supersede older proposals. Builder receipts are reported evidence; tracker verification is the site build. Execution ownership retained; reconciled by Codex tracker curator.
