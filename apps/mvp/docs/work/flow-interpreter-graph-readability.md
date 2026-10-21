---
title: Simplify the flow interpreter and graph
status: done
area: sdk
owner: Opus flow simplification agent assigned by lead
updated: 2026-10-21 03:34 PDT
links: [code-readability-burn-down.md, engine-core-readability.md, flows-as-code-api.md, code-review-guides.md, ../rulings.md, ../rules.md]
---

## Tracker reconciliation — 2026-10-21 03:34 PDT

**What:** Simplify Interpreter.ts and Graph.ts while keeping one flow model.

**Why:** Make flow authoring and execution understandable for review.

**Current state:** At 03:28 PDT the lead reports both rewrites on main at cf6bd457, including the flow lint/formatting fix. The suite passes 903/903 at full coverage with unchanged public types. Earlier reported remote mutation checks remain evidence; this tracker did not rerun them.

**Next step:** Retain the landing and mutation receipts; regenerate revision-specific guides after the queue source fix and review-policy answer.

**Open questions for Will:** None new.

Evidence: script-filtered user-typed text and lead replies from session 6253ecf2, 01:33–03:33 PDT; synthetic notifications, teammate messages and tool content excluded. Rulings and queue answers through 01:19 PDT supersede historical briefs, panel designs, decisions, proposals, TODOs and rules. Product validation and landing are lead-reported; Codex curates this documentation and runs only the site build. Execution ownership retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 03:24 PDT

**What:** Simplify Interpreter.ts and Graph.ts without changing the public flow model.

**Why:** Make the authoring and execution code readable for review.

**Current state:** At 03:14 PDT the lead reports Interpreter reduced from a 613-line function nested 12 levels deep to a 30-line outline; Graph’s 679-line build became a builder with an expander per node kind. Rewritten functions are at most 39 lines and four levels deep. Public types are reported byte-identical, coverage 100%, and the suite passes 903/903. Mutation checks on the remote runner caught every behavior-changing mutation. At 03:23 the combined landing still awaits the API baseline and engine-store suite; no pushed revision is reported.

**Next step:** Finish the pending landing checks, record the pushed revision and refresh revision-specific review guides. Keep this work in-progress until landing is confirmed.

**Open questions for Will:** None new.

Evidence: lead text replies through 03:23 PDT, script-extracted from the latest approximately two session hours; synthetic user messages, teammate reports and tool content are excluded as human evidence. Current rulings and queue answers supersede historical briefs, designs, decisions, proposals, TODOs and rules. Product checks are lead-reported; this tracker verifies the site build. Execution ownership retained; Codex curates documentation.

## Earlier tracker history (retained)

**What:** Simplify Interpreter.ts and Graph.ts while retaining the single flow model and public authoring behavior.

**Why:** The lead reports functions of 613 and 679 lines respectively; readable implementation is needed for useful review.

**Current state:** At 02:17 the lead reports a separate Opus agent working in its own workspace. No completion, test, coverage or landing receipt exists. The approved flows-as-code API is a separate workstream; this receipt establishes readability work only.

**Next step:** Preserve behavior and public types; validate interpreter, graph, recovery and error paths with meaningful tests and full coverage, then land and regenerate guides.

**Open questions for Will:** None.

Evidence: lead text replies through 02:23 PDT in session 6253ecf2, extracted by script from the latest two hours with automated notifications and tool content excluded; current rulings and queue answers through 01:19 PDT, shared briefs/designs, decisions, proposals, TODOs and rules. Product checks are reported receipts; this tracker runs only the maintainer-site build. Execution ownership and earlier history retained. Documentation curator: Codex.
