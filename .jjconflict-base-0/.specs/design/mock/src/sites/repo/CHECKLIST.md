| Row | Verdict before | What changed |
|---|---|---|
| 8 | partly | Public reads already worked; opened signed-out Stack reading while keeping writes gated. |
| 9–11 | holds | Repo tabs/counts/Ask, commit/branch/release summary, and prompt composer already hold; frame/code-home read only. |
| 12 | partly | Kept hover/definition/diagnostics/range actions; made code TODO creation reach the Stack. |
| 13 | partly | Registered picker doors; kept ref/path/query through history; cleared stale prior-blame state; pinned tag permalinks to tag SHA; corrected omitted-file history links. |
| 14–18 | holds | Blame, history, commit evidence, branch/tag powers, and issue forms/actions already exist on current fixture routes. |
| 19 | partly | Merged new issue/code TODOs into saved Stack order and restored them on direct visits; is:todo already works. |
| 20 | holds | Conversation, Commits, Checks, and Files changed already have direct PR routes. |
| 21 | partly | Added list links to recorded review receipts and focused their timeline entry; linked runs and next-review action already exist. |
| 22–24 | holds | Runs/inbox, inline question and human resume, graph/trace/cost/landed evidence already exist; current waiting fixture is run-511. |
| 25 | partly | Fixed newly launched flow runs missing from run detail/list and stale overlay reads; source/graph/triggers/schedules/models already exist. |
| 26 | partly | Accepted GitHub's wiki/Home spelling; edit, provenance, revisions, and proposals already exist. |
| 27–30 | holds | Release notes, held/enabled Models, cross-subject search, and sandbox terminal/watch/SSH already exist. |
| 31 | partly | Cleared file-tree content/grid from non-ready states; fixed omitted-file empty precedence and Settings empties; corrected local/hosted gates and unavailable retries. Detail read states already exist. |
| 32 | partly | Registered owned button titles against their actual controls; added public navigation doors and distinct final-submit commands; preserved typed handlers and gates. Outside-scope registry gaps listed below. |
| 48 | holds | Direct subject routes already render the selected view inside RepoFrame without a trailing repo home. |

Changed: ui/BranchPicker.tsx; views/code/{Blame.tsx,File.tsx,Tree.tsx,code.css,routes.tsx,check.mjs}; views/history/{Branches.tsx,Commit.tsx,Commits.tsx,Tags.tsx,Terminal.tsx}; views/issues/{Issue.tsx,Issues.tsx,NewIssue.tsx,shared.tsx,model.ts}; views/pulls/{PullPage.tsx,PullsList.tsx,Stack.tsx,shared.tsx,Conversation.tsx,PullFiles.tsx,routes.tsx,review-fixes.test.mjs}; views/runs/{Run.tsx,Runs.tsx,Approvals.tsx,shared.tsx}; views/flows/{Flow.tsx,Flows.tsx,Agents.tsx}; views/evals/{Suite.tsx,Evals.tsx}; views/wiki/{Wiki.tsx,routes.tsx}; views/docs/Docs.tsx; views/search/{Search.tsx,check.mjs}; views/settings/{Settings.tsx,shared.tsx,routes.tsx}; views/releases/Releases.tsx.
Created: CHECKLIST.md; views/checklist/{ViewFrame.tsx,check.mjs}. No frame/core/app/front/code-home changes.
Routes: no new patterns. Screens: code-blob-tag, code-blob-smithers-omitted, code-blob-effect-omitted, settings-general-empty, settings-sync-empty, settings-reporting-empty, wiki-github-home.
States: ready, loading, error with Retry, empty, public signed-out reads; write sign-in, reader denial, and held/unavailable acts. Effeck now has contents for every listed file; omitted-content fallback verified on Smithers/Effect.
Verified: 884 checklist assertions; code 78; flows/agents/Wiki 56; search/docs/releases 294; pull/run 4; issue regressions pass. Repo-scoped tsc prints nothing. Build with --no-prerender succeeds.
Blocked: exact node build.mjs --site=default bundles, then Chromium prerender hits sandbox MachPort Permission denied. No crawl/shot or visual QA run; orchestrator must complete them.
Done (pm21b): code home shares registered navigation and control doors; frame/account/Ask commands use registerSlash.
