---
title: Repo-wide checks pass again
status: done
area: sdk
owner: repo-checks agent (started about 00:40, reported done about 02:06 on 2026-10-20); the lead fixed the root `sdkRuleTests` glob (00:39) and one stale doc example (about 02:06)
updated: 2026-10-20
links: [api-baseline-rerecord.md, declared-import-exceptions.md, agent-root-browser-safe.md, deep-import-migration.md, issue-sync-ingest-retry-loop.md, flows-root-platform-neutral.md, agent-ui-rendering.md, integrations-durable-retries.md, integrations-effect-httpclient.md, model-endpoint.md, sdk-test-reds.md, land-and-deploy-mvp.md, import-rules-and-jev-lint.md, library-catalog.md, ../../../../AGENTS.md]
---

## What

Make the repository-wide checks pass after tonight's combined changes. Five are red:
1. **Target index:** `pnpm target-index` can't regenerate `.smithers/target-index.json`, which is stale since 20:27 on 2026-10-19. 23 declared globs cross package boundaries, most of them in root `//:sdkJevRules`. The fix moves those rules into per-package targets.
2. **Export maps:** new subpaths in `@smthrs/agent`, `@smthrs/model` and other packages break the public export-map check.
3. **Release package count:** the release test packs 50 packages where the RC contract publishes 49.
4. **Dependency boundaries:** `apps/app`'s `LauncherSeam.ts` imports a file inside `apps/site/src` by relative path.
5. **API baseline:** the release fixture `public-api-baseline.json`, unchanged since 13:20 on 2026-10-19, needs a refresh from the release api-baseline flow.

## Why

These checks guard every landing, and nothing lands on `main` while they're red ([land and deploy](land-and-deploy-mvp.md)). Root `AGENTS.md`: no tech debt; finish every migration in the same effort. Each red came from another lane's unfinished move: the [flows root](flows-root-platform-neutral.md), the views SDK ([agent UI rendering](agent-ui-rendering.md)), the [model endpoint](model-endpoint.md)'s `ModelProxy`, and the integrations changes.

## State

- 00:36 on 2026-10-20: V1+V2 reported three repo checks red on other lanes' changes: public export maps (`@smthrs/agent` `ModelStep`), the package contract (flows `package.json`) and dependency boundaries (`apps/app` `LauncherSeam`) ([agent UI rendering](agent-ui-rendering.md)).
- 00:39: the flows-root agent reported the same reds plus two more. The release test packs 50 packages against 49 expected. `pnpm target-index` fails because root `//:sdkJevRules` declared `packages/smithers/ui/test/**`, which doesn't exist, and `public-api-baseline.json` needs a refresh ([flows root](flows-root-platform-neutral.md)).
- 00:39: **the lead fixed the root glob.** `sdkRuleTests` in root `PACKAGE.ts` names `packages/smithers/ui/tests/**/*.test.{ts,tsx}` for `@smthrs/ui`, which keeps its tests in `tests/`, and `test/**/*.test.ts` for every other package.
- About 00:40: **started**, one agent for all five. The lead told Will: "I've started a cleanup pass for the repository-wide checks that tonight's combined changes broke: the target index, export maps, release package count, one `apps/app` import, and the API baseline."
- 00:40 to 00:45 on 2026-10-20, the agent's "before" runs in the scratchpad:
  - `ti-before.log` and `ti.log`: with the glob fixed, `pnpm target-index` still fails with `declared_input_crosses_package: 23 declared globs cross package boundaries; depend on the owning package's label`. 21 are root `//:sdkJevRules`' `src` and `test` globs for each SDK package. The other 2 are in `@smthrs/ui`'s `browserProbes` and `unitTests`, which name `packages/smithers/ui/views/src/**`, now its own package.
  - `boundary-before.log`: `apps/app/src/mainview/state/seams/LauncherSeam.ts` imports `../../../../../site/src/lib/appHistory.ts`; the check asks for `@smithers/site` through its export map.
  - `release-before.log`: "the packed set is exactly the 49 names the RC contract publishes" fails; the log's other release tests pass.
  - `exportmaps-before.log` (00:42), with a diff script, `exportdiff.mjs`.
  - `apibaseline-before.log` (00:45): the baseline flow's declaration build fails in `@smthrs/cli`, where `src/operator/Integrations.ts(213,69)` passes `maxRetries`, which `GitHubConfig` no longer has. Best guess: the [integrations retries](integrations-durable-retries.md) agent's change in progress, which deletes the in-step retries.
- As of 00:47: `LauncherSeam.ts`, `public-api-baseline.json` and `.smithers/target-index.json` are unchanged. No report.

