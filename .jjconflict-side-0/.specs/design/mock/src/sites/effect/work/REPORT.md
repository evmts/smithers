Files: effect/docs/{Docs.tsx,docs.css,model.ts,routes.tsx,scenarios.json}; effect/work/{Ownership.tsx,work.css,model.ts,filters.ts,routes.tsx,check.mjs,REPORT.md}.
Route: smithers.sh/:owner/:repo/docs — package index; delegates to stage-1 Docs when config.packages is absent.
Route: smithers.sh/:owner/:repo/docs/* — README, API and guide pages; same fallback.
Route: smithers.sh/:owner/:repo/settings/ownership — register before settings/:section; Effect entry already imports both route exports.
Screen IDs (prefix effect-docs-): index, index-scoped, loading, error, empty, signed-out, reader.
Screen IDs (prefix effect-docs-): sql-pg, api, stale, missing, no-package-docs, generation-failed, generation-preview.
Screen IDs (prefix effect-docs-): generation-held, generation-denied, generation-signed-out, generation-model-none, page-loading, page-error, page-empty.
Screen IDs (prefix effect-ownership-): ready, tester-match, tester-fallback, edit, reader, signed-out, loading, error, empty.
Docs covers public and reader access, package scope, loading/retry, empty, missing, stale source, failed generation, held generation and disconnected model.
Generation: Requested → Running → preview → human acceptance; deduplicates, persists by package/ref, progresses after navigation and writes shared run records.
Ownership covers member access, loading/retry, empty, matching/fallback, unmatched paths, inline edit, persisted Save and toast; signed out uses SignInWall and readers use Denied.
Filters export issuesFor(scope, records?), pullsFor(scope, records?), runsFor(scope, records?); accepts package object/name/slug/null; shared and unknown associations stay visible.
Issues.tsx / IssuesContent: replace `all = empty ? [] : loaded` with `all = empty ? [] : issuesFor(query.get("package"), loaded)` before filtering, sorting and counts; add package to the useView key.
PullsList.tsx / PullsReady: read location query; set `all = flags.data === "empty" ? [] : pullsFor(params.get("package"), pulls.map(localPull))`; existing counts, filters and next-to-review then use scoped records.
Runs.tsx / RunsReady: destructure `records: allRecords` from useRunRecords; set `records = runsFor(query.get("package"), allRecords)` before waiting, status filters and summary counts.
All three lists: carry package through search/status/flow URLs and detail links using withScope; Pulls setQuery must clone existing params, and Runs listURL/navigation must preserve package. Keep detail contents and overall status complete.
List changes above are reported only; no stage-1 files were edited. Import helpers from ../../../effect/work/filters in stage-1 view files.
Validation: default and Effect builds pass with --no-prerender; 155 DOM assertions pass, including every registered screen, single-package fallback and generation continuing across repository navigation.
TypeScript: no diagnostics in effect/docs, effect/work or src/sites/repo; full project check still reports existing packages/smithers/ui dependency/type errors.
Exact default build reaches prerender, then Chromium launch fails with sandbox bootstrap_check_in permission denial. Browser crawl/screenshots remain for the orchestrator; no crawl.mjs or shot.mjs was run.
