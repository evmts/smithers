---
title: CLI backend regression fixes
status: done
area: cli
owner: codex-046457
updated: 2026-10-22
links: []
---

Reproduce the six supplied backend findings in this isolated mini clone. Retain failing regression receipts before the smallest fixes, run affected CLI tests and import rules, commit once, and leave the requested bookmark without pushing.

Library catalog entries: existing `@smthrs/control` and `@smthrs/gateway` contracts for RPC types; Effect for resource lifetimes and event streams. History watching is a terminal subscription, with no background job, retry, or repeated network polling.

Browser E2E: not run (mini clone).

All six findings reproduced. The initial affected-file baseline had 786 passing
tests and two Mac fixture failures from `/var` versus `/private/var`; fixture
roots now use their real paths. New regressions produced nine failures on the
original source, covering unsafe RPC types, secret file export, swallowed
403/422 stream errors, raw timer polling, lost bundle metadata, missing
cross-process locking and shared temporary plist writes. A separate recovery
probe confirmed the stopped plist was missing before any backend was invoked.

The relay now derives required bodies and operation-specific results from the
public control/gateway RPC schemas. Secret file options are rejected before
reading a value. History is one Effect-managed event subscription with visible
failure, cancellation and scoped cleanup; there is no repeated polling or
reconnection. Stop moves the plist outside launchd discovery and restore uses
that receipt. Install and stop take one fail-closed cross-process lock; each
plist write uses a private temporary directory. Crashed lock holders require
explicit cleanup, documented in the CLI reference. Logs, counters and spans
record operation outcomes, with span failure text withheld.

Validation:

- Final affected files: 796 tests passed across seven files, including counter
  assertions and real HTTP, filesystem, backend-executable and process tests.
- Wider backend suite: 1,364 passed; its one Mac-specific
  `BackendManagedTerminalCredentials` failure reproduces with the original
  backend sources. No additional failures.
- CLI source `tsc --noEmit` and MVP `tsc --noEmit`: passed.
- CLI test-project typecheck: its unchanged
  `NativeControlInitialization.test.ts:19` string/`"gateway"` mismatch reproduces
  with original sources. The new RPC fixture has no diagnostics after the fix.
- `//packages/smithers:importRules`: passed. The package previously lacked this
  target; it now guards subscription timers and public relay-contract imports.
- Changed production modules: ESLint passed. Target index regenerated.
- Codex Astra review: no actionable findings. Fable tool unavailable.

No device schema changed. No push or existing bookmark movement is authorized.