- Between 00:47 and 00:52 on 2026-10-20: the lead told the [integrations retries](integrations-durable-retries.md) agent to fix the `maxRetries` caller in `@smthrs/cli`'s `src/operator/Integrations.ts:213`. At 00:52 that file no longer passes it, so best guess the API-baseline declaration build gets past it. No rerun is on record.
- 00:53 to 00:54 on 2026-10-20, on disk, unreported: **item 1 is underway.** A new `packages/repo-targets/src/SdkRules.ts` (00:53), exported from its `index.ts`, is "the SDK rules macro": a package names its `role` (`library`, `app-library`, `host` or `components`) in its own `PACKAGE.ts` and gets an `ImportRules` and a `JevRules` target, each rule tagged with its `apps/mvp/docs/rules.md` id. "Every glob is relative to the declaring package, so neither target reads across a package boundary." Tests in `test/SdkRules.test.ts` and `test/index.test.ts` (00:54).
- As of 00:54: root `PACKAGE.ts` (00:39), `LauncherSeam.ts`, `public-api-baseline.json` and `.smithers/target-index.json` are unchanged. A repo-wide `pnpm docs:check` passed at 00:54 (scratchpad `docs-check.log`, exit 0), whose run isn't on record. No report.

- 00:55 to 01:05 on 2026-10-20, on disk and in scratchpad logs, unreported:
  - **Item 1, target index:** `PACKAGE.ts` files in about ten packages changed at 00:55 (among them `effect-code-storage`, `effect-electric`, `effect-tanstack-db`, `rpc`, `model`, `model-host`, `observability`, `platform-cloudflare`, `ui` and `ui/views`), with a helper script `sdkrules_edit.py`; root `PACKAGE.ts` changed at 00:56. **`pnpm target-index` passes** (`ti-after.log`, 01:04, `ok: true`) and `.smithers/target-index.json` was rewritten at 01:04, the first time since 20:27 on 2026-10-19.
  - **Item 2, export maps:** `public-export-surface.json` and `public-export-maps.test.mjs` changed at 00:58; `exportmaps-after.log` passes 39 of 39.
  - **Item 3, release count:** `release-after.log` (01:02) passes "the packed set is exactly the 50 names the RC contract publishes", so the contract now counts the 50th package rather than dropping it; which package that is isn't on record. The same run fails 12 cut-release tests (`set-release-version.mjs` reports a file that "no longer declares" its version). `cut-after.log` (01:03) then passes 19 of 19.
  - **Item 4, dependency boundaries:** `LauncherSeam.ts` changed at 00:56; `boundary-after.log` (01:03): "Dependency boundary check passed for 72 package(s)".
  - **Item 5, API baseline:** `public-api-baseline.json` is still unchanged since 13:20 on 2026-10-19. The `maxRetries` caller that broke its declaration build is gone, and the [integrations retries](integrations-durable-retries.md) agent reported done at about 01:03.
  - No report.

- 01:05 to 01:15 on 2026-10-20, on disk and in scratchpad logs, unreported:
  - **`@smthrs/rpc`:** `PACKAGE.ts`, `AgentTurnJournal.ts` and `LspWire.ts` changed; its `jevRules` (`jev.log`, 01:05) and `importRules` (`ir.log`, 01:06) targets pass.
  - **Rules:** `packages/repo-targets/src/JevRules.ts` and its README (01:08), then `apps/mvp/docs/rules.md` (01:09). Best guess: the rule ids the SDK rules macro tags.
  - **`apps/app`** type-checks (`app-tsc.log`, 01:07, exit 0).
  - **Docs:** `pnpm docs:sync` (01:09) rewrote 48 API pages and `llms.txt`; `apps/server/src/docsRedirectMap.ts` changed at 01:09. `pnpm docs:check` (01:10) passes, including "50 published package tarballs passed", which agrees with item 3's count.
  - **Item 5, API baseline:** the declaration build now gets past `@smthrs/cli`, but the check fails (`apibaseline-check2.log`, 01:11): "Declaration/API drift requires compatibility review" in 21 packages, among them `@smthrs/agent`, `flow`, `flows`, `integrations`, `platform-browser`, `platform-cloudflare` and `run-store`. The check asks for a review of the declaration diffs, consumer type tests and release notes "before explicitly updating the baseline". An `apibaseline-update.log` was created empty at 01:11, and the declaration build started again at 01:15. `public-api-baseline.json` is still unchanged.
  - No report.
- 01:12: Codex Astra review 3 started; it covers `repo-targets`' per-package SDK rules ([code reviews](code-reviews.md)).

- 01:18 to 01:52 on 2026-10-20, in scratchpad logs and on disk, unreported: **item 5, the API baseline, is recorded.**
  - 01:18 (`apibaseline-after.log`): the declaration build failed in `@smthrs/platform-browser` (`'wasm' does not exist in type 'SqliteOptions'`), mid-edit by the [`platform-browser` agent](one-sqlite-one-leader.md).
  - 01:45 (`apibaseline-final.log`, a 19-minute run): the check ran through and named drift in five packages, down from 21: `@smthrs/crypto`, `platform-browser`, `platform-cloudflare`, `platform-node` and `sandbox`. All five changed tonight in other agents' work ([B1 follow-ups](b1-follow-ups.md), [one SQLite, one leader](one-sqlite-one-leader.md), [flows root](flows-root-platform-neutral.md)).
  - 01:49 (`docs-check2.log`): `pnpm docs:check` passes, with 50 package tarballs.
  - 01:52 (`apibaseline-update2.log`, run-167): `release/api-baseline` "Recorded declarations for 50 public packages". `public-api-baseline.json` changed for the first time since 13:20 on 2026-10-19.
  - Not on record: whether anyone reviewed the five packages' declaration diffs first, as the check asks. A last check started at 01:52 (`apibaseline-final2.log`, still empty).
  - No report.

