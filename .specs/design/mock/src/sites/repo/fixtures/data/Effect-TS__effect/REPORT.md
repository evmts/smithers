Created only `.specs/design/mock/src/sites/repo/fixtures/data/Effect-TS__effect/`.
Files: 21 Dataset-field JSON files; `relations.json`, `release-plan.json`, `ci-projects.json`, `ownership.json`, `package-releases.json`; `index.ts`, `types.ts`, `manifest.json`, `generate.py`, `check.mjs`, `REPORT.md`.
Exports: typed `dataset`, `extras`, `MOCK_NOW`, and documented extra interfaces. Clock: `2026-10-18T05:00:00Z`.
Counts: 38 packages (31 public / 7 private), 1,256 tree entries, 110 blobs, 4 blamed files, 50 commits (8 agent-made), 13 branches, 4 tags, 7 labels.
Work: 24 issues, 10 PRs, 6 stack entries, 16 runs, 3 approvals, 6 flows, 4 agents, 4 people.
Docs: 4 wiki pages, 11 docs pages, 4 rc releases, 123 package-release records; 456 project/runtime cells across 4 CI runs.
Connected scenario: issue #42 → TODO → PR #101 → run-4802 Bun failure → maya requests changes; no successful landing claimed.
States: open/closed issues; open/draft/merged/closed PRs; all six run states; waiting/approved/denied approvals; excluded/skipped runtime results and push-only skips.
Routes/screens added: none. Views and flag-driven loading/error/empty/auth states belong to the UI tasks.
Validation: `check.mjs` passes counts, references, ownership, source hashes, blame, hunks, runtime exclusions, timestamps, identity scrub and the 2.5 MB limit; folder approximately 2.45 MB.
Validation: `node build.mjs --site=default` passes. TypeScript emits no errors under `src/sites/repo`; the full check reports shared UI dependency/typing errors outside this task.
Browser: not run, as instructed.
Gap: checkout uses `packages/effect/src/sql/SqlClient.ts`; `packages/effect/src/unstable/sql/SqlClient.ts` does not exist. The scenario uses the real path.
Gap: `Schema.ts` contains the permitted first 600 lines plus a trailing excerpt comment. Full historical changelog blobs exceed 5 MB; four complete sanitized rc sections per public package are extracted where present.
Gap: `@effect/ai-typesafe` has no rc.115 changelog section, so that package-release record is absent.
Gap: exact next versions remain null until pinned Changesets 3.0.3 executes; the release-plan run waits for maya's preview approval.
Needed in shared registry: `import { dataset as effect } from "./data/Effect-TS__effect"`, then add `"Effect-TS/effect": effect` to `DATASETS`.
Needed from UI owners: consume exported `extras`; handle home destinations `packages`, `releases/plan`, and `settings/ownership` alongside the approved flow routes.
