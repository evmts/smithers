---
title: RPC file, LSP, refusal and repository path validation
status: done
area: sdk
owner: Codex
updated: 2026-10-22
links: [../../../../../packages/rpc/README.md]
---

Reproduced and fixed the seven reported contract bugs in `packages/rpc/src`.
Uses the library catalog's shared route/schema/card contract entry, `@smthrs/rpc`.
Validation runs locally in this clone; no push or deployment is requested.

Card IDs preserve the readable repository-path@revision form, escaping percent
signs and repository/path delimiters to keep identities unique. Malformed base64 reports
`FilePageRejected` with `invalid_encoding`. Definitions reuse the request path
validator; diagnostics enforce joint items/total nullability. Explicit retry
seconds use the existing positive finite seconds validator. An absent response
defaults to client attribution, preserving explicit origins. Direct ref resolution
uses the existing location grammar before decoding.

Validation with Node 26.5.0 after `pnpm install --frozen-lockfile --offline`:

| Finding | Failing regressions before fixes |
| --- | ---: |
| File card ID collisions | 1 |
| Unwrapped malformed base64 | 5 |
| Definition path validation bypass | 11 |
| Diagnostic items/total nullability | 3 |
| Invalid explicit retry seconds | 6 |
| Missing-response attribution | 4 |
| Direct ref resolution validation bypass | 12 |

- Focused command: `pnpm --dir packages/rpc exec vitest run test/FileRead.test.ts test/FilePage.test.ts test/FilePageRejected.test.ts test/LocalLsp.test.ts test/Refusal.test.ts test/RepositorySubjectPath.test.ts --reporter=dot`.
  Before: 42 failed, 161 passed. After: 203 passed.
- `pnpm --dir packages/rpc test --reporter=dot`: 99 files, 4,261 tests passed.
- `pnpm --dir packages/rpc run check`: passed.
- `pnpm exec smithers-build test '//packages/rpc:importRules'`: passed, zero failures.
- ESLint on the four changed source files and dprint on changed package files: passed.
- E2E: not run (mini clone).

These are pure contract changes; tagged errors and Zod validation issues remain
the observable failure boundaries. No I/O, logging of content, mocks or timed waits
were added.


Amend validation on Latitude (2026-10-22): ordinary card IDs retain their old
form; repository hyphens, path @ signs and literal percent escapes cannot
alias another file. No model-host expectations changed and no sleeps were added.
- RPC full Vitest suite: 99 files, 4,261 tests passed.
- Model-host full Vitest suite: 23 files, 465 tests passed; 100% measured coverage.
- MVP importRules: passed, zero violations.
- RPC affected files with coverage disabled: 6 files, 203 tests passed.
- Model-host HostTools with coverage disabled: 1 file, 87 tests passed.
