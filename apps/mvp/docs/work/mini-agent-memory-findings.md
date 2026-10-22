---
title: Agent memory and promotion confirmed bugs
status: done
area: sdk
owner: codex-mini-fix-packages-smithers-agent-src-895511
updated: 2026-10-21
links: [../../../../packages/smithers/agent/docs/guides/memory.md]
---

Reproduce and fix the seven supplied memory calibration, threshold confinement,
concurrent fact write, and flow promotion findings. Use the library catalog's
agent, memory, model judgement and registry entries; no new library is needed.

The miner takes fitted settings through `MemoryCalibration.Current`, an injected
Effect context reference with the declared settings as its default. Hosts can
provide `Memory.thresholds(root)` without adding filesystem access to mining.
The note store's creation-data conflict contract remains unchanged; only mining
recovers a concurrent insert of the same normalized transcript fact.

Validation:
- Before: 24 regression cases failed for the supplied findings.
- After: 31 regression cases pass; 58 existing calibration, mining and promotion
  tests and 79 existing memory selection tests pass (168 distinct cases).
- Package importRules, TypeScript test typecheck and changed-source ESLint pass.
- Package target index regenerated; Codex Astra review found no correctness issue.
- Playwright: not run (mini clone).

Full package run: 2,142 passed, 1 failed, 6 skipped. The failure is the existing
`Fault.sweep.test.ts` audit: `@smthrs/flow/EffectKeyUnavailable` in the unchanged
flow package has no fault registration. Re-running the audit after restoring all
four original source files reproduced the identical failure (9 passed, 1 failed);
the fixed files were then restored byte for byte.

A progress inspection of the long-running RunawayGuard case introduced an
inspector-only `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` rejection into the full
run. The same command-timeout case was rerun without the inspector and passed
(1 passed, 22 unselected). No product code changed for that rerun.
