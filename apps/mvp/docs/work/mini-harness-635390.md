---
title: Harness context, answer scanning and custom output regressions
status: done
area: agent
owner: codex-mini-635390
updated: 2026-10-22
links: []
---

Fixed all four reported harness findings: document declared digest hashing,
retain the sole transcript during compaction, skip regex answer decoys after
control headers, and preserve successful non-code-mode custom tool output.
Use the library catalog's `@smthrs/harness` entry and its existing pure context
and transcript APIs; no new libraries, runtime services or persisted schemas.

Validation on Node 26.5.0 after `pnpm install --frozen-lockfile --offline`:

- Before production changes, the focused regressions failed 12 cases: one
  JSDoc contract, one sole-transcript preservation, six control-header regex
  decoys, and four successful custom outputs. Command:
  `pnpm --dir packages/smithers/agent/harness exec vitest run --coverage.enabled=false
  test/ContextWindow.test.ts test/DoneText.test.ts test/ExternalTranscript.test.ts
  -t 'documents declaredDigest|only compactable segment|regex answer decoys|custom output without'`.
- Final package suite: `pnpm --dir packages/smithers/agent/harness exec vitest run`:
  2,523 passed, three opt-in tests skipped (two files); 100% statements,
  branches, functions and lines with unchanged thresholds.
- `pnpm exec smithers-build test '//packages/smithers/agent/harness:importRules'`
  and `pnpm exec smithers-build test '//apps/mvp:importRules'`: passed.
- `pnpm --dir packages/smithers/agent/harness exec tsc -p tsconfig.test.json --noEmit`:
  passed. `pnpm exec tsc --noEmit` in `apps/mvp`: passed before and after.
- ESLint on the three changed source files and dprint on all six changed
  TypeScript files: passed.
- Astra review: three findings reproduced with failing regressions and fixed;
  final review had no findings. Regressions retain whitespace/comment property
  access and direct, invalid and wrapped patch failures. Fable review unavailable:
  no Fable model or review tool is configured in this session.
- E2e: not run (mini clone).
