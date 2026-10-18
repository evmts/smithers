Changed `src/sites/smithers-site-main.tsx`; added `views/evals/{Evals,Suite,History}.tsx`, `actions.tsx`, `model.ts`, `routes.tsx`, `evals.css`, `check.mjs`, this report.
Added the eval family in `repo/routes.tsx`; added only the conditional Evals tab and regressed/total badge in `frame/RepoFrame.tsx`.
Dataset JSON changed: `{evals,repo,people,commits,branches,issues,pulls,stack,runs,approvals,flows,agents,wiki,settings,ask,tree,files,blame}.json` under `fixtures/data/smithers-canary__smithers/`.
Dataset support changed: `index.ts`, `generate.py`, `check.mjs`, `SOURCES.md`, `REPORT.md`; added `extend.py`.
New route patterns: `smithers.sh/:owner/:repo/evals`, `smithers.sh/:owner/:repo/evals/:suite`.
List states: ready, loading, error/retry, empty, signed-out read-only, reader read-only. Suite adds confirmation, sign-in, denied, held/local-copy, paused, missing, expanded cases, and queued-run link.
Curated IDs use prefix `smithers-site-` with these exact suffixes:
`all-screens, home, home-signed-out, home-loading, home-error, home-empty, tree, directory, file, blame, terminal, commits, file-history, commit, branches, tags`.
`issues, fixed-by-agents, new-issue, issue, receipt-4218, receipt-4217, receipt-4214, receipt-4209, pull-commits, pull-checks, pull-files, pull, pulls, landing-queue, queue-reader`.
`run, approvals, runs, runs-issue-triage, runs-docs-sync, runs-land, runs-release, flow, agents, flows, evals, eval-suite, wiki-page, wiki, docs, docs-page, release, releases, models, settings-denied, settings, search`.
Eval screen IDs use prefix `smithers-evals-` with these exact suffixes:
`list, loading, error, empty, signed-out, reader, review, case, authoring, recommend, swebench, agent, suite-loading, suite-error, suite-empty, suite-signed-out, suite-reader, confirm, held, denied, signin, paused, missing`.
The site registers 42 patterns and 92 screens; every repo pattern has a concrete Smithers screen. Front screens are retagged; tinyhttp screens are removed. Start: `smithers.sh/`.
Verified both requested builds, 198 browser-free interaction/route checks, 4,576 fixture checks, and byte-stable regeneration. TypeScript reports no errors in the named files or repo views; unrelated Effect/UI errors remain.
History and five snapshot run records are illustrative. SWE-bench remains the recorded 1/5 vs 5/5 fixture wave. Authoring is inconclusive. Neither source has an executable fixed-suite adapter, so their run cards explain that limit.
Needs `front/`: a direct mirror link on the Monday landing and a Smithers launcher row; current landing has no direct repo-home link.
Needs shared home/Ask owners: handlers for `/prs.triage`, `/wiki.ask`, `/triggers.register`; those three real home app cards currently reach unavailable-command replies.
Needs `views/pulls/Stack.tsx`: remove Add TODO from this landing queue; use landing terminology. Needs `views/flows/actions.tsx`: prevent a member from bypassing the queue by directly launching `land`.
Shared fixture API follow-up: export a live typed `evals` binding and add optional `note`, `runnable`, `unavailable` metadata. Until then, dataset index projects suites through `repo.config.evals.suites`; the generic views read only the shared fixture index.
Browser crawl, screenshots, and visual overflow verification were not run under the sandbox restriction.
