---
title: Reconcile public support promises after legacy removal
status: done
area: process
owner: Lead and legacy-removal/docs agents; public-policy decision with Will
updated: 2026-10-21 22:43 PDT
links: [../rulings.md, legacy-code-removal.md, docs-truth-pass.md, will-decision-queue.md]
---

## Tracker reconciliation — 2026-10-21 22:43 PDT

**What:** Remove unsupported billing and export/erase promises.

**Why:** Public support text must describe the shipped app.

**Current state:** Will approved removal in the queue at 21:06. At 22:38 the lead confirms SUPPORT.md landed among 31 fixes on main 3b028386; contact routes remain.

**Next step:** Retain the corrected policy; change promises only when those features ship.

**Open questions for Will:** None newly required.

Evidence: script-filtered recent human messages and lead text replies in 6253ecf2, through 22:43 PDT; the supplied continuation path is absent, with continuation-era text in the available session. Current rulings and queue answers prevail. Existing execution ownership retained; Codex curates this note. Reported product receipts were not rerun here. Wiped briefs are not missing work.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 21:34 PDT

**What:** Remove unsupported support promises while keeping contact routes.

**Why:** Public policy must match the current app.

**Current state:** Will approved removal at 21:06. The surviving support report names unpushed commit 77ddb01b0b2a: Pro billing/priority and export/erase promises removed, contact links preserved, link-set and generated-page checks passed. At 21:31 the lead confirms it is queued with the second lander. Full docs validation remains with the batch gate after missing local dependencies.

**Next step:** Collect the batch docs and landing receipts.

**Open questions for Will:** None newly required; existing product decisions and account provisioning remain in their owning workstreams.

Evidence: script-filtered user text and lead replies from the latest approximately two hours across both requested session paths, current rulings and queue answers, and surviving reports where named. Product checks are reported receipts. Implementation owner retained; Codex maintains this tracker entry. Earlier history below is preserved; reboot-wiped briefs are not missing work.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 21:10 PDT

**What:** Remove unsupported Pro billing and export/erase promises while retaining contact routes.

**Why:** Public support text must match shipped capabilities.

**Current state:** Will accepts option 1 on decision:support-md-promises at 21:06. The lead assigns a Codex editing job; completion is not reported.

**Next step:** Finish the authorized SUPPORT.md edit and validate its links.

**Open questions for Will:** None; Will has answered.

Evidence: script-filtered user text and lead replies, 19:06–21:06 PDT; current rulings and queue answers through 21:06; surviving briefs and reports. Product results are reported receipts, not rerun here. Implementation ownership retained; Codex curates documentation. Wiped scratch files are not missing work.

## Earlier tracker history (retained)


**What:** Reconcile SUPPORT.md promises for Pro billing and user data export/erase with the capabilities of the new app.

**Why:** The old Go backend implements those promises and is being removed; current public docs must describe the product that exists.

**Current state:** At 11:09 the lead flags both promises and recommends removing them until the new app ships them, at 80% confidence. This is a recommendation for Will’s queue, not an accepted ruling or a completed edit.

**Next step:** Present the concrete public-policy decision through the existing queue, then update the promises to the settled policy and verify remaining support links after legacy removal.

**Open questions for Will:** Remove the Pro billing and export/erase promises until supported in the new app? Lead recommendation: yes, 80% confidence; no answer found in queue answers.

Evidence: script-filtered user text and lead replies from session 6253ecf2, approximately 09:14–11:14 PDT on 2026-10-21; current rulings (including PROC-21–23), queue answers, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules. Engineering receipts are reported evidence; this refresh validates only the maintainer-site build. Existing implementation owners are retained; Codex curates these notes.

## Builder receipt

Will chose “Remove both promises until the new app ships them; keep the contact routes” in the decision queue on 2026-10-21 at 21:06 PDT (decision:support-md-promises).

SUPPORT.md removes Pro billing and priority-support promises and the account export/erase section. All contact routes and policy links remain. Repository searches found no links to the removed section and no generated copy sourced from SUPPORT.md.

Checks: contact and policy link sets match the original; removed promises are absent; generated support pages pass `sync-support-docs.mjs --check`. No SUPPORT.md projection or removed-section links were found, so docs sync was unnecessary. `pnpm docs:check` ran under heavy.lock but failed because workspace dependencies lack `tinyglobby`. The optional support-matrix test could not start because workspace dependencies lack `yaml`. No library or SDK changes.
