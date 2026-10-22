---
title: Agent quota and charge validation
status: done
area: agent
owner: codex-fix-packages-smithers-agent-src-195771
updated: 2026-10-21
links: []
---

Validate quota park bounds, preserve attribution totals, and reject conflicting recovered USD charges.
Library catalog entry: `@smthrs/agent` for durable agent budgets and quota parking.

Validation: all 12 new regression cases failed before the fix. All 229 tests in
AgentAction.test.ts, Budget.test.ts and BudgetDurability.test.ts pass after it.
The package importRules target and formatting check pass.

Full package runs are not green: Fault.sweep.test.ts reports the existing
unregistered @smthrs/flow/EffectKeyUnavailable tag (also reproduced with the
original production code). The final run also encountered Postgres connection
resets in ModelStep.test.ts; its 39 tests passed in the first full run.
Vitest runs used --coverage.enabled=false; no coverage claim is made.
