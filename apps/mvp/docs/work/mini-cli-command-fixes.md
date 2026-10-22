---
title: CLI command correctness and resource limits
status: done
area: sdk
owner: codex-mini-fix-packages-smithers-src-commands-925725
updated: 2026-10-21
links: [../../../../packages/smithers/docs/command-safety.md]
---

Reproduce and fix seven confirmed findings in Open, Bug, Claude node waiting,
and FlowCatalog. Use the catalog's existing @smthrs/control service and Effect;
no new libraries. Validate regressions before and after, affected CLI suites,
and the package importRules target. No pushes or end-to-end runs in this clone.

Validation (Node 26.5.0, mini clone):

- `pnpm install --frozen-lockfile --offline`: passed.
- From `packages/smithers`, `pnpm exec vitest run --config vitest.config.ts --coverage.enabled=false test/Open.test.ts test/CommandVerbs.test.ts test/CommandProjections.test.ts test/Bug.test.ts test/ClaudeMirror.test.ts test/NodeOutput.test.ts test/BoundedEvents.test.ts`: parent sources 117 passed / 16 failed; fixed sources 132 passed / 1 failed. All 15 checks covering the seven findings changed from failing to passing.
- The unchanged failure is Bug.test.ts's real CLI startup: the native `smithers-jj-export` helper is absent in this clone. A direct CLI diagnostic confirms the fail-closed filesystem refusal before the report command runs. No new failures.
- `pnpm exec tsc -p packages/smithers/tsconfig.test.json --noEmit --pretty false`: passed.
- `pnpm exec smithers-build test '//packages/smithers:importRules'`: passed. Added the previously absent target; it checks the four affected command modules and their three command test files.
- ESLint on the four source files: passed. Test files have no matching ESLint configuration; importRules and TypeScript check them.
- Formatted the affected files using the installed dprint 0.57.1 binary from this clone's pnpm virtual store (no root dprint bin is linked).
- E2e: not run (mini clone).

Behavior and library choice: [command safety](../../../../packages/smithers/docs/command-safety.md).

Finished-work review: Codex Astra reviewed the changes and found no concrete
introduced bugs or material regression gaps. Fable review was unavailable:
there is no Fable model, tool, or executable in this session.

`pnpm run target-index` regenerated the declaration index;
`pnpm exec smthrs lint '//:targetIndex'` passed with no drift. The regeneration
also removed a stale reference to an absent, ignored `api.md.orig` artifact.
The affected-file dprint check and source ESLint check both passed.
