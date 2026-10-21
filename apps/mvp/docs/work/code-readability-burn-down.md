---
title: Code readability burn-down
status: in-progress
area: sdk
owner: lead assigns Opus for engine/core and Codex Sol for simpler app code
updated: 2026-10-21 04:54 PDT
links: [queue-recorded-revision-source.md, engine-store-readability.md, flow-interpreter-graph-readability.md, engine-core-readability.md, code-review-guides.md, flow-engine-dispatch-readability.md, queue-review-quality-gate.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 04:54 PDT

**What:** Complete the readability rewrites and return revision-matched code for review.

**Why:** Will needs readable code and accurate guides before reviewing every file.

**Current state:** Engine and flow rewrites remain landed at cf6bd457. At 04:48 PDT the lead reports engine-store’s five-file rewrite complete with unchanged public types and SQL, 4,322 passing SQLite/Postgres tests at full coverage, and 22 mutation-backed regression tests; landing remains pending. At 04:24 the API baseline and commit-based queue source were also finished and with the lander, with no completed landing or live queue activation receipt. The older statement that engine-store has no completion evidence is superseded.

**Next step:** Finish landing the validated batches, activate commit-based queue source and refresh slices and guides against their actual revisions. Track engine-store’s untouched inertJson helper and long SQL-query functions in engine-store-readability.md. Preserve existing review requirements while question 945 remains unanswered.

**Open questions for Will:** Existing review-format question 945 remains unanswered; no new question.

Evidence: lead text replies at 04:24 and 04:48 PDT, script-extracted from session 6253ecf2’s latest approximately two hours (02:53–04:53 PDT). No user-typed text appears in that window; synthetic notifications and tool content are excluded. Rulings and Will’s queue answers override historical briefs, panels, decisions, proposals, TODOs and rules. Validation is lead-reported; this tracker runs only the maintainer-site build. Execution ownership retained; Codex curates documentation.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 03:34 PDT

**What:** Finish readability work and return accurate code slices for review.

**Why:** Readable code and revision-matched guides make every-file review meaningful.

**Current state:** The 03:28 PDT lead reports the engine and flow rewrites landed at cf6bd457: engine 604/604 and flow 903/903, full coverage and unchanged public types. Engine-store simplification remains independently in progress without a completion receipt. At 03:31 the lead says the shared checkout still has old source for eight rewritten files among 916 changed files; its Interpreter edit conflicts with the rewrite, so another rebase is deferred.

**Next step:** Finish engine-store work, refresh the 12-package API baseline, and serve review slices at recorded revisions before regenerating guides. Keep the existing every-file review requirement until Will changes it.

**Open questions for Will:** Existing review-format question 945 remains unanswered; no new question.

Evidence: script-filtered user-typed text and lead replies from session 6253ecf2, 01:33–03:33 PDT; synthetic notifications, teammate messages and tool content excluded. Rulings and queue answers through 01:19 PDT supersede historical briefs, panel designs, decisions, proposals, TODOs and rules. Product validation and landing are lead-reported; Codex curates this documentation and runs only the site build. Execution ownership retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 03:24 PDT

**What:** Land the engine and flow readability rounds and refresh their review material.

**Why:** Keep durable execution understandable without changing behavior or persisted-history compatibility.

**Current state:** The flow rewrite now has the lead’s 03:14 receipt: 903/903 tests, 100% coverage, unchanged public types and remote mutation checks. Both engine rounds and the flow rewrite are being combined with fixes for lint and formatting failures left by round-4 flow metrics. At 03:23 the lander still waits for the API baseline and engine-store suite. This is validation in progress, not a landing receipt. The review-format queue question remains unanswered.

**Next step:** Obtain the final API and engine-store results, land the validated changes and regenerate guides. Preserve every-file review until Will changes that ruling.

**Open questions for Will:** None new.

Evidence: lead text replies through 03:23 PDT, script-extracted from the latest approximately two session hours; synthetic user messages, teammate reports and tool content are excluded as human evidence. Current rulings and queue answers supersede historical briefs, designs, decisions, proposals, TODOs and rules. Product checks are lead-reported; this tracker verifies the site build. Execution ownership retained; Codex curates documentation.

## Earlier tracker history (retained)

## Tracker reconciliation — 2026-10-21 02:24 PDT

**What:** Simplify unreadable code before guided review.

**Why:** Reduce long functions and deeply nested control flow while preserving behavior.

**Current state:** At 02:17 the second engine round is reported complete with 604 tests passing at full coverage and unchanged public types. Both engine rounds await landing after deployment. Two new Opus agents are working in separate workspaces on engine-store and flow; their work has no completion receipt. The next 80 guides remain held; the every-file review rule still stands while queue item 945 is unanswered.

**Next step:** Land the validated engine rounds after deployment; track and validate the new engine-store and flow rewrites separately, then regenerate revision-specific guides.

**Open questions for Will:** Review format remains pending in the existing queue item; no new question.

Evidence: lead text replies through 02:23 PDT in session 6253ecf2, extracted by script from the latest two hours with automated notifications and tool content excluded; current rulings and queue answers through 01:19 PDT, shared briefs/designs, decisions, proposals, TODOs and rules. Product checks are reported receipts; this tracker runs only the maintainer-site build. Execution ownership and earlier history retained. Documentation curator: Codex.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 02:14 PDT

**What:** Simplify unreadable slices before guided review.

**Why:** Will needs readable code and useful review evidence.

**Current state:** The second Opus engine pass remains active in the 02:13 lead update. Track its four files separately in engine-core-readability.md. The first Dispatch/make pass has test proof but no reported landing receipt. The next 80 guides remain held while the review-format question at priority 945 awaits Will; the earlier every-file requirement still applies.

**Next step:** Finish and validate the second pass, land the engine changes in dependency order, and re-guide the requested engine files.

**Open questions for Will:** Review format remains pending in the existing queue item; no new question.

Evidence: user-typed text and lead replies extracted by script from the last two session hours through 02:13 PDT; automated notifications and tool content excluded. Current rulings and queue answers through 01:19 PDT override historical briefs, panels, decisions and proposals. Product checks are lead-reported receipts; this tracker runs the site build only. Execution ownership and earlier history retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 01:24 PDT

**What:** Simplify held code before guided review.

**Why:** Will rejected excessive function length and nesting.

**Current state:** The lead reports Dispatch.ts and make.ts passing 585/585 engine tests at full coverage with unchanged public types; landing follows the combined round. A second Opus agent is simplifying layerMemory.ts, Trampoline.ts, Placed.ts and Round.ts, stacked on that rewrite. No second-lane completion is reported.

**Next step:** Finish and validate the second rewrite, land in order, and regenerate revision-specific guides.

**Open questions for Will:** None.

Evidence: script-filtered human messages and lead text replies from session 6253ecf2, approximately 23:24–01:24 PDT; current rulings and queue answers through 01:19 PDT; shared briefs/designs, decisions, proposals, TODOs and rules. Product results are reported receipts. Execution owners retained; Codex curates tracker documentation only. Later rulings supersede earlier history.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 01:05 PDT

**What:** Simplify held code slices and regenerate guides.

**Why:** Will needs readable code before review.

**Current state:** At 01:01 a second Opus agent is actively simplifying layerMemory.ts, Trampoline.ts, Placed.ts and Round.ts, stacked on the Dispatch/make refactor. The broader 87-slice list remains; starting these four does not complete it.

**Next step:** Finish the second engine pass with behavior, coverage and API checks; land in order and refresh exact-revision guides. Assign the remaining slices under PROC-18.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies from session 6253ecf2, latest two hours through 01:04 PDT; current rulings, queue answers, shared briefs/designs, decisions, proposals, TODOs and rules. Product checks are lead-reported, not executed by this tracker. Execution owners retained; Codex curates documentation only.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 00:34 PDT

**What:** Simplify held code slices before refreshing their review guides.

**Why:** Reviewers need clear functions, naming and control flow.

**Current state:** At 00:28 the lead reports 87 slices on the simplify-first list, superseding 69 at 00:22. Dispatch.ts and make.ts remain a separate active isolated refactor. The 00:31 usage-limit update leaves that refactor in progress with no completion receipt.

**Next step:** After deployment, assign the remaining slices under PROC-18, preserve behavior and coverage, and regenerate guides for exact revised code.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies from session 6253ecf2, latest two hours through 00:33 PDT; current rulings and queue answers through 00:17:42 PDT, decisions, proposals, TODOs, rules and shared briefs/designs. Product checks are lead-reported receipts; this tracker runs the maintainer-site build. Execution owners and all prior history retained; Codex curates documentation only.

## Earlier tracker history (retained)


**What:** Simplify code slices held by the readability gate.

**Why:** Reviews need understandable functions, nesting, names and concepts.

**Current state:** At 00:22 the lead reports 69 held slices after 40 more failed readability assessment. This supersedes the initial 27. Dispatch.ts/make.ts already have a separate active Opus workstream; the broader pass follows deploy.

**Next step:** Assign isolated jj workspaces, preserve behavior and coverage, then refresh guides against exact changed revisions.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies from session 6253ecf2, latest two hours through 00:23 PDT; queue answers through 00:17 PDT; rulings, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules. Product receipts are reported evidence, not new tracker-run tests. Execution owners retained; documentation reconciled by Codex tracker curator.
