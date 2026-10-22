---
title: Rework GitHub write outcomes and keyed actions
status: done
area: integrations
owner: codex-mini-fix-rework-06799a9d-051430
updated: 2026-10-22
links: []
---

Reworked bounced 06799a9d9d48 against main@origin (4de8f49e). Uses the GitHub
entry in `docs/libraries.md`: `@smthrs/integrations` and its injected Effect HTTP client.

- Retry permission retains the unknown write outcome after a transport failure,
  body failure, deadline or 5xx, including trace attributes.
- Sticky comment and check-run reconciliation serialize by key across independently
  constructed action layers. Cancellation preserves occupied gates; failed and
  interrupted owners release them. The gate is process-local; separate processes
  still require one owner per key.
- Pull request closing references come from GitHub, preserving descriptions and
  ignoring apparent closing keywords inside Markdown code or comments. The removed
  text predicate is re-proved through the action's real reconciliation path.
- Retained the existing HTTP/HTTPS transport contract. The bounced change's unrelated
  blanket HTTPS credential restriction broke loopback GitHub auth. Dropped that
  restriction and its TLS fixture migration; added real HTTP Bearer and Basic
  regression cases. No app auth implementation changed.
- Dropped stale generated target-index hunks; source targets are discovered correctly.
  Added one integrations ImportRules block for platform boundaries and behavioral tests.

Validation on Node 26.5.0:

- `pnpm install --frozen-lockfile --offline`: passed. Shared disk exhaustion interrupted
  later runs; restored this clone's dependencies with the same command plus
  `--package-import-method=hardlink`. No other builder directory was changed.
- Main's full integrations suite: 831 passed, four credentialed live cases skipped.
  The six affected regression suites against main production code: 16 failed,
  284 passed. The failures reproduce ambiguous-outcome loss, false Markdown closing
  references, and duplicate concurrent comments/check runs.
- Final full integrations suite: `pnpm --filter @smthrs/integrations exec vitest run
  --configLoader=native --cache=false --maxWorkers=4`: 837 passed, four live cases
  skipped. Coverage gate passed unchanged: branches 100%, statements/lines 99.95%,
  functions 99.85%; the remaining gap is the existing PostgreSQL SourceStore arm.
- MVP A/B, restoring only integrations production sources to main and then reapplying:
  `pnpm --dir apps/mvp exec vitest run --configLoader=native --cache=false
  --coverage.enabled=false --maxWorkers=4` (default and JSON reporters). All 233 files
  match: 1306 passed, two expected failures, 368 failures, 1296 skipped on BOTH revisions;
  112 failed files, 118 passed files, three skipped files. Zero new failed tests or files,
  and no missing files. Existing failures include unavailable PostgreSQL at localhost:54321
  and missing Docker. Native config loading avoids temporary config writes during disk pressure.
- `rg -l '(@smthrs/integrations|GitHub|github)' apps/mvp/worker -g '*test.ts'`
  selects 53 worker files; every one ran in both whole-app runs. Both have 65 passing
  assertions and 824 skipped cases, many blocked by failed PostgreSQL setup. Failed
  file sets match. `worker/GitHubAuth.test.ts` passes all 10 in both runs, including
  user identity, permissions and Basic-auth revocation over real loopback HTTP.
- `pnpm exec smithers-build test '//packages/smithers/agent/integrations:importRules'`
  and `pnpm exec smithers-build test '//apps/mvp:importRules'`: passed.
- `pnpm --filter @smthrs/integrations exec tsc -p tsconfig.test.json --noEmit`: passed.
- `pnpm exec tsc --noEmit` in apps/mvp: passed on main and the rework.
- dprint check on every changed TypeScript file: passed.
- Astra review: no findings. Fable unavailable. No Playwright runs, push or deployment.

One local commit and the requested mini bookmark only. Raw validation reports remain
in the ignored `.rework/` directory of this clone.
