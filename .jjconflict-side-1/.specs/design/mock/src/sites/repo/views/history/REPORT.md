h2-history-fixes
Changed: history/{Branches.tsx,Commits.tsx,Commit.tsx,Tags.tsx,Terminal.tsx,shared.tsx,history.css,REPORT.md}.
Route patterns added: none. Screen ids added: none; existing routes and screens are unchanged.
Removed Files/Commits/Branches/Tags sub-navigation from every history page; kept page headers and code.browse registration.
Branches use fixed-width behind/ahead bars, a center divider, and a single-line pull chip; status moves below the name under 900px.
Row actions use a terminal icon and ghost Sandbox button, with full text and /box.open in its title.
Running and suspended sandbox status remains below the branch name.
Branch and author filters use the shared button class, body type, and --ctl-h.
Terminal labels use sandbox <id> and ~/<repo>; internal sandbox ids remain available for links and saved state.
Frame registerSlash is available. Retained branch.fork, branch.rebase, branch.archive, branch.new, box.open, box.suspend, box.resume.
Commits/Commit: ready, loading, error with Retry, empty, public signed-out/reader access.
Tags: ready, loading, error with Retry, empty, public signed-out/reader access.
Branches: ready, loading, error with Retry, only-default empty, filters, forms, signed-out acts, reader/denied acts, paused host.
Terminal: running, suspended, hosted paused, loading, error with Retry, empty, sign-in, denied.
Verification: history routes bundle passes independently; history CSS parses for Safari 17 and Chrome 120.
TypeScript: no history diagnostics; unrelated search and shared-ui diagnostics prevent a global pass.
Default build attempted twice; blocked by search/Search.tsx importing ./search, colliding with search.ts on this filesystem.
Needed outside ownership: give search.ts a distinct basename and update its import in Search.tsx, then rerun the default build.
Browser crawl/screenshots were not run, as instructed.
