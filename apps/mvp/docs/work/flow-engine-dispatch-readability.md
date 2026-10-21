---
title: FlowEngine Dispatch readability
status: done
area: sdk
owner: lead assigns execution; Codex tracker curator maintains evidence
updated: 2026-10-21 03:34 PDT
links: [flows-as-code-api.md, code-review-guides.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 03:34 PDT

**What:** Simplify Dispatch.ts and make.ts.

**Why:** Will requested less complexity and nesting before reviewing these files.

**Current state:** The 03:28 PDT lead receipt places Dispatch and make on main at cf6bd457 together with the second engine round. The combined engine suite passes 604/604 at full coverage with unchanged public types.

**Next step:** Retain the landed revision and validation evidence; regenerate guides against that revision when the queue can serve it.

**Open questions for Will:** None new.

Evidence: script-filtered user-typed text and lead replies from session 6253ecf2, 01:33–03:33 PDT; synthetic notifications, teammate messages and tool content excluded. Rulings and queue answers through 01:19 PDT supersede historical briefs, panel designs, decisions, proposals, TODOs and rules. Product validation and landing are lead-reported; Codex curates this documentation and runs only the site build. Execution ownership retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 03:14 PDT

**What:** Simplify Dispatch.ts and make.ts while preserving engine behavior.

**Why:** Will requested less complexity and nesting before reviewing these files.

**Current state:** At 03:09 PDT the lead reports the shared checkout rebased and the lander waiting for engine test suites before pushing the readability commits. No pushed revision for this round is reported.

**Next step:** Obtain the engine suite and push receipts, then refresh the requested engine review guides.

**Open questions for Will:** None new. The existing review-format question remains pending; the every-file review ruling still applies.

Evidence: script-extracted user text and lead replies, 08:13–10:13 UTC on 2026-10-21 (01:13–03:13 PDT); current rulings and queue answers take precedence over briefs and designs. Execution owners and status retained. Product receipts are lead-reported; this tracker validates only the maintainer-site build.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 02:24 PDT

**What:** Simplify Dispatch.ts and make.ts and return them for review.

**Why:** Will rejected their complexity before reviewing them.

**Current state:** The first round has the reported 585/585 tests, full coverage, byte-identical public types and 38 caught deliberate alterations. The 02:17 lead update clarifies that both engine readability rounds land after deployment; the pushed combined round alone did not clear that ordering prerequisite. No refactor landing receipt is reported.

**Next step:** After deployment, land the first round before the second, then regenerate the two guides.

**Open questions for Will:** None.

Evidence: lead text replies through 02:23 PDT in session 6253ecf2, extracted by script from the latest two hours with automated notifications and tool content excluded; current rulings and queue answers through 01:19 PDT, shared briefs/designs, decisions, proposals, TODOs and rules. Product checks are reported receipts; this tracker runs only the maintainer-site build. Execution ownership and earlier history retained. Documentation curator: Codex.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 02:14 PDT

**What:** Simplify Dispatch.ts and make.ts without changing behavior.

**Why:** Will rejected their function length and nesting.

**Current state:** The 01:01 lead receipt reports byte-identical public types, 585/585 engine tests at full coverage and 38 deliberate alterations caught by tests. Round 4c/4d landed at 01:49, clearing the originally stated ordering prerequisite. No later receipt establishes that this separate refactor landed.

**Next step:** Obtain the isolated refactor landing receipt, then regenerate both guides against its landed revision.

**Open questions for Will:** None.

Evidence: user-typed text and lead replies extracted by script from the last two session hours through 02:13 PDT; automated notifications and tool content excluded. Current rulings and queue answers through 01:19 PDT override historical briefs, panels, decisions and proposals. Product checks are lead-reported receipts; this tracker runs the site build only. Execution ownership and earlier history retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 01:05 PDT

**What:** Simplify Dispatch.ts and make.ts for review.

**Why:** Will rejected their complexity and nesting.

**Current state:** At 01:01 the lead reports the refactor complete with byte-identical public types and 585/585 engine tests at full coverage. Longest functions fell from 277 to 47 and 204 to 27 lines; indentation fell from 8 to 5 and 15 to 5. Each rewritten branch was altered 38 times and every alteration failed a test. Landing follows the combined round; no push receipt yet.

**Next step:** Land the isolated change after round 4, then refresh both guides against the landed revision.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies from session 6253ecf2, latest two hours through 01:04 PDT; current rulings, queue answers, shared briefs/designs, decisions, proposals, TODOs and rules. Product checks are lead-reported, not executed by this tracker. Execution owners retained; Codex curates documentation only.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 00:14 PDT

**What:** Simplify Dispatch.ts and make.ts as one engine readability workstream.

**Why:** Will rejected both files for complexity and nesting before review.

**Current state:** At 00:07 the lead started an Opus agent on both files in an isolated jj workspace, superseding the earlier after-deploy schedule. Both slices are withheld until simplified and re-guided; no completed refactor is reported.

**Next step:** Flatten control flow, extract clear functions and remove Effect-only indirection while preserving API and behavior. Report longest function and deepest nesting before/after; retain green tests and full coverage.

**Open questions for Will:** None.

Evidence: script-filtered user text and lead replies through 00:13 PDT; queue answers through 00:10 PDT, current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Product checks are reported receipts; tracker validation is the site build. Execution ownership retained; Codex curates documentation only.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 00:06 PDT

**What:** Simplify FlowEngine Dispatch code for review.

**Why:** Will’s 00:05:23 queue answer says it is complex and hard to read before review.

**Current state:** The queue requests readability changes to packages/smithers/flows/engine/src/FlowEngine/Dispatch.ts at reviewed revision 5a75c229. No assignment, fix or passing checks are established by the extracted lead replies.

**Next step:** Lead assigns a focused readability refactor preserving durable dispatch behavior, cancellation, fencing and recovery; run the engine’s behavioral checks and refresh the review guide.

**Open questions for Will:** None.

Evidence: script-filtered human text and lead replies from the last two session hours, through 00:05 PDT; queue answers through 00:05:48 PDT; current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Product checks are reported receipts, not checks executed by this tracker. Existing execution owners and history retained; Codex curates documentation only.
