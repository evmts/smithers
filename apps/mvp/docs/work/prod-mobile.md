---
title: Production mobile sweep failures
status: done
area: frontend
owner: Codex (mini/prod-mobile)
updated: 2026-10-23
links: [./mobile-responsiveness-sweep.md, ../features/files.md, ../features/conversations.md]
---

## Round 3 — production 98bd3487

Started from main@origin 98bd3487. Existing catalog entries: `@smthrs/ui`,
`@smthrs/effect-electric`, `@smthrs/effect-tanstack-db`. Repairs existing core
rendering and its sweep; no new feature, dependency, stored schema or public API.
Decision: [0089](../decisions/0089-mobile-shape-readiness.md).

The issue and TODO screenshots expose the same product defect: the shared
sidebar's T5/T4 and Watch links are 18px high. They now have 32px minimum
width/height through 960px, with long branches still wrapping. The desktop
baseline indexes the new mobile rule; the strict layout audit is unchanged.

Pulls: its metadata shape completed, but the supplied items-shape receipt is
3,845 rows without up-to-date. The list reads items too. The UI incorrectly
showed No pull requests from the completed GitHub sync while the device query
was still loading. It now checks the real live query's isReady. The sweep waits
for the actual list to settle and still requires a real detail link. A fresh
signed-out real SQLite device receives every one of five pulls from a
multi-chunk 3,845-item snapshot alongside 8,061 comments. No local row loss was
reproduced; this does not establish the original browser's eventual outcome.
The first new integration run failed because the test had not recorded its
repository as public; using the existing repository projection fixed that
fixture without changing access policy.

TODO cleanup belongs to fixture teardown in finally with its own budget,
starting before Commit. It recovers the unique TODO from the server shape even
if commit/list/navigation fails, posts Drop, verifies Dropped and waits for an
existing run to be cancelled or already terminal (completed/failed). Supplied
T13/T14 failure snapshots already show Dropped. They contain no terminal engine
receipt, so their historical cancellation remains unverified; no production
test or request was run.

Red/green receipts (all `/tmp/prod-mobile-3-*`):

- `layout-red.log`: 2 failures matching captured target dimensions; layout-green:
  12 pass. `ready-red.log`: false empty pull-list render fails before the fix.
- `render-final.log`: `vitest run tests/MobileLayout.browser.test.ts
  src/features/pulls/view.test.ts --coverage.include=src/features/pulls/view.ts
  --maxWorkers=1`, 26 pass; view.ts 100% statements/branches/functions/lines.
- `pulls-final.log`: full touched pulls.test.ts, real Postgres/Electric/SQLite,
  8 pass (isolated local ports 55489/30189). No production service was used.
- `ui-tests.log`: `bun test tests/item-conversation.test.tsx
  tests/item-conversation-page.test.tsx --coverage`, 34 pass. Changed
  itemConversationCss export: 25/25 measured lines, 1/1 functions. Browser
  geometry assertions are the CSS behavior evidence.
- `cancellation.log`: actual durable engine cancellation regression in
  worker/stack/Api.test.ts, 1 pass (30 unmatched tests skipped).
- Frozen install, all four app typecheck projects, UI check, both app/UI
  importRules pass. `playwright test mobile.spec.ts --list`: 153 cases.
- Astra read-only review: no actionable findings. Fable executable unavailable.
  Full suite not run; no full-suite lock taken. Full local mobile journey not
  run (live model/Code Storage prerequisites); production e2e prohibited.
  No public API change requires docs:sync; UI README and changeset updated.

## Round 2 — production 93ac5778

Started from main@origin 9fd0c0cb. Library catalog: existing
`@smthrs/effect-electric`, `@smthrs/effect-tanstack-db` and `@smthrs/ui`.
This repairs existing core route state and test infrastructure; no new feature,
dependency, persisted schema or public SDK API. No push or deployment.

Classification from `evidence/prod-mobile-2/results/*/error-context.md`:

- Issues: missing product data, not a locator mismatch. Failed snapshots show
  zero counts/No issues, or unknown counts with no rows. The numeric-link
  locator is valid and succeeded for other cases in this same run. There is
  no evidence here that migration 0048 or decision 0079 erased the projection.
- Pulls: one reproduced product bug plus missing browser rows. A direct visit
  left the shared issues sync-status query on an empty/previous repository.
  `pulls.open` now updates that repository. The real Postgres/Electric test
  failed waiting for loading=false, then passed, including switching to an
  unsynced repository. This fixes the incorrect loading state; it does not
  establish a repair of the missing pull rows.
- Files: product delivery discrepancy. The mirror's refs were ready, but the
  signed-in snapshots said Not cloned, with no file article. The spec now
  confirms the ready server repositories-shape row as well as refs. It still
  requires the actual article and every layout assertion. A real SQLite,
  Postgres and Electric projection/reload test passes locally; it invokes no
  forge or Code Storage stand-in and does not claim live file-read coverage.
