---
title: CLI flow warnings and TUI cancellation
status: done
area: cli
owner: codex-903753
updated: 2026-10-21
links: []
---

Reproduce dropped discovery warnings in RunControl.listFlows and ignored local TUI AbortSignals, then retain failing-before/passing-after regression evidence. Uses the catalog's existing @smthrs/cli and @smthrs/control entries; no new library or flow runtime.

## Regression evidence

Node 26.5.0; `pnpm install --frozen-lockfile --offline` succeeded. Before changing production code, `pnpm exec vitest run test/TuiCancellation.test.ts test/CommandVerbs.test.ts --coverage.enabled=false -t 'local TUI cancellation|keeps distinct discovery warnings'` failed all three selected regressions: the flow document omitted both paged discovery warnings; a pre-aborted launch wrote its child-start marker; a running child survived abort until test cleanup ended its readiness socket. No fixed sleeps or mocked processes were used. Catalog refusals are injected through the existing Control Effect service.

The fix returns FlowCatalog.listing with the collected warnings. Local TUI execution checks cancellation before runtime selection and after bundle rebuilding, forwards abort to the real child with SIGTERM, waits for exit before returning 130, and removes the abort listener on both exit and spawn error. Normal child statuses are preserved. These behaviors use existing CLI boundaries and introduce no new runtime or schema.

## Validation

From packages/smithers, `pnpm exec vitest run test/TuiCancellation.test.ts test/Tui.test.ts test/CommandVerbs.test.ts test/CommandHandlers.test.ts test/CatalogOutput.test.ts --coverage.enabled=false`: five files, 137 tests passed. After correcting the warning fixture's literal type and adding normal-exit/spawn-error cleanup cases, `pnpm exec vitest run test/TuiCancellation.test.ts test/CommandVerbs.test.ts --coverage.enabled=false`: two complete files, 34 tests passed. This covers 139 distinct passing tests across the affected files; the repository-wide suite and aggregate coverage gate were not run.

`pnpm exec tsc -p tsconfig.test.json --noEmit` in packages/smithers passed. `pnpm exec tsc --noEmit` in apps/mvp passed before and after the production fixes. No persisted device schema changed. E2e: not run (mini clone).

`pnpm exec smithers-build test '//packages/smithers:importRules'` failed with `unknown_label`: this revision declares no importRules target for the CLI. Direct checks using ImportRulesCheck.check compared all four edited TypeScript files against the parent revision: three existing deep-import violations before and after, zero added; the new cancellation file also passes the fixed-sleep call rule. Dprint checked all four edited TypeScript files.

Codex Astra reviewed the finished diff and found no actionable defects. A Fable reviewer is not available among the configured review tools. Work remains in this clone, with no push or movement of main.
