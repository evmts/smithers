Stage 2 report: `../../../views/evals/REPORT.md`. Current dataset: 5 eval families, 51 runs, 5 flow/command cards, 33 complete source blobs, 6 Ask samples. Author metadata and approvals use maya; lander is the configured landing user. The generator invokes `extend.py`, repeats byte-stably, and passes 4,576 fixture checks. See `SOURCES.md` for synthesized-history and recorded-wave limits.
The following is the historical stage 1 handoff: 22 JSON files, `index.ts`, `generate.py`, `check.mjs`, `SOURCES.md`, `REPORT.md`.
Counts per JSON file:
`MOCK_NOW: 1`, `repo: 1`, `people: 3`, `tree: 1104`, `files: 25`, `blame: 25`.
`commits: 100`, `branches: 7`, `tags: 4`, `labels: 7`, `issues: 60`, `pulls: 27`.
`stack: 8`, `runs: 46`, `approvals: 1`, `flows: 4`, `agents: 2`, `wiki: 3`.
`docs: 6`, `releases: 4`, `settings: 1`, `ask: 5`.
All 25 blobs are complete; two have symbols; the newest 25 commits have exported diffstat paths and the newest 10 have reconstructed previews.
Three disallowed-author pulls were dropped; all 60 issue authors qualify. Four closed issues have landing receipts.
States: queued, landing, landed, refused; running, waiting, failed, succeeded; stale GitHub sync; rc.13 preparation awaits roninjin10.
Routes/screens added: none. Shared views supply loading, error/retry, empty, signed-out, denied and held-host states.
Self-check: `node src/sites/repo/fixtures/data/smithers-canary__smithers/check.mjs` → `PASS 4247 checks · 22 JSON fields · Dataset type contract`.
Build: `node build.mjs --site=default` passed, producing `dist-default-ui/index.html` (1755 KiB).
Typecheck: no diagnostics in this folder; the full project reports unrelated Effect dataset/UI dependency errors.
Limits: the checkout is older than history; exact patches, historical tag-tip receipts and pull bodies are unavailable. Two receipt agent attributions are inferred; stable release date is illustrative. Details: `SOURCES.md`.
No root `WORKSPACE.ts` exists. Browser crawl/screenshots were not run, as instructed.
Registry import to add: `import { dataset as smithersDataset } from "./data/smithers-canary__smithers"`.
Register under `smithers-canary/smithers`; shared history/file views must handle out-of-window tag refs and unloaded blobs truthfully. Registry and shared files were not edited.
