---
title: Native control internal bug regressions
status: done
area: cli
owner: Codex mini internal fixes
updated: 2026-10-21
links: []
---

Reproduce and fix the eight assigned internal control findings. Use existing
catalog entries @smthrs/control, @smthrs/registry and @smthrs/journal; add no libraries.
Validation runs in this mini clone; Playwright is not run.

All eight findings reproduced and fixed. Before the fixes, 14 regression cases
failed for the assigned causes across AuthoredRebuild, BoundedEvents,
NativeControlInitialization and NativeControlPlanningFailures. The valid-plan
control case passed before and after.

Validation (Node 26.5.0, pnpm frozen install; offline retry required missing
@astrojs/check metadata):

```sh
pnpm --filter @smthrs/cli exec vitest run --coverage.enabled=false test/{AuthoredRebuild,BoundedEvents,NativeControlInitialization,NativeControlPlanningFailures,NodeApprovalAuthority,RegistryRefreshPlanning,OperatorStore}.test.ts
```

33 passed in seven files. Changed production files pass ESLint and changed
TypeScript files were formatted with the package's dprint.

Broader comparison added NativeControlPlan and NodeComposition with
`-t '^(?!.*the revision)'`: 89 passed, 23 failed, five skipped. Every remaining
failure is the pre-existing missing smithers-jj-export filesystem helper, also
observed before the fixes. Git-creating revision tests were excluded to honor
the no-git instruction. E2e: not run (mini clone).

Astra reviewed the final production changes and found no actionable issues.
No new libraries, runtime, storage path or retry loop was introduced.
