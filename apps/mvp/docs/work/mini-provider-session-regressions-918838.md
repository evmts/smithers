---
title: Provider session and credential concurrency regressions
status: done
area: cli
owner: Codex mini/fix-packages-smithers-src-internal-918838
updated: 2026-10-21
links: [../../../../packages/smithers/src/internal/ClaudeCode.ts, ../../../../packages/smithers/src/internal/CodexLogin.ts]
---

Reproduce the five reported provider bugs before fixing them. Use the catalog's
`@smthrs/model` entry for the model/auth boundary and Effect for concurrency.
Keep credential and prompt contents out of diagnostics. Run affected unit suites,
import rules and the app typecheck; e2e not run (mini clone). Commit locally once;
do not push or move main.

All five findings reproduced. The initial provider run passed 73 tests; five
new cases failed on the old session/auth behavior. The stale-lock regression
uses four real processes and a long dead-owner record to widen the race; it
observed three simultaneous refresh owners on round 1 before the fix.

The catalog's `@smthrs/database` entry covers durable SQL state. This CLI host
uses Node SQLite only as a native interprocess exclusion primitive around a
filesystem check/unlink, with no SQL data or schema; a durable SQL writer would
not make those filesystem operations atomic. The empty guard file is retained
so every process locks the same inode, and the OS releases its transaction on
process death. Busy/unavailable guards fail closed without removing the lock.
The existing auth timing record reports waiting and whether refresh happened;
no credential or prompt content is added to telemetry.


Validation (Node 26.5.0; frozen offline pnpm install):
- Original Claude/Codex files: 73 passed, one live smoke skipped.
- Regressions before fixes: five session/auth cases failed as reported; the
  separate real-process stale-lock case failed with three refresh owners.
- Affected CLI files (`ClaudeCode`, `CodexLogin`, `CodexLoginLockRace`,
  `Providers`): 148 passed, one live smoke skipped. The lock suite also proves
  a killed reclaimer releases its guard.
- Complete model package: 1,040 passed, nine skipped; 100% statements,
  branches, functions and lines with the configured coverage gate.
- CLI and model test typechecks, both importRules targets, and app typecheck
  passed. App typecheck passed both before and after; no device schema changed.
- E2e: not run (mini clone). No production deployment or push.
- Regenerated and drift-checked the target index. Synced the site reference
  and LLM bundle. Offline dry-run tarballs for both affected packages retain
  README and docs; the repository-wide docs test was kept outside this scoped
  mini-clone test run.
