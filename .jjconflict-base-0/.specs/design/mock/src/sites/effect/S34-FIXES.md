Changed paths relative to `.specs/design/mock/`:
- `src/sites/repo/frame/RepoFrame.tsx`: use declared Evals and Docs titles.
- `src/sites/repo/ui/BranchPicker.tsx`: connect each filter label through `useId()`.
- `src/sites/effect/releases/ReleasePlan.tsx` and `releases.css`: show the plan before actions; put the compact local command in the action area when held.
- `src/sites/effect/docs/routes.tsx`: resolve a review-screen ID collision with public docs.
- `src/sites/effect/s34-fixes.test.mjs`: seven DOM regression checks; four failed before the fixes.
- `src/sites/effect/S34-FIXES.md`: this report.

Route patterns added: none.
Screen ID renamed on `smithers.sh/:owner/:repo/docs`: `effect-docs-index` → `effect-docs-packages-index`; the public docs screen retains its ID.
Code home already uses `commit(entry.sha) ?? lastCommitFor(entry.path)`; verified distinct commits, dates and fallback without changing it.
Packages, package home and release plan already select Code; ownership selects Settings. Verified ready/loading/error/empty renders.
Code home states: ready/loading/error/empty/public signed-out; sandbox sign-in/denied/held.
Packages states: ready/loading/error/empty/public signed-out; package home also has missing and check sign-in/denied/held/model-required.
Ownership states: ready/loading/error/empty/signed-out/denied.
Release-plan states: ready/loading/error/empty/sign-in/denied/held/stale/running/preparation-failed/existing-PR.
Checks passed: seven new regressions, shared frame regressions, 93 release assertions, Effect entry (50 routes, 143 unique screens).
All four site bundles pass with `--no-prerender`: effect, effeck-site, smithers-site, default.
Full builds require Chromium prerendering, which fails with sandbox Mach-port permission denial; crawl and screenshots remain with the orchestrator.
TypeScript reports no errors in owned files; the full check fails on existing shared UI dependency-resolution errors.
The package picker is in unowned `src/sites/repo/frame/packageScope.tsx`; its single rendered instance labels correctly. No out-of-scope changes are required for these screens.
