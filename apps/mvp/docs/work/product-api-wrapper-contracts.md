---
title: Product API wrapper contracts
status: done
area: sdk
owner: codex-mini-040236
updated: 2026-10-21
links: []
---

Reproduce and fix the six reported ProductApi wrapper gaps, using retained
backend contracts at `78407fce59dd`. Keep HTTP transport behavior covered with
real loopback requests and the live connection with a real WebSocket.

All six findings reproduced and fixed. Signed webhook text now reaches the
shared Client unchanged; the live wrapper exposes an injected connector's
connection. No library dependency or product flow was added.

Validation on Node 26.5.0 after a frozen, offline pnpm install:

- Before fixes: `vitest run test/ProductApiContracts.test.ts
  --coverage.enabled=false` failed all six tests for the reported reasons.
  The unchanged `ProductApi.test.ts` passed 608 tests.
- After fixes: the two `ProductApi*.test.ts` files passed 613 tests.
- `BackendTransport`, `BackendClientCredentials`, `BackendSse` and
  `BackendPagination` passed 122 tests.
- `vitest run test/Backend test/ProductApi --coverage.enabled=false` ran
  1,300 tests: 1,299 passed; `BackendManagedTerminalCredentials` failed with
  `token_file_unavailable` at `Session.readTokenFile`. The same existing test,
  importing an exact copy of the original Client from `@-`, failed identically.
  Temporary baseline copies were removed. The run also reported a
  BackendCommands worker shutdown timeout.
- `tsc -p tsconfig.test.json --noEmit`, Client ESLint and changed-file dprint
  checks passed.
- `smithers-build test '//packages/smithers:importRules'` cannot run because
  this package declares no such target. The same ImportRules checker ran
  directly: two rules passed, checking the changed API tests for fixed sleeps
  and mocks, and the new API contracts for deep Smithers imports.
- E2E: not run (mini clone).

The required Astra review could not start: the collaboration tool failed with
`invalid thread-store request: no rollout found`. No external review receipt
is claimed.
