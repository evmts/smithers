---
title: Durable external effects without guessed crash recovery
status: in-progress
area: sdk
owner: Codex tracker (documentation); Opus and Codex Sol design assigned by lead
updated: 2026-10-21 17:14 PDT
links: [../rulings.md, everything-is-a-durable-flow.md, vibelang-coding-factory.md, code-reviews.md, cloudflare-flow-host.md]
---

## Tracker reconciliation — 2026-10-21 17:14 PDT

**What:** Recover external writes through durable action identities.

**Why:** Avoid duplicating a write after its response is lost.

**Current state:** Foundation is on main 60ababaa. At 17:10 the lead says plan-core’s three replacement commits supersede durable-effects’ final commit; the lander drops that old commit. Final retry/key work is not a completed landing.

**Next step:** Track replacement validation in planner-core-replay-ordering.md and model-step.md; collect dependent production receipts.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies in session 6253ecf2, approximately 15:14–17:14 PDT. Notifications, relayed agents, tools and compaction summaries excluded. Rulings and queue answers supersede older briefs/designs and docs. Execution owner retained; Codex curates the tracker only. Product results are lead-reported.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 16:33 PDT

**What:** Recover external writes through durable action identities.

**Why:** The landed foundation and remaining model retry work need separate receipts.

**Current state:** At 16:29 and 16:33 PDT the lead identifies main as 60ababaa with durable-effects landed. The final model-call retry piece remains written but waiting on tests and landing; the plan-core builder owns rebasing its last commit onto action-key versioning. A deploy of main is reported underway, without a completion receipt.

**Next step:** Finish model-step.md validation and landing, then collect deployment and dependent steering/dogfood acceptance receipts.

**Open questions for Will:** None.

Evidence: lead text replies in session 6253ecf2, script-filtered through 16:33 PDT from its latest two hours; automated notifications, tool records and compaction summaries excluded. Rulings and queue answers take precedence over historical briefs. Implementation ownership retained; Codex curates tracker documentation. Product results are lead-reported.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 15:54 PDT

**What:** Recover external writes through stable durable identities.

**Why:** Dependent steering and Dogfood work need the SDK repair landed.

**Current state:** At 15:50 and 15:52 the lead reports durable-effects on main and dependents rebasing. This supersedes the earlier queued stack. No new deployed acceptance receipt is reported.

**Next step:** Verify the landed revision and deploy receipts; finish dependent steering and Dogfood acceptance.

**Open questions for Will:** None newly identified; unresolved questions in the retained history remain open.

Evidence: script-filtered lead text replies in session 6253ecf2, latest approximately two hours through 15:53 PDT. Automated notifications, tool content and compaction summaries excluded. Rulings and queue answers prevail over historical briefs. Implementation ownership retained; Codex maintains these notes. Product receipts are lead-reported; this refresh verifies the site build.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 14:54 PDT

**What:** Recover outside writes through stable engine identities.

**Why:** Crash recovery must not adopt unrelated writes.

**Current state:** The 19-commit durable-effects stack remains queued as of 14:52 while main waits for VibeLang. At 14:41 reader/writer conflict ordering moves to a separate planner/core builder, rather than remaining assigned here.

**Next step:** Land and verify the effects stack, then dependent steering/dogfood; track planner ordering in planner-core-replay-ordering.md.

**Open questions for Will:** None for this repair. Existing pending decisions remain in the retained history.

Evidence: script-extracted user-typed text and lead replies from session 6253ecf2, 12:54–14:54 PDT; automated notifications excluded. Rulings and queue answers govern over historical briefs and proposals. Product receipts are lead-reported; this pass verifies only the maintainer-site build. Implementation owners remain assigned; Codex maintains tracker documentation.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 14:35 PDT

**What:** Make outside writes and flow ordering recoverable through the engine.

**Why:** DUR-8 forbids guessed recovery and readers must finish before dependent writers.

**Current state:** The queue repair and comment/check keys are validated and queued; model retries and step-key compatibility remain next. At 14:33 a newly confirmed planner bug goes to this builder: a writer can run before an earlier reader finishes. No landing completion is reported.

**Next step:** Retain an ordering regression and repair planner dependencies alongside queued durable-effects work; finish replay compatibility and collect landing/deploy receipts.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies, approximately 12:34–14:34 PDT on 2026-10-21, session 6253ecf2. Automated notifications, tool records and generated summaries excluded. Current rulings and queue answers prevail over historical briefs/designs and planning docs. Product receipts are lead-reported; this pass verifies the maintainer-site build only. Existing engineering ownership retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 14:23 PDT

**What:** Give external writes exact durable identities and engine-owned recovery.

**Why:** DUR-8 forbids guessed write recovery; DUR-2 keeps retries in the engine.

**Current state:** At 14:20 the durable-queue repair and comment/check-run key changes join the durable-effects landing stack. Queue crash tests and the flow suite report 912/912 at 100% coverage. Model retries and old step-key encoding remain the builder’s next work. At 14:22 the lander keeps checking this stack during the VibeLang push hold; no completed landing is reported.

