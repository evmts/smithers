---
title: Repo open states (what each URL shows)
status: in-progress
area: app
owner: four-model repository-pages repair panel; Opus synthesis and build assigned by lead
updated: 2026-10-21 16:04 PDT
links: [../decisions/0006-repo-clone-and-view.md, ../decisions/0008-auth.md]
---

## Tracker reconciliation — 2026-10-21 16:04 PDT

**What:** Show truthful missing and inaccessible repository outcomes promptly.

**Why:** People must know whether a repository can actually be opened.

**Current state:** At 14:51 straightforward repository repairs move to Codex Sol: selectors, the immediate Not found header, and refusal tests. The panel separately identifies a deployment-wide journal lock delaying missing-repository results 42–198 seconds; its SDK repair has a separate owner. This moves the work from design into implementation; no passing acceptance receipt is reported.

**Next step:** Prove absent, inaccessible and signed-out outcomes; coordinate the journal fix without treating immediate header feedback as completed cloning.

**Open questions for Will:** None newly identified; unresolved questions in the retained history remain open.

Evidence: script-filtered user text and lead assistant replies from session 6253ecf2, approximately 14:03–16:03 PDT on 2026-10-21. Tool records, relayed agent messages, automation prompts and compaction summaries excluded. Rulings and queue answers prevail over shared briefs, panel designs and older planning docs. Product checks are lead-reported; this refresh verifies the maintainer-site build. Engineering ownership retained; documentation reconciliation by Codex.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 14:05 PDT

**What:** Show truthful missing and inaccessible repository states.

**Why:** GH-4 requires an honest result when a repository cannot be opened.

**Current state:** At 14:01 PDT the lead assigns the missing Not found journey to the repository-pages panel, alongside HTML/raw failures. Three confirmed findings are held for this panel at 14:03; no repair receipt exists.

**Next step:** Repair after panel diagnosis and prove absent, inaccessible and signed-out states locally and in production.

**Open questions for Will:** None.

Evidence: user-typed text and lead text replies extracted by script from session 6253ecf2 for approximately 12:04–14:04 PDT on 2026-10-21; synthetic notifications and tool records excluded. Rulings and queue answers override historical briefs, designs, decisions, proposals, TODOs and rules. Product receipts are lead-reported; this tracker validates the maintainer-site build only. Engineering owners remain responsible; Codex owns this documentation reconciliation.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 13:38 PDT

**What:** Show truthful repository open states, including Not found.

**Why:** GH-4 requires an honest result for absent or inaccessible repositories.

**Current state:** At 13:15 PDT the lead reports the production missing-repository journey never shows Not found. The production harness is being repaired and failures rerun; no individual repair assignment or passing receipt is reported.

**Next step:** Preserve the failing journey, confirm it after the harness rerun, then assign the repair and prove missing, inaccessible and signed-out outcomes.

**Open questions for Will:** None.

Evidence: lead text replies extracted by script from session 6253ecf2, 11:37–13:37 PDT on 2026-10-21. Automated notifications and tool records excluded. Rulings and queue answers override historical briefs, panel designs, decisions, proposals, TODOs and rules. Product results are lead-reported. Existing execution owners retained; Codex owns tracker reconciliation only.

## Earlier tracker history (retained)


## What

What `/owner/repo` shows in every case, never claiming an import that didn't happen (spec M-46):
1. Imported and our App installed: it opens, and people with access can ask for changes.
2. Public, App not installed: clone and view it; most features wait for the App or a fork into the person's account.
3. Private or missing while signed out: one "Not found" that offers sign-in, since we can't tell them apart.
4. App on the org but not on this repo: link to that App setting. Org needs owner approval: say so.
5. Renamed on GitHub: follow the redirect. Made private or deleted after cloning: stop showing our copy to people without access.
6. GitHub down or rate-limiting us: say so, and keep working on repos already imported.

## Why

Will: "if github is down we should show some UI that mentions github is down and smithers will continue to work for repos that are already imported. Same for rate limiting." "Our server should support anything that github supports?" "we would have no idea of knowing if the repo is truly 404 or if it's private unless we were signed in."

## State

Spec only. Case 2 is [feature 2](repo-clone-and-view.md)'s first slice; cases 3 to 5 need [auth](auth.md).

## Next

One live e2e test per case, written failing first.

## Questions for Will

None.
