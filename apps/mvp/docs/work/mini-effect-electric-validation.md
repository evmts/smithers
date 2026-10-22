---
title: Electric batch validation and retry review
status: done
area: sdk
owner: mini/fix-amend-77c9d62a-514669
updated: 2026-10-22
links: [../../../../packages/effect-electric/src/ElectricCollection.ts]
---

Fixed batch validation: every array member must have a valid change, control or event envelope before Electric receives the response. Numeric LSN and snapshot identifiers must be unsigned decimal strings, and txids and move positions must be nonnegative integers. Invalid batches stop with `Unreadable`, retain the requested offset on reconnect, apply no rows and record `electric.shape.complete: false` without a row count. Column values continue through the existing row-schema decoder. Catalog entry used: Electric collection sync (`@smthrs/effect-electric`). No device schema changed.

Retry finding remains unresolved: the source does use `Effect.retry`, but no failing behavioral regression for durable recovery was established. The public API and catalog currently specify an arbitrary Effect Schedule, and callbacks run outside a flow. A durable replacement needs host-owned request identities, serializable results, runtime registration and a migration of the existing Schedule/reconnect contract. This change does not claim to fix it or add a memory-only durability substitute. Catalog reference for that future correction: `@smthrs/flow` durable retry.

Original validation recorded before the bounce, on Node 26.5.0 after `pnpm install --frozen-lockfile --offline`:

- `pnpm --filter @smthrs/effect-electric exec vitest run test/BatchValidation.test.ts --coverage.enabled=false`: 15 failures before the fix (`Succeeded` instead of `Stopped`); 15 pass after.
- `pnpm --filter @smthrs/effect-electric exec vitest run --exclude test/BatchValidation.test.ts`: baseline 68 tests pass, 100% coverage.
- Astra review found six additional numeric-metadata cases; all six failed before the metadata validation fix, alongside the original 15 passing cases. The follow-up review found no remaining batch-validation issues. Fable review is unavailable in this environment.
- `pnpm --filter @smthrs/effect-electric exec vitest run`: final suite passes 113 tests, with 100% statements, branches, functions and lines.
- Package `tsc -p tsconfig.test.json --noEmit` and eslint on changed sources pass.
- `pnpm exec tsc --noEmit` in `apps/mvp`: passes before and after, zero new failures.
- `pnpm exec smithers-build test '//packages/effect-electric:importRules'`: passes.
- E2e: not run (mini clone).


Amendment of `77c9d62affd9` (2026-10-22): restored its patch on `ec8a686cf7ab`. The fetch adapter now uses `Object.assign(wrapper, fetch)` to retain the host fetch's helpers, including Bun's `preconnect`, without asserting a type or changing the Effect request path.

Amendment validation on Node 26.5.0:

- `pnpm install --frozen-lockfile --offline`: passes.
- Parent: all 68 effect-electric tests pass with 100% statements, branches, functions and lines.
- `pnpm exec tsc --noEmit` in `apps/mvp`: parent and amended change pass. The historical parent's default ambient types do not include Bun's fetch helper.
- Explicit Bun declarations (`pnpm exec tsc --noEmit --types vite/client,../../node_modules/.pnpm/bun-types@1.4.3/node_modules/bun-types` in `apps/mvp`) reproduce TS2741 at `ElectricCollection.ts:340` with the bounced patch. The amendment removes exactly that diagnostic; the other 108 diagnostics are unchanged, with no new diagnostics.
- `pnpm --filter @smthrs/effect-electric exec tsc -p tsconfig.test.json --noEmit` and eslint on changed production sources: pass.
- `pnpm exec smithers-build test '//packages/effect-electric:importRules'`: passes before and after.
- The extra full non-Playwright app baseline was interrupted after more than seven minutes in live-sync tests with repeated upstream 503 responses; no full-app suite result is claimed. The first amended library run also encountered real Electric 503s. Validation was moved to another running real Postgres/Electric pair (ports 54331/30011); the first complete run passed 112 tests with one timeout in the existing cut-batch recovery test. A complete rerun retains every test and the coverage gates. The attempted temporary Docker startups were canceled and their network removed.
- Codex Astra review: no actionable findings. Fable review remains unavailable.
- Playwright: not run as instructed.

- Final whole suite, with `DATABASE_URL` and `ELECTRIC_URL` selecting that separate real service pair: `pnpm --filter @smthrs/effect-electric exec vitest run --reporter=verbose` passes all 113 tests (9 files), with 100% statements, branches, functions and lines. No tests skipped. The previously timed-out cut-batch recovery test passes.
