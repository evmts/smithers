Changed src/sites/effeck-site-main.tsx: Effeck fronts, sign-in and every shared repository route; starts at effeck.dev/.
Changed fixtures/data/effeck__effeck/{index.ts,check-fixtures.mjs,REPORT.md}; added evals.json.
Changed dataset JSON: agents,approvals,ask,blame,branches,commits,files,flows,issues,labels,people,pulls,releases,repo,runs,settings,stack,tree,wiki.
Created views/hovers/{model.ts,DocsCode.tsx,index.ts,hovers.css,check.mjs,screens.json,REPORT.md}.
Permitted Docs change: one import `import { DocsCode } from "../hovers"`; code renderer becomes `<DocsCode code={block.text} />`.
Exact 41 route patterns and all 125 curated screen IDs/URLs: [screens.json](screens.json); every screen is tagged effeck-site, with no tinyhttp screens.
Front patterns: __screens, effeck.dev/, effeck.dev/*, smithers.sh/signin. All 37 repository patterns use the shared smithers.sh/:owner/:repo routes.
Core IDs (all prefixed effeck-site-): home,tree,directory,file,blame,terminal,commits,file-history,commit,branches,tags,issues,new-issue,issue,pull-commits,pull-checks,pull-files,pull,pulls,stack,run,approvals,runs,flow,agents,flows,evals,golden-set,wiki-page,wiki,docs,docs-page,release,releases,models,settings,search.
Showcase IDs: docs-hover-find,docs-hover-signed-out,fixed-by-agents,receipt-32,receipt-33,receipt-34,docs-examples-compile; twenty golden-case-<source-folder> IDs are enumerated in screens.json.
States: shared views retain their states; home/docs/evals/suite screens cover ready,loading,error+Retry,empty,signed-out,reader; actions cover held,sign-in and denied.
Golden set: all 20 source pairs, per-case expected Effeck and compile reasons; exact gate is 16 of 20 compile, hero included.
Illustrative latest 14/20, hero passing; converter remains off for Monday until a real gate passes. Expected pairs also appear in the prompt.
Docs compile suite: six pages, linked mock run and history; modeled results never claim executed compiler receipts.
Hovers resolve identifiers by name from current .effeck fixtures, disambiguate by code context, and expose definition/reference links; mouse, keyboard and /docs.symbol work.
Factory #31 resolves Reported → Accepted → Working → In review → Landed, with a human landing. Runs include convert-golden,docs-sync,implement-issue,release.
Validation: 12,565 fixture checks; 573 route/DOM/interaction checks; both site builds pass with --no-prerender; no TypeScript diagnostics for owned files or shared repo files.
Standard build's Chromium prerender is blocked by the sandbox's Mach-port permission. No crawl.mjs or shot.mjs was run; visual review remains with the orchestrator.
Needed in frame/RepoFrame.tsx: use repo.config.evals?.title ?? "Evals" for the eval tab label (currently hard-coded Evals).
Needed in views/code-home/CodeHome.tsx: route known effeck.dev home links through Link so Install/Docs stay inside this mock; canonical .smithers/home.json URLs are preserved.
Needed in views/evals/Suite.tsx: render expected source in a semantic code slot. Until then the full source is preserved in detail text, with indentation retained in this entry.
No VCS commands, commits, dependency changes or changes to core/app/front/build/crawl/shot.