**Next step:** Finish model retry/usage and replay compatibility repairs, land the ordered stack after the hold, and retain PostgreSQL/docs validation receipts.

**Open questions for Will:** None newly identified; existing decisions remain with their owning notes.

Evidence: lead text replies at 14:20–14:23 PDT on 2026-10-21, extracted by script from session 6253ecf2 within its latest approximately two hours (12:23–14:23 PDT). Automated notifications, tool blocks and relayed agent messages excluded. Current rulings and Will’s queue answers take precedence over historical briefs and designs. Product results are lead-reported; this tracker verifies the site build. Engineering ownership is retained; Codex maintains these notes.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 14:05 PDT

**What:** Replace guessed recovery with durable identities and engine-owned retry state.

**Why:** DUR-8 requires exact external-write recovery and DUR-2 forbids independent recovery loops.

**Current state:** The 19-commit conversion stack remains queued in the latest lead report. The builder also owns durable-queue recovery. At 14:03 two more findings are assigned here: model retries lose count/failed-attempt usage on restart, and finished-step key encoding changes can break old replay. A separate five-finding engine fix is going to the lander, not yet reported landed.

**Next step:** Land and verify conversions, finish remaining consumers and PostgreSQL/docs checks, and repair queue/model replay with retained crash regressions.

**Open questions for Will:** None.

Evidence: user-typed text and lead text replies extracted by script from session 6253ecf2 for approximately 12:04–14:04 PDT on 2026-10-21; synthetic notifications and tool records excluded. Rulings and queue answers override historical briefs, designs, decisions, proposals, TODOs and rules. Product receipts are lead-reported; this tracker validates the maintainer-site build only. Engineering owners remain responsible; Codex owns this documentation reconciliation.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 13:54 PDT

**What:** Replace guessed recovery with durable external-write identities.

**Why:** DUR-8 requires exact recovery; DUR-2 keeps retries in the engine.

**Current state:** The 19-commit conversion stack remains queued in the latest implementation report. At 13:49 review also finds durable queue bugs: failed result persistence can rerun a completed job, exhausted retries leave its caller waiting, and recovery has a handwritten retry loop. The lead assigns these to the durable-effects builder; see durable-queue-recovery.md. No complete migration or landing receipt is reported.

**Next step:** Land the conversion stack, finish remaining GitHub consumers and outstanding PostgreSQL/docs checks, and repair queue recovery with retained crash and terminal-failure regressions.

**Open questions for Will:** None.

Evidence: lead text replies at 13:44–13:53 PDT on 2026-10-21, extracted by script from session 6253ecf2 within its latest approximately two hours. Automated notifications, relayed agent messages and tool content are excluded. Rulings and queue answers take precedence over historical briefs and designs. Results are lead-reported; this tracker verifies the maintainer-site build. Existing implementation ownership is retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 13:44 PDT

**What:** Replace guessed recovery with SDK-owned external-write identities.

**Why:** DUR-8 requires exact recovery of the object a step created.

**Current state:** At 13:43 PDT ten more commits cover checks, triage, CLI stack operations, branch-name collision refusal, keyed sandbox merges, declared at-least-once spend alerts and stronger lint. All 19 commits are queued together; GitHub issue writes and merges remain with their existing builder. Earlier 912/912 flow tests and shared-database crash tests do not establish PostgreSQL coverage or complete migration.

**Next step:** Land the 19-commit stack, finish remaining GitHub consumers and outstanding PostgreSQL/docs checks, then unblock steering and dogfood.

**Open questions for Will:** None.

Evidence: script-filtered user-typed messages and lead text replies from session 6253ecf2, approximately 11:44–13:44 PDT; automated notifications and tool content excluded. Rulings and queue answers govern over historical briefs, panel designs, decisions, proposals, TODOs and rules. Product receipts are lead-reported; this pass validates the site build only. Existing execution owners retained; Codex curates tracker documentation.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 12:54 PDT

**What:** Move external mutations onto SDK-owned durable effect identities.

**Why:** DUR-8 forbids recovery that guesses which outside object a prior attempt created.

**Current state:** At 12:48 PDT the lead reports Action.once built, with step-derived keys carried on commits, PRs and branches. Effects unable to carry a key use an at-most-once step. TODO creation and issue triage are converted, with a rule against new handwritten recovery. Reported validation: flow suite 912/912 at 100% coverage and crash tests across two engine instances sharing one database. Nine commits are queued; PostgreSQL crash tests, docs:check and docs-index generation have not run. The design inventoried 28 conversion sites, and remaining conversions are now underway. The lead’s “done” describes the building block and first users, not this complete migration.

**Next step:** Land the SDK and first consumers, run outstanding checks, then convert the remaining inventoried writes; coordinate merge/GitHub changes with their current builder. Close this workstream only with the complete migration and receipts.

