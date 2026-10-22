---
title: Operator credential authorization and concurrent trigger recovery
status: done
area: cli
owner: Codex mini operator fixes
updated: 2026-10-22
links: []
---

Both assigned findings reproduced before their fixes: the integration diagnostic
sent an unrelated encrypted credential to a host-authorized loopback provider,
and overlapping inspections let cancellation succeed after Control accepted a
run whose ID had not yet reached the trigger-plan row. The new regressions
failed on those assertions (2 failed, 34 passed).

Repository integration declarations now select stored IDs only from the host's
provider-specific `SMITHERS_GITHUB_CREDENTIAL_IDS` allowlist (empty by default).
Authorization runs when reading configuration, before secret resolution, and
before probing. Local credential administration retains its existing authority.
The real encrypted-store tests cover denied and explicitly allowed references,
offline checks, and online requests without revealing secrets in output.

Inspections use the database writer's transaction lock on a separate
`.flows/trigger-inspections.db`, keeping Control's own database available for
launches and immediate cancellation intent. The lock covers independent layers
and processes, releases when its connection closes, and leaves the durable
launch key available for recovery. The concurrent regression delays a parked
receipt, accepts another launch, interrupts after acceptance, and verifies that
cancellation refuses to discard the monitor and recovery cancels the real run.
No device schema changed. Existing catalog entries used: @smthrs/control,
@smthrs/integrations, @smthrs/triggers and @smthrs/database; no new dependencies.

Validation with Node 26.5.0 after `pnpm install --frozen-lockfile --offline`:

- `pnpm --filter @smthrs/cli exec vitest run --coverage.enabled=false test/OperatorIntegrations.test.ts test/OperatorTriggerPlans.test.ts`: 36 passed after the fixes.
- `pnpm --filter @smthrs/cli exec vitest run --coverage.enabled=false test/Operator`: all 60 tests in eight files passed.
- Expanded run adding `test/Environment.test.ts test/Readme.test.ts`: 115 passed, one existing README failure. Running the README suite with the parent README reproduces exactly that failure: its peer-dependency expectation omits the manifest's existing `@smthrs/platform-bun` peer (46 passed, one failed).
- Final `test/Environment.test.ts`: 9 passed after removing its redundant native-timer fixed wait; explicit overflow and boundary assertions remain.
- `pnpm --filter @smthrs/cli exec tsc --noEmit`: passed. `pnpm exec tsc --noEmit` in apps/mvp: passed.
- `pnpm --filter @smthrs/cli exec tsc -p tsconfig.test.json --noEmit`: the identical pre-existing TS2322 at `test/NativeControlInitialization.test.ts:19` occurs with both the parent operator sources and the fixed sources.
- `pnpm exec smithers-build test '//packages/smithers:importRules'`: this package has no such target. Ran its underlying `packages/repo-targets/scripts/import-rules.mjs` directly with forbidden mocks and fixed waits scoped to all three changed test files: passed, no violations.
- Package dprint check passed. ESLint passed on changed production sources; the repository ESLint configuration ignores test files.
- Coverage was not measured. E2e: not run (mini clone).

One local jj commit and the requested mini bookmark only; no push or main movement.
