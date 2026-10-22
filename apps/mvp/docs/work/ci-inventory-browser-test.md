---
title: CI inventory browser target parity
status: done
area: build
owner: codex-ci-inventory
updated: 2026-10-21
links: []
---

The browser targets were already declared and selected. The stale inventory
classifier omitted `platform-browser:browserTest`, `ui:browserProbes` and
`terminal-frame:browserProbes`. It now verifies their exact commands, declared
inputs and Chromium entrypoints, requires both package selections, and still
rejects unknown suites. Each classification has a regression shown red first.

The full inventory also exposed `codingHostSize` as its sole cacheable NodeTest.
Its declaration in `.smithers/flows/PACKAGE.ts` now sets `cache: false`; an
effective-plan regression verifies fresh execution. The general cache guard is
unchanged. The bundle builder's executable/input identity is not cache-complete.

The inventory generator is `packages/repo-targets/contracts/ci-inventory.mjs`.
`contracts/generate-ci.mjs` in the same package renders root `PACKAGE.ts` through
`GithubCiGen`; regeneration left `ci.yml` unchanged. `pnpm run target-index`
records the cache correction and removes an absent UI docs `api.md.orig` input.

Validation under Node 26.5.0:

- `pnpm install --frozen-lockfile`: passed.
- Browser regressions failed before their fixes; full inventory then failed at the unchanged cache guard (17 passed, 1 failed).
- `node --test packages/repo-targets/contracts/ci-inventory.test.mjs`: 19 passed, zero failures or skips; all workflow selections resolved.
- `pnpm exec smthrs lint '//:ci' --no-cache`: passed, one check executed.
- `pnpm exec smthrs lint '//:targetIndex'`: passed, index and coverage checks executed, zero cache hits.
- ESLint on the changed contract: passed. Astra reviewed all changes without findings; Fable is unavailable.

An initial cold planning attempt hit the existing deadline and was stopped.
Browser execution, actual host bundling and the full workspace suite were not
run for this inventory-only change. No library or public API changed.
