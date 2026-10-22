---
title: Backend diagnostic and host service safety
status: done
area: cli
owner: codex-mini-462605
updated: 2026-10-22
links: []
---

Seven findings reproduced and fixed: scalar fallback diagnostics, verbose
stacks/causes, live terminal controls, unbounded event retention, stranded
service locks after process death, restore/install exclusion, and canonical
bundle paths. Library catalog: existing `@smthrs/journal` redaction; existing
Node SQLite and Effect resource scopes for CLI process exclusion. No dependency
or device schema changed.

Baseline: four Client tests failed for the reported leaks, terminal controls
and 10,001 retained events. Three real-process host tests failed for relative
plist paths, a lock stranded by SIGKILL, and install entering during restore.
The final host tests use a real HTTP completion barrier and an absent launchd
domain. No mock or fixed sleep was added. Review also exposed ANSI normalization
reconstructing protected values in errors, decoded records, thrown strings and
live output; those failing cases are retained.

Final focused command:
`pnpm --dir packages/smithers exec vitest run --coverage.enabled=false test/BackendSafetyClient.test.ts test/BackendSafetyHost.test.ts test/HostServiceRecovery.test.ts test/BackendRefusal.test.ts test/Failure.test.ts`
passes 112 tests. Credential/readiness existing suites pass 103 tests. The
reported handwritten credential retry and readiness timer loops remain: their
architecture is visible, but no failing behavioral regression was established
for either finding, so neither is claimed fixed.

Both package and apps/mvp importRules pass. The existing BackendSafety test
rules already cover both new files. Source ESLint, dprint, CLI typecheck and
apps/mvp typecheck pass. Installation used Node 26.5.0 and
`pnpm install --frozen-lockfile --offline` successfully.

The final unchanged-source backend/host/Failure run passes 885 tests, skips 20,
and retains one failed test plus one failed suite setup (43 files). Both
failures reproduce with the original source: HostTiming's missing execution snapshot and
BackendManagedTerminalCredentials' token-file refusal. A BackendLocal timeout
passed in isolated A/B runs on both original and final source. Selected-file
checks disable coverage instrumentation; the whole package was not run.
E2e: not run (mini clone).

Astra reviewed the change and its concrete reporting/test findings were fixed.
Fable is unavailable in this environment. The legacy synchronous maintenance
backend can survive a killed CLI parent; process supervision for that existing
crash combination remains outside this change. The new lock excludes concurrent
CLI operations throughout a living restore invocation and releases after a CLI
crash; it does not claim to supervise an orphaned backend.
