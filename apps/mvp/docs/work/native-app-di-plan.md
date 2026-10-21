---
title: Native app through shared service interfaces
status: in-progress
area: design
owner: Opus and Codex Sol design panel; Will reviews merged proposal
updated: 2026-10-20 23:34 PDT
links: [self-host-install.md, web-first-desktop-later.md, host-agnostic-flows.md, ../decisions/0010-web-first-desktop-later.md, ../rulings.md, ../proposals/native-app-by-injection.md]
---

## Tracker reconciliation — 2026-10-20 23:34 PDT

**What:** Revise the approved native-host plan around hosted app-data synchronization.

**Why:** Local-first native and web clients must share product data.

**Current state:** Will approved the revised plan at 23:27 (ARCH-18): always keep a database subset plus LRU data cache, synced through the hosted backend. Independent databases shared only through git are dropped. Shared API extraction is approved as the first architecture task after deployment; implementation is not complete.

**Next step:** Rewrite the proposal’s sync section and scope the shared route extraction with a Claude architecture owner; include the required LRU size bound.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead text replies in session 6253ecf2, approximately 21:34–23:34 PDT; queue answers through 23:33:36, current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Notifications and teammate messages excluded from human evidence. Product receipts are lead-reported; this tracker verifies the site build. Existing execution ownership retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-20 23:25 PDT

**What:** Design native hosts through shared service interfaces.

**Why:** Support local repositories while retaining hosted synchronization.

**Current state:** Will’s 23:14 queue answer requests confidence scores, not plan approval. At 23:16 the lead reports Q1 at 50% because independent local data with git-only branch sharing may miss hosted app-data sync; API extraction is 85%. The queued alternative extracts routes now and redesigns Q1 around hosted data sync.

**Next step:** Revise synchronization choice and present recommendations with confidence and reasons; defer native implementation until approved.

**Open questions for Will:** Review revised Q1 and API extraction recommendation; include what would raise confidence below 60%.

Evidence: script-filtered human messages and lead text replies through 23:25 PDT; queue answers through 23:16, current rulings, decisions, proposals and shared briefs/designs. Automated notifications excluded. Product receipts are lead-reported; tracker validation is the site build. Execution owner retained; Codex curates the note.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 21:04 PDT

**What:** Plan a native app from the same product flows with local service Layers.

**Why:** Will requested local repositories and sandboxes with minimal duplicated code and hosted synchronization.

**Current state:** The merged Opus/Sol proposal exists and the 20:57 lead reports it complete. At 20:57:42 the curator confirms it is queued at priority 990 with two questions. Hosted sign-in and server-proxied model calls are already decided by existing rulings; the proposal’s third question is not an unresolved blocker. Electrobun, local Postgres/Electric, Microsandbox and branch-level git sharing remain proposed design choices, not shipped behavior.

**Next step:** Obtain Will’s two decisions, then scope the shared API extraction and real-host walking skeleton accordingly. Keep hosted delivery first until timing is answered.

**Open questions for Will:** Approve an independent local database with branch-level git sharing? Extract the shared API routes now and defer the rest until hosted ship? Both queue recommendations are yes.

Evidence: script-filtered user-typed text and assistant text replies from session 6253ecf2, 19:04–21:04 PDT on 2026-10-20; rulings and queue answers through 19:38 PDT; decisions through 0021, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Later Will text and queue answers prevail. Product receipts are reported evidence; this tracker verifies the site build. Execution ownership retained; reconciliation by Codex tracker curator.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 20:57 PDT

**What:** Design a native app by composing the existing app with local service Layers.

**Why:** Will requested local repositories and sandboxes with minimal new code and hosted synchronization.

**Current state:** The merged Opus/Sol proposal now exists at ../proposals/native-app-by-injection.md. The 20:57 PDT lead update reports it done and being added to the queue at priority 990. It proposes Electrobun/Bun, local Postgres and Electric, Microsandbox, jj repository access and hosted model/auth proxies. Of 21 seams, eight exist, eight need adapters and five are missing. This is a proposed design; no native implementation is complete.

**Next step:** Review the merged proposal and its real-host walking skeleton. Keep hosted delivery first until Will answers timing; extracting shared API routes is a proposal, not a new authorization from this tracker.

**Open questions for Will:** Approve branch-level git sharing with an independent local database? Require hosted sign-in/model proxy initially? Build only the API extraction now and the rest after hosted ship, or prioritize local repositories?

Evidence: script-filtered human messages and lead text replies from session 6253ecf2, approximately 18:57–20:57 PDT; current rulings and queue answers, decisions through 0021, proposals and shared briefs/designs. Transport details additionally use its final builder report. Product checks are reported evidence; this pass runs the maintainer-site build. Execution ownership retained.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 20:24 PDT

**What:** Design a downloadable native app composed from shared flows and host service Layers.

**Why:** Will requested local repositories and sandboxes with minimal duplicated code and hosted synchronization.

**Current state:** Sol’s independent draft native-app-sol.md is now available. It recommends Electrobun with a Bun main process and hosted identity, model, GitHub and sync services; it explicitly identifies missing local repository and offline metadata work. At 20:20 PDT the lead still reports Opus’s independent plan and synthesis waiting for an agent slot. No merged design or implementation receipt exists.

**Next step:** Obtain Opus’s independent design and synthesis, compare adapters and packaging, and review the walking skeleton and sync boundaries. Keep implementation scope separate from this authorized planning work.

**Open questions for Will:** None yet; any concrete choices come from the merged plan.

Evidence: script-filtered user text and assistant replies from session 6253ecf2, approximately 18:24–20:24 PDT; queue answers through 19:38 PDT; rulings, decisions through 0021, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Builder checks are reported evidence; this tracker verifies the maintainer-site build. Existing execution ownership retained.

## Earlier tracker history (retained)


**What:** Plan a downloadable native app using host compositions and local adapters for the same product flows and service interfaces.

**Why:** Will’s Telegram request, quoted in NATIVE-APP-BRIEF.md, asks for local repositories and sandboxes with local-first hosted sync and minimal code through dependency injection.

**Current state:** At 20:13 the lead reports Sol planning underway, with Opus’s independent plan and merge waiting for a slot. The shared brief records the request around 20:14. No merged design, packaging choice or implementation is reported. This authorizes planning; it does not establish a new shipped native product or retire the hosted app.

**Next step:** Map Cloudflare services to existing, small-adapter or missing local implementations; compare Electrobun and a compiled Bun build, signing and updates. Design hosted sync, access and secret boundaries, name differing files and prove no forked product logic. Propose a walking skeleton opening a local repo, running a local sandbox flow and syncing one branch. Treat direct model keys in the brief as a design option requiring reconciliation with ARCH-17.

**Open questions for Will:** None yet; the merged plan may raise at most three concrete questions with recommendations.

Evidence: script-filtered user-typed text and assistant replies in session 6253ecf2, 18:15–20:14 PDT on 2026-10-20; queue answers through 19:38 PDT; current rulings, decisions 0001–0020, proposals, TODOs, rules and shared briefs/designs. Later Will text and queue answers prevail. Product checks are reported receipts; this tracker validates the site build. Execution ownership is retained.
