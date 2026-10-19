Changed paths below are relative to `.specs/design/mock/src/sites/repo/`.

- `ui/Markdown.tsx`: safe HTML subset; comments removed; centered ASCII preserved; unknown images show alt text.
- `views/code-home/CodeHome.tsx`, `views/code-home/code-home.css`: prompt, one app row, links and evidence before files; README Ask only without a prompt.
- `views/pulls/Stack.tsx`, `views/pulls/shared.tsx`: configured Stack naming, queue-only controls, clean item titles and landing states.
- `views/evals/Evals.tsx`, `views/evals/Suite.tsx`: explicit list/suite Ask context.
- `views/evals/check.mjs`: rendering and interaction regressions for all four fixes, including default-repo behavior.
- `fixtures/types.ts`: optional `RepoConfig.stack` with title and Add TODO policy.
- `fixtures/data/smithers-canary__smithers/repo.json`, `generate.py`: matching Landing queue configuration.
- `views/code-home/S2-FIXES.md`: this report.

Route patterns added: none. Screen IDs added: none.
Home, Stack and evals retain ready, loading, retryable error, empty, signed-out and reader states; write actions retain denied/held states.
Validation: 230 interaction/route checks and four existing pull/run regression tests passed; generator/config parity passed.
Both site bundles build with `--no-prerender`: `dist-smithers-site/index.html`, `dist-default-ui/index.html`.
Exact build commands reach prerendering, then sandboxed Chromium fails with `bootstrap_check_in ... Permission denied (1100)`.
TypeScript: no errors in owned files; the full check reports existing shared-UI dependency/type errors outside this task.
Needed outside owned files: no source changes; orchestrator must run browser prerendering and visual review outside the sandbox.
