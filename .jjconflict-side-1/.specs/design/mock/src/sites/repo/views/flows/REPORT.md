Changed flows/: Agents.tsx, Flow.tsx, Flows.tsx, actions.tsx, flows.css, model-options.json, routes.tsx, check.mjs, REPORT.md.
Changed wiki/: Wiki.tsx, wiki.css, routes.tsx.
Route prefix for every pattern below: smithers.sh/:owner/:repo/.
flows — screens: flows-list, flows-list-empty, flows-list-loading, flows-list-error, flows-list-signed-out, flows-list-reader, flows-list-run.
flows/:name — screens: flows-overview, flows-source, flows-runs, flows-run-form, flows-run-confirm, flows-held, flows-paused, flows-loading, flows-error, flows-empty, flows-not-found, flows-signed-out, flows-run-signed-out, flows-reader, flows-run-denied.
agents — screens: flows-agents, flows-agents-disconnected, flows-agents-loading, flows-agents-error, flows-agents-empty, flows-agents-signed-out, flows-agents-reader.
wiki — screens: wiki-home, wiki-empty, wiki-new, wiki-loading, wiki-error, wiki-home-signed-out, wiki-home-reader.
wiki/:page — screens: wiki-person, wiki-proposal, wiki-proposal-confirm, wiki-edit, wiki-preview, wiki-history, wiki-not-found, wiki-page-loading, wiki-page-error, wiki-signed-out, wiki-reader, wiki-edit-denied, wiki-edit-signed-out.
Flows/agents cover ready, loading, error/Retry, empty, signed-out reads and reader restrictions; run forms also cover confirmation, held code changes and paused hosting.
Flow detail includes graph/phone list, inputs, source, runs, trigger switches and agent roles; agent models and instructions are interactive.
Wiki covers ready, loading, error/Retry, empty/new page, not found, signed-out, reader denial, Write/Preview/Save, history, proposal confirm/accept/dismiss and provenance.
Validation: browser-free check.mjs passes 56 assertions; no TypeScript diagnostics for flows/ or wiki/.
Full default build passed earlier; final build is blocked outside scope by search/Search.tsx importing ./search, which resolves to itself on this Mac and lacks searchFixtures/searchMode/searchSubject/subjects exports.
Required outside change: runs/shared.tsx must merge new records from the repo-runs:<slug> sessionStorage overlay into records and refresh its memory cache after external repo-runs-local-change events. New runs are saved and linked, but their detail page currently reports not found.
Browser/crawl/screenshots were not run, as instructed. Shared package TypeScript dependency errors also remain outside scope.