- Conversations: missing/stalled product data; the snapshots show neither a
  list nor the loaded empty state. The spec also relied on a shared fixed
  branch. It now requires the configured private test conversation, confirms
  its unarchived row in the server shape, then requires that exact list link.
- Draft: product delivery discrepancy, not a Save locator issue. The API
  accepted the ready draft, but the snapshot contains only the page header.
  A fresh persisted device loads the same API-created draft locally. The spec
  declares Member, confirms its ready server row, and makes Save a hard gate.

The mobile detail prerequisite explicitly requires E2E_SYNCED_REPOSITORY;
missing configuration blocks the summary instead of permitting a green skip.
Astra identified that missing blocked flag; the new summary regression was red
before the flag and green after. The complete snapshot helper follows every
chunk and folds inserts/updates/deletes. Its integration test uses real
Postgres/Electric and a 24 MB, 3,000-row shape, plus real upstream refusals.
Browser `shape-reads.json` attaches endpoint, status, change count and completion
only; no row values, parameters or credentials. Every layout audit stays strict.

Read-only public production investigation on 2026-10-23 (no browser, sign-in,
test runner, assertions or writes): completed shapes currently contain 3,840
present issues and five present pulls on smithersai/smithers; Spoon-Knife's
repository row is ready with a head. The actual app schemas decode all 3,845
items and 17 repositories. The same collections persist in local real SQLite
in 3.7 s and 0.9 s. These are current receipts, not proof of what those shapes
returned during the earlier sweep or a reproduction of its browser hydration.
Counts-only logs: /tmp/prod-mobile-2-public-{shapes,decode,persist}.log.

Local test infrastructure corrections: repository harnesses now honor
TEST_ELECTRIC_PORT; Node repository tabs isolate Electric's URL replay cache
per browser realm, matching the existing ChatApi fixture. A full investigation
run passed 56 tests but timed out in the pre-existing Copy permalink wait; that
case and the persisted-device regression both passed on a focused rerun.
After isolating the run from concurrent suites, the whole repository file passed
24/24 without changing its waits. The fault file passed 18/18 in the earlier
combined run; flows/conversations passed 33/33. Earlier combined runs' timing
failures remain recorded rather than being called product fixes.

Final validation (Node 26.5.0; isolated Postgres 55489 / Electric 30189):

- `pnpm install --frozen-lockfile`: pass.
- `pnpm --dir apps/mvp run typecheck`: all four projects pass.
- `pnpm exec smithers-build test '//apps/mvp:importRules'`: pass.
- `vitest run src/features/pulls/pulls.test.ts
  --coverage.include=src/features/pulls/actions.ts`: 7 pass, changed product
  module 100% statements, branches, functions and lines. Red and green receipts:
  /tmp/prod-mobile-2-pulls-{red-isolated,green}.log.
- `vitest run e2e/shape.test.ts e2e/target.test.ts e2e/summary.test.ts
  tests/MobileLayout.browser.test.ts --coverage.enabled=false --maxWorkers=1`:
  64 pass (/tmp/prod-mobile-2-specs-seeded.log). Missing-config summary test's
  red receipt: /tmp/prod-mobile-2-missing-fixture-red.log.
- `vitest run src/features/repo/repo.test.ts --coverage.enabled=false
  --maxWorkers=1 --reporter=verbose`: 24 pass
  (/tmp/prod-mobile-2-repo-quiescent.log). The other local full-file receipts
  are /tmp/prod-mobile-2-sync-final.log and
  /tmp/prod-mobile-2-repo-suite-final.log; their earlier timing failures are
  not hidden. The independent ready-draft regression passed before any
  production behavior change.
- `playwright test mobile.spec.ts --list`: 153 local cases compile/list. No
  complete local mobile journey ran; live Code Storage/model prerequisites
  are not configured in this clone. Production e2e was deliberately not run.
- Optional explicit coverage of the existing e2e utilities still fails their
  whole-module 100% gate (target.ts and shape.ts include unrelated unexecuted
  Playwright helpers; the previous round records the baseline). Those modules
  are normally outside the app's coverage include list. No gate, threshold
  or production exclusion changed. Product action coverage above passes.
- Astra final read-only review: no remaining actionable findings.

Remaining blocker: the original signed-in browser's shape statuses, completion
and hydration records were not included in the supplied evidence. No speculative
fallback, wider access, longer layout timeout or data-dependent skip was added.
The next authorized mobile run's receipts separate server absence from browser
hydration. Public shapes and local layers now pass; the original browser data
loss is not claimed fixed. Astra review complete; no Fable executable is
available in this session. Production e2e was not run. No public API change
requires docs:sync or a changeset.

## Previous round

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
