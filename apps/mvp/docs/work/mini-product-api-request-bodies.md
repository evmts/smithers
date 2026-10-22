---
title: Preserve backend API mutation request bodies
status: done
area: sdk
owner: codex-fix-rework-8a067eb4-158706
updated: 2026-10-22
links: [../../../../packages/smithers/src/internal/backend/ProductApi.ts]
---

Reworked 8a067eb479b1 on main after signed webhook raw-body support.
All eleven mutation wrappers forward their bodies. `raw` preserves signed JSON
text through `rawBody`, including an empty string, and takes precedence over
the positional body. `binary` means a positional `Uint8Array` sent as
`application/octet-stream`; other bodies retain JSON serialization. Uploads
preserve empty arrays, every byte value and views with offsets. Credential
fences and diagnostics are unchanged; no request payload logging was added.

Uses the library catalog's `@smthrs/cli` transport entry; no new dependency.
The existing single `ImportRules` block covers all ProductApi tests against
fixed sleeps and the new HTTP regressions against mocked dependencies.

Validation in this clone, Node 26.5.0:

- `pnpm install --frozen-lockfile --offline`: passed.
- Before production changes, `vitest run test/ProductApiBodies.test.ts
  test/ProductApiContracts.test.ts --coverage.enabled=false`: 13 failed and
  8 passed, reproducing every missing mutation body and upload boundary.
- `vitest run test/Backend*.test.ts test/ProductApi*.test.ts
  --coverage.enabled=false`: 1,347 passed, one failed across 34 files. All 628
  ProductApi cases passed. The managed-terminal credential test fails with
  `Cannot read a valid SMITHERS_TOKEN_FILE` at its first request; restoring
  main's Client reproduced that same failure, before body serialization.
- Whole CLI suite: `pnpm --filter @smthrs/cli exec vitest run
  --coverage.enabled=false --fileParallelism=true --maxWorkers=4`: 5,213
  passed, 311 failed, 52 skipped across 305 files. Failures include unavailable
  native `smithers-jj-export` and Bun. This is not a passing whole-package gate;
  coverage was not measured. All three ProductApi files passed in this run too.
- App A/B, restoring main's files and then the exact reworked files:
  `pnpm exec vitest run --coverage.enabled=false --maxWorkers=2` in `apps/mvp`.
  Both runs: 1,308 passed, 368 failed, 1,296 skipped. Every failure reports
  unavailable Postgres. Comparing test identities and failed suites found
  zero new failures.
- `pnpm exec tsc --noEmit` in `apps/mvp`: passed before and after. The CLI's
  `tsc --noEmit` also passed.
- `pnpm exec smithers-build test '//packages/smithers:importRules'` and
  `pnpm exec smithers-build test '//apps/mvp:importRules'`: passed.
- Formatting passed. Astra review found no issues; Fable is unavailable.
- Playwright was not run, as requested.
