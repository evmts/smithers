---
title: Close main coverage gaps
status: done
area: app-tests
owner: codex-mvp-coverage
updated: 2026-10-23
links: [../rules.md]
---

Restore the unchanged 100% coverage gate with behavioral tests and remove proven dead code. Validate coverage, typecheck and importRules on Latitude only. No push.

Validated on Latitude with unchanged thresholds:

- `pnpm test --maxWorkers=2`: exit 0; 265 files passed, 3,415 tests passed, 2 existing expected failures and 13 existing skipped tests.
- Lines 16,996/16,996; statements 19,608/19,608; functions 5,889/5,889; branches 10,491/10,491: all 100%.
- `pnpm typecheck`: exit 0.
- `pnpm exec smthrs test '//apps/mvp:importRules'`: exit 0.

The baseline inventory contained 32 uncovered lines and 61 nonpositive branch arms across 34 files. Feature commits cover the behaviors and delete unreachable docs-identity and missing-TODO fallbacks. The home preview race has a red-first regression; reload tests now use real device engines. Coverage reports remain visible when tests fail. No mocks, skips, threshold reductions or exclusions were added. No push.

Existing catalog libraries used: `@smthrs/flow`, `@smthrs/effect-electric`, `@smthrs/effect-tanstack-db` and their injected platform services; no new library was selected.
