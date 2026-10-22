---
title: Suggest briefs, check inventory and filesystem recovery
status: done
area: cli
owner: codex
updated: 2026-10-22
links: []
---

Reproduce the five supplied suggest findings before fixing them. Use the library
catalog's existing flow, agent and Node host entries for filesystem recovery;
retain the public suggest boundaries and add no independent execution loop.
Four findings reproduced and fixed: implementation briefs now teach named
`Flow.make` default exports in `flow.ts`; CI follow-ups request Smithers flow
checks; discovery retains each distinct check command with a unique ID; lockless
pnpm, Yarn Classic and Bun installation commands disable lockfile creation.
Modern or unversioned Yarn without a lockfile is refused before installation.

The interruption finding could not be reproduced: the real scripted host refuses
both relative and absolute writes with `Permission denied` before any mutation.
The existing happy-path write test fails with ENOENT for its unwritten file on
the original implementation too. No filesystem recovery change is included.

Validation (Node 26.5.0, offline frozen install succeeded):

- `pnpm exec vitest run test/suggest/Brief.test.ts test/ChecklistEvidence.test.ts --coverage.enabled=false`:
  before fixes, 7 failed and 55 passed; after fixes, all 62 passed.
  Three additional modern/unversioned Yarn cases failed before the version
  guard and pass in the final focused run.
- `pnpm exec vitest run test/suggest test/ChecklistEvidence.test.ts test/Suggest.test.ts test/SuggestCli.test.ts test/SuggestDefaults.test.ts test/SuggestSurface.test.ts --coverage.enabled=false`:
  Final run: 125 passed, 1 existing filesystem-write test failed. The package suite is not
  verified green; the whole CLI suite was not run.
- `pnpm exec smithers-build test '//packages/smithers:importRules'`: target absent.
  Ran the same `import-rules.mjs` checker directly for fixed sleeps in changed
  tests and root imports in changed sources (preserving the existing registry
  subpath imports): 2 rules passed over 603 source files.
- Source ESLint passed; the package ESLint configuration does not include tests.
- Formatting check passed on all changed TypeScript files.
- `pnpm exec tsc --noEmit --pretty false` in `apps/mvp`: passed before and after.
- E2E: not run (mini clone).

No new library or runtime was introduced. No push, main movement or deployment.
Astra review found the Yarn compatibility issue; the follow-up review found no
remaining actionable issue. No Fable review tool is available in this session.
