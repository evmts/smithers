---
title: Control projection and inventory bug fixes
status: done
area: control
owner: codex-fix-packages-smithers-control-src-945910
updated: 2026-10-22
links: []
---

Reproduce and fix journal approval precedence, string defect redaction, plan publication cursor ordering, and reserved run inventory. Use the existing control runtime and Effect services; no new libraries.

All four findings reproduced before fixing. Latitude validation:
- Focused regressions: 68 passed; baseline failed for all four findings.
- Control suite: 1,187 passed, one PostgreSQL-only test skipped.
- SQLite/PostgreSQL matrix: both passed (1,187 passed and one backend-specific skip each).
- Control test typecheck and MVP typecheck passed.
- Package importRules target is absent; invoked its checker directly with the behavioral no-fixed-waits rule over the changed tests: passed.
- Changed TypeScript files pass dprint. Coverage thresholds were not evaluated in these test runs.

Existing Effect service boundaries and runtime spans are retained. No new library, persisted device schema, or product interface.
