---
title: Native host containment, auth selection and observation fixes
status: done
area: cli
owner: codex-mini-444234
updated: 2026-10-22
links: []
---

Fixed the four confirmed native-host bugs: containment recognizes parent path
segments instead of rejecting every name starting with `..`; explicit OpenAI
auth selection precedes account-pool routing; watcher normalization uses the
host's path separator and preserves literal POSIX backslashes.

Library catalog entry: `@smthrs/cli`; retain the existing Effect seat resolver
and `@smthrs/agent` workspace observer. No new libraries or persisted schemas.

Validation on Node 26.5.0 after frozen, offline pnpm installation:

- Regressions failed on the original production code: both LSP containment
  checks admitted `..tools`, both `..foo` runner cases returned undefined,
  explicit auth consulted/refused the pool, and a measured `.git\\kept.ts`
  write did not increment the settled watcher count.
- Final focused run of `HostLanguageServers`, `NodeComposition`,
  `NodeWorkspaceObservation`, and `SeatResolution`: 15 passed, 169 deselected.
  Command: `pnpm --dir packages/smithers exec vitest run --coverage.enabled=false
  test/HostLanguageServers.test.ts test/NodeComposition.test.ts
  test/NodeWorkspaceObservation.test.ts test/SeatResolution.test.ts -t
  'named \.\.tools|descendant|outside the mount|POSIX backslash|explicit api-key|validates explicit|sibling host'`.
- Full run of those four files: 180 passed, four failed. All four failures
  reproduced with original production code restored: three `NodeComposition`
  cases lack the native `smithers-jj-export` helper, and the existing watcher
  performance case counted two walks instead of one. No new failures.
- `pnpm exec tsc --noEmit` in `apps/mvp`: passed before and after.
- `pnpm exec smithers-build test '//apps/mvp:importRules'`: passed.
  `//packages/smithers:importRules` does not exist. The underlying import-rule
  checker compared the seven changed TypeScript files against the parent:
  24 existing root-import/sleep violations before and after, zero added.
- Package dprint check on all seven changed TypeScript files: passed.
- Astra review: no findings. Windows paths inspected, not executed.
- E2e: not run (mini clone).
