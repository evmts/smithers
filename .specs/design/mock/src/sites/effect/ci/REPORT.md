Created only `src/sites/effect/ci/`: `routes.tsx`, `Matrix.tsx`, `Affected.tsx`, `LocalRun.tsx`, `model.ts`, `commands.ts`, `scenarios.json`, `ci.css`, `check.mjs`, `REPORT.md`.
Routes: `smithers.sh/:owner/:repo/runs/:id/matrix`; `smithers.sh/:owner/:repo/runs`; `smithers.sh/:owner/:repo/runs/:id`.
The runs route opens the affected form at `?affected=1`; otherwise it delegates to stage 1. Run detail delegates to stage 1 except for locally launched runs and the setup-failure scenario.
All screen IDs have prefix `effect-ci-`:
`matrix-failed`, `matrix-all-pass`, `matrix-running`, `matrix-setup-failure`, `matrix-scoped`, `matrix-cancelled`, `matrix-excluded`, `matrix-missing`, `matrix-loading`, `matrix-error`, `matrix-empty`, `matrix-signed-out`.
`affected-form`, `affected-confirm`, `affected-shared`, `affected-held`, `affected-loading`, `affected-error`, `affected-empty`, `affected-signed-out`, `affected-denied`.
`setup-log`, `failure-log`.
Matrix covers ready, running/pending, cancelled, setup failure with log tail, scoped overall failure, skipped/excluded/unreported, loading, retryable error, empty, and signed-out reading.
Affected covers preview, confirmation, running launch, shared-input widening, empty, loading, retryable error, signed-out, reader denied, and held with a copyable local command.
Affected launches persist per tab and deduplicate by ref/revision. Ask accepts `/run.affected`, `/run.affected.confirm`, `/ci.job`, and `/ci.failures`.
Validation: default and Effect builds passed before parallel changes. Both then passed with `--no-prerender`; the shared build gained browser prerendering and its plain command fails at the sandbox's Chromium launch restriction.
Latest Effect integration rebuild is blocked by another task: `effect/work/Ownership.tsx` imports `./ownership`, resolving to itself on this Mac and missing export `ownershipFor`.
TypeScript: zero diagnostics in owned CI files and shared repo files; unrelated shared UI diagnostics remain.
`node src/sites/effect/ci/check.mjs` from the mock root passes: 114 cells, state accuracy, dependency closure, widening, access/held gates, scope preservation, launch deduplication, and reload.
Browser crawl/screenshots remain with the orchestrator; neither was run.
Shared change needed: add a Matrix tab/link to stage 1's `RunReady` tabs for check/affected runs, targeting `to('runs/' + item.id + '/matrix')` with package scope.
Shared change needed: `frame/packageScope.tsx` should retain `/runs/:id/matrix` when changing package scope; it currently navigates to `/runs`.
