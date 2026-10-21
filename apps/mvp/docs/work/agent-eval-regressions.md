---
title: Fix agent failures found by live evals
status: done
area: app
owner: agent regression builder
updated: 2026-10-20
links: [agent-evals.md, slash-commands.md, navigate-flow.md, flow-authoring.md, model-endpoint.md, ../rulings.md, ../features/agent-evals.md]
---

## Current specification — 2026-10-20, 19:34 PDT

**What:** Fix the five live agent behavior failures and retain their eval regressions.

**Why:** Actions must respect intent, product language and budget accounting.

**Current state:** At 19:29 the lead reports all five fixes complete: a real-model baseline of 60/60 across 20 cases, including behavior, safety and judge checks; docs navigation passed 8/8 and clone-by-agent passes. The eval used the HTTP/1.1 provider transport seam; host-wide consolidation remains separate.

**Next step:** Retain the baseline and per-case receipts. Track transport recovery in h2-model-transport.md and the new docs-sync authorization regression separately.

**Open questions for Will:** None.

Evidence: script-extracted user-typed messages and lead text replies from session 6253ecf2, 2026-10-21 00:34–02:34 UTC (17:34–19:34 PDT); queue answers through 02:33:47 UTC; current rulings, decisions, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Latest Will text and queue answers prevail. Product receipts are reported, not rerun by this tracker. Existing execution owners are retained.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 17:34 PDT

**What:** Fix theme actions, internal-name leaks, unrequested side effects, wrong-site navigation and refused-call budget accounting.

**Why:** The live eval harness exposed real behavior failures.

**Current state:** Clone-by-agent now passes per the lead at 17:28. No complete passing rerun establishes all five live-eval fixes, so the broader workstream stays active.

**Next step:** Retain the clone regression and structural intent guards; rerun all failure-class evals against the real model within budget and publish the individual results.

**Open questions for Will:** None.

Evidence: queue answers through 2026-10-21 00:34:14 UTC; script-filtered human text and lead replies from the latest two transcript hours through 00:33:48 UTC; current rulings, decisions, proposals, TODOs, rules and shared briefs. Latest answers supersede older blockers. Product tests are reported evidence; this tracker runs the maintainer-site build only.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 17:24 PDT

**What:** Fix the five live-eval failure classes and the clone-by-agent browser failure.

**Why:** Agent actions must follow requested intent, and provider refusal must release unspent budget.

**Current state:** The five failures remain assigned with no passing fix receipt. At 17:18 the lead explicitly added clone-by-agent to the same builder because the cause is in the same clone code; it is the only reported walkthrough still failing. The completed eval harness and baseline remain separate from these behavior fixes.

**Next step:** Retain failing evals for theme actions, internal-name leaks, unrequested clone/save/run, wrong-site navigation and budget refusal; add the clone browser regression. Use structural side-effect guards and rerun real-model and browser checks within the allocated budget.

**Open questions for Will:** None.

Evidence: script-extracted user-typed text and lead replies from session 6253ecf2, latest two hours through 2026-10-21 00:23:43 UTC; queue answers through 00:06:34 UTC; current rulings and decision 0017, including its Astra fixes. Older briefs and proposals yield to these rulings. Completion and tests are reported evidence; this tracker validates the site build only.

## Earlier tracker history (retained)


## What

Fix five classes found by the first live eval run: act on a /theme request instead of denying the command; keep internal flow names out of replies; prevent unrequested clone/save/run actions; resolve “the Effect docs” to the intended site; and release daily-budget reservations when the provider refuses a call.

## Why

The agent must act through the same flows as people while respecting their intent. A refused provider call must not consume budget as though it spent tokens.

## Current state

At 16:53 PDT the lead assigned a builder to all five. The eight-case baseline passed behavioral checks in 7/8, safety in 8/8 and the judge in 6/8. Wrong-site navigation occurred in 3/8 runs. A refused provider call reserved about 43,000 tokens. No fix or passing regression receipt was reported. The lead requires structural guards for side effects, rather than relying on prompt wording.

## Next step

Retain a failing eval for each bug, fix it in the owning SDK/app layer through durable flows, and rerun with real models. Prove requested actions still work and unrequested effects are refused; cover budget refusal and recovery. Expand toward 20 cases within the lead’s roughly 350,000-token run budget.

## Open questions for Will

None. The lead assigned implementation; no product choice is required.

## History

2026-10-20 16:53 PDT: script-extracted lead reply from session 6253ecf2 reported these findings and assignment. Rulings FLOW-5, NO INVENTION and DUR-4 govern the fix. This tracker did not run evals.
