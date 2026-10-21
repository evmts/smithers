---
title: Simplify the remaining engine core files
status: done
area: sdk
owner: second Opus engine simplification agent assigned by lead
updated: 2026-10-21 03:34 PDT
links: [flow-engine-dispatch-readability.md, code-readability-burn-down.md, code-review-guides.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 03:34 PDT

**What:** Simplify layerMemory.ts, Trampoline.ts, Placed.ts and Round.ts.

**Why:** Make durable execution readable without changing its public behavior.

**Current state:** At 03:28 PDT the lead reports both engine rounds landed on main at cf6bd457. The engine passes 604/604 tests at full coverage and public types are unchanged. This supersedes the pending-suite and pending-landing reports.

**Next step:** Retain validation receipts; refresh review material through the recorded-revision queue fix. Guide writing remains paused on the existing review-policy question.

**Open questions for Will:** None new.

Evidence: script-filtered user-typed text and lead replies from session 6253ecf2, 01:33–03:33 PDT; synthetic notifications, teammate messages and tool content excluded. Rulings and queue answers through 01:19 PDT supersede historical briefs, panel designs, decisions, proposals, TODOs and rules. Product validation and landing are lead-reported; Codex curates this documentation and runs only the site build. Execution ownership retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 03:24 PDT

**What:** Simplify layerMemory.ts, Trampoline.ts, Placed.ts and Round.ts while preserving behavior.

**Why:** Make the durable engine implementation readable before review.

**Current state:** The second round retains its reported 604-test, full-coverage and byte-identical-public-types evidence. At 03:14 the lead says the engine-store suite is slow under MacBook load. At 03:23 the combined readability landing still waits on that suite and the API baseline. No failure or pushed revision is reported.

**Next step:** Finish both pending checks, record the pushed revision and regenerate review guides.

**Open questions for Will:** None new.

Evidence: lead text replies through 03:23 PDT, script-extracted from the latest approximately two session hours; synthetic user messages, teammate reports and tool content are excluded as human evidence. Current rulings and queue answers supersede historical briefs, designs, decisions, proposals, TODOs and rules. Product checks are lead-reported; this tracker verifies the site build. Execution ownership retained; Codex curates documentation.

## Earlier tracker history (retained)

## Tracker reconciliation — 2026-10-21 03:14 PDT

**What:** Simplify layerMemory.ts, Trampoline.ts, Placed.ts and Round.ts without changing public behavior.

**Why:** Make durable engine code readable before Will reviews it.

**Current state:** The completed second round retains its reported 604-test/full-coverage and byte-identical-public-types evidence. At 03:09 PDT the lander waits on engine suites before pushing both rounds; completion of the rewrite does not establish landing.

**Next step:** Finish landing validation, record the pushed revision and regenerate guides against that revision.

**Open questions for Will:** None new. The existing review-format question remains pending; the every-file review ruling still applies.

Evidence: script-extracted user text and lead replies, 08:13–10:13 UTC on 2026-10-21 (01:13–03:13 PDT); current rulings and queue answers take precedence over briefs and designs. Execution owners and status retained. Product receipts are lead-reported; this tracker validates only the maintainer-site build.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 03:04 PDT

**Current state:** At 02:56 PDT the lead assigned the lander to land both completed engine readability rounds after rebasing onto new main. The 604-test/full-coverage receipt remains builder-reported; no landing receipt appears through 03:03 PDT.

**Next step:** Obtain the landed revision and regenerate guides for review; preserve public types and behavioral validation.

**Open questions for Will:** None new; existing unresolved questions remain in the retained history.

Evidence: lead text replies through 03:03 PDT, extracted by script from the latest approximately two session hours; automated notifications and tool blocks excluded. Current rulings and queue answers take precedence over briefs and designs. Execution ownership retained; documentation reconciled by Codex tracker curator. Product receipts are reported, not independently rerun here.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 02:24 PDT

**What:** Simplify layerMemory.ts, Trampoline.ts, Placed.ts and Round.ts without changing behavior.

**Why:** Make the remaining engine core readable before review.

**Current state:** At 02:17 the lead reports the second round complete in four commits: longest functions are now 25, 40, 15 and 21 lines respectively; deepest nesting is 4, 4, 4 and 3. Public types are byte-identical; all 604 tests pass at full coverage. Both readability rounds still wait for the deployment before landing. Status stays in-progress until landing and refreshed review evidence.

**Next step:** Land both rounds in order after deployment, then regenerate guides against the landed revisions.

**Open questions for Will:** None.

Evidence: lead text replies through 02:23 PDT in session 6253ecf2, extracted by script from the latest two hours with automated notifications and tool content excluded; current rulings and queue answers through 01:19 PDT, shared briefs/designs, decisions, proposals, TODOs and rules. Product checks are reported receipts; this tracker runs only the maintainer-site build. Execution ownership and earlier history retained. Documentation curator: Codex.

## Earlier tracker history (retained)


**What:** Simplify layerMemory.ts, Trampoline.ts, Placed.ts and Round.ts, stacked on the Dispatch/make rewrite.

**Why:** The first pass identified the same readability problem elsewhere; layerMemory.ts has a reported 570-line function nested 11 levels deep.

**Current state:** The lead started this second pass by 01:01 and confirms the engine-simplification agent still working at 02:13. No completion, test or landing receipt for these four files is reported. The first pass's 585-test receipt does not prove this second pass.

**Next step:** Finish the rewrite, demonstrate unchanged public behavior with the engine suite, coverage and deliberate branch alterations, then land after its prerequisite and regenerate guides.

**Open questions for Will:** None. Requested engine rewrites still return for review while the broader review-format question is pending.

Evidence: user-typed text and lead replies extracted by script from the last two session hours through 02:13 PDT; automated notifications and tool content excluded. Current rulings and queue answers through 01:19 PDT override historical briefs, panels, decisions and proposals. Product checks are lead-reported receipts; this tracker runs the site build only. Execution ownership and earlier history retained.