- 01:57 on 2026-10-20, scratchpad `apibaseline-final2.log`: "Declaration baseline matches 50 public packages."
- **About 02:06 on 2026-10-20: all five checks pass**, reported by the agent. The lead to Will: "All five repository-wide checks pass again."
  - **Target index:** each SDK package declares its own lint rules from one shared definition, `SdkRules` in `@smthrs/repo-targets`. `.smithers/target-index.json` was rewritten again at 02:03 (scratchpad `ti-final.log`).
  - **Export maps:** 39 of 39. Nine new deep subpaths were removed in favor of root exports.
  - **Release:** 404 of 404. `@smthrs/platform-cloudflare` is the 50th package, and it publishes.
  - **Dependency boundaries:** the `apps/app` violation is fixed at its source: `AppEntry` moved into `@smthrs/rpc`.
  - **API baseline:** re-recorded for 50 public packages.
  - **Declared exceptions**, kept as stated debt ([declared import exceptions](declared-import-exceptions.md)):
    - `@smthrs/model-host` deep-imports `@smthrs/cli/Catalog` (and `@smthrs/cli/CatalogRequest`, in `src/HostTools.ts`), because the CLI root fails the browser check;
    - `@smthrs/rpc` imports canonical internals.
  - The lead fixed one stale doc example the agent couldn't touch.
  - **Left:** the baseline needs recording again once the SDK agents still running land ([API baseline re-record](api-baseline-rerecord.md)).
- **02:24 to 02:40 on 2026-10-20: a regression from another lane.** The [agent root](agent-root-browser-safe.md) agent moved `NodeLanguageServer.ts` to `platform-node`, but `packages/smithers/agent/std/PACKAGE.ts` still named the old path, so every `smithers-build` target failed while evaluating declarations, `//apps/mvp:importRules` included. 02:40: the lead told that agent to fix it first. On disk, unreported: `std/PACKAGE.ts` (02:40:41) no longer names it and `.smithers/target-index.json` (02:41:30) points at the new path. No build run after the fix is on record by 02:43. This item stays done; the fix belongs to the agent root's lane.

## Next

None here. Follow-ups have their own notes: [API baseline re-record](api-baseline-rerecord.md), [declared import exceptions](declared-import-exceptions.md), and the [issue-sync retry loop](issue-sync-ingest-retry-loop.md) deletion, which edits the same export-map fixture.

Until about 02:06 on 2026-10-20 the next step was, from 01:52: the agent's report. Items 1 to 4 pass on its logs. Item 5's baseline is recorded for 50 packages, so the last check, started 01:52, should pass. Each fix at its source and tested. After it, the [issue-sync retry loop](issue-sync-ingest-retry-loop.md) deletion, which edits the same export-map fixture.

Until about 01:52 on 2026-10-20 the next step was: the agent's report. Items 1, 2 and 4 pass on its logs; item 3 passes on count, and `pnpm docs:check` packs 50 tarballs; item 5's declaration build runs, but 21 packages show API drift that the check wants reviewed before `--update` records it. Each fix at its source and tested. After it, the [issue-sync retry loop](issue-sync-ingest-retry-loop.md) deletion, which edits the same export-map fixture.

Until about 01:15 on 2026-10-20 the next step was: the agent's report: items 1, 2 and 4 pass on its logs; item 3 passes on count, and a cut-release rerun passed 19 of 19 after 12 failed; item 5, the API baseline refresh through the release api-baseline flow, is the one with no evidence yet. Each fix at its source and tested. After it, the [issue-sync retry loop](issue-sync-ingest-retry-loop.md) deletion, which edits the same export-map fixture.

Until about 01:05 on 2026-10-20 the next step was: the agent's report: `pnpm target-index` regenerates the index with per-package rules; the export-map, release, dependency-boundary and API-baseline checks pass; each fix is made at its source and tested. The `@smthrs/cli` caller that passed `maxRetries` is the [integrations retries](integrations-durable-retries.md) agent's, changed at 00:52.

Until 00:52 on 2026-10-20 the last sentence was: the `@smthrs/cli` caller that passes `maxRetries` moves with the [integrations retries](integrations-durable-retries.md) change.

## Questions for Will

None. Open for the lead (01:52 on 2026-10-20): the baseline was recorded after the drift narrowed to five packages (`crypto`, `platform-browser`, `platform-cloudflare`, `platform-node`, `sandbox`); was each diff reviewed with its changeset first? Before that: who reviews the declaration drift in 21 packages before the API baseline is updated? Codex Astra review 3 covers most of those packages ([code reviews](code-reviews.md)). (Answered about 02:06 on 2026-10-20: which package is the 50th in the release pack, and should it publish? `@smthrs/platform-cloudflare`, and it publishes.)
