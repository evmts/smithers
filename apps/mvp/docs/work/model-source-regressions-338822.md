---
title: Model pricing, effort, signatures and classifier regressions
status: done
area: model
owner: codex-mini-338822
updated: 2026-10-22
links: []
---

Reproduce and fix the four reported model-source bugs in the isolated mini clone.
Library catalog entry: `@smthrs/model` for provider protocols, pricing and classifiers.
Use pure protocol/accounting tests and the existing Effect evaluator service.

All four findings reproduced before production edits: 14 failing regression
cases and 132 passing existing tests in the three affected files. The classifier
mutation test also failed after strengthening its nested-criteria mutations.

Fixes reject nonfinite weighted or rounded estimates, recognize the exact dated
Opus 4.5 id, buffer thinking past empty signature placeholders, and retain an
immutable schema-decoded question snapshot for hashing, evaluation and decoding.
Existing classifier digest goldens and question class identities are preserved.
No persistent device schema changed; existing transport/evaluator observability
continues to cover the corrected request and event paths.

Validation (Node 26.5.0, frozen offline install):
- `pnpm --filter @smthrs/model test run test/Pricing.test.ts test/AnthropicMessages.test.ts test/Classifier.test.ts --coverage.enabled=false`: red 14 failed / 132 passed; green 146 passed.
- `pnpm --filter @smthrs/model test run`: 1,051 passed, 9 live-provider tests skipped; 100% statements, branches, functions and lines.
- `pnpm --filter @smthrs/model exec tsc -p tsconfig.test.json --noEmit`: passed.
- `pnpm exec tsc --noEmit` in `apps/mvp`: passed before and after; no added errors.
- `pnpm exec smithers-build test '//packages/smithers/agent/model:importRules'`: passed.
- Astra review: no findings. Fable review unavailable: no Claude executable in this environment.
- E2e: not run (mini clone).
