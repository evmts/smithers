Files changed: `routes.tsx`.
Files created: `Tree.tsx`, `File.tsx`, `Blame.tsx`, `CodeView.tsx`, `shared.tsx`, `code.css`, `react-dom.d.ts`, `check.mjs`, `REPORT.md`.
Route: `smithers.sh/:owner/:repo/tree/:ref`.
Route: `smithers.sh/:owner/:repo/tree/:ref/*`.
Route: `smithers.sh/:owner/:repo/blob/:ref/*`.
Route: `smithers.sh/:owner/:repo/blame/:ref/*`.
Screens: `code-tree-root`, `code-tree-root-empty`, `code-tree-src`, `code-tree-middleware`.
Screens: `code-tree-empty`, `code-tree-loading`, `code-tree-error`, `code-tree-not-found`.
Screens: `code-blob-router`, `code-blob-lines`, `code-blob-diagnostic`, `code-blob-readme`.
Screens: `code-blob-readme-code`, `code-blob-raw`, `code-blob-loading`, `code-blob-error`.
Screens: `code-blob-empty`, `code-blob-not-found`, `code-blob-image-not-found`, `code-blob-todo`.
Screens: `code-blob-signed-out`, `code-blob-signin-wall`, `code-blob-reader`.
Screens: `code-blame-router`, `code-blame-agent`, `code-blame-readme`, `code-blame-loading`.
Screens: `code-blame-error`, `code-blame-empty`, `code-blame-signed-out`.
Tree states: ready, loading, error/retry, empty, missing; public reading signed out or as reader.
File states: ready, line selection, diagnostic, symbol card, Markdown/code, raw, loading, error/retry, empty, missing, unavailable preview, signed out, reader denial, TODO form/created.
Blame states: ready, agent attribution/run link, loading, error/retry, empty, missing, signed out, TODO permission states, unavailable historical snapshot.
Validation: default-site build passed; 78 DOM behavioral checks passed, including all four datasets; no browser launched.
Types: no errors under `src/sites/repo`; unrelated front-page/shared UI errors remain in the complete project check.
Shared gaps handled locally: CodeView symbol/diagnostic/syntax slots and linked TODO toast; no shared files edited.
Needs frame owner: Ask dispatch for `/todo.create`, `/file.view`, `/file.copy`, `/files.toggle`, `/code.symbol`, `/diagnostics.show`; titles already expose these commands.
Needs fixture owner: revision-indexed file/blame snapshots. Prior links reach the parent SHA and show an explicit unavailable state; other refs share fixture content.
Browser screenshots, visual overflow checks, and crawl remain with the orchestrator; binary preview is unavailable and the image screen truthfully reports a missing path.
