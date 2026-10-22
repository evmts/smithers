---
title: RPC error presentation, recorded state, answer decoding and docs anchors
status: done
area: rpc
owner: codex-mini-297245
updated: 2026-10-22
links: []
---

Fixed the four assigned RPC findings with regression tests.
Library catalog entry: `@smthrs/rpc`, shared runtime-free wire contracts.
No new library or persisted schema is needed. Error presentation must withhold
untrusted prose and exception detail, retaining typed failure information.

Arbitrary upstream sentences now use status fallbacks; the pinned scope-gate
literal remains recognized. Exception detail is entirely redacted because a
generic presentation boundary cannot identify arbitrary secrets or user content.
Registered copy, tags, fault attribution, actions and unknown-error reporting
remain available. Objects with invalid field names remain whole in one JSON
`state` field, preserving original keys instead of renaming them. Raw choice
distributions validate all probabilities before selecting declared options.
Docs reads strip the fragment and return the complete named page.

Validation on Node 26.5.0 after
`pnpm install --frozen-lockfile --offline`:

- Before the production changes, the four focused regression files failed 16
  assertions for the reported reasons: three upstream disclosures, four
  exception disclosures, four recorded-state collisions, two out-of-range
  undeclared-option probabilities, and three anchored docs reads. The full
  baseline RPC suite had exactly those 16 failures and 4,337 passes.
- `pnpm --dir packages/rpc exec vitest run`: 100 files, 4,354 tests passed.
- `pnpm --dir packages/rpc run check`: production and test typechecks passed.
- `pnpm exec smithers-build test '//packages/rpc:importRules'`: passed.
- Changed RPC TypeScript files passed ESLint and dprint; README passed dprint.
- `pnpm exec tsc --noEmit` in `apps/mvp`: passed before and after.
- No app test imports RPC directly (`rg -l '@smthrs/rpc' apps/mvp --glob
  '*test*'`). Its agent and flow instruction modules import the RPC root.
  `pnpm --dir apps/mvp exec vitest run --coverage.enabled=false
  src/features/agent/instructions.test.ts src/features/flows-ui/checks.test.ts
  src/features/flows-ui/tab.test.ts src/features/flows-ui/source.test.ts
  src/features/flows-ui/faults.test.ts src/features/flows-ui/flows.test.ts`:
  six files, 63 tests passed before and after; zero new failures.
- E2E: not run (mini clone).
- Codex Astra reviewed the finished diff with no actionable findings. Fable
  review is unavailable in this environment.
