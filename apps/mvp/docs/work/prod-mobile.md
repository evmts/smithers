---
title: Production mobile sweep failures
status: blocked
area: frontend
owner: Codex (mini/prod-mobile)
updated: 2026-10-23
links: [./mobile-responsiveness-sweep.md, ../features/files.md, ../features/conversations.md]
---

Implemented against main@origin eeb01ea4. Library catalog entries: @smthrs/ui
and @smthrs/repo-view; existing core rendering and test infrastructure only, no
new dependency, plugin feature or public API. No push or deployment.

Production evidence classification:

- Files/file-tabs: mixed. Signed-out failures initially show Not cloned; the
  spec opened the page before launching its fixture, then treated launch as
  completion. It now waits for real Code Storage refs before navigation, under
  the existing codeStorage/member prerequisites. Loaded files exposed product
  bugs: 20px close buttons, 22px preview controls, 27.5px tree controls, and a
  Markdown editor taking 100% of the article height in addition to its toolbar.
  Shared CSS repairs preserve toolbar access and document content at all sizes.
- Issues/pulls detail: product. Real synced items 4432/4435 loaded; the GitHub
  link was only 18px high. The link now has a 32px minimum through 960px. Keep
  githubApp, real populated-detail checks and every layout assertion; select
  E2E_SYNCED_REPOSITORY rather than assuming the deployment syncs smithersai.
- TODO: test prerequisite. Spoon-Knife's stack ends Not found; its optimistic
  Requested row became Not sent, never a numbered TODO. Existing dropped
  TODOs cannot satisfy this UUID-specific assertion. Requires writableStack:
  deployment runs must name E2E_STACK_REPOSITORY, a writable scratch stack with
  membership and shapes, never smithersai. Local runs retain Spoon-Knife and
  the complete commit/number/detail/drop journey. Do not widen product access.
- Docs: service/read failure, not evidence of a layout defect or local fixture.
  The snapshot says Couldn't read docs. Other sizes/identities succeeded; the
  supplied artifacts contain no HTTP status/reason, so neither GitHub throttling
  nor a docs-host failure is established. Keep the index assertion strict and
  attach docs-reads status/code/reason to future results. This does not claim to
  fix the original refused read or turn it into a skipped/passing layout test.
- Conversations: product. smithers-e2e on roninjin10/smithers-github-tests lost
  branch text at 390px. Rows now wrap branch and repository labels.

Red first: /tmp/prod-mobile-layout-red.log has six failing browser regressions
matching small targets, Markdown clipping and conversation truncation. The
fixture uses the real RepoView/Milkdown, FileTabs and ItemConversation renderers;
conversation rows use captured labels and equivalent markup with the real
screen stylesheet, not the live conversation collection. The writableStack
contract first failed in /tmp/prod-mobile-needs-red.log. No HTTP route mocks.

Validation (Node 26.5.0):

- pnpm --dir apps/mvp run typecheck: all four projects pass. UI and repo-view
  pnpm run check pass. All three packages' importRules pass.
- pnpm --dir apps/mvp exec vitest run tests/MobileLayout.browser.test.ts
  e2e/target.test.ts --coverage.include=e2e/target.ts --coverage.reporter=json
  --coverage.reportsDirectory=/tmp/prod-mobile-target-coverage --maxWorkers=1:
  48 pass. New helper/need have every measured statement, function and branch
  covered. The whole target.ts gate still fails (74.19% lines, 71.35% statements,
  69.56% functions, 77.18% branches); before edits its existing tests already
  failed it (73.50%, 70.71%, 68.65%, 76.22%). It is normally outside app coverage.
  No thresholds or production exclusions were changed. Browser CSS coverage is
  behavioral geometry evidence, not a JavaScript coverage percentage.
- UI: bun test tests --coverage --coverage-reporter=lcov
  --coverage-dir=/tmp/prod-mobile-ui-coverage: 2644 pass. Changed uiCss and
  itemConversationCss exports have 100% measured lines/functions. Repo-view:
  bun test --isolate test --coverage-reporter=lcov
  --coverage-dir=/tmp/prod-mobile-repo-coverage: 167 pass and the unchanged
  100% package gate passes; styles.tsx is 65/65 lines, 3/3 functions.
- Docs: vitest worker/docs/Api.test.ts, measuring worker/docs/Source.ts:
  13 pass, Source has 100% statements/branches/functions/lines, including
  upstream busy/error refusals. No production request was made.
- playwright test mobile.spec.ts --list: 153 local cases compile/list.
  Full local mobile attempted with one worker; Alchemy fails before serving
  on missing CEREBRAS_API_KEY. No journey ran, so local E2E remains unverified.
  Production E2E is intentionally left to the deployer.
- Astra read-only review: no actionable findings. Fable default session is
  signed out; account fallback reports every account failed or cooling.
  No public API changed; docs sync is unnecessary. Package docs and changeset
  updated for the CSS repair.
