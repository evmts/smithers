---
title: Simplify engine-store execution and persistence
status: in-progress
area: sdk
owner: Opus engine-store simplification agent assigned by lead
updated: 2026-10-21 04:54 PDT
links: [code-readability-burn-down.md, engine-core-readability.md, code-review-guides.md, ../rulings.md, ../rules.md]
---

## Tracker reconciliation — 2026-10-21 04:54 PDT

**What:** Simplify engine-store execution and persistence without changing durable behavior.

**Why:** Make the driver and persistence code reviewable while preserving public types, SQL and recorded history.

**Current state:** At 04:48 PDT the lead reports five completed commits covering RunDriver, ActionPersistence, PlanScheduler, DurableEngineState and EngineStore. The longest functions fell to 49, 47, 58, 66 and 69 lines respectively. Public types are byte-identical, SQL text is unchanged, and the SQLite/Postgres matrix passes 4,322/4,322 at full coverage. Twenty-two new tests each catch a mutation the old suite missed. The batch joins the current lander; no completed landing receipt exists, so status remains in-progress. This supersedes the earlier absence of a completion or validation receipt.

**Next step:** Obtain the landing receipt, refresh review slices at that commit and retire the workspace only after landing. Keep the untouched inertJson helper and long SQL-query functions visible as remaining readability scope; retain the reported pre-existing formatting failures until resolved.

**Open questions for Will:** None new.

Evidence: lead text replies at 04:24 and 04:48 PDT, script-extracted from session 6253ecf2’s latest approximately two hours (02:53–04:53 PDT). No user-typed text appears in that window; synthetic notifications and tool content are excluded. Rulings and Will’s queue answers override historical briefs, panels, decisions, proposals, TODOs and rules. Validation is lead-reported; this tracker runs only the maintainer-site build. Execution ownership retained; Codex curates documentation.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 04:19 PDT

**What:** Simplify engine-store execution and persistence while preserving durable history and recovery.

**Why:** The large, deeply nested driver and persistence functions remain a separate readability workstream from the landed engine and flow rewrites.

**Current state:** At 04:13 PDT the lead explicitly confirms the engine-store readability builder is still active, alongside conflict tests, coding factory, docs panes and device identity. No completion, passing validation or landing receipt is reported for this workstream. Status stays in-progress; cf6bd457 completes the separate engine/flow rewrites, not this one.

**Next step:** Obtain the builder's exact file scope and behavioral, coverage and recovery receipts; land the verified rewrite and refresh the review slices at the landed commit.

**Open questions for Will:** None new.

Evidence: script-extracted human text and assistant text replies from session 6253ecf2, approximately 02:19–04:19 PDT; no human-typed messages in this window. Automated notifications and tools excluded. Current rulings and queue answers override shared briefs, panel designs, decisions, proposals, TODOs and rules. Product checks are reported evidence; this tracker runs only the maintainer-site build. Execution owner retained; documentation curator: Codex.

## Earlier tracker history (retained)


**What:** Refactor RunDriver.ts, ActionPersistence.ts and the additional large engine-store files identified by the builder.

**Why:** The lead reports a 1,807-line RunDriver function and persistence nesting 18 levels deep. Durable execution and persisted history must retain their behavior.

**Current state:** At 02:17 the lead reports an Opus agent working in its own workspace. Three further large files are mentioned but not named; their exact scope needs a builder receipt. No completed rewrite, validation or landing is reported.

**Next step:** Confirm the remaining file scope; flatten control flow with behavioral regression tests, preserve persistence/recovery and public contracts, report coverage and before/after complexity, then land and refresh guides.

**Open questions for Will:** None.

Evidence: lead text replies through 02:23 PDT in session 6253ecf2, extracted by script from the latest two hours with automated notifications and tool content excluded; current rulings and queue answers through 01:19 PDT, shared briefs/designs, decisions, proposals, TODOs and rules. Product checks are reported receipts; this tracker runs only the maintainer-site build. Execution ownership and earlier history retained. Documentation curator: Codex.