**Open questions for Will:** None.

Evidence: script-filtered human text and lead replies for the latest approximately two hours of session 6253ecf2 through 12:54 PDT; automated notifications, relayed agents and tool blocks excluded. Current rulings and queue answers govern over older briefs, panels, decisions, proposals, TODOs and rules. Product receipts are lead-reported; Codex curates tracker documentation and runs the site build. Existing execution owners are retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 12:46 PDT

**What:** Give external mutations exact durable identity through the SDK.

**Why:** DUR-8 rejects guessed commit recovery after a crash.

**Current state:** At 12:38 the lead reports the eight-commit implementation finished: a durable external step records its result under its own key; TODO branch/commit/PR creation and issue triage use it, and a lint rule flags hand-written recovery. The stranger-commit regression fails on main and passes with the fix. The stack is next with the lander, ahead of steering, stacked PRs and the Mac mini runner. No landing or production receipt is reported.

**Next step:** Land the tested stack first, retain its SDK/tests/lint/proposal receipts, then coordinate dependent TODO-flow changes and deployment after checking for active runs.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies, approximately 10:44–12:44 PDT on 2026-10-21, session 6253ecf2; synthetic notifications, relayed agents and tool blocks excluded. Rulings and queue answers govern over shared briefs/designs and historical decisions, proposals, TODOs and rules. Product receipts are lead-reported; Codex curates documentation and validates the site build. Existing execution ownership is retained.

## Earlier tracker history (retained)

## Tracker reconciliation — 2026-10-21 12:28 PDT

**What:** Give external mutations exact durable identity through the SDK.

**Why:** DUR-8 rejects guessed commit recovery after a crash.

**Current state:** At 12:00 the TODO branch, commit and PR exact-result recovery changes are in final Mac mini tests, including rejecting a stranger’s matching-title commit and bumping affected step versions. At 12:21 the lead still lists this work awaiting landing/final tests; no newer completion receipt appears.

**Next step:** Obtain final tests and commit receipt, land SDK and TODO changes, then coordinate ordered deployment and active-run checks.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies, approximately 10:28–12:28 PDT, session 6253ecf2; rulings and queue answers govern over historical briefs, designs, decisions, proposals, TODOs and rules. Product results are lead-reported. Existing engineering ownership is retained; Codex curates tracker documentation and validates the site build.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 12:04 PDT

**What:** Give external mutations exact, durable result identity through the Smithers SDK, starting with TODO branch, commit and pull-request publication.

**Why:** DUR-8 calls for eliminating guessed recovery after a crash; a matching title and author cannot establish ownership.

**Current state:** At 12:00 PDT the lead reports implementation is on its final Mac mini test run. TODO branch, commit and pull-request creation each record the exact result and recover that same result after a crash. A regression rejects a stranger’s commit with the same title. Affected step versions were bumped so a run crossing the deploy stops cleanly rather than replaying incompatible steps. No commit, completed final test run or production receipt is reported. The proposed shared-checkout proposal file remains absent.

**Next step:** Obtain the final test and commit receipts, land the SDK and TODO changes, and coordinate the ordered TODO-flow deployment after checking for active runs. Retain the collision regression, crash-before-receipt evidence and documented recovery limits. Record the merged design in the owning docs when it lands.

**Open questions for Will:** None currently; raise any provider or durability tradeoff only when the design requires Will’s choice.

Evidence: user-typed text and lead replies extracted by script from session 6253ecf2, 10:03–12:03 PDT; current rulings and queue answers override historical briefs and design records. Product receipts are lead-reported; tracker verification is the maintainer-site build. Existing engineering owners remain assigned; Codex curates this note only.

## Earlier tracker history (retained)

**What:** Give external effects stable identity and explicit recovery through the Smithers SDK, beginning with TODO commit publication.

**Why:** DUR-8: Will’s 10:40 request calls for the clean durable design that prevents this class of bug. Matching a commit by TODO number, title and author can adopt somebody else’s commit after a crash.

**Current state:** At 10:39 Astra and Fable independently flag the collision. At 10:43 the lead assigns independent Opus and Codex Sol designs, followed by a merged proposal at docs/proposals/durable-external-effects.md (not yet present). Scope includes commits, branches, PRs, comments, pushes, messages and container starts. Research compares Temporal, Restate and DBOS; these are references, never replacement runtimes. No implementation or completed review is reported.

**Next step:** Inventory hand-written recovery, merge the designs, extend the SDK and lint enforcement, then migrate TODO recovery with a regression proving a stranger’s matching commit is never adopted. Prove crash-before-receipt recovery without duplicate external mutations or invented exactly-once claims.

**Open questions for Will:** None now; the design must expose any provider limitation and decision with confidence before implementation needs his choice.

Evidence: script-extracted user text at 10:40 and lead updates at 10:39/10:43 PDT; ruling DUR-8. Codex maintains this note; the assigned designers own engineering.
