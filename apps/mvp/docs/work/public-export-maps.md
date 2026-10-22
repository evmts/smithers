---
title: Repair reviewed public export maps
status: done
area: sdk
owner: Codex GPT-6.1 Sol
updated: 2026-10-21
links: [repo-checks-green.md]
---

The export contract fails on main: integrations' reviewed additions omit
AppAuth and Issues; memory publishes no Opening subpath. Current main also
omits sandbox TerminalProtocol from its publication map and reviewed additions.
Use the package barrels, documented APIs and explicit development maps as
evidence; preserve the historical fixture and register individual additions.

Baseline: `node --test packages/repo-targets/contracts/public-export-maps.test.mjs`
fails 2 of 39 tests on 0d66db74 (memory/sandbox parity and integrations fixture).

Decisions:
- Integrations' `src/github.ts`, `docs/api.md` and both manifest maps already
  expose AppAuth and Issues. Add their exact entries to the fixture's `added`
  ledger; no package API change or release is needed for integrations.
- Memory's `src/index.ts` and `docs/surface.md` declare Opening. Add its
  missing ESM/CJS runtime and declaration publication targets, with a patch
  changeset and documentation.
- Sandbox's `src/index.ts` and `docs/api.md` declare TerminalProtocol. Repair
  its missing publication targets and private nested-path block the same way.
- The next exact-map assertion exposed further stale additions on fetched
  main: registry ModuleFlow, engine-store RunInspection, sandbox SandboxTools,
  sync PresenceProtocol/PresenceRoom/PresenceSocket/SharedText, and notifications
  Channels/Inbox. Their root barrels, API docs and matching manifest maps
  establish the existing API. Register those exact entries and the SandboxTools
  private nested-path block; change none of their package manifests.

Validation (Node 26.5.0, pnpm 11.25.0):
- `pnpm install --frozen-lockfile`: passes.
- `node --test packages/repo-targets/contracts/public-export-maps.test.mjs`:
  39/39 pass. Historical baseline and all original assertions remain intact.
- `pnpm --filter @smthrs/integrations --filter @smthrs/memory run check`:
  passes, including source and test typechecks. Individual `pnpm --filter
  @smthrs/<package> run check` passes for sandbox, registry, engine-store,
  sync and notifications. Combined extra-package checks hit existing workspace
  dependency cycles; individual checks require no policy/configuration change.
- `pnpm --filter @smthrs/integrations --filter @smthrs/memory --filter
  @smthrs/sandbox run build`: passes.
- Release `stagePackage` from `.smithers/flows/release/pack-release.mjs`, then
  `pnpm pack`, `assertPackedExportTargets` from the release validator, and
  `npm publish --dry-run --ignore-scripts --json`: pass for integrations,
  memory and sandbox (133, 85 and 85 literal export targets respectively).
  Logs: `/tmp/export-maps-publish.log`; no publication occurred.
- `pnpm docs:sync`: site generation succeeds; durable wrapper fails because
  this clone lacks `smithers-jj-export`. Its remaining package-docs module
  passes directly with `--write` and `--check`. Keep only relevant generated
  sandbox documentation and regenerate the site's llms text.
- Codex Astra review: no actionable findings. Fable review unavailable in
  this session. Full release, live tests and deployment not run: this changes
  package metadata and contract fixtures, not runtime behavior.

Delivery: one local jj commit and `mini/export-maps`; no push, per the brief.
