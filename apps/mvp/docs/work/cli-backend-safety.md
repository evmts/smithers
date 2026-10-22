---
title: CLI backend export and landing safety
status: done
area: cli
owner: Codex mini/fix-packages-smithers-src-internal-backend-718825
updated: 2026-10-21
links: [../../../../packages/smithers/docs/backend-safety.md]
---

Reproduce and fix the seven backend findings with filesystem and loopback HTTP
regressions. No push, deployment, or Playwright run in this mini clone.

The original code failed all 14 initial regression cases: staging symlink
overwrite, concurrent writers sharing a file, `0644` output, unpinned merges,
dismissed approval, omitted second pages, dot normalization in both encoders,
and dropped OAuth query parameters. The command was
`pnpm --dir packages/smithers exec vitest run test/BackendSafety.test.ts --coverage.enabled=false`.
Five additional boundary cases cover private streaming, interrupted-download
cleanup, incomplete/oversized evidence, and an exact page boundary.

The broader backend run also fails `BackendManagedTerminalCredentials.test.ts`
on this Mac: the unchanged token reader deliberately uses Linux
`/proc/self/fd`, which macOS does not supply. Its failure was present in the
initial broader run. This work does not change token-file behavior.

Validation: 848 tests passed across `BackendSafety`, `BackendStack`,
`BackendMutations`, `BackendCommands`, and `ProductApi`, using
`pnpm --dir packages/smithers exec vitest run test/BackendSafety.test.ts test/BackendStack.test.ts test/BackendMutations.test.ts test/BackendCommands.test.ts test/ProductApi.test.ts --coverage.enabled=false`.
The package importRules target, `tsc -p tsconfig.test.json --noEmit`, and
ESLint over the changed backend sources passed. The target index was
regenerated. Playwright: not run (mini clone).

Final broader run: 1,313 tests passed in 28 files with
`pnpm --dir packages/smithers exec vitest run test/Backend test/ProductApi.test.ts --exclude test/BackendManagedTerminalCredentials.test.ts --coverage.enabled=false`.
Only the already failing Linux-only test was excluded. The four older stack
fixtures now recognize pagination query strings and pass in this run.
`pnpm exec smithers-build lint '//:targetIndex'` also passed.
